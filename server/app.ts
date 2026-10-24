import {registerContracts,pageQuerySchema,decodeCursor} from './contracts';
import {readiness} from './readiness';
import { erxesConfig, registerErxes } from "./erxes";
import { registerUploadRoutes } from "./uploads";
import { someAsync } from "./async-array";
import { Collaboration, registerCollaborationRoutes } from "./collaboration";
import { assetResponse } from "./asset-response";
import { referencedAssets } from "../shared/publications";
import { Hono } from "hono";
import sharp from "sharp";
import { sessionUser, type SessionUser } from "./auth-session";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { objectStorage, StorageFailure } from "./storage";
import { Store, ApiError } from "./store";
import {
  LiveSessions,
  registerAudienceRoutes,
  registerLiveRoutes,
} from "./live";
import { registerDesignRoutes } from "./design";
import { registerCreditRoutes } from "./credits";
import {
  PublicationStore,
  registerPublicRoutes,
  registerPublishingRoutes,
} from "./publications";
import { registerExportRoutes, registerPublicDownloadRoutes } from "./exports";
import {
  createAIServices,
  registerAIRoutes,
  type AIServices,
} from "./creation";
import {
  uid,
  operationSchema,
  elementSchema,
  documentSchema,
  themeSchema,
  type User,
} from "../shared/schema";
export function createApp(
  store = new Store(),
  ai: AIServices = createAIServices(store),
  resolveSession: SessionUser = sessionUser,
) {
  const app = new Hono<{
    Variables: {
      user: User;
    };
  }>();
  registerContracts(app);
  const erxes = erxesConfig();
  const publications = new PublicationStore(store, ai.exports);
  const live = new LiveSessions(store);
  const collaboration = new Collaboration(store);
  app.use("/view/*", async (c, next) => {
    const id = c.req.path.split("/").at(-1);
    const row = (await store.db.one("publications",{id:id || ""})) as {
      visibility: string;
      revokedAt: string | null;
    } | null;
    c.header(
      "X-Robots-Tag",
      row?.visibility === "public" && !row.revokedAt
        ? "index, follow"
        : "noindex, nofollow",
    );
    await next();
  });
  app.use(
    "/api/*",
    bodyLimit({
      maxSize: 52 * 1024 * 1024,
      onError: (c) =>
        c.json(
          {
            error:
              "This request is too large. Images must be under 10 MB and videos under 50 MB.",
          },
          413,
        ),
    }),
  );
  app.use("/api/*", async (c, next) => {
    const started = performance.now(),
      requestId = uid();
    c.header("X-Request-ID", requestId);
    await next();
    if (
      (process.env.NODE_ENV === "production" ||
        process.env.FRAME_REQUEST_LOGS === "true") &&
      c.req.path !== "/api/health"
    )
      console.log(
        JSON.stringify({
          level: c.res.status >= 500 ? "error" : "info",
          event: "request_completed",
          requestId,
          method: c.req.method,
          route: c.req.routePath || "/api/*",
          status: c.res.status,
          durationMs: Math.round((performance.now() - started) * 10) / 10,
          time: new Date().toISOString(),
        }),
      );
  });
  app.use("/api/*", async (c, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const origin = c.req.header("Origin");
      const requestOrigin = new URL(c.req.url).origin;
      const allowed = process.env.APP_ORIGIN || "http://127.0.0.1:5174";
      if (origin && origin !== requestOrigin && origin !== allowed)
        throw new ApiError(
          403,
          "This request came from an unrecognized website.",
        );
    }
    c.header("X-Content-Type-Options", "nosniff");
    c.header("Cache-Control", "no-store");
    await next();
  });
  registerErxes(app, store, erxes);
  app.get("/api/auth/provider", (c) =>
    c.json({ provider: erxes ? "erxes" : "clerk", erxesOrigin: erxes?.origin ?? null }),
  );
  app.get("/api/health", async (c) => {
    return c.json({ ok: true, version: "0.1.0" });
  });
  app.get('/api/ready',async c=>{const result=await readiness(store);return c.json(result,result.ok?200:503);});
  registerAudienceRoutes(app, live);
  registerPublicRoutes(app, publications, resolveSession);
  registerPublicDownloadRoutes(app, ai.exports, publications, resolveSession);
  app.all("/api/auth/*", (c) =>
    c.json(
      {
        error: erxes
          ? "Open Frame from your erxes workspace to sign in."
          : "Sign in with Clerk to continue.",
      },
      erxes ? 403 : 410,
    ),
  );
  app.use("/api/*", async (c, next) => {
    const user = await resolveSession(store, c.req.raw.headers);
    if (!user) throw new ApiError(401, "Sign in to open your workspace.");
    c.set("user", user);
    await next();
  });
  registerCreditRoutes(app, store);
  app.get("/api/me", (c) =>
    c.json({
      user: c.get("user"),
      ...(erxes ? { integration: { erxesOrigin: erxes.origin } } : {}),
    }),
  );
  app.patch("/api/me", async (c) => {
    const input = z
      .object({ name: z.string().trim().min(1).max(80) })
      .parse(await c.req.json());
    await store.db.update("users",{id:c.get("user").id},{$set:{name:input.name}});
    return c.json({ user: await store.user(c.get("user").id) });
  });
  app.get("/api/decks", async (c) => {const query=pageQuerySchema.parse(c.req.query());return c.json(await store.list(c.get("user"),c.req.header('X-Frame-Contract')==='reference'?undefined:{limit:query.limit+1,after:decodeCursor(query.cursor)}));});
  app.post("/api/decks", async (c) => {
    const input = z
      .object({
        title: z.string().trim().min(1).max(200),
        template: z
          .enum(["blank", "story", "pitch", "lesson"])
          .default("blank"),
        themeId: z.string().default("studio"),
        theme: themeSchema.optional(),
      })
      .parse(await c.req.json());
    return c.json(
      await store.create(
        c.get("user"),
        input.title,
        input.template,
        input.themeId,
        input.theme,
      ),
      201,
    );
  });
  app.get("/api/decks/:id", async (c) =>
    c.json(await store.access(c.req.param("id"), c.get("user"), true)),
  );
  app.patch("/api/decks/:id", async (c) => {
    const input = z
      .object({
        baseRevision: z.number().int().min(0),
        operations: z.array(operationSchema).min(1).max(500),
      })
      .parse(await c.req.json());
    return c.json(
      await store.mutate(
        c.req.param("id"),
        c.get("user"),
        input.baseRevision,
        input.operations,
      ),
    );
  });
  app.put("/api/decks/:id", async (c) => {
    const input = z
      .object({
        baseRevision: z.number().int().min(0),
        document: documentSchema,
      })
      .parse(await c.req.json());
    return c.json(
      await store.replace(
        c.req.param("id"),
        c.get("user"),
        input.baseRevision,
        input.document,
      ),
    );
  });
  app.post("/api/decks/:id/duplicate", async (c) =>
    c.json(await store.duplicate(c.req.param("id"), c.get("user")), 201),
  );
  app.delete("/api/decks/:id", async (c) => {
    const id=c.req.param('id'),user=c.get('user');
    await store.delete(id,user);
    for(const job of await store.db.find('jobs',{deckId:id,status:{$in:['queued','running']}}))await ai.worker.cancel(job.id,job.ownerId);
    return c.json({ ok: true });
  });
  registerCollaborationRoutes(app, collaboration);
  registerLiveRoutes(app, live);
  registerDesignRoutes(app, store);
  registerPublishingRoutes(app, publications);
  registerExportRoutes(app, ai.exports);
  registerAIRoutes(app, ai);
  app.get("/api/compositions", async (c) => {
    const rows = (await store.db.find("compositions",{workspaceId:c.get("user").workspaceId},{sort:{createdAt:-1},limit:100})) as {
      elements: string;
    }[];
    return c.json(
      rows.map((r) => ({ ...r, elements: JSON.parse(r.elements) })),
    );
  });
  app.post("/api/compositions", async (c) => {
    const data = z
      .object({
        name: z.string().trim().min(1).max(80),
        width: z.number().finite().min(5).max(8000),
        height: z.number().finite().min(5).max(8000),
        elements: z.array(elementSchema).min(1).max(100),
      })
      .parse(await c.req.json());
    const user = c.get("user"),
      id = uid();
    await store.db.insert("compositions",{id:id,workspaceId:user.workspaceId,ownerId:user.id,name:data.name,width:data.width,height:data.height,elements:JSON.stringify(data.elements),createdAt:new Date().toISOString()});
    return c.json({ id, ...data }, 201);
  });
  app.delete("/api/compositions/:id", async (c) => {
    const row = await store.db.one("compositions",{id:c.req.param("id"),ownerId:c.get("user").id});
    if (!row) throw new ApiError(404, "Composition not found.");
    await store.db.remove("compositions",{id:c.req.param("id")});
    return c.json({ ok: true });
  });
  app.get("/api/folders", async (c) =>
    c.json(
      await store.db.find("folders",{workspaceId:c.get("user").workspaceId},{sort:{name:1}}),
    ),
  );
  app.post("/api/folders", async (c) => {
    const input = z
      .object({ name: z.string().trim().min(1).max(80) })
      .parse(await c.req.json());
    const folder = { id: uid(), name: input.name };
    await store.db.insert("folders",{id:folder.id,workspaceId:c.get("user").workspaceId,name:folder.name});
    return c.json(folder, 201);
  });
  app.get("/api/decks/:id/revisions", async (c) => {
    await store.access(c.req.param("id"), c.get("user"), true);
    return c.json(
      await store.db.find("revisions",{deckId:c.req.param("id")},{sort:{revision:-1},limit:80}),
    );
  });
  app.post("/api/decks/:id/restore/:revision", async (c) => {
    const input = z
      .object({ baseRevision: z.number().int() })
      .parse(await c.req.json());
    await store.access(c.req.param("id"), c.get("user"), true);
    const document=await store.revisionDocument(c.req.param('id'),Number(c.req.param('revision')));
    return c.json(await store.replace(c.req.param('id'),c.get('user'),input.baseRevision,document));
  });
  app.post("/api/assets", async (c) => {
    const length = Number(c.req.header("Content-Length") || 0);
    if (length > 52 * 1024 * 1024)
      throw new ApiError(413, "Choose media smaller than 50 MB.");
    const form = await c.req.formData(),
      file = form.get("file");
    if (file === null || typeof file === "string")
      throw new ApiError(400, "Choose an image or video to upload.");
    const user = c.get("user"),
      presentationId = form.get("presentationId");
    let workspaceId = user.workspaceId;
    if (typeof presentationId === "string" && presentationId)
      workspaceId = (await store.access(presentationId, user, true))
        .workspaceId;
    else {
      const member = (await store.db.one("members",{$and:[{workspaceId:workspaceId},{userId:user.id}]})) as {
        role: string;
      } | null;
      if (!member || member.role === "viewer")
        throw new ApiError(403, "Editor access is required to upload media.");
    }
    if (file.size > 50 * 1024 * 1024)
      throw new ApiError(413, "Choose a video smaller than 50 MB.");
    let bytes = new Uint8Array(await file.arrayBuffer());
    const video =
      String.fromCharCode(...bytes.slice(4, 8)) === "ftyp"
        ? "video/mp4"
        : bytes[0] === 0x1a &&
            bytes[1] === 0x45 &&
            bytes[2] === 0xdf &&
            bytes[3] === 0xa3
          ? "video/webm"
          : null;
    let mime = video,
      width: number | undefined,
      height: number | undefined;
    if (!video) {
      if (file.size > 10 * 1024 * 1024)
        throw new ApiError(413, "Choose an image smaller than 10 MB.");
      try {
        const image = sharp(bytes, {
            limitInputPixels: 40000000,
            failOn: "error",
          }),
          metadata = await image.metadata();
        if (!["png", "jpeg", "webp", "gif"].includes(metadata.format || ""))
          throw new Error();
        if ((metadata.pages || 1) > 1)
          throw new ApiError(
            400,
            "Animated images are not supported. Upload a still image or an MP4/WebM video.",
          );
        const output = await image
          .rotate()
          .webp({ quality: 92 })
          .toBuffer({ resolveWithObject: true });
        bytes = new Uint8Array(output.data);
        width = output.info.width;
        height = output.info.height;
        mime = "image/webp";
      } catch (error) {
        if (error instanceof ApiError) throw error;
        throw new ApiError(
          400,
          "This image could not be read. Use a valid PNG, JPEG, WebP, or still GIF under 40 megapixels.",
        );
      }
    }
    const id = uid();
    if (typeof presentationId === "string" && presentationId)
      await store.requireAccess(presentationId, user, true);
    const storage = objectStorage();
    await storage.put("assets", id, bytes, mime || "application/octet-stream");
    try {
      await store.db.transaction(async () => {
        if (typeof presentationId === "string" && presentationId)
          await store.requireAccess(presentationId, user, true);
        else {
          const member = (await store.db.one("members",{$and:[{workspaceId:workspaceId},{userId:user.id}]})) as {
            role: string;
          } | null;
          if (!member || member.role === "viewer")
            throw new ApiError(
              403,
              "Editor access is required to upload media.",
            );
        }
        await store.db.insert("assets",{id:id,ownerId:user.id,workspaceId:workspaceId,name:file.name.slice(0, 200),mime:mime,bytes:bytes.length,storageKey:id,createdAt:new Date().toISOString()});
      })();
    } catch (error) {
      await storage.delete("assets", id).catch(() => {});
      throw error;
    }
    return c.json(
      { id, src: `/api/assets/${id}`, name: file.name, mime, width, height },
      201,
    );
  });
  app.get("/api/assets/:id", async (c) => {
    const user = c.get("user"),
      assetId = c.req.param("id"),
      row = (await store.db.one("assets",{id:assetId})) as {
        ownerId: string;
        workspaceId: string;
        mime: string;
        storageKey: string;
      } | null;
    if (!row || !/^image\/|^video\//.test(row.mime))
      throw new ApiError(404, "Media not found.");
    const member = (await store.db.one("members",{$and:[{workspaceId:row.workspaceId},{userId:user.id}]})) as {
      role: string;
    } | null;
    let allowed =
      row.ownerId === user.id ||
      member?.role === "owner" ||
      member?.role === "editor";
    if (!allowed) {
      const candidates = (await store.db.find("decks",{workspaceId:row.workspaceId,deletedAt:{$exists:false}})) as {
        id: string;
      }[];
      allowed = await someAsync(candidates, async (candidate) =>
        (await store.role(candidate.id,user)) !== null && referencedAssets(await store.access(candidate.id, user)).includes(assetId),
      );
    }
    if (!allowed) throw new ApiError(404, "Media not found.");
    return assetResponse(row.storageKey, row.mime, c.req.header("Range"));
  });
  registerUploadRoutes(app, store);
  app.all("/api/*", (c) =>
    c.json({ error: "This endpoint was not found." }, 404),
  );
  app.onError(async (error, c) => {
    if (error instanceof z.ZodError)
      return c.json(
        {
          code:"INVALID_INPUT",requestId:c.res.headers.get("X-Request-ID"),error: error.issues
            .map((i) => i.message)
            .slice(0, 3)
            .join(" "),
        },
        400,
      );
    if (error instanceof StorageFailure)
      return c.json({ error: error.message,code:"STORAGE_UNAVAILABLE",requestId:c.res.headers.get("X-Request-ID") }, 503);
    if (error instanceof ApiError)
      return c.json({ error: error.message,code:error.code,requestId:c.res.headers.get("X-Request-ID") }, error.status as 400);
    const requestId = c.res.headers.get("X-Request-ID") || uid(),
      time = new Date().toISOString(),
      route = c.req.routePath || "/api/*";
    try {
      await store.db.transaction(async () => {
        await store.db.update("errorEvents",{id:requestId},{$setOnInsert:{id:requestId,createdAt:time,method:c.req.method,route:route,errorType:error.name}},{upsert:true});
      })();
    } catch {
      /* A logging failure must not replace the original response. */
    }
    console.error(
      JSON.stringify({
        level: "error",
        event: "request_failed",
        requestId,
        route,
        errorType: error.name,
        ...(typeof (error as any).code === "string" &&
        /^[A-Z0-9]{5}$/.test((error as any).code)
          ? { databaseCode: (error as any).code }
          : {}),
        time,
      }),
    );
    return c.json(
      {
        error:
          "Something went wrong while saving your request. Your existing work is safe. Try again.",
        code:"INTERNAL_ERROR",requestId,
      },
      500,
    );
  });
  return app;
}
