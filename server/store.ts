import { Database, MAX_DOCUMENT_BYTES } from "./database";
import {
  documentSchema,
  uid,
  type FrameDocument,
  type User,
  type Theme,
  type Operation,
} from "../shared/schema";
import { applyOperations, cloneSlides } from "../shared/operations";
import { publicProjection, referencedAssets } from "../shared/publications";
import type { AccessRole } from "../shared/collaboration";
import { makeDocument } from "../shared/templates";
import { themeSnapshotForDocument } from "../shared/themes";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}
export class Store {
  db: Database;
  constructor(
    uri = process.env.MONGODB_URI,
    name = process.env.MONGODB_DATABASE,
  ) {
    this.db = new Database(uri, name);
  }
  async migrate() {
    await this.db.migrate();
  }
  async createUser(
    name: string,
    email: string,
    _unused = "",
    id: string = uid(),
  ): Promise<User> {
    const workspaceId = uid(),
      now = new Date().toISOString();
    email = email.trim().toLowerCase();
    return this.db.transaction(async () => {
      const existing = await this.user(id);
      if (existing) return existing;
      if (await this.db.one("users", { email }))
        throw new ApiError(
          409,
          "An unrelated account already uses this email. Accounts are never linked by email.",
        );
      await this.db.insert("users", {
        id,
        name,
        email,
        workspaceId,
        createdAt: now,
        updatedAt: now,
      });
      await this.db.insert("workspaces", {
        id: workspaceId,
        ownerId: id,
        name: `${name.split(" ")[0]}’s workspace`,
        accessEpoch: 0,
        createdAt: now,
      });
      await this.db.insert("members", {
        workspaceId,
        userId: id,
        role: "owner",
      });
      await this.db.insert("presentationCredits", {
        userId: id,
        remaining: null,
        revision: 0,
        updatedAt: now,
      });
      await this.db.insert("jobQuotas", {
        id,
        active: 0,
        live: 0,
        revision: 0,
      });
      return { id, name, email, workspaceId };
    })();
  }
  async user(id: string): Promise<User | undefined> {
    const row = await this.db.one("users", { id });
    return row
      ? {
          id: row.id,
          name: row.name,
          email: row.email,
          workspaceId: row.workspaceId,
        }
      : undefined;
  }
  async ensureAuthUser(identity: {
    id: string;
    name: string;
    email: string;
    issuer?: string;
    subject?: string;
    imported?: boolean;
  }): Promise<User> {
    return this.db.transaction(async () => {
      const key = {provider: 'clerk', issuer: identity.issuer || 'clerk', subject: identity.subject || identity.id};
      const mapping = await this.db.one('authIdentities', key);
      if(mapping){const mapped=await this.user(mapping.userId);if(!mapped)throw new ApiError(409,'This identity has an unresolved workspace mapping.');return mapped;}
      const current = await this.user(identity.id);
      if (current) {
        if(!identity.imported)throw new ApiError(409,'This account has no matching verified identity mapping.');
        await this.db.insert('authIdentities',{...key,userId:current.id});
        return current;
      }
      const user = await this.createUser(
        identity.name,
        identity.email,
        "",
        identity.id,
      );
      await this.db.insert("authIdentities", {
        ...key,
        userId: user.id,
      });
      await this.seed(user);
      return user;
    })();
  }
  async role(id: string, user: User): Promise<AccessRole | null> {
    const row = await this.db.one("decks", {
      id,
      deletedAt: { $exists: false },
    });
    if (!row) return null;
    if (row.ownerId === user.id) return "owner";
    const member = await this.db.one("members", {
      workspaceId: row.workspaceId,
      userId: user.id,
    });
    const grant = await this.db.one("collaborators", {
      deckId: id,
      userId: user.id,
    });
    if (["owner", "editor"].includes(member?.role) || grant?.role === "editor")
      return "editor";
    return member?.role === "viewer" || grant?.role === "viewer"
      ? "viewer"
      : null;
  }
  async requireAccess(
    id: string,
    user: User,
    write = false,
  ): Promise<AccessRole> {
    const role = await this.role(id, user);
    if (!role) throw new ApiError(404, "Presentation not found.");
    if (write && role === "viewer")
      throw new ApiError(
        403,
        "You have view-only access to this presentation.",
      );
    // Revocation and a committing mutation both write this guard inside their transaction.
    if (this.db.inTransaction)
      await this.db.update("decks", { id }, { $inc: { accessEpoch: 1 } });
    return role;
  }
  async snapshot(document: FrameDocument): Promise<string> {
    const doc = documentSchema.parse(document);
    if (Buffer.byteLength(JSON.stringify(doc), "utf8") > MAX_DOCUMENT_BYTES)
      throw new ApiError(
        413,
        "This presentation exceeds the 32 MiB document limit. Split it into smaller presentations.",
      );
    const { slides, ...metadata } = doc;
    const metadataContentId = await this.db.contentPut(
      doc.workspaceId,
      JSON.stringify(metadata),
    );
    const slideRefs = [];
    for (const slide of slides)
      slideRefs.push({
        id: slide.id,
        contentId: await this.db.contentPut(
          doc.workspaceId,
          JSON.stringify(slide),
        ),
      });
    const id = uid();
    await this.db.raw
      .collection("snapshots")
      .insertOne({
        _id: id as any,
        workspaceId: doc.workspaceId,
        schemaVersion: doc.version,
        metadataContentId,
        slideRefs,
        createdAt: new Date(),
      });
    return id;
  }
  async readSnapshot(id: string): Promise<FrameDocument> {
    await this.db.ready;
    const root = await this.db.raw
      .collection("snapshots")
      .findOne({ _id: id as any });
    if (!root) throw new ApiError(404, "Presentation snapshot not found.");
    const metadata = await this.db.contentRead(
      root.metadataContentId,
      root.workspaceId,
    );
    let bytes = Buffer.byteLength(metadata);
    const slides = [];
    if (root.slideRefs.length > 200)
      throw new Error("Invalid snapshot slide count.");
    for (const ref of root.slideRefs) {
      const text = await this.db.contentRead(ref.contentId, root.workspaceId);
      bytes += Buffer.byteLength(text);
      if (bytes > MAX_DOCUMENT_BYTES)
        throw new ApiError(
          413,
          "Presentation exceeds the document size limit.",
        );
      const slide = JSON.parse(text);
      if (slide.id !== ref.id) throw new Error("Invalid slide reference.");
      slides.push(slide);
    }
    return documentSchema.parse({ ...JSON.parse(metadata), slides });
  }
  async access(id: string, user: User, write = false): Promise<FrameDocument> {
    await this.requireAccess(id, user, write);
    const row = await this.db.one("decks", { id });
    return this.readSnapshot(row.headSnapshotId);
  }
  async validateAssets(doc: FrameDocument, user?: User) {
    for (const id of referencedAssets(doc)) {
      const asset = await this.db.one("assets", {
        id,
        workspaceId: doc.workspaceId,
      });
      if (!asset)
        throw new ApiError(
          400,
          "This presentation refers to media that is not available in this workspace.",
        );
    }
    if (
      doc.folderId &&
      !(await this.db.one("folders", {
        id: doc.folderId,
        workspaceId: doc.workspaceId,
      }))
    )
      throw new ApiError(400, "Choose a folder in your workspace.");
  }
  async attach(doc: FrameDocument, snapshotId: string, actorId = doc.ownerId) {
    const metadata = {
      workspaceId: doc.workspaceId,
      ownerId: doc.ownerId,
      title: doc.title,
      folderId: doc.folderId,
      status: doc.status,
      revision: doc.revision,
      headSnapshotId: snapshotId,
      width: doc.width,
      height: doc.height,
      themeId: doc.themeId,
      slideCount: doc.slides.length,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
    if (doc.revision === 0)
      await this.db.insert("decks", {
        id: doc.id,
        ...metadata,
        accessEpoch: 0,
      });
    else if (
      !(
        await this.db.update(
          "decks",
          {
            id: doc.id,
            revision: doc.revision - 1,
            deletedAt: { $exists: false },
          },
          { $set: metadata },
        )
      ).changes
    )
      throw new ApiError(
        409,
        "This presentation changed in another tab. Your edits are safe on this device.",
        "REVISION_CONFLICT",
      );
    await this.db.insert("revisions", {
      deckId: doc.id,
      revision: doc.revision,
      snapshotId,
      actorId,
      createdAt: doc.updatedAt,
    });
    await this.db.remove("revisions", {
      deckId: doc.id,
      revision: { $lt: doc.revision - 79 },
    });
  }
  async write(doc: FrameDocument) {
    await this.validateAssets(doc);
    const snapshotId = await this.snapshot(doc);
    await this.db.transaction(() => this.attach(doc, snapshotId))();
  }
  async create(
    user: User,
    title: string,
    template: string,
    themeId: string,
    theme?: Theme,
  ) {
    let doc = makeDocument(
      user.id,
      user.workspaceId,
      title,
      template,
      theme ? "studio" : themeId,
    );
    if (theme)
      doc = applyOperations(doc, [
        { type: "theme.apply", theme: themeSnapshotForDocument(doc, theme) },
      ]);
    await this.write(doc);
    return doc;
  }
  async list(
    user: User,
    page?: { limit: number; after: [string, string] | null },
  ) {
    const memberships = await this.db.find("members", { userId: user.id });
    const grants = await this.db.find("collaborators", { userId: user.id });
    const heads = await this.db.find(
      "decks",
      {
        $or: [
          { ownerId: user.id },
          { workspaceId: { $in: memberships.map((m) => m.workspaceId) } },
          { id: { $in: grants.map((g) => g.deckId) } },
        ],
        deletedAt: { $exists: false },
        ...(page?.after
          ? {
              $and: [
                {
                  $or: [
                    { updatedAt: { $lt: page.after[0] } },
                    { updatedAt: page.after[0], id: { $gt: page.after[1] } },
                  ],
                },
              ],
            }
          : {}),
      },
      { sort: { updatedAt: -1, _id: 1 }, limit: page?.limit || 200 },
    );
    const out = [];
    for (const head of heads) {
      const root = await this.db.one("snapshots", { id: head.headSnapshotId });
      const metadata = JSON.parse(
        await this.db.contentRead(root.metadataContentId, head.workspaceId),
      );
      const slide = JSON.parse(
        await this.db.contentRead(
          root.slideRefs[0].contentId,
          head.workspaceId,
        ),
      );
      const role = await this.requireAccess(head.id, user);
      const projection = publicProjection(
        { ...metadata, slides: [slide] },
        (assetId) =>
          role === "viewer"
            ? `/api/decks/${head.id}/review/assets/${assetId}`
            : `/api/assets/${assetId}`,
      );
      out.push({
        id: head.id,
        title: head.title,
        width: head.width,
        height: head.height,
        themeId: head.themeId,
        themes: projection.themes,
        status: head.status,
        folderId: head.folderId,
        revision: head.revision,
        createdAt: head.createdAt,
        updatedAt: head.updatedAt,
        ownerId: head.ownerId,
        workspaceId: head.workspaceId,
        accessRole: role,
        slideCount: head.slideCount,
        cover: { ...projection.slides[0], notes: "" },
      });
    }
    return out;
  }
  async mutate(
    id: string,
    user: User,
    baseRevision: number,
    operations: Operation[],
  ) {
    const current = await this.access(id, user, true);
    if (current.revision !== baseRevision)
      throw new ApiError(
        409,
        "This presentation changed in another tab. Your edits are safe on this device.",
        "REVISION_CONFLICT",
      );
    if (
      current.ownerId !== user.id &&
      operations.some(
        (op) =>
          op.type === "document.update" &&
          (op.patch.status !== undefined || op.patch.folderId !== undefined),
      )
    )
      throw new ApiError(
        403,
        "Only the owner can archive, trash or move this presentation.",
      );
    const doc = applyOperations(current, operations);
    return this.commit(current, doc, user, baseRevision);
  }
  async replace(
    id: string,
    user: User,
    baseRevision: number,
    input: FrameDocument,
  ) {
    const current = await this.access(id, user, true);
    const doc = documentSchema.parse({
      ...input,
      id: current.id,
      ownerId: current.ownerId,
      workspaceId: current.workspaceId,
      createdAt: current.createdAt,
      revision: current.revision,
      folderId: current.folderId,
      status: current.status,
    });
    return this.commit(current, doc, user, baseRevision);
  }
  private async commit(
    current: FrameDocument,
    input: FrameDocument,
    user: User,
    baseRevision: number,
  ) {
    if (current.revision !== baseRevision)
      throw new ApiError(
        409,
        "This presentation changed in another tab. Your edits are safe on this device.",
        "REVISION_CONFLICT",
      );
    const doc = documentSchema.parse({
      ...input,
      revision: baseRevision + 1,
      updatedAt: new Date().toISOString(),
    });
    await this.validateAssets(doc, user);
    const snapshotId = await this.snapshot(doc);
    await this.db.transaction(async () => {
      await this.requireAccess(doc.id, user, true);
      await this.attach(doc, snapshotId, user.id);
    })();
    return doc;
  }
  async duplicate(id: string, user: User) {
    const original = await this.access(id, user, true);
    if (original.ownerId !== user.id)
      throw new ApiError(
        403,
        "Only the owner can duplicate this presentation. Use a recovery copy to preserve your authorized edits.",
      );
    const doc = {
      ...original,
      id: uid(),
      ownerId: user.id,
      workspaceId: user.workspaceId,
      title: `${original.title.slice(0, 190)} copy`,
      revision: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      folderId: null,
      status: "active" as const,
      slides: cloneSlides(original.slides),
    };
    await this.write(doc);
    return doc;
  }
  async revisions(id: string, user: User) {
    await this.requireAccess(id, user, true);
    return (
      await this.db.find(
        "revisions",
        { deckId: id },
        { sort: { revision: -1 }, limit: 80 },
      )
    ).map((r) => ({ revision: r.revision, createdAt: r.createdAt }));
  }
  async revisionDocument(id: string, revision: number) {
    const row = await this.db.one("revisions", { deckId: id, revision });
    if (!row) throw new ApiError(404, "That revision is no longer available.");
    return this.readSnapshot(row.snapshotId);
  }
  async delete(id: string, user: User) {
    await this.db.transaction(async () => {
      const doc = await this.access(id, user, true);
      if (doc.ownerId !== user.id)
        throw new ApiError(
          403,
          "Only the owner can permanently delete a presentation.",
        );
      if (doc.status !== "trashed")
        throw new ApiError(400, "Move the presentation to trash first.");
      const now = new Date().toISOString();
      await this.db.update(
        "decks",
        { id },
        { $set: { deletedAt: now }, $inc: { accessEpoch: 1 } },
      );
      await this.db.update(
        "publications",
        { deckId: id },
        { $set: { active: false, revokedAt: now } },
      );
      await this.db.update(
        "liveSessions",
        { deckId: id, endedAt: null },
        { $set: { endedAt: now }, $inc: { version: 1 } },
      );
      await this.db.insert("deletionTombstones", {
        deckId: id,
        workspaceId: doc.workspaceId,
        createdAt: now,
        state: "marked",
      });
    })();
  }
  async seed(user: User) {
    await this.create(
      user,
      "Illustrative story — make it yours",
      "story",
      "studio",
    );
    await this.create(
      user,
      "Illustrative lesson — edit every idea",
      "lesson",
      "organic",
    );
    await this.create(
      user,
      "Illustrative pitch — replace example copy",
      "pitch",
      "editorial",
    );
  }
}
