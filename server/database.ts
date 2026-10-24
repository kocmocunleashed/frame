import { AsyncLocalStorage } from "node:async_hooks";
import {
  MongoClient,
  type ClientSession,
  type Document,
  Binary,
} from "mongodb";
import { createHash, randomUUID } from "node:crypto";
import { indexDefinitions, MIGRATION_VERSION } from "./repositories/indexes";

const numericDates = new Set([
  "expiresAt",
  "leaseUntil",
  "availableAt",
  "lastSeen",
  "cancelRequestedAt",
]);
const dates = new Set([
  "createdAt",
  "updatedAt",
  "resolvedAt",
  "revokedAt",
  "endedAt",
  "deletedAt",
  "sentAt",
  "appliedAt",
  "windowStart",
  ...numericDates,
]);
const largeFields: Record<string, string[]> = {
  jobs: ["payload", "result"],
  creationDrafts: ["data"],
  sources: ["text"],
  compositions: ["elements"],
  themes: ["data"],
  brandKits: ["data"],
};
export const contentHash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
/** MongoDB unit of work. No SQL, protocol emulation, or process-local persistence. */
export class Database {
  readonly client: MongoClient;
  readonly name: string;
  readonly ready: Promise<void>;
  readonly ephemeral = false;
  private context = new AsyncLocalStorage<ClientSession>();
  constructor(
    uri = process.env.MONGODB_URI,
    name = process.env.MONGODB_DATABASE,
  ) {
    if (!uri || !/^mongodb(\+srv)?:\/\//.test(uri))
      throw new Error(
        "Set MONGODB_URI to a MongoDB replica-set connection string.",
      );
    this.name =
      name ||
      new URL(
        uri.replace("mongodb+srv:", "http:").replace("mongodb:", "http:"),
      ).pathname.slice(1) ||
      "frame_dev";
    this.client = new MongoClient(uri, {
      maxPoolSize: 20,
      serverSelectionTimeoutMS: 5000,
      retryWrites: true,
    });
    this.ready = this.client.connect().then(async () => {
      const hello = await this.client.db().admin().command({ hello: 1 });
      if (!hello.setName && hello.msg !== "isdbgrid")
        throw new Error("Frame requires a MongoDB replica set.");
    });
  }
  get raw() {
    return this.client.db(this.name);
  }
  get options() {
    return this.context.getStore() ? { session: this.context.getStore() } : {};
  }
  get inTransaction() {
    return !!this.context.getStore();
  }
  private filter(input: any): any {
    if (
      input instanceof Date ||
      input instanceof RegExp ||
      input === null ||
      typeof input !== "object"
    )
      return input;
    if (Array.isArray(input)) return input.map((v) => this.filter(v));
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => {
        const k = key === "id" ? "_id" : key;
        const convert = (v: any, op = ""): any => {
          if (v === null || op === "$exists" || op === "$type") return v;
          if (Array.isArray(v)) return v.map((x) => convert(x));
          if (typeof v === "object" && !(v instanceof Date))
            return Object.fromEntries(
              Object.entries(v).map(([operator, x]) => [
                operator,
                convert(x, operator),
              ]),
            );
          return new Date(v);
        };
        return [k, dates.has(key) ? convert(value) : this.filter(value)];
      }),
    );
  }
  private async encode(collection: string, value: any) {
    const row: any = { ...value };
    if (["publications", "liveSessions"].includes(collection) && row.document) {
      const doc = JSON.parse(row.document);
      row.snapshotId = await this.snapshotPut(doc);
      delete row.document;
    }
    if ("id" in row) {
      row._id = row.id;
      delete row.id;
    }
    for (const k of dates) if (row[k] != null) row[k] = new Date(row[k]);
    for (const field of largeFields[collection] || []) {
      if (field in row && row[field] === null) row[field + "ContentId"] = null;
      if (row[field] != null) {
        const text =
          typeof row[field] === "string"
            ? row[field]
            : JSON.stringify(row[field]);
        row[field + "ContentId"] = await this.contentPut(
          row.workspaceId || row.ownerId || "system",
          text,
        );
        if (field === "payload") {
          const payload = JSON.parse(text);
          row.workflowVersion = payload.workflowVersion;
          row.draftId = payload.draftId;
        }
        delete row[field];
      }
    }
    return row;
  }
  private async decode(
    collection: string,
    value: any,
    hydrateSnapshot = true,
  ): Promise<any> {
    if (!value) return null;
    const row: any = { ...value };
    if ("_id" in row) {
      row.id = row._id;
      delete row._id;
    }
    for (const k of dates)
      if (row[k] instanceof Date)
        row[k] = numericDates.has(k) ? row[k].getTime() : row[k].toISOString();
    for (const field of largeFields[collection] || [])
      if (row[field + "ContentId"])
        row[field] = await this.contentRead(row[field + "ContentId"]);
    if (
      hydrateSnapshot &&
      ["publications", "liveSessions"].includes(collection) &&
      row.snapshotId
    )
      row.document = JSON.stringify(await this.snapshotRead(row.snapshotId));
    return row;
  }
  async snapshotPut(doc: any) {
    const { slides, ...metadata } = doc;
    const metadataContentId = await this.contentPut(
      doc.workspaceId,
      JSON.stringify(metadata),
    );
    const slideRefs = [];
    for (const slide of slides)
      slideRefs.push({
        id: slide.id,
        contentId: await this.contentPut(
          doc.workspaceId,
          JSON.stringify(slide),
        ),
      });
    const id = randomUUID();
    await this.raw.collection("snapshots").insertOne({
      _id: id as any,
      workspaceId: doc.workspaceId,
      schemaVersion: doc.version,
      metadataContentId,
      slideRefs,
      createdAt: new Date(),
    });
    return id;
  }
  async snapshotRead(id: string) {
    await this.ready;
    const root = await this.raw
      .collection("snapshots")
      .findOne({ _id: id as any });
    if (!root) throw new Error("Missing snapshot.");
    const metadata = JSON.parse(
      await this.contentRead(root.metadataContentId, root.workspaceId),
    );
    const slides = [];
    let size = Buffer.byteLength(JSON.stringify(metadata));
    for (const ref of root.slideRefs) {
      const text = await this.contentRead(ref.contentId, root.workspaceId);
      size += Buffer.byteLength(text);
      if (size > MAX_DOCUMENT_BYTES) throw new Error("Oversized snapshot.");
      slides.push(JSON.parse(text));
    }
    return { ...metadata, slides };
  }
  async one(
    collection: string,
    filter: any = {},
    options: any = {},
  ): Promise<any> {
    await this.ready;
    const { hydrateSnapshot = true, ...queryOptions } = options;
    return this.decode(
      collection,
      await this.raw
        .collection(collection)
        .findOne(this.filter(filter), { ...queryOptions, ...this.options }),
      hydrateSnapshot,
    );
  }
  async find(
    collection: string,
    filter: any = {},
    options: any = {},
  ): Promise<any[]> {
    await this.ready;
    const { sort, limit = 1000, skip = 0, ...rest } = options;
    const rows = await this.raw
      .collection(collection)
      .find(this.filter(filter), { ...rest, ...this.options })
      .sort(sort || { _id: 1 })
      .skip(skip)
      .limit(limit)
      .toArray();
    const out = [];
    for (const row of rows) out.push(await this.decode(collection, row));
    return out;
  }
  async count(collection: string, filter: any = {}) {
    await this.ready;
    return this.raw
      .collection(collection)
      .countDocuments(this.filter(filter), this.options);
  }
  async insert(collection: string, value: any) {
    await this.ready;
    const row = await this.encode(collection, { id: randomUUID(), ...value });
    await this.raw.collection(collection).insertOne(row, this.options);
    return { changes: 1 };
  }
  async update(collection: string, filter: any, patch: any, options: any = {}) {
    await this.ready;
    const update: any = { ...patch };
    if (update.$set) update.$set = await this.encode(collection, update.$set);
    if (update.$setOnInsert)
      update.$setOnInsert = await this.encode(collection, update.$setOnInsert);
    if (options.upsert) {
      update.$setOnInsert ||= {};
      if (!update.$setOnInsert._id && !update.$set?._id)
        update.$setOnInsert._id =
          filter.id || contentHash(collection + JSON.stringify(filter));
    }
    const result = await this.raw
      .collection(collection)
      .updateMany(this.filter(filter), update, { ...options, ...this.options });
    return { changes: result.modifiedCount + result.upsertedCount };
  }
  async atomic(collection: string, filter: any, patch: any, options: any = {}) {
    await this.ready;
    const update = { ...patch };
    if (update.$set) update.$set = await this.encode(collection, update.$set);
    if (update.$setOnInsert)
      update.$setOnInsert = await this.encode(collection, update.$setOnInsert);
    if (options.upsert) {
      update.$setOnInsert ||= {};
      if (!update.$setOnInsert._id && !update.$set?._id)
        update.$setOnInsert._id =
          filter.id || contentHash(collection + JSON.stringify(filter));
    }
    return this.decode(
      collection,
      await this.raw
        .collection(collection)
        .findOneAndUpdate(this.filter(filter), update, {
          ...options,
          returnDocument: "after",
          ...this.options,
        }),
    );
  }
  async remove(collection: string, filter: any) {
    await this.ready;
    const r = await this.raw
      .collection(collection)
      .deleteMany(this.filter(filter), this.options);
    return { changes: r.deletedCount };
  }
  async aggregate(collection: string, pipeline: Document[]) {
    await this.ready;
    return this.raw
      .collection(collection)
      .aggregate(pipeline, this.options)
      .toArray();
  }
  transaction<T>(callback: () => Promise<T> | T) {
    return async (): Promise<T> => {
      await this.ready;
      if (this.context.getStore()) return callback();
      for (let attempt = 0; attempt < 5; attempt++) {
        const session = this.client.startSession();
        try {
          return (await session.withTransaction(
            () => this.context.run(session, async () => callback()),
            {
              readConcern: { level: "snapshot" },
              writeConcern: { w: "majority" },
              maxCommitTimeMS: 10000,
              timeoutMS: 20000,
            },
          ))!;
        } catch (error: any) {
          if (error.code === 11000 && attempt < 4) continue;
          throw error;
        } finally {
          await session.endSession();
        }
      }
      throw new Error("Transaction retry budget exhausted.");
    };
  }
  /** Immutable chunks are staged outside the short root transaction. Retain orphans until an exclusive GC is implemented. */
  async contentPut(workspaceId: string, text: string) {
    await this.ready;
    const bytes = Buffer.from(text, "utf8");
    if (bytes.length > MAX_DOCUMENT_BYTES)
      throw Object.assign(new Error("Content exceeds the 32 MiB limit."), {
        status: 413,
      });
    const hash = contentHash(bytes);
    const id = contentHash(workspaceId + "\0" + hash);
    const manifests = this.raw.collection("contentManifests");
    if (await manifests.findOne({ _id: id as any })) return id;
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += 1024 * 1024) {
      const chunkId = id + ":" + chunks.length;
      chunks.push(chunkId);
      await this.raw.collection("contentChunks").updateOne(
        { _id: chunkId as any },
        {
          $setOnInsert: {
            manifestId: id,
            ordinal: chunks.length - 1,
            bytes: new Binary(bytes.subarray(i, i + 1024 * 1024)),
            createdAt: new Date(),
          },
        },
        { upsert: true },
      );
    }
    await manifests.updateOne(
      { _id: id as any },
      {
        $setOnInsert: {
          workspaceId,
          hash,
          byteLength: bytes.length,
          encoding: "utf8",
          chunkIds: chunks,
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );
    return id;
  }
  async contentRead(id: string, workspaceId?: string) {
    await this.ready;
    const manifest = await this.raw
      .collection("contentManifests")
      .findOne({ _id: id as any, ...(workspaceId ? { workspaceId } : {}) });
    if (!manifest || manifest.byteLength > MAX_DOCUMENT_BYTES)
      throw new Error("Invalid content manifest.");
    const buffers: Buffer[] = [];
    for (let i = 0; i < manifest.chunkIds.length; i++) {
      const chunk = await this.raw
        .collection("contentChunks")
        .findOne({ _id: manifest.chunkIds[i], manifestId: id, ordinal: i });
      if (!chunk) throw new Error("Missing content chunk.");
      buffers.push(Buffer.from(chunk.bytes.buffer));
    }
    const bytes = Buffer.concat(buffers);
    if (
      bytes.length !== manifest.byteLength ||
      contentHash(bytes) !== manifest.hash
    )
      throw new Error("Content integrity verification failed.");
    return bytes.toString("utf8");
  }
  async migrate() {
    await this.ready;
    const owner = randomUUID(),
      now = new Date();
    const lease = await this.raw
      .collection("operationLeases")
      .findOneAndUpdate(
        {
          _id: "schema" as any,
          $or: [{ expiresAt: { $lte: now } }, { owner }],
        },
        {
          $set: { owner, expiresAt: new Date(Date.now() + 120000) },
          $inc: { token: 1 },
        },
        { upsert: true, returnDocument: "after" },
      )
      .catch((e: any) => {
        if (e.code === 11000) throw new Error("Another migration is running.");
        throw e;
      });
    let leaseLost = false;
    const renew = async () => {
      const result = await this.raw
        .collection("operationLeases")
        .updateOne(
          {
            _id: "schema" as any,
            owner,
            token: lease?.token,
            expiresAt: { $gt: new Date() },
          },
          { $set: { expiresAt: new Date(Date.now() + 120000) } },
        );
      if (result.matchedCount !== 1)
        throw new Error("The migration lease was lost.");
    };
    const heartbeat = setInterval(
      () =>
        void renew().catch(() => {
          leaseLost = true;
        }),
      10000,
    );
    const checkLease = async () => {
      if (leaseLost) throw new Error("The migration lease was lost.");
      await renew();
    };
    try {
      const checksum = contentHash(JSON.stringify(indexDefinitions));
      const prior = await this.one("schemaMigrations", {
        id: String(MIGRATION_VERSION),
      });
      if (prior && prior.checksum !== checksum)
        throw new Error(
          "Migration checksum changed. Add a new migration version.",
        );
      // Check every unique invariant before creating any indexes. Report only
      // collection/field names; duplicate identity data never enters logs.
      for (const [collection, indexes] of Object.entries(indexDefinitions)) {
        await checkLease();
        for (const index of indexes.filter((index) => index.options?.unique)) {
          const fields = Object.keys(index.key as Record<string, unknown>);
          const duplicate = await this.raw
            .collection(collection)
            .aggregate(
              [
                ...(index.options?.partialFilterExpression
                  ? [{ $match: index.options.partialFilterExpression }]
                  : []),
                {
                  $group: {
                    _id: Object.fromEntries(
                      fields.map((field, i) => [String(i), `$${field}`]),
                    ),
                    count: { $sum: 1 },
                  },
                },
                { $match: { count: { $gt: 1 } } },
                { $limit: 1 },
                { $project: { _id: 0, count: 1 } },
              ],
              { maxTimeMS: 30000, allowDiskUse: true },
            )
            .hasNext();
          if (duplicate)
            throw new Error(
              `Migration preflight found duplicates in ${collection} (${fields.join(", ")}). Resolve them before retrying.`,
            );
        }
      }
      for (const [collection, indexes] of Object.entries(indexDefinitions)) {
        await checkLease();
        if (!(await this.raw.listCollections({ name: collection }).hasNext()))
          await this.raw.createCollection(collection);
        for (const index of indexes)
          await this.raw
            .collection(collection)
            .createIndex(index.key, index.options || {});
      }
      await checkLease();
      await this.update(
        "schemaMigrations",
        { id: String(MIGRATION_VERSION) },
        {
          $setOnInsert: {
            checksum,
            appliedAt: new Date(),
            releaseId: process.env.FRAME_RELEASE_ID || "local",
          },
        },
        { upsert: true },
      );
    } finally {
      clearInterval(heartbeat);
      await this.raw
        .collection("operationLeases")
        .deleteOne({ _id: "schema" as any, owner, token: lease?.token });
    }
  }
  async ping() {
    await this.ready;
    await this.raw.command({ ping: 1 });
    return true;
  }
  async close() {
    await this.client.close();
  }
}
