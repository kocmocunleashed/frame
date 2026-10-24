import {
  mkdir,
  readdir,
  stat,
  unlink,
  writeFile,
  link,
} from "node:fs/promises";
import { join } from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
export type ObjectArea = "assets" | "exports" | "staging";
export type StoredObject = {
  key: string;
  bytes: number;
  modifiedAt: number;
  version?: string;
  checksum?: string;
  mime?: string;
};
export type StorageConfig =
  | { mode: "local"; assets: string; exports: string; staging?: string }
  | {
      mode: "s3";
      endpoint?: string;
      region: string;
      bucket: string;
      accessKeyId?: string;
      secretAccessKey?: string;
      forcePathStyle?: boolean;
    };
export class StorageFailure extends Error {
  constructor() {
    super(
      "Object storage is unavailable. Try again; your saved presentation is unchanged.",
    );
  }
}
const validKey = /^[a-zA-Z0-9-]{1,100}$/;
const missing = (e: any) =>
  e.code === "ENOENT" ||
  ["NoSuchKey", "NotFound"].includes(e.name) ||
  e.$metadata?.httpStatusCode === 404;
export function storageConfig(env = process.env): StorageConfig {
  const mode = env.FRAME_STORAGE;
  if (mode === "local") {
    if (env.NODE_ENV === "production")
      throw new Error("Production requires private S3 storage.");
    return {
      mode,
      assets: env.FRAME_ASSETS || ".frame-data/assets",
      exports: env.FRAME_EXPORTS || ".frame-data/exports",
      staging: env.FRAME_STAGING || ".frame-data/staging",
    };
  }
  if (
    mode !== "s3" ||
    !env.FRAME_S3_BUCKET ||
    !(env.FRAME_S3_REGION || env.AWS_REGION)
  )
    throw new Error(
      "S3 requires FRAME_STORAGE=s3, FRAME_S3_BUCKET and AWS_REGION. Local storage must be explicitly selected for development.",
    );
  const endpoint = env.FRAME_S3_ENDPOINT;
  if (endpoint) {
    const u = new URL(endpoint);
    if (
      u.protocol === "http:" &&
      !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)
    )
      throw new Error("Remote S3 endpoints require HTTPS.");
    if (
      u.username ||
      u.password ||
      u.search ||
      u.hash ||
      !(
        u.protocol === "https:" ||
        (env.NODE_ENV !== "production" && u.protocol === "http:")
      )
    )
      throw new Error("Invalid S3 endpoint.");
  }
  if (!!env.FRAME_S3_ACCESS_KEY !== !!env.FRAME_S3_SECRET_KEY)
    throw new Error("Both development S3 credentials are required.");
  if (
    env.NODE_ENV === "production" &&
    (env.FRAME_S3_ACCESS_KEY || env.FRAME_S3_SECRET_KEY)
  )
    throw new Error("Use ECS task-role credentials in production.");
  return {
    mode: "s3",
    bucket: env.FRAME_S3_BUCKET,
    region: env.FRAME_S3_REGION || env.AWS_REGION!,
    endpoint,
    forcePathStyle: !!endpoint,
    accessKeyId: env.FRAME_S3_ACCESS_KEY,
    secretAccessKey: env.FRAME_S3_SECRET_KEY,
  };
}
export class ObjectStorage {
  readonly client?: S3Client;
  private probeAt = 0;
  private probePromise?: Promise<void>;
  constructor(readonly config: StorageConfig = storageConfig()) {
    if (config.mode === "s3")
      this.client = new S3Client({
        region: config.region,
        endpoint: config.endpoint,
        forcePathStyle: config.forcePathStyle ?? false,
        ...(config.accessKeyId
          ? {
              credentials: {
                accessKeyId: config.accessKeyId,
                secretAccessKey: config.secretAccessKey!,
              },
            }
          : {}),
        maxAttempts: 3,
        requestHandler: { connectionTimeout: 5000, requestTimeout: 30000 },
      });
  }
  private directory(area: ObjectArea) {
    if (this.config.mode !== "local") throw new Error("Not local.");
    return this.config[area] || ".frame-data/staging";
  }
  address(area: ObjectArea, key: string) {
    if (!validKey.test(key)) throw new Error("Invalid object key.");
    return this.config.mode === "s3"
      ? { Bucket: this.config.bucket, Key: `${area}/${key}` }
      : join(this.directory(area), key);
  }
  async put(
    area: ObjectArea,
    key: string,
    bytes: Uint8Array,
    mime = "application/octet-stream",
  ) {
    const address = this.address(area, key);
    try {
      if (typeof address !== "string") {
        await this.client!.send(
          new PutObjectCommand({
            ...address,
            Body: bytes,
            ContentType: mime,
            IfNoneMatch: "*",
            ChecksumAlgorithm: "SHA256",
          }),
        );
        return;
      }
      await mkdir(this.directory(area), { recursive: true, mode: 0o700 });
      const temp = address + "." + crypto.randomUUID() + ".tmp";
      try {
        await writeFile(temp, bytes, { flag: "wx", mode: 0o600 });
        await link(temp, address);
      } finally {
        await unlink(temp).catch(() => {});
      }
    } catch {
      throw new StorageFailure();
    }
  }
  async stat(area: ObjectArea, key: string): Promise<StoredObject | null> {
    const address = this.address(area, key);
    try {
      if (typeof address === "string") {
        const s = await stat(address);
        return s.isFile()
          ? { key, bytes: s.size, modifiedAt: s.mtimeMs }
          : null;
      }
      const h = await this.client!.send(
        new HeadObjectCommand({ ...address, ChecksumMode: "ENABLED" }),
      );
      return {
        key,
        bytes: h.ContentLength!,
        modifiedAt: h.LastModified!.getTime(),
        version: h.VersionId,
        checksum: h.ChecksumSHA256,
        mime: h.ContentType,
      };
    } catch (e) {
      if (missing(e)) return null;
      throw new StorageFailure();
    }
  }
  async stream(
    area: ObjectArea,
    key: string,
    range?: { start: number; end: number },
    version?: string,
  ): Promise<ReadableStream<Uint8Array>> {
    const address = this.address(area, key);
    try {
      if (
        range &&
        (!Number.isSafeInteger(range.start) ||
          !Number.isSafeInteger(range.end) ||
          range.start < 0 ||
          range.end < range.start)
      )
        throw new Error("Invalid range");
      if (typeof address === "string") {
        const file = Bun.file(address);
        return (range ? file.slice(range.start, range.end + 1) : file).stream();
      }
      const r = await this.client!.send(
        new GetObjectCommand({
          ...address,
          VersionId: version,
          ...(range ? { Range: `bytes=${range.start}-${range.end}` } : {}),
        }),
      );
      if (!r.Body) throw new Error();
      return r.Body.transformToWebStream() as ReadableStream<Uint8Array>;
    } catch {
      throw new StorageFailure();
    }
  }
  async read(
    area: ObjectArea,
    key: string,
    limit = 125 * 1024 * 1024,
    version?: string,
  ): Promise<Uint8Array> {
    const info = await this.stat(area, key);
    if (!info) throw new Error("Stored file is no longer available.");
    if (info.bytes > limit)
      throw new Error("Stored file exceeds the allowed size.");
    const reader = (
      await this.stream(area, key, undefined, version || info.version)
    ).getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const r = await reader.read();
        if (r.done) break;
        size += r.value.length;
        if (size > limit)
          throw new Error("Stored file exceeds the allowed size.");
        parts.push(r.value);
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    return new Uint8Array(Buffer.concat(parts));
  }
  async delete(area: ObjectArea, key: string) {
    const address = this.address(area, key);
    try {
      if (typeof address === "string") await unlink(address);
      else await this.client!.send(new DeleteObjectCommand(address));
    } catch (e) {
      if (!missing(e)) throw new StorageFailure();
    }
  }
  async *list(area: ObjectArea): AsyncGenerator<StoredObject> {
    try {
      if (this.config.mode === "local") {
        const names = await readdir(this.directory(area)).catch((e) => {
          if (missing(e)) return [];
          throw e;
        });
        for (const key of names)
          if (validKey.test(key)) {
            const info = await this.stat(area, key);
            if (info) yield info;
          }
        return;
      }
      let token: string | undefined;
      do {
        const page = await this.client!.send(
          new ListObjectsV2Command({
            Bucket: this.config.bucket,
            Prefix: `${area}/`,
            ContinuationToken: token,
          }),
        );
        for (const item of page.Contents || []) {
          const key = item.Key!.slice(area.length + 1);
          if (validKey.test(key))
            yield {
              key,
              bytes: item.Size!,
              modifiedAt: item.LastModified!.getTime(),
            };
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
        if (page.IsTruncated && !token) throw new Error();
      } while (token);
    } catch {
      throw new StorageFailure();
    }
  }
  async probe() {
    if (this.probePromise && Date.now() - this.probeAt < 5000)
      return this.probePromise;
    this.probeAt = Date.now();
    return (this.probePromise = (async () => {
      if (this.config.mode === "s3") {
        await this.client!.send(
          new HeadBucketCommand({ Bucket: this.config.bucket }),
          { abortSignal: AbortSignal.timeout(4000) },
        );
      } else
        for (const area of ["assets", "exports", "staging"] as const)
          await mkdir(this.directory(area), { recursive: true, mode: 0o700 });
    })());
  }
  close() {
    this.client?.destroy();
  }
}
let cached: ObjectStorage | undefined,
  configuration = "";
export function objectStorage() {
  const config = storageConfig(),
    fingerprint = JSON.stringify(config);
  if (!cached || configuration !== fingerprint) {
    cached?.close();
    cached = new ObjectStorage(config);
    configuration = fingerprint;
  }
  return cached;
}
