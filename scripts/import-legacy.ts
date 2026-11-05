import { z } from "zod";
import { sql, getTableColumns } from "drizzle-orm";
import { Store } from "../server/store";
import { MAX_DOCUMENT_BYTES } from "../server/database";
import { documentSchema } from "../shared/schema";
import { tables } from "../server/db/schema";

const archiveSchema = z
  .object({
    version: z.literal(1),
    resources: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))),
    snapshots: z.array(
      z.object({ id: z.string().min(1), document: documentSchema }),
    ),
    historical: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();
const transient = new Set([
  "sessions",
  "verifications",
  "authRateLimits",
  "presence",
  "rateLimits",
  "operationLeases",
  "workerHeartbeats",
]);
class DryRun extends Error {}

/** Never changes the source. A populated target is rejected, even in dry-run mode. */
export async function importLegacy(
  store: Store,
  input: unknown,
  { apply = false } = {},
) {
  const archive = archiveSchema.parse(input),
    counts: Record<string, number> = {};
  for (const name of Object.keys(archive.resources)) {
    if (!Object.hasOwn(tables, name) || ["snapshots", "slides"].includes(name))
      throw new Error(`Unsupported import resource: ${name}`);
    counts[name] = archive.resources[name].length;
  }
  counts.snapshots = archive.snapshots.length;
  const targetEmpty = async () => {
    for (const name of Object.keys(tables))
      if (await store.db.count(name))
        throw new Error(
          "Import requires an empty, isolated target database. No data was replaced.",
        );
  };
  await targetEmpty();
  try {
    await store.db.transaction(async () => {
      await store.db.query.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('frame-legacy-import'))`,
      );
      await targetEmpty();
      await store.db.query.execute(sql`SET CONSTRAINTS ALL DEFERRED`);
      for (const [name, rows] of Object.entries(archive.resources)) {
        if (transient.has(name)) continue;
        const columns = getTableColumns(store.db.table(name));
        const values: Record<string, unknown>[] = [];
        for (const input of rows) {
          const row = { ...input };
          for (const key of Object.keys(row))
            if (!Object.hasOwn(columns, key))
              throw new Error(`Unsupported import field in ${name}: ${key}`);
          if (name === "users") {
            row.email = z.email().parse(String(row.email).trim().toLowerCase());
            row.emailVerified = false;
          }
          if (name === "liveSessions" && !row.endedAt)
            row.endedAt = new Date().toISOString();
          if (
            name === "jobs" &&
            ["queued", "running"].includes(String(row.status))
          )
            Object.assign(row, {
              status: "cancelled",
              leaseOwner: null,
              leaseUntil: null,
              cancelRequestedAt: Date.now(),
              error:
                "Imported workflow; resume explicitly after reviewing its inputs.",
            });
          values.push(row);
        }
        await store.db.insertMany(name, values);
      }
      const roots: Record<string, unknown>[] = [],
        slides: Record<string, unknown>[] = [];
      for (const snapshot of archive.snapshots) {
        if (
          Buffer.byteLength(JSON.stringify(snapshot.document)) >
          MAX_DOCUMENT_BYTES
        )
          throw new Error("Imported document exceeds the 32 MiB limit.");
        const { slides: content, ...metadata } = snapshot.document;
        roots.push({
          id: snapshot.id,
          workspaceId: snapshot.document.workspaceId,
          schemaVersion: snapshot.document.version,
          metadata,
        });
        for (let position = 0; position < content.length; position++)
          slides.push({
            snapshotId: snapshot.id,
            slideId: content[position].id,
            position,
            content: content[position],
          });
      }
      await store.db.insertMany("snapshots", roots);
      await store.db.insertMany("slides", slides);
      await store.db.query.execute(sql`SET CONSTRAINTS ALL IMMEDIATE`);
      for (const head of await store.db.find("decks", {}, { limit: 1000000 })) {
        const doc = await store.readSnapshot(head.headSnapshotId);
        if (
          doc.id !== head.id ||
          doc.workspaceId !== head.workspaceId ||
          doc.ownerId !== head.ownerId ||
          doc.revision !== head.revision
        )
          throw new Error(
            "Presentation head does not match its immutable snapshot.",
          );
        await store.validateAssets(doc);
      }
      if (!apply) throw new DryRun();
    })();
  } catch (error) {
    if (!(error instanceof DryRun)) throw error;
  }
  return {
    applied: apply,
    counts,
    skippedTransientResources: Object.keys(archive.resources).filter((name) =>
      transient.has(name),
    ),
    credentials:
      "Existing users require explicit local password provisioning; identities are never linked by email.",
  };
}
if (import.meta.main) {
  const path = process.argv[2];
  if (!path)
    throw new Error(
      "Usage: bun run db:import /private/archive.json [--apply]. Dry-run is the default.",
    );
  const store = new Store();
  try {
    await store.migrate();
    console.log(
      JSON.stringify(
        await importLegacy(store, await Bun.file(path).json(), {
          apply: process.argv.includes("--apply"),
        }),
      ),
    );
  } catch {
    console.error(
      "Import did not complete. The database transaction was rolled back. Check archive validation and referential integrity; no record values were logged.",
    );
    process.exitCode = 1;
  } finally {
    await store.db.close();
  }
}
