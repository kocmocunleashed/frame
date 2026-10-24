import {remoteImage} from './remote-images';
import {contentHash} from './database';
import {publicationExports} from "./repositories/relations";
import type { Hono } from "hono";
import { objectStorage } from "./storage";
import { z } from "zod";
import type { FrameDocument, User } from "../shared/schema";
import { uid } from "../shared/schema";
import {
  publicProjection,
  type PublicDocument,
  type Publication,
} from "../shared/publications";
import {
  exportRequestSchema,
  type ExportFormat,
  type ExportResult,
} from "../shared/exports";
import { Store, ApiError } from "./store";
import { JobQueue, JobFailure, publicJob, type JobRow } from "./jobs";
import { renderExport } from "./render-export";
import { sessionUser, type SessionUser } from "./auth-session";
import type { PublicationStore } from "./publications";
export class ExportService {
  constructor(
    public store: Store,
    public queue: JobQueue,
  ) {}
  async create(
    doc: FrameDocument,
    user: User,
    format: ExportFormat,
    scale: number,
    key: string,
    publication: Publication | null = null,
  ): Promise<JobRow> {
    const authorized = await this.store.access(doc.id, user, true);
    if (!publication && authorized.revision !== doc.revision)
      throw new ApiError(
        409,
        "Save the current presentation before exporting.",
      );
    const existing = (await this.store.db.one("jobs",{$and:[{ownerId:user.id},{idempotencyKey:key}]})) as JobRow | null;
    if (existing) {
      const previous = JSON.parse(existing.payload);
      if (
        existing.kind !== "export" ||
        existing.deckId !== doc.id ||
        previous.sourceRevision !== doc.revision ||
        previous.format !== format ||
        previous.scale !== scale ||
        previous.publicationId !== (publication?.id || null) ||
        previous.publicationEdition !== (publication?.revision || null)
      )
        throw new ApiError(
          409,
          "This export key belongs to a different request.",
        );
      return existing;
    }
    const snapshot = publicProjection(doc, (id) => `/api/assets/${id}`);
    if (
      snapshot.slides.some((s) =>
        s.elements.some(
          (e) =>
            (e.type === "image" || e.type === "video") &&
            e.src?.startsWith("https://"),
        ),
      )
    )
      throw new ApiError(
        400,
        "Upload external images and video to Frame before exporting so the download can be self-contained.",
      );
    return await this.store.db.transaction(async () => {
      const job = await this.queue.enqueue(
        user.id,
        "export",
        {
          document: snapshot,
          sourceRevision: doc.revision,
          format,
          scale,
          publicationId: publication?.id || null,
          publicationEdition: publication?.revision || null,
        },
        key,
        doc.id,
      );
      await this.store.db.update("exportRequests",{jobId:job.id},{$setOnInsert:{jobId:job.id,deckId:doc.id,publicationId:publication?.id || null,publicationEdition:publication?.revision || null,format:format,createdAt:new Date().toISOString()}},{upsert:true});
      return job;
    })();
  }
  async preparePublication(
    doc: FrameDocument,
    user: User,
    publication: Publication,
    keySuffix = "initial",
  ) {
    for (const format of ["html", "pdf"] as const)
      await this.create(
        doc,
        user,
        format,
        1,
        `publication-${publication.id}-${publication.revision}-${format}-${keySuffix}`,
        publication,
      );
  }
  async list(docId: string, user: User): Promise<JobRow[]> {
    await this.store.access(docId, user, true);
    return (await this.store.db.find("jobs",{$and:[{ownerId:user.id},{kind:"export"},{deckId:docId}]},{sort:{createdAt:-1},limit:30})) as JobRow[];
  }
  async run(
    job: JobRow,
    context: {
      signal: AbortSignal;
      progress: (step: string, percent: number) => void | Promise<void>;
    },
  ): Promise<ExportResult> {
    const payload = JSON.parse(job.payload) as {
      document: PublicDocument;
      format: ExportFormat;
      scale: number;
    };
    const user = await this.store.user(job.ownerId);
    if (!user) throw new JobFailure("The export owner is unavailable.");
    const original = await this.store.access(job.deckId!, user, true),
      doc = structuredClone(payload.document),
      assets: Record<string, string> = {};
    let total = 0;
    const wanted = [
      ...new Set(
        doc.slides
          .flatMap((s) =>
            s.elements.flatMap((el) => [
              ...(el.type === "image" ||
              (el.type === "video" && payload.format === "html")
                ? [el.src]
                : []),
              ...(el.type === "video" ? [el.media?.poster] : []),
            ]),
          )
          .filter((src): src is string => !!src?.startsWith("/api/assets/"))
          .map((src) => src.slice("/api/assets/".length)),
      ),
    ];
    for (const id of wanted) {
      if (context.signal.aborted) throw new JobFailure("Export cancelled.");
      const row = (await this.store.db.one("assets",{$and:[{id:id},{workspaceId:original.workspaceId}]})) as {
        mime: string;
        storageKey: string;
        bytes: number;
      } | null;
      if (!row || !/^image\/|^video\//.test(row.mime))
        throw new JobFailure(
          "A referenced image or video is unavailable. Replace it before exporting.",
        );
      total += row.bytes;
      if (total > 52 * 1024 * 1024)
        throw new JobFailure(
          "Embedded media exceeds 52 MB. Reduce media size or split the deck.",
        );
      const bytes = await objectStorage().read(
        "assets",
        row.storageKey,
        52 * 1024 * 1024,
      );
      assets[id] =
        `data:${row.mime};base64,${Buffer.from(bytes).toString("base64")}`;
    }
    const remote=new Map<string,string>();
    for(const slide of doc.slides)for(const element of slide.elements){
      for(const property of ['src','poster'] as const){
        const source=property==='src'&&element.type==='image'?element.src:property==='poster'?element.media?.poster:undefined;
        if(!source?.startsWith('https://'))continue;
        let id=remote.get(source);
        if(!id){const image=await remoteImage(source,context.signal);total+=image.bytes.length;if(total>52*1024*1024)throw new JobFailure('Embedded media exceeds 52 MiB. Reduce media or split the deck.');id='external-'+contentHash(source);remote.set(source,id);assets[id]=`data:${image.mime};base64,${Buffer.from(image.bytes).toString('base64')}`;}
        if(property==='src')element.src=`/api/assets/${id}`;else if(element.media)element.media.poster=`/api/assets/${id}`;
      }
      if(payload.format==='html'&&element.type==='video'&&element.src?.startsWith('https://'))throw new JobFailure('Upload linked videos to Frame before creating an offline HTML export.');
    }
    const rendered = await renderExport(
      doc,
      assets,
      payload.format,
      payload.scale,
      context,
    );
    if (context.signal.aborted) throw new JobFailure("Export cancelled.");
    const storageKey = uid();
    await objectStorage().put(
      "exports",
      storageKey,
      rendered.bytes,
      rendered.mime,
    );
    if (context.signal.aborted) {
      await objectStorage()
        .delete("exports", storageKey)
        .catch(() => {});
      throw new JobFailure("Export cancelled.");
    }
    const basename =
      doc.title
        .normalize("NFKD")
        .replace(/[^a-zA-Z0-9 _-]/g, "")
        .trim()
        .slice(0, 100) || "presentation";
    return {
      storageKey,
      filename: `${basename}.${rendered.extension}`,
      mime: rendered.mime,
      bytes: rendered.bytes.length,
      format: payload.format,
      warnings: rendered.warnings,
    };
  }
  async publicDownloads(publication: Publication): Promise<
    {
      format: ExportFormat;
      href: string;
      bytes: number;
    }[]
  > {
    if (!publication.allowDownload) return [];
    const rows = (await (await publicationExports(this.store.db,publication.id,publication.revision)).filter(r=>r.status==="succeeded")) as {
      format: ExportFormat;
      result: string;
    }[];
    return rows
      .filter(
        (row, i) =>
          rows.findIndex((other) => other.format === row.format) === i,
      )
      .map((row) => ({
        format: row.format,
        href: `/api/publications/${publication.id}/download/${row.format}`,
        bytes: (JSON.parse(row.result) as ExportResult).bytes,
      }));
  }
  async publicDownloadState(
    publication: Publication,
  ): Promise<"disabled" | "preparing" | "ready" | "failed"> {
    if (!publication.allowDownload) return "disabled";
    const active = (await ({n:(await publicationExports(this.store.db,publication.id,publication.revision)).filter(r=>["queued","running"].includes(r.status)).length})) as {
      n: number;
    };
    if (active.n) return "preparing";
    return (await this.publicDownloads(publication)).length >= 2
      ? "ready"
      : "failed";
  }
  async file(result: ExportResult): Promise<Response> {
    if (!/^[a-zA-Z0-9-]+$/.test(result.storageKey))
      throw new ApiError(404, "Export not found.");
    const storage = objectStorage(),
      file = await storage.stat("exports", result.storageKey);
    if (!file)
      throw new ApiError(
        410,
        "This export file is no longer available. Create a new export.",
      );
    return new Response(await storage.stream("exports", result.storageKey), {
      headers: {
        "Content-Type": result.mime,
        "Content-Length": String(file.bytes),
        "Content-Disposition": `attachment; filename="${result.filename.replace(/["\r\n\\]/g, "_")}"`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
}
export function registerExportRoutes(
  app: Hono<{
    Variables: {
      user: User;
    };
  }>,
  exports: ExportService,
) {
  app.get("/api/decks/:id/exports", async (c) =>
    c.json(
      (await exports.list(c.req.param("id"), c.get("user"))).map(publicJob),
    ),
  );
  app.post("/api/decks/:id/exports", async (c) => {
    const user = c.get("user"),
      input = exportRequestSchema.parse(await c.req.json()),
      doc = await exports.store.access(c.req.param("id"), user, true);
    if (input.baseRevision !== doc.revision)
      throw new ApiError(
        409,
        "Save the current presentation before exporting.",
      );
    return c.json(
      publicJob(
        await exports.create(doc, user, input.format, input.scale, input.key),
      ),
      202,
    );
  });
  app.get("/api/exports/:jobId/download", async (c) => {
    const user = c.get("user"),
      job = await exports.queue.get(c.req.param("jobId"), user.id);
    if (job.kind !== "export" || !job.deckId)
      throw new ApiError(404, "Export not found.");
    await exports.store.access(job.deckId, user, true);
    if (job.status !== "succeeded" || !job.result)
      throw new ApiError(409, "Wait for the export to finish.");
    return exports.file(JSON.parse(job.result));
  });
}
export function registerPublicDownloadRoutes(
  app: Hono<{
    Variables: {
      user: User;
    };
  }>,
  exports: ExportService,
  publications: PublicationStore,
  resolveSession: SessionUser = sessionUser,
) {
  app.get("/api/publications/:id/download/:format", async (c) => {
    const user = await resolveSession(exports.store, c.req.raw.headers),
      row = await publications.access(c.req.param("id"), user),
      publication = publications.metadata(row);
    if (!publication.allowDownload)
      throw new ApiError(403, "The owner has disabled downloads.");
    const format = z
      .enum(["pdf", "html", "images", "pptx"])
      .parse(c.req.param("format"));
    const result = (await (await publicationExports(exports.store.db,publication.id,publication.revision,format)).find(r=>r.status==="succeeded")) as {
      result: string;
    } | null;
    if (!result)
      throw new ApiError(
        409,
        "This download is not ready. The owner can prepare it from publishing settings.",
      );
    return exports.file(JSON.parse(result.result));
  });
}
