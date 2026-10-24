import type { Database } from "../database";
export async function sharingOwner(db: Database, deckId: string) {
  const deck = await db.one("decks", { id: deckId });
  return deck ? db.one("users", { id: deck.ownerId }) : null;
}
export async function sharingGrants(db: Database, deckId: string) {
  const deck = await db.one("decks", { id: deckId });
  const grants = await db.find(
    "collaborators",
    { deckId },
    { sort: { createdAt: 1 } },
  );
  const out = [];
  for (const grant of grants) {
    const user = await db.one("users", { id: grant.userId });
    if (!user) continue;
    const member = await db.one("members", {
      workspaceId: deck.workspaceId,
      userId: grant.userId,
    });
    out.push({
      userId: user.id,
      name: user.name,
      email: user.email,
      role: grant.role,
      inheritedRole: ["editor", "owner"].includes(member?.role)
        ? "editor"
        : member?.role === "viewer"
          ? "viewer"
          : null,
    });
  }
  return out;
}
export async function reviewComments(db: Database, deckId: string) {
  const comments = await db.find(
    "comments",
    { deckId },
    { sort: { createdAt: 1, _id: 1 }, limit: 1000 },
  );
  const out = [];
  for (const c of comments) {
    const user = await db.one("users", { id: c.authorId });
    out.push({
      ...c,
      resolvedAt: c.resolvedAt ?? null,
      resolvedBy: c.resolvedBy ?? null,
      author: user?.name || "Former member",
    });
  }
  return out;
}
export async function activePeers(
  db: Database,
  deckId: string,
  after: number,
  except: string,
) {
  const peers = await db.find(
    "presence",
    { deckId, lastSeen: { $gt: after }, userId: { $ne: except } },
    { sort: { lastSeen: -1 }, limit: 100 },
  );
  const out = [];
  for (const p of peers) {
    const user = await db.one("users", { id: p.userId });
    if (user) out.push({ ...p, name: user.name });
  }
  return out;
}
export async function publicationExports(
  db: Database,
  publicationId: string,
  edition: number,
  format?: string,
) {
  const requests = await db.find(
    "exportRequests",
    {
      publicationId,
      publicationEdition: edition,
      ...(format ? { format } : {}),
    },
    { sort: { createdAt: -1 }, limit: 100 },
  );
  const out = [];
  for (const req of requests) {
    const job = await db.one("jobs", { id: req.jobId });
    if (job) out.push({ ...req, status: job.status, result: job.result });
  }
  return out;
}
export async function publicationAsset(
  db: Database,
  publicationId: string,
  assetId: string,
) {
  const pub = await db.one("publications", { id: publicationId, active: true });
  if (!pub) return null;
  const link = await db.one("publicationAssets", {
    publicationId,
    edition: pub.edition,
    assetId,
  });
  if (!link) return null;
  return db.one("assets", { id: assetId });
}
