import type { Hono } from "hono";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { z } from "zod";
import sharp from "sharp";
import { Store, ApiError } from "./store";
import { uid, type User } from "../shared/schema";
import { objectStorage } from "./storage";
import { contentHash } from "./database";
import { JobQueue } from "./jobs";
import { SourceStore } from "./sources";
const inputSchema = z
  .object({
    kind: z.enum(["media", "source"]),
    name: z.string().trim().min(1).max(200),
    bytes: z
      .number()
      .int()
      .positive()
      .max(50 * 1024 * 1024),
    mime: z.string().min(1).max(200),
    checksum: z.string().regex(/^[a-f0-9]{64}$/),
    presentationId: z.string().max(100).nullable().optional(),
  })
  .strict();
export async function inspectMedia(input: Uint8Array, declared: string) {
  const video =
    Buffer.from(input.subarray(4, 8)).toString() === "ftyp"
      ? "video/mp4"
      : Buffer.from(input.subarray(0, 4)).equals(
            Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
          )
        ? "video/webm"
        : null;
  if (video) {
    if (declared !== video)
      throw new ApiError(
        400,
        "The media type does not match the uploaded bytes.",
      );
    return { bytes: input, mime: video };
  }
  try {
    const image = sharp(input, { limitInputPixels: 40000000, failOn: "error" }),
      meta = await image.metadata();
    const mime = meta.format === "jpeg" ? "image/jpeg" : `image/${meta.format}`;
    if (
      !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(mime) ||
      mime !== declared ||
      (meta.pages || 1) > 1
    )
      throw new Error();
    const out = await image
      .rotate()
      .webp({ quality: 92 })
      .toBuffer({ resolveWithObject: true });
    return {
      bytes: new Uint8Array(out.data),
      mime: "image/webp",
      width: out.info.width,
      height: out.info.height,
    };
  } catch {
    throw new ApiError(
      400,
      "Use a valid still PNG, JPEG, GIF or WebP under 40 megapixels, or MP4/WebM video.",
    );
  }
}
function sourceMime(bytes: Uint8Array, name: string, declared: string) {
  const ext = name.split(".").pop()?.toLowerCase();
  let mime: string;
  if (ext === "pdf" && Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-")
    mime = "application/pdf";
  else if (ext === "docx" && bytes[0] === 0x50 && bytes[1] === 0x4b)
    mime =
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  else if (["txt", "md", "markdown", "csv"].includes(ext || "")) {
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new ApiError(400, "Text sources must use UTF-8.");
    }
    if (bytes.includes(0))
      throw new ApiError(400, "The source contains binary data.");
    mime =
      ext === "csv"
        ? "text/csv"
        : ext === "txt"
          ? "text/plain"
          : "text/markdown";
  } else
    throw new ApiError(400, "Use a valid PDF, DOCX or UTF-8 text document.");
  if (
    declared !== mime &&
    !(mime === "text/markdown" && declared === "text/plain")
  )
    throw new ApiError(
      400,
      "The source type does not match its bytes and filename.",
    );
  return mime;
}
export class Uploads {
  constructor(public store: Store) {}
  async authorize(user: User, deckId: string | null | undefined) {
    if (deckId) {
      await this.store.requireAccess(deckId, user, true);
      return (await this.store.db.one("decks", { id: deckId })).workspaceId;
    }
    const member = await this.store.db.one("members", {
      userId: user.id,
      workspaceId: user.workspaceId,
    });
    if (!member || member.role === "viewer")
      throw new ApiError(403, "Editor access is required to upload.");
    return user.workspaceId;
  }
  async get(id: string, user: User) {
    const row = await this.store.db.one("uploadIntents", {
      id,
      ownerId: user.id,
    });
    if (!row) throw new ApiError(404, "Upload not found.");
    if (!row.result && row.expiresAt <= Date.now())
      throw new ApiError(410, "Upload expired. Choose the file again.");
    await this.authorize(user, row.deckId);
    return row;
  }
  async prepare(user: User, value: unknown) {
    const input = inputSchema.parse(value);
    if (
      input.kind === "source" &&
      (input.bytes > 10 * 1024 * 1024 || input.presentationId)
    )
      throw new ApiError(
        413,
        "Source documents must be under 10 MiB and belong to your workspace.",
      );
    const id = uid(),
      stagingKey = uid();
    const intent = await this.store.db.transaction(async () => {
      const workspaceId = await this.authorize(user, input.presentationId);
      await this.store.db.update(
        "jobQuotas",
        { id: user.id },
        { $inc: { revision: 1 } },
      );
      if (
        (await this.store.db.count("uploadIntents", {
          ownerId: user.id,
          expiresAt: { $gt: Date.now() },
          status: "pending",
        })) >= 10
      )
        throw new ApiError(
          429,
          "Finish an existing upload before starting another.",
        );
      const row = {
        id,
        ownerId: user.id,
        workspaceId,
        ...input,
        deckId: input.presentationId || null,
        stagingKey,
        expiresAt: Date.now() + 15 * 60000,
        status: "pending",
        result: null,
        createdAt: new Date().toISOString(),
      };
      await this.store.db.insert("uploadIntents", row);
      return row;
    })();
    const storage = objectStorage();
    if (storage.config.mode === "local")
      return {
        id,
        expiresAt: new Date(intent.expiresAt).toISOString(),
        mode: "local",
        url: `/api/uploads/${id}/body`,
      };
    const policy = await createPresignedPost(storage.client!, {
      Bucket: storage.config.bucket,
      Key: `staging/${stagingKey}`,
      Expires: 600,
      Fields: {
        "Content-Type": input.mime,
        "x-amz-checksum-algorithm": "SHA256",
        "x-amz-checksum-sha256": Buffer.from(input.checksum, "hex").toString(
          "base64",
        ),
      },
      Conditions: [
        ["content-length-range", input.bytes, input.bytes],
        ["eq", "$Content-Type", input.mime],
        [
          "eq",
          "$x-amz-checksum-sha256",
          Buffer.from(input.checksum, "hex").toString("base64"),
        ],
      ],
    });
    return {
      id,
      mode: "s3",
      expiresAt: new Date(intent.expiresAt).toISOString(),
      ...policy,
    };
  }
  async finish(id: string, user: User) {
    const intent = await this.get(id, user);
    if (intent.result) return intent.result;
    const storage = objectStorage();
    const stat = await storage.stat("staging", intent.stagingKey);
    if (!stat || stat.bytes !== intent.bytes)
      throw new ApiError(
        400,
        "Uploaded file size does not match the approved upload.",
      );
    const raw = await storage.read(
      "staging",
      intent.stagingKey,
      intent.bytes,
      stat.version,
    );
    if (contentHash(raw) !== intent.checksum)
      throw new ApiError(400, "Uploaded file checksum does not match.");
    const inspected =
      intent.kind === "media"
        ? await inspectMedia(raw, intent.mime)
        : { bytes: raw, mime: sourceMime(raw, intent.name, intent.mime) };
    const assetId = uid(),
      sourceId = uid(),
      now = new Date().toISOString();
    await storage.put("assets", assetId, inspected.bytes, inspected.mime);
    const finalObject = await storage.stat("assets", assetId);
    if (!finalObject)
      throw new ApiError(
        503,
        "The uploaded file could not be verified. Retry this upload.",
      );
    const result = await this.store.db.transaction(async () => {
      const current = await this.get(id, user);
      if (current.result) return current.result;
      await this.store.db.update(
        "uploadIntents",
        { id, status: "pending" },
        { $set: { status: "finishing" } },
      );
      await this.store.db.insert("assets", {
        id: assetId,
        ownerId: user.id,
        workspaceId: intent.workspaceId,
        name: intent.name,
        mime: inspected.mime,
        bytes: inspected.bytes.length,
        byteLength: inspected.bytes.length,
        storageKey: assetId,
        objectVersion: finalObject.version || null,
        checksum: contentHash(inspected.bytes),
        state: "ready",
        createdAt: now,
      });
      let value: any = {
        id: assetId,
        src: `/api/assets/${assetId}`,
        name: intent.name,
        mime: inspected.mime,
        ...("width" in inspected
          ? { width: inspected.width, height: inspected.height }
          : {}),
      };
      if (intent.kind === "source") {
        const queue = new JobQueue(this.store);
        const job = await queue.enqueue(
          user.id,
          "extract",
          { sourceId, assetId, name: intent.name },
          `extract-${sourceId}`,
        );
        await this.store.db.insert("sources", {
          id: sourceId,
          ownerId: user.id,
          workspaceId: user.workspaceId,
          name: intent.name,
          mime: inspected.mime,
          assetId,
          jobId: job.id,
          text: "",
          warnings: "[]",
          createdAt: now,
        });
        value = await new SourceStore(this.store, queue).get(sourceId, user);
      }
      await this.store.db.update(
        "uploadIntents",
        { id },
        {
          $set: {
            status: "complete",
            result: value,
            resultAssetId: assetId,
            resultSourceId: intent.kind === "source" ? sourceId : null,
            updatedAt: now,
          },
        },
      );
      return value;
    })();
    return result;
  }
}
export function registerUploadRoutes(
  app: Hono<{ Variables: { user: User } }>,
  store: Store,
) {
  const uploads = new Uploads(store);
  app.get("/api/uploads/config", (c) => c.json({ directUploads: true }));
  for (const path of ["/api/uploads/prepare", "/api/uploads/token"])
    app.post(path, async (c) =>
      c.json(await uploads.prepare(c.get("user"), await c.req.json()), 201),
    );
  app.post("/api/uploads/:id/body", async (c) => {
    if (
      objectStorage().config.mode !== "local" ||
      process.env.NODE_ENV === "production"
    )
      throw new ApiError(404, "Endpoint not found.");
    const intent = await uploads.get(c.req.param("id"), c.get("user"));
    const body = await c.req.formData(),
      file = body.get("file");
    if (!(file instanceof File) || file.size !== intent.bytes)
      throw new ApiError(400, "The file size does not match.");
    await objectStorage().put(
      "staging",
      intent.stagingKey,
      new Uint8Array(await file.arrayBuffer()),
      intent.mime,
    );
    return c.json({ ok: true });
  });
  app.post("/api/uploads/:id/finish", async (c) =>
    c.json(await uploads.finish(c.req.param("id"), c.get("user")), 201),
  );
}
export async function cleanupUploads(store: Store) {
  const expired = await store.db.find(
    "uploadIntents",
    { expiresAt: { $lte: Date.now() } },
    { limit: 100 },
  );
  for (const row of expired) {
    await objectStorage().delete("staging", row.stagingKey);
    await store.db.remove("uploadIntents", { id: row.id });
  }
  return expired.length;
}
