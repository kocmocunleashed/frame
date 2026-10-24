import { revisionInput } from "./contracts";
import type { Hono } from "hono";
import { z } from "zod";
import { uid, themeSchema, type User } from "../shared/schema";
import { brandKitSchema } from "../shared/design-library";
import { Store, ApiError } from "./store";
type Row = {
  id: string;
  ownerId: string;
  data: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
export function registerDesignRoutes(
  app: Hono<{
    Variables: {
      user: User;
    };
  }>,
  store: Store,
) {
  for (const resource of ["themes", "brand-kits"] as const) {
    const table = resource === "themes" ? "themes" : "brandKits";
    const key = resource === "themes" ? "theme" : "kit";
    const schema = resource === "themes" ? themeSchema : brandKitSchema;
    const project = (row: Row, user: User) => ({
      id: row.id,
      [key]: JSON.parse(row.data),
      revision: row.revision,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      canEdit: row.ownerId === user.id,
    });
    app.get(`/api/${resource}`, async (c) => {
      const user = c.get("user");
      const rows = (await store.db.find(
        table,
        { workspaceId: user.workspaceId },
        { sort: { updatedAt: -1 }, limit: 100 },
      )) as Row[];
      return c.json(rows.map((r) => project(r, user)));
    });
    const validate = async (data: unknown, user: User) => {
      const value = schema.parse(data);
      if ("logo" in value && value.logo) {
        const assetId = value.logo.src.split("/").pop()!;
        const asset = (await store.db.one("assets", {
          $and: [{ id: assetId }, { workspaceId: user.workspaceId }],
        })) as {
          mime: string;
        } | null;
        if (!asset || !asset.mime.startsWith("image/"))
          throw new ApiError(
            400,
            "Use an image uploaded to this workspace for the logo.",
          );
      }
      return resource === "themes"
        ? { ...value, id: uid(), custom: true }
        : value;
    };
    const canWrite = async (user: User) => {
      const member = (await store.db.one("members", {
        $and: [{ workspaceId: user.workspaceId }, { userId: user.id }],
      })) as {
        role: string;
      } | null;
      if (!member || member.role === "viewer")
        throw new ApiError(
          403,
          "Editing workspace designs requires editor access.",
        );
    };
    app.post(`/api/${resource}`, async (c) => {
      const user = c.get("user");
      await canWrite(user);
      const body = z.object({ [key]: schema }).parse(await c.req.json());
      const value = await validate(body[key], user),
        id = uid(),
        now = new Date().toISOString();
      await store.db.transaction(async () => {
        await store.db.update(
          "workspaces",
          { id: user.workspaceId },
          { $inc: { accessEpoch: 1 } },
        );
        const count = (await {
          n: await store.db.count(table, { workspaceId: user.workspaceId }),
        }) as {
          n: number;
        };
        if (count.n >= 100)
          throw new ApiError(
            400,
            "Your workspace can save up to 100 designs of each kind. Remove an unused design first.",
          );
        await store.db.insert(table, {
          id: id,
          ownerId: user.id,
          workspaceId: user.workspaceId,
          name: value.name,
          data: JSON.stringify(value),
          createdAt: now,
          revision: 0,
          updatedAt: now,
        });
      })();
      return c.json(
        {
          id,
          [key]: value,
          revision: 0,
          createdAt: now,
          updatedAt: now,
          canEdit: true,
        },
        201,
      );
    });
    app.put(`/api/${resource}/:id`, async (c) => {
      const user = c.get("user");
      await canWrite(user);
      const body = z
        .object({ [key]: schema, revision: z.number().int().min(0) })
        .parse(revisionInput(await c.req.json()));
      const value = await validate(body[key], user),
        now = new Date().toISOString();
      const row = await store.db.transaction(async () => {
        const previous = (await store.db.one(table, {
          $and: [
            { id: c.req.param("id") },
            { ownerId: user.id },
            { workspaceId: user.workspaceId },
          ],
        })) as Row | null;
        if (!previous)
          throw new ApiError(404, "Design not found or you do not own it.");
        if (previous.revision !== body.revision)
          throw new ApiError(
            409,
            "This design changed in another window. Reload the library before saving. Your draft is still here.",
          );
        await store.db.update(
          table,
          { id: previous.id },
          {
            $set: {
              name: value.name,
              data: JSON.stringify(value),
              updatedAt: now,
            },
            $inc: { revision: +1 },
          },
        );
        return {
          ...previous,
          data: JSON.stringify(value),
          revision: previous.revision + 1,
          updatedAt: now,
        };
      })();
      return c.json(project(row, user));
    });
    app.delete(`/api/${resource}/:id`, async (c) => {
      const user = c.get("user");
      await canWrite(user);
      const result = await store.db.remove(table, {
        id: c.req.param("id"),
        ownerId: user.id,
        workspaceId: user.workspaceId,
      });
      if (!result.changes)
        throw new ApiError(404, "Design not found or you do not own it.");
      return c.json({ ok: true });
    });
  }
}
