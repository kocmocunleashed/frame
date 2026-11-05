import { JobQueue } from "./jobs";
import { cleanupUploads } from "./uploads";
import type { Store } from "./store";
/** Logical cleanup is resumable. Immutable content and physical objects are retained. */
export async function maintain(store: Store, { dryRun = true } = {}) {
  const expiredJobs = await store.db.count("jobs", {
      status: "running",
      leaseOwner: { notEqual: null },
      leaseUntil: { atMost: Date.now() },
    }),
    uploads = await store.db.count("uploadIntents", {
      expiresAt: { atMost: Date.now() },
    }),
    tombstones = await store.db.find(
      "deletionTombstones",
      { state: "marked" },
      { limit: 20 },
    );
  if (!dryRun) {
    await new JobQueue(store).recover();
    await cleanupUploads(store);
    for (const c of ["presence", "rateLimits", "sessions", "verifications"])
      await store.db.remove(c, { expiresAt: { atMost: Date.now() } });
    await store.db.remove("authRateLimits", {
      lastRequest: { atMost: Date.now() - 86400000 },
    });
    await store.db.update(
      "liveSessions",
      { endedAt: null, expiresAt: { atMost: Date.now() } },
      { set: { endedAt: new Date().toISOString() }, increment: { version: 1 } },
    );
    for (const root of tombstones)
      await store.db.transaction(async () => {
        const current = await store.db.one("deletionTombstones", {
          id: root.id,
          state: "marked",
        });
        if (!current) return;
        const deck = await store.db.one("decks", { id: root.deckId });
        if (deck && !deck.deletedAt)
          throw new Error("Deletion requires an access-revoked tombstone.");
        for (const collection of [
          "comments",
          "presence",
          "collaborators",
          "revisions",
        ])
          await store.db.remove(collection, { deckId: root.deckId });
        await store.db.update(
          "jobs",
          { deckId: root.deckId, status: { inList: ["queued", "running"] } },
          {
            set: {
              status: "cancelled",
              cancelRequestedAt: Date.now(),
              leaseOwner: null,
              leaseUntil: null,
            },
          },
        );
        await store.db.remove("decks", {
          id: root.deckId,
          deletedAt: { present: true },
        });
        await store.db.update(
          "deletionTombstones",
          { id: root.id, state: "marked" },
          { set: { state: "cleaned", updatedAt: new Date().toISOString() } },
        );
      });
  }
  return {
    dryRun,
    expiredJobs,
    expiredUploads: uploads,
    contentCleanup: "retain-unreferenced",
    pendingTombstones: tombstones.length,
  };
}
