import { publicationAsset } from "./repositories/relations";
import {collectionPage} from './contracts';
import type { Hono } from "hono";
import { z } from "zod";
import {
  type User,
  type FrameDocument,
  documentSchema,
  uid,
} from "../shared/schema";
import {
  publicProjection,
  referencedAssets,
  type Publication,
  type PublishedView,
} from "../shared/publications";
import { Store, ApiError } from "./store";
import { sessionUser, type SessionUser } from "./auth-session";
import { assetResponse } from "./asset-response";
import type { ExportService } from "./exports";
type Row = {
  id: string;
  deckId: string;
  ownerId: string;
  visibility: Publication["visibility"];
  allowDownload: number;
  revision: number;
  document: string;
  createdAt: string;
  updatedAt: string;
  revokedAt: string | null;
  edition: number;
};
export class PublicationStore {
  constructor(
    public store: Store,
    public exports?: ExportService,
  ) {}
  metadata(row: Row): Publication {
    return {
      id: row.id,
      presentationId: row.deckId,
      visibility: row.visibility,
      allowDownload: !!row.allowDownload,
      revision: row.edition,
      documentRevision: row.revision,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      revokedAt: row.revokedAt,
    };
  }
  private async owned(id: string, user: User) {
    const doc = await this.store.access(id, user, true);
    if (doc.ownerId !== user.id)
      throw new ApiError(
        403,
        "Only the presentation owner can publish or revoke access.",
      );
    return doc;
  }
  async current(id: string, user: User): Promise<Publication | null> {
    await this.owned(id, user);
    const row = (await this.store.db.one("publications", {
      $and: [{ deckId: id }, { revokedAt: null }],
    })) as Row | null;
    return row ? this.metadata(row) : null;
  }
  async publish(
    id: string,
    user: User,
    input: {
      baseRevision: number;
      expectedEdition: number | null;
      visibility: Publication["visibility"];
      allowDownload: boolean;
    },
  ): Promise<Publication> {
    if (input.allowDownload && !this.exports)
      throw new ApiError(
        503,
        "Download preparation is unavailable. Publish without downloads or ask the server owner to check configuration.",
      );
    return await this.store.db.transaction(async () => {
      const doc = await this.owned(id, user);
      if (doc.revision !== input.baseRevision)
        throw new ApiError(
          409,
          "Save the latest presentation before publishing.",
        );
      const previous = (await this.store.db.one("publications", {
        $and: [{ deckId: id }, { revokedAt: null }],
      })) as Row | null;
      if ((previous?.edition || null) !== input.expectedEdition)
        throw new ApiError(
          409,
          "Publishing settings changed in another window. Reload them before publishing.",
        );
      const assets = referencedAssets(doc);
      for (const assetId of assets) {
        const asset = (await this.store.db.one("assets", {
          $and: [{ id: assetId }, { workspaceId: doc.workspaceId }],
        })) as {
          mime: string;
        } | null;
        if (!asset || !/^image\/|^video\//.test(asset.mime))
          throw new ApiError(
            400,
            "A slide references an unavailable media asset. Replace it before publishing.",
          );
      }
      const now = new Date().toISOString(),
        publicationId = previous?.id || uid();
      if (previous)
        await this.store.db.update(
          "publications",
          { id: previous.id },
          {
            $set: {
              visibility: input.visibility,
              allowDownload: input.allowDownload ? 1 : 0,
              revision: doc.revision,
              document: JSON.stringify(doc),
              updatedAt: now,
            },
            $inc: { edition: +1 },
          },
        );
      else
        await this.store.db.insert("publications", {
          id: publicationId,
          deckId: doc.id,
          ownerId: user.id,
          visibility: input.visibility,
          allowDownload: input.allowDownload ? 1 : 0,
          revision: doc.revision,
          document: JSON.stringify(doc),
          createdAt: now,
          revokedAt: null,
          active: true,
          updatedAt: now,
          edition: 1,
        });
      const head = await this.store.db.one("publications", {
        id: publicationId,
      });
      await this.store.db.insert("publicationEditions", {
        publicationId,
        edition: head.edition,
        documentRevision: doc.revision,
        snapshotId: head.snapshotId,
        visibility: input.visibility,
        allowDownload: input.allowDownload,
        createdAt: now,
      });
      for (const assetId of assets)
        await this.store.db.insert("publicationAssets", {
          publicationId: publicationId,
          edition: head.edition,
          assetId: assetId,
          storageKey: (await this.store.db.one("assets", { id: assetId }))
            .storageKey,
        });
      const publication = (await this.current(doc.id, user))!;
      if (input.allowDownload)
        await this.exports!.preparePublication(doc, user, publication);
      return publication;
    })();
  }
  async revoke(
    id: string,
    user: User,
    publicationId: string,
    expectedEdition: number,
  ): Promise<void> {
    await this.store.db.transaction(async () => {
      await this.owned(id, user);
      const row = (await this.store.db.one("publications", {
        $and: [
          { id: publicationId },
          { deckId: id },
          { ownerId: user.id },
          { revokedAt: null },
        ],
      })) as Row | null;
      if (!row) throw new ApiError(404, "Active publication not found.");
      if (row.edition !== expectedEdition)
        throw new ApiError(
          409,
          "This publication changed elsewhere. Reload before revoking it.",
        );
      await this.store.db.update(
        "publications",
        { id: row.id },
        {
          $set: {
            active: false,
            revokedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      );
    })();
  }
  async access(id: string, user: User | null): Promise<Row> {
    const row = (await this.store.db.one("publications", {
      id: id,
    })) as Row | null;
    if (!row)
      throw new ApiError(404, "This published presentation was not found.");
    if (row.revokedAt)
      throw new ApiError(410, "Access to this presentation has been revoked.");
    if (row.visibility === "private") {
      if (!user)
        throw new ApiError(401, "Sign in to view this private presentation.");
      if (!(await this.store.role(row.deckId, user)))
        throw new ApiError(
          403,
          "The owner has not granted you access to this private presentation.",
        );
    }
    return row;
  }
  async view(id: string, user: User | null): Promise<PublishedView> {
    const row = await this.access(id, user),
      doc = documentSchema.parse(JSON.parse(row.document)),
      owner = await this.store.user(row.ownerId);
    const { presentationId, revokedAt, ...metadata } = this.metadata(row);
    return {
      publication: metadata,
      document: publicProjection(
        doc,
        (assetId) => `/api/publications/${row.id}/assets/${assetId}`,
      ),
      author: owner?.name || "Frame author",
      downloads:
        (await this.exports?.publicDownloads(this.metadata(row))) || [],
      downloadsState:
        (await this.exports?.publicDownloadState(this.metadata(row))) ||
        "disabled",
    };
  }
}
export function registerPublicRoutes(
  app: Hono<{
    Variables: {
      user: User;
    };
  }>,
  publications: PublicationStore,
  resolveSession: SessionUser = sessionUser,
) {
  const currentUser = async (headers: Headers) =>
    await resolveSession(publications.store, headers);
  app.get("/api/publications", async (c) => {
    if(c.req.header('X-Frame-Contract')!=='reference')return c.json(await collectionPage(publications.store.db,'publications',{visibility:'public',active:true},c.req.query(),async row=>{const view=await publications.view(row.id,null);return {...view,document:{...view.document,slides:view.document.slides.slice(0,1)}};}));
    const rows = (await publications.store.db.find(
      "publications",
      { visibility: "public", active: true },
      { sort: { updatedAt: -1 }, limit: 50 },
    )) as {
      id: string;
    }[];
    return c.json(
      await Promise.all(
        rows.map(async (row) => {
          const view = await publications.view(row.id, null);
          return {
            ...view,
            document: {
              ...view.document,
              slides: view.document.slides.slice(0, 1),
            },
          };
        }),
      ),
    );
  });
  app.get("/api/publications/:id", async (c) => {
    const view = await publications.view(
      c.req.param("id"),
      await currentUser(c.req.raw.headers),
    );
    c.header(
      "X-Robots-Tag",
      view.publication.visibility === "public"
        ? "index, follow"
        : "noindex, nofollow",
    );
    return c.json(view);
  });
  app.get("/api/publications/:id/assets/:assetId", async (c) => {
    const row = await publications.access(
      c.req.param("id"),
      await currentUser(c.req.raw.headers),
    );
    const asset = (await publicationAsset(
      publications.store.db,
      row.id,
      c.req.param("assetId"),
    )) as {
      storageKey: string;
      mime: string;
    } | null;
    if (!asset)
      throw new ApiError(
        404,
        "This asset is not in the published presentation.",
      );
    return assetResponse(asset.storageKey, asset.mime, c.req.header("Range"));
  });
}
export function registerPublishingRoutes(
  app: Hono<{
    Variables: {
      user: User;
    };
  }>,
  publications: PublicationStore,
  resolveSession: SessionUser = sessionUser,
) {
  app.post("/api/decks/:id/publication/downloads", async (c) => {
    const user = c.get("user"),
      input = z
        .object({
          expectedEdition: z.number().int().min(1),
          key: z.string().min(8).max(100),
        })
        .parse(await c.req.json()),
      publication = await publications.current(c.req.param("id"), user);
    if (!publication || !publication.allowDownload)
      throw new ApiError(
        400,
        "Enable downloads in the published version first.",
      );
    if (publication.revision !== input.expectedEdition)
      throw new ApiError(
        409,
        "This publication changed. Reload publishing settings.",
      );
    const row = await publications.access(publication.id, user);
    if (!publications.exports)
      throw new ApiError(503, "Export preparation is unavailable.");
    await publications.store.db.transaction(
      async () =>
        await publications.exports!.preparePublication(
          documentSchema.parse(JSON.parse(row.document)),
          user,
          publication,
          input.key,
        ),
    )();
    return c.json({ ok: true }, 202);
  });
  app.get("/api/decks/:id/publication", async (c) =>
    c.json(await publications.current(c.req.param("id"), c.get("user"))),
  );
  app.post("/api/decks/:id/publication", async (c) => {
    const input = z
      .object({
        baseRevision: z.number().int().min(0),
        expectedEdition: z.number().int().min(1).nullable(),
        visibility: z.enum(["private", "unlisted", "public"]),
        allowDownload: z.boolean().default(false),
      })
      .parse(await c.req.json());
    return c.json(
      await publications.publish(c.req.param("id"), c.get("user"), input),
      201,
    );
  });
  app.post("/api/decks/:id/publication/revoke", async (c) => {
    const input = z
      .object({
        id: z.string().min(1),
        expectedEdition: z.number().int().min(1),
      })
      .parse(await c.req.json());
    await publications.revoke(
      c.req.param("id"),
      c.get("user"),
      input.id,
      input.expectedEdition,
    );
    return c.json({ ok: true });
  });
}
