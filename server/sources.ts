import { objectStorage } from "./storage";
import type { Hono } from "hono";
import { sourceInputSchema, type SourceRecord } from "../shared/ai";
import { uid, type User } from "../shared/schema";
import { Store, ApiError } from "./store";
import { JobQueue, JobWorker } from "./jobs";
import { SOURCE_FILE_LIMIT } from "./extract-core";
type SourceRow = {
  id: string;
  ownerId: string;
  workspaceId: string;
  name: string;
  mime: string;
  assetId: string | null;
  jobId: string | null;
  text: string;
  warnings: string;
  createdAt: string;
};
export class SourceStore {
  constructor(
    public store: Store,
    public queue: JobQueue,
  ) {}
  private async project(row: SourceRow): Promise<SourceRecord> {
    const result: SourceRecord = {
      id: row.id,
      name: row.name,
      mime: row.mime,
      text: row.text,
      warnings: JSON.parse(row.warnings),
      status: "ready",
      error: null,
      jobId: row.jobId,
      createdAt: row.createdAt,
    };
    if (row.jobId) {
      const job = await this.queue.get(row.jobId, row.ownerId);
      result.status = job.status === "succeeded" ? "ready" : job.status;
      result.error = job.error;
      if (job.result) {
        const data = JSON.parse(job.result);
        result.text = data.text;
        result.warnings = data.warnings;
      }
    }
    return result;
  }
  async get(id: string, user: User): Promise<SourceRecord> {
    const row = (await this.store.db.one("sources",{$and:[{id:id},{ownerId:user.id},{workspaceId:user.workspaceId}]})) as SourceRow | null;
    if (!row) throw new ApiError(404, "Source not found.");
    return await this.project(row);
  }
  async list(user: User): Promise<SourceRecord[]> {
    return await Promise.all(
      (
        (await this.store.db.find("sources",{$and:[{ownerId:user.id},{workspaceId:user.workspaceId}]},{sort:{createdAt:-1},limit:100})) as SourceRow[]
      ).map(async (row) => await this.project(row)),
    );
  }
  async selected(ids: string[], user: User): Promise<SourceRecord[]> {
    const rows = await Promise.all(
      [...new Set(ids)].map(async (id) => await this.get(id, user)),
    );
    if (rows.some((s) => s.status !== "ready" || !s.text))
      throw new ApiError(
        400,
        "Wait for source extraction to finish and select sources with readable text.",
      );
    if (rows.reduce((n, s) => n + s.text.length, 0) > 120000)
      throw new ApiError(
        400,
        "Selected sources exceed 120,000 characters. Choose fewer sources or split the material.",
      );
    return rows;
  }
  private async limit(user: User) {
    if(this.store.db.inTransaction)await this.store.db.update("jobQuotas",{id:user.id},{$inc:{revision:1}});
    const count = (await ({n:await this.store.db.count("sources",{ownerId:user.id})})) as {
      n: number;
    };
    if (count.n >= 100)
      throw new ApiError(
        400,
        "You can keep up to 100 sources. Remove an unused source first.",
      );
  }
  async paste(user: User, name: string, text: string): Promise<SourceRecord> {
    const data = sourceInputSchema.parse({ name, text }),
      id = uid();
    await this.store.db.transaction(async () => {
      await this.limit(user);
      await this.store.db.insert("sources",{id:id,ownerId:user.id,workspaceId:user.workspaceId,name:data.name,mime:"text/plain",assetId:null,jobId:null,text:data.text,warnings:"[]",createdAt:new Date().toISOString()});
    })();
    return await this.get(id, user);
  }
  async upload(
    user: User,
    file: File,
    bytes: Uint8Array,
  ): Promise<SourceRecord> {
    if (!bytes.length || bytes.length > SOURCE_FILE_LIMIT)
      throw new ApiError(413, "Use a non-empty document under 10 MB.");
    const ext = file.name.toLowerCase().split(".").pop(),
      mime =
        ext === "pdf"
          ? "application/pdf"
          : ext === "docx"
            ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            : ["txt", "md", "markdown", "csv"].includes(ext || "")
              ? "text/plain"
              : null;
    if (!mime)
      throw new ApiError(
        400,
        "Use a PDF, DOCX, TXT, Markdown or CSV document.",
      );
    const id = uid(),
      asset = uid(),
      now = new Date().toISOString(),
      storage = objectStorage();
    await this.limit(user);
    await storage.put("assets", asset, bytes, mime);
    try {
      await this.store.db.transaction(async () => {
        const member = (await this.store.db.one("members",{$and:[{userId:user.id},{workspaceId:user.workspaceId}]})) as {
          role: string;
        } | null;
        if (!member || member.role === "viewer")
          throw new ApiError(403, "Editor access is required to add sources.");
        await this.limit(user);
        await this.store.db.insert("assets",{id:asset,ownerId:user.id,workspaceId:user.workspaceId,name:file.name.slice(0, 200),mime:mime,bytes:bytes.length,storageKey:asset,createdAt:now});
        const job = await this.queue.enqueue(
          user.id,
          "extract",
          { sourceId: id, assetId: asset, name: file.name.slice(0, 200) },
          `extract-${id}`,
        );
        await this.store.db.insert("sources",{id:id,ownerId:user.id,workspaceId:user.workspaceId,name:file.name.slice(0, 200),mime:mime,assetId:asset,jobId:job.id,text:"",warnings:"[]",createdAt:now});
      })();
    } catch (error) {
      await storage.delete("assets", asset).catch(() => {});
      throw error;
    }
    return await this.get(id, user);
  }
}
export function registerSourceRoutes(
  app: Hono<{
    Variables: {
      user: User;
    };
  }>,
  sources: SourceStore,
  worker: JobWorker,
) {
  app.get("/api/sources", async (c) =>
    c.json(await sources.list(c.get("user"))),
  );
  app.get("/api/sources/:id", async (c) =>
    c.json(await sources.get(c.req.param("id"), c.get("user"))),
  );
  app.post("/api/sources", async (c) => {
    const user = c.get("user");
    const member = (await sources.store.db.one("members",{$and:[{userId:user.id},{workspaceId:user.workspaceId}]})) as {
      role: string;
    } | null;
    if (!member || member.role === "viewer")
      throw new ApiError(403, "Editor access is required to add sources.");
    if (c.req.header("content-type")?.startsWith("multipart/form-data")) {
      const data = await c.req.formData(),
        file = data.get("file");
      if (file === null || typeof file === "string")
        throw new ApiError(400, "Choose a document.");
      if (file.size > SOURCE_FILE_LIMIT)
        throw new ApiError(413, "Choose a document smaller than 10 MB.");
      return c.json(
        await sources.upload(
          user,
          file,
          new Uint8Array(await file.arrayBuffer()),
        ),
        201,
      );
    }
    const data = sourceInputSchema.parse(await c.req.json());
    return c.json(await sources.paste(user, data.name, data.text), 201);
  });
  app.delete("/api/sources/:id", async (c) => {
    const user = c.get("user"),
      source = await sources.get(c.req.param("id"), user);
    const member = (await sources.store.db.one("members",{$and:[{userId:user.id},{workspaceId:user.workspaceId}]})) as {
      role: string;
    } | null;
    if (!member || member.role === "viewer")
      throw new ApiError(403, "Editor access is required to remove sources.");
    if (source.jobId) await worker.cancel(source.jobId, user.id);
    await sources.store.db.remove("sources",{$and:[{id:source.id},{ownerId:user.id}]});
    return c.json({ ok: true });
  });
}
