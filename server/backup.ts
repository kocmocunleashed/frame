import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { BSON } from "mongodb";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { Database, contentHash } from "./database";
import { objectStorage, type ObjectArea } from "./storage";
import type { Store } from "./store";
import { indexDefinitions, MIGRATION_VERSION } from "./repositories/indexes";
type FileEntry = {
  path: string;
  sha256: string;
  bytes: number;
  collection?: string;
  area?: ObjectArea;
  key?: string;
  version?: string;
};
export type BackupManifest = {
  version: 1;
  schemaVersion: number;
  createdAt: string;
  encrypted: boolean;
  files: FileEntry[];
  counts: Record<string, number>;
};
function encryptionKey() {
  const raw = process.env.FRAME_BACKUP_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production")
      throw new Error(
        "Set FRAME_BACKUP_KEY to a separate 32-byte hexadecimal backup encryption key.",
      );
    return null;
  }
  if (!/^[a-f0-9]{64}$/i.test(raw))
    throw new Error("Invalid backup encryption key.");
  return Buffer.from(raw, "hex");
}
function encrypt(bytes: Buffer, key: Buffer | null) {
  if (!key) return bytes;
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
}
function decrypt(bytes: Buffer, key: Buffer | null) {
  if (!key) return bytes;
  const decipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  decipher.setAuthTag(bytes.subarray(12, 28));
  return Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]);
}
function safe(root: string, path: string) {
  if (
    !/^(collections\/[A-Za-z]+\.bson|objects\/(assets|exports)-[a-zA-Z0-9-]+)$/.test(
      path,
    )
  )
    throw new Error("Invalid backup path.");
  const result = resolve(root, path);
  if (!result.startsWith(resolve(root) + "/"))
    throw new Error("Invalid backup path.");
  return result;
}
export async function backup(store: Store, directory: string) {
  await store.db.ready;
  await mkdir(directory, { recursive: false, mode: 0o700 });
  await mkdir(join(directory, "collections"), { mode: 0o700 });
  await mkdir(join(directory, "objects"), { mode: 0o700 });
  const key = encryptionKey(),
    manifest: BackupManifest = {
      version: 1,
      schemaVersion: MIGRATION_VERSION,
      createdAt: new Date().toISOString(),
      encrypted: !!key,
      files: [],
      counts: {},
    };
  const objects = new Map<
    string,
    { area: ObjectArea; key: string; version?: string }
  >();
  const write = async (
    path: string,
    bytes: Buffer,
    extra: Partial<FileEntry> = {},
  ) => {
    const encoded = encrypt(bytes, key);
    await writeFile(safe(directory, path), encoded, {
      mode: 0o600,
      flag: "wx",
    });
    manifest.files.push({
      path,
      bytes: encoded.length,
      sha256: contentHash(encoded),
      ...extra,
    });
  };
  // Snapshot reads share a MongoDB cluster time. Final files are immutable and physical cleanup is disabled.
  const session = store.db.client.startSession({ snapshot: true });
  try {
    for (const collection of Object.keys(indexDefinitions)) {
      const parts: Buffer[] = [];
      let count = 0;
      for await (const row of store.db.raw
        .collection(collection)
        .find({}, { session })) {
        parts.push(Buffer.from(BSON.serialize(row)));
        count++;
        if (collection === "assets" && row.storageKey)
          objects.set("assets:" + row.storageKey, {
            area: "assets",
            key: row.storageKey,
            version: row.objectVersion,
          });
      }
      manifest.counts[collection] = count;
      await write(`collections/${collection}.bson`, Buffer.concat(parts), {
        collection,
      });
    }
  } finally {
    await session.endSession();
  }
  // Job output records point to immutable exports; retain all export bytes to include every snapshot-time result.
  const storage = objectStorage();
  for await (const file of storage.list("exports"))
    objects.set("exports:" + file.key, {
      area: "exports",
      key: file.key,
      version: file.version,
    });
  for (const object of objects.values()) {
    const bytes = Buffer.from(
      await storage.read(
        object.area,
        object.key,
        256 * 1024 * 1024,
        object.version,
      ),
    );
    await write(`objects/${object.area}-${object.key}`, bytes, object);
  }
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    { mode: 0o600, flag: "wx" },
  );
  await verifyBackup(directory);
  return manifest;
}
export async function verifyBackup(directory: string) {
  const manifest = JSON.parse(
    await readFile(join(directory, "manifest.json"), "utf8"),
  ) as BackupManifest;
  if (
    manifest.version !== 1 ||
    manifest.schemaVersion !== MIGRATION_VERSION ||
    !Array.isArray(manifest.files)
  )
    throw new Error("Unsupported backup manifest.");
  const key = manifest.encrypted ? encryptionKey() : null;
  if (manifest.encrypted && !key)
    throw new Error("The backup encryption key is required.");
  const seen = new Set();
  for (const file of manifest.files) {
    if (seen.has(file.path)) throw new Error("Duplicate backup file.");
    seen.add(file.path);
    const bytes = await readFile(safe(directory, file.path));
    if (bytes.length !== file.bytes || contentHash(bytes) !== file.sha256)
      throw new Error("Backup checksum verification failed.");
    const plain = decrypt(bytes, key);
    if (file.collection) {
      if (!(file.collection in indexDefinitions))
        throw new Error("Unknown backup collection.");
      let n = 0;
      for (let i = 0; i < plain.length;) {
        const length = plain.readInt32LE(i);
        if (length < 5 || i + length > plain.length)
          throw new Error("Invalid BSON backup.");
        BSON.deserialize(plain.subarray(i, i + length));
        i += length;
        n++;
      }
      if (n !== manifest.counts[file.collection])
        throw new Error("Backup count mismatch.");
    }
  }
  if (
    Object.keys(indexDefinitions).some(
      (c) => !manifest.files.some((f) => f.collection === c),
    )
  )
    throw new Error("Backup is missing a collection.");
  return manifest;
}
export async function restoreBackup(store: Store, directory: string) {
  const manifest = await verifyBackup(directory);
  await store.db.ready;
  const existing = await store.db.raw.listCollections().toArray();
  for (const collection of existing)
    if (await store.db.raw.collection(collection.name).countDocuments())
      throw new Error("Restore requires an empty isolated database.");
  const storage = objectStorage();
  for (const area of ["assets", "exports"] as const)
    for await (const _ of storage.list(area))
      throw new Error("Restore requires an empty private storage namespace.");
  const key = manifest.encrypted ? encryptionKey() : null;
  for (const file of manifest.files) {
    const plain = decrypt(await readFile(safe(directory, file.path)), key);
    if (file.collection) {
      if (
        [
          "erxesSessions",
          "erxesTickets",
          "presence",
          "workerHeartbeats",
          "operationLeases",
        ].includes(file.collection)
      )
        continue;
      for (let i = 0; i < plain.length;) {
        const length = plain.readInt32LE(i);
        const row = BSON.deserialize(plain.subarray(i, i + length));
        i += length;
        if (file.collection === "liveSessions" && !row.endedAt)
          row.endedAt = new Date();
        if (
          file.collection === "jobs" &&
          ["queued", "running"].includes(row.status)
        ) {
          row.status = "cancelled";
          row.cancelRequestedAt = new Date();
          row.leaseOwner = null;
          row.leaseUntil = null;
          row.error = "Restored backup; resume this workflow explicitly.";
        }
        await store.db.raw.collection(file.collection).insertOne(row);
      }
    } else if (file.area && file.key)
      await storage.put(file.area, file.key, plain);
  }
  await store.migrate();
  for (const row of await store.db.find("decks", {}, { limit: 100000 })) {
    const doc = await store.readSnapshot(row.headSnapshotId);
    await store.validateAssets(doc);
  }
  return { ok: true, collections: Object.keys(manifest.counts).length };
}
