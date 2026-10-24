import {
  sharingOwner,
  sharingGrants,
  reviewComments,
  activePeers,
} from "./repositories/relations";
import type { Hono } from "hono";
import { z } from "zod";
import {
  documentSchema,
  uid,
  type User,
  type FrameDocument,
} from "../shared/schema";
import { publicProjection, referencedAssets } from "../shared/publications";
import type {
  AccessRole,
  Sharing,
  ReviewDocument,
  ReviewComment,
  Presence,
} from "../shared/collaboration";
import { cloneSlides } from "../shared/operations";
import { Store, ApiError } from "./store";
import { assetResponse } from "./asset-response";
type CommentRow = {
  id: string;
  deckId: string;
  slideId: string | null;
  elementId: string | null;
  authorId: string;
  author: string;
  body: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  createdAt: string;
};
export class Collaboration {
  constructor(
    public store: Store,
    public now = () => Date.now(),
  ) {}
  private async owner(deckId: string, user: User) {
    if ((await this.store.requireAccess(deckId, user)) !== "owner")
      throw new ApiError(403, "Only the presentation owner can change access.");
  }
  async sharing(deckId: string, user: User): Promise<Sharing> {
    const role = await this.store.requireAccess(deckId, user),
      owner = (await sharingOwner(this.store.db, deckId)) as {
        id: string;
        name: string;
      };
    const grants =
      role === "owner" ? await sharingGrants(this.store.db, deckId) : [];
    return { role, owner, grants: grants as Sharing["grants"] };
  }
  async grant(
    deckId: string,
    user: User,
    input: {
      email: string;
      role: "editor" | "viewer";
      expectedRole: "editor" | "viewer" | null;
    },
  ): Promise<Sharing> {
    return await this.store.db.transaction(async () => {
      await this.owner(deckId, user);
      const target = (await this.store.db.one("users", {
        email: input.email.toLowerCase(),
      })) as {
        id: string;
      } | null;
      if (!target)
        throw new ApiError(
          404,
          "That account is not registered yet. Ask them to create a Frame account, then add their email here.",
        );
      if (target.id === user.id)
        throw new ApiError(400, "You already own this presentation.");
      const old = (await this.store.db.one("collaborators", {
        $and: [{ deckId: deckId }, { userId: target.id }],
      })) as {
        role: "editor" | "viewer";
      } | null;
      if ((old?.role || null) !== input.expectedRole)
        throw new ApiError(
          409,
          "This person’s access changed in another window. Reload the people list.",
        );
      const count = (await {
        n: await this.store.db.count("collaborators", { deckId: deckId }),
      }) as {
        n: number;
      };
      if (!old && count.n >= 100)
        throw new ApiError(
          429,
          "This presentation has reached its 100-person sharing limit.",
        );
      await this.store.db.update(
        "collaborators",
        { deckId: deckId, userId: target.id },
        {
          $set: {
            deckId: deckId,
            userId: target.id,
            role: input.role,
            createdAt: new Date(this.now()).toISOString(),
          },
        },
        { upsert: true },
      );
      await this.retireEditor(deckId, target.id);
      return await this.sharing(deckId, user);
    })();
  }
  async revoke(
    deckId: string,
    user: User,
    targetId: string,
    expectedRole: "editor" | "viewer",
  ): Promise<Sharing> {
    return await this.store.db.transaction(async () => {
      await this.owner(deckId, user);
      const result = await this.store.db.remove("collaborators", {
        $and: [
          { deckId: deckId },
          { userId: targetId },
          { role: expectedRole },
        ],
      });
      if (!result.changes)
        throw new ApiError(
          409,
          "This person’s access changed. Reload the people list.",
        );
      await this.store.db.remove("presence", {
        $and: [{ deckId: deckId }, { userId: targetId }],
      });
      await this.retireEditor(deckId, targetId);
      return await this.sharing(deckId, user);
    })();
  }
  private async retireEditor(deckId: string, userId: string) {
    const user = await this.store.user(userId);
    if (
      !user ||
      (await this.store.role(deckId, user)) === "editor" ||
      (await this.store.role(deckId, user)) === "owner"
    )
      return;
    await this.store.db.update(
      "liveSessions",
      { $and: [{ deckId: deckId }, { ownerId: userId }, { endedAt: null }] },
      {
        $set: { endedAt: new Date(this.now()).toISOString() },
        $inc: { version: +1 },
      },
    );
    await this.store.db.update(
      "presence",
      { $and: [{ deckId: deckId }, { userId: userId }] },
      { $set: { mode: "view" } },
    );
  }
  async review(deckId: string, user: User): Promise<ReviewDocument> {
    const role = await this.store.requireAccess(deckId, user),
      doc = await this.store.access(deckId, user),
      owner = (await this.store.db.one("users", { id: doc.ownerId })) as {
        name: string;
      };
    return {
      document: publicProjection(
        doc,
        (id) => `/api/decks/${deckId}/review/assets/${id}`,
      ),
      revision: doc.revision,
      role,
      owner: owner.name,
    };
  }
  async asset(deckId: string, user: User, assetId: string, range?: string) {
    const doc = await this.store.access(deckId, user);
    if (
      !referencedAssets(
        publicProjection(doc, (id) => `/api/assets/${id}`) as FrameDocument,
      ).includes(assetId)
    )
      throw new ApiError(404, "This media is not in the visible presentation.");
    const row = (await this.store.db.one("assets", {
      $and: [{ id: assetId }, { workspaceId: doc.workspaceId }],
    })) as {
      storageKey: string;
      mime: string;
    } | null;
    if (!row || !/^image\/|^video\//.test(row.mime))
      throw new ApiError(404, "This media is unavailable.");
    return assetResponse(row.storageKey, row.mime, range);
  }
  async recoveryCopy(
    deckId: string,
    user: User,
    input: FrameDocument,
  ): Promise<FrameDocument> {
    return await this.store.db.transaction(async () => {
      const original = await this.store.access(deckId, user, true);
      if (input.id !== deckId)
        throw new ApiError(400, "Choose the presentation being recovered.");
      const fresh: FrameDocument = {
        ...input,
        id: uid(),
        title: `${input.title.slice(0, 180)} — recovered`,
        ownerId: user.id,
        workspaceId: user.workspaceId,
        revision: 0,
        folderId: null,
        status: "active",
        createdAt: new Date(this.now()).toISOString(),
        updatedAt: new Date(this.now()).toISOString(),
        slides: cloneSlides(input.slides),
      };
      const allowed = new Set<string>();
      const collect = (doc: FrameDocument) => {
        for (const slide of doc.slides)
          for (const el of slide.elements)
            for (const src of [el.src, el.media?.poster])
              if (src?.startsWith("/api/assets/")) allowed.add(src.slice(12));
      };
      collect(original);
      const revisions = (await this.store.db.find("revisions", {
        deckId: deckId,
      })) as {
        snapshotId: string;
      }[];
      for (const revision of revisions)
        collect(await this.store.readSnapshot(revision.snapshotId));
      const copies = new Map<string, string>();
      const copy = async (
        src: string | undefined,
      ): Promise<string | undefined> => {
        if (!src?.startsWith("/api/assets/")) return src;
        const assetId = src.slice(12);
        if (copies.has(assetId)) return `/api/assets/${copies.get(assetId)}`;
        const asset = (await this.store.db.one("assets", { id: assetId })) as {
          ownerId: string;
          workspaceId: string;
          name: string;
          mime: string;
          bytes: number;
          storageKey: string;
        } | null;
        const member = asset
          ? ((await this.store.db.one("members", {
              $and: [{ workspaceId: asset.workspaceId }, { userId: user.id }],
            })) as {
              role: string;
            } | null)
          : null;
        if (
          !asset ||
          !/^image\/|^video\//.test(asset.mime) ||
          (asset.ownerId !== user.id &&
            member?.role !== "owner" &&
            member?.role !== "editor" &&
            !(
              asset.workspaceId === original.workspaceId && allowed.has(assetId)
            ))
        )
          throw new ApiError(
            403,
            "A media reference is outside your authorized presentation. Replace that media before making a recovery copy.",
          );
        if (asset.workspaceId === user.workspaceId) {
          copies.set(assetId, assetId);
          return src;
        }
        const id = uid();
        await this.store.db.insert("assets", {
          id: id,
          ownerId: user.id,
          workspaceId: user.workspaceId,
          name: asset.name,
          mime: asset.mime,
          bytes: asset.bytes,
          storageKey: asset.storageKey,
          createdAt: new Date(this.now()).toISOString(),
        });
        copies.set(assetId, id);
        return `/api/assets/${id}`;
      };
      for (const slide of fresh.slides)
        for (const el of slide.elements) {
          el.src = await copy(el.src);
          if (el.media) el.media.poster = await copy(el.media.poster);
        }
      documentSchema.parse(fresh);
      await this.store.write(fresh);
      return fresh;
    })();
  }
  private comment(
    row: CommentRow,
    user: User,
    role: AccessRole,
  ): ReviewComment {
    return {
      id: row.id,
      slideId: row.slideId,
      elementId: row.elementId,
      authorId: row.authorId,
      author: row.author,
      body: row.body,
      resolvedAt: row.resolvedAt,
      resolvedBy: row.resolvedBy,
      createdAt: row.createdAt,
      canResolve: role !== "viewer" || row.authorId === user.id,
      canDelete: role === "owner" || row.authorId === user.id,
    };
  }
  async comments(deckId: string, user: User): Promise<ReviewComment[]> {
    const role = await this.store.requireAccess(deckId, user);
    return ((await reviewComments(this.store.db, deckId)) as CommentRow[]).map(
      (row) => this.comment(row, user, role),
    );
  }
  async addComment(
    deckId: string,
    user: User,
    input: {
      body: string;
      slideId: string | null;
      elementId: string | null;
    },
  ): Promise<ReviewComment> {
    return await this.store.db.transaction(async () => {
      const doc = await this.store.access(deckId, user);
      const slide = input.slideId
        ? doc.slides.find((s) => s.id === input.slideId)
        : null;
      if (input.slideId && !slide)
        throw new ApiError(
          409,
          "That slide was removed. Choose an existing slide or comment on the presentation.",
        );
      if (
        input.elementId &&
        (!slide ||
          !slide.elements.some((e) => e.id === input.elementId && !e.hidden))
      )
        throw new ApiError(
          409,
          "That object is no longer visible. Comment on the slide instead.",
        );
      const count = (await {
        n: await this.store.db.count("comments", { deckId: deckId }),
      }) as {
        n: number;
      };
      if (count.n >= 1000)
        throw new ApiError(
          429,
          "This presentation has reached its 1,000-comment limit. Remove older comments before adding another.",
        );
      const id = uid();
      await this.store.db.insert("comments", {
        id: id,
        deckId: deckId,
        slideId: input.slideId,
        authorId: user.id,
        body: input.body.trim(),
        createdAt: new Date(this.now()).toISOString(),
        elementId: input.elementId,
      });
      return (await this.comments(deckId, user)).find((c) => c.id === id)!;
    })();
  }
  async updateComment(
    deckId: string,
    user: User,
    id: string,
    resolved: boolean,
  ): Promise<ReviewComment> {
    return this.store.db.transaction(async () => {
      const comment = (await this.comments(deckId, user)).find(
        (c) => c.id === id,
      );
      if (!comment) throw new ApiError(404, "Comment not found.");
      if (!comment.canResolve)
        throw new ApiError(
          403,
          "Only the author or an editor can resolve this comment.",
        );
      await this.store.db.update(
        "comments",
        { id: id },
        {
          $set: {
            resolvedAt: resolved ? new Date(this.now()).toISOString() : null,
            resolvedBy: resolved ? user.id : null,
          },
        },
      );
      return (await this.comments(deckId, user)).find((c) => c.id === id)!;
    })();
  }
  async deleteComment(deckId: string, user: User, id: string) {
    return this.store.db.transaction(async () => {
      const comment = (await this.comments(deckId, user)).find(
        (c) => c.id === id,
      );
      if (!comment) throw new ApiError(404, "Comment not found.");
      if (!comment.canDelete)
        throw new ApiError(
          403,
          "Only the author or owner can remove this comment.",
        );
      await this.store.db.remove("comments", { id: id });
    })();
  }
  async presence(deckId: string, user: User): Promise<Presence> {
    await this.store.requireAccess(deckId, user);
    const row = (await this.store.db.one("decks", { id: deckId })) as {
      revision: number;
    };
    const peers = (await activePeers(
      this.store.db,
      deckId,
      this.now() - 30000,
      user.id,
    )) as {
      userId: string;
      name: string;
      mode: "view" | "edit";
      lastSeen: number;
    }[];
    return {
      ...row,
      peers: (
        await Promise.all(
          peers.map(async (peer) => ({
            ...peer,
            role: (await this.store.role(deckId, {
              ...user,
              id: peer.userId,
            }))!,
          })),
        )
      ).filter((peer) => peer.role),
    };
  }
  async heartbeat(
    deckId: string,
    user: User,
    mode: "view" | "edit",
  ): Promise<Presence> {
    await this.store.requireAccess(deckId, user, mode === "edit");
    await this.store.db.remove("presence", {
      lastSeen: { $lt: this.now() - 60000 },
    });
    await this.store.db.update(
      "presence",
      { deckId: deckId, userId: user.id },
      {
        $set: {
          deckId: deckId,
          userId: user.id,
          mode: mode,
          lastSeen: this.now(),
          expiresAt: this.now() + 60000,
        },
      },
      { upsert: true },
    );
    return await this.presence(deckId, user);
  }
}
export function registerCollaborationRoutes(
  app: Hono<{
    Variables: {
      user: User;
    };
  }>,
  collab: Collaboration,
) {
  app.post("/api/decks/:id/recovery", async (c) => {
    const { document } = z
      .object({ document: documentSchema })
      .parse(await c.req.json());
    return c.json(
      await collab.recoveryCopy(c.req.param("id"), c.get("user"), document),
      201,
    );
  });
  app.get("/api/decks/:id/access", async (c) =>
    c.json(await collab.sharing(c.req.param("id"), c.get("user"))),
  );
  app.post("/api/decks/:id/access", async (c) => {
    const input = z
      .object({
        email: z
          .email()
          .max(254)
          .transform((s) => s.toLowerCase()),
        role: z.enum(["editor", "viewer"]),
        expectedRole: z.enum(["editor", "viewer"]).nullable(),
      })
      .parse(await c.req.json());
    return c.json(await collab.grant(c.req.param("id"), c.get("user"), input));
  });
  app.delete("/api/decks/:id/access/:userId", async (c) => {
    const input = z
      .object({ expectedRole: z.enum(["editor", "viewer"]) })
      .parse(await c.req.json());
    return c.json(
      await collab.revoke(
        c.req.param("id"),
        c.get("user"),
        c.req.param("userId"),
        input.expectedRole,
      ),
    );
  });
  app.get("/api/decks/:id/review", async (c) =>
    c.json(await collab.review(c.req.param("id"), c.get("user"))),
  );
  app.get("/api/decks/:id/review/assets/:assetId", async (c) =>
    collab.asset(
      c.req.param("id"),
      c.get("user"),
      c.req.param("assetId"),
      c.req.header("Range"),
    ),
  );
  app.get("/api/decks/:id/comments", async (c) =>
    c.json(await collab.comments(c.req.param("id"), c.get("user"))),
  );
  app.post("/api/decks/:id/comments", async (c) => {
    const input = z
      .object({
        body: z.string().trim().min(1).max(4000),
        slideId: z.string().min(1).max(100).nullable(),
        elementId: z.string().min(1).max(100).nullable(),
      })
      .parse(await c.req.json());
    return c.json(
      await collab.addComment(c.req.param("id"), c.get("user"), input),
      201,
    );
  });
  app.patch("/api/decks/:id/comments/:commentId", async (c) => {
    const { resolved } = z
      .object({ resolved: z.boolean() })
      .parse(await c.req.json());
    return c.json(
      await collab.updateComment(
        c.req.param("id"),
        c.get("user"),
        c.req.param("commentId"),
        resolved,
      ),
    );
  });
  app.delete("/api/decks/:id/comments/:commentId", async (c) => {
    await collab.deleteComment(
      c.req.param("id"),
      c.get("user"),
      c.req.param("commentId"),
    );
    return c.json({ ok: true });
  });
  app.get("/api/decks/:id/presence", async (c) =>
    c.json(await collab.presence(c.req.param("id"), c.get("user"))),
  );
  app.post("/api/decks/:id/presence", async (c) => {
    const { mode } = z
      .object({ mode: z.enum(["view", "edit"]) })
      .parse(await c.req.json());
    return c.json(
      await collab.heartbeat(c.req.param("id"), c.get("user"), mode),
    );
  });
  app.delete("/api/decks/:id/presence", async (c) => {
    await collab.store.requireAccess(c.req.param("id"), c.get("user"));
    await collab.store.db.remove("presence", {
      $and: [{ deckId: c.req.param("id") }, { userId: c.get("user").id }],
    });
    return c.json({ ok: true });
  });
}
