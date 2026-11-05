import type { Hono } from "hono";
import { z } from "zod";
import { Store, ApiError } from "./store";
import { uid, type User } from "../shared/schema";

export async function activeWorkspaceUser(
  store: Store,
  user: User,
  workspaceId?: string,
) {
  const id = workspaceId || user.workspaceId;
  if (!(await store.db.one("members", { workspaceId: id, userId: user.id })))
    throw new ApiError(
      403,
      "Workspace access is no longer available.",
      "WORKSPACE_ACCESS_REVOKED",
    );
  return { ...user, workspaceId: id };
}
export function registerWorkspaceRoutes(
  app: Hono<{ Variables: { user: User } }>,
  store: Store,
) {
  const authorized = async (id: string, user: User, owner = false) => {
    const workspace = await store.db.one("workspaces", { id });
    const member = await store.db.one("members", {
      workspaceId: id,
      userId: user.id,
    });
    if (!workspace || !member) throw new ApiError(404, "Workspace not found.");
    if (owner && workspace.ownerId !== user.id)
      throw new ApiError(403, "Only the workspace owner can manage members.");
    return workspace;
  };
  app.get("/api/workspaces", async (c) => {
    const user = c.get("user"),
      memberships = await store.db.find("members", { userId: user.id });
    const rows = [];
    for (const membership of memberships) {
      const workspace = await store.db.one("workspaces", {
        id: membership.workspaceId,
      });
      if (workspace) rows.push({ ...workspace, role: membership.role });
    }
    return c.json(rows);
  });
  app.post("/api/workspaces", async (c) => {
    const { name } = z
      .object({ name: z.string().trim().min(1).max(80) })
      .parse(await c.req.json());
    const user = c.get("user"),
      workspace = { id: uid(), name, ownerId: user.id };
    await store.db.transaction(async () => {
      await store.db.insert("workspaces", workspace);
      await store.db.insert("members", {
        workspaceId: workspace.id,
        userId: user.id,
        role: "owner",
      });
    })();
    return c.json({ ...workspace, role: "owner" }, 201);
  });
  app.patch("/api/workspaces/:id", async (c) => {
    const { name } = z
      .object({ name: z.string().trim().min(1).max(80) })
      .parse(await c.req.json());
    await store.db.transaction(async () => {
      await authorized(c.req.param("id"), c.get("user"), true);
      await store.db.update(
        "workspaces",
        { id: c.req.param("id") },
        {
          set: { name, updatedAt: new Date().toISOString() },
          increment: { accessEpoch: 1 },
        },
      );
    })();
    return c.json({ ok: true });
  });
  app.get("/api/workspaces/:id/members", async (c) => {
    const id = c.req.param("id");
    await authorized(id, c.get("user"));
    const rows = [];
    for (const member of await store.db.find("members", { workspaceId: id })) {
      const user = await store.user(member.userId);
      if (user)
        rows.push({
          id: user.id,
          name: user.name,
          email: user.email,
          role: member.role,
        });
    }
    return c.json(rows);
  });
  app.put("/api/workspaces/:id/members", async (c) => {
    const input = z
      .object({
        email: z.email().transform((v) => v.trim().toLowerCase()),
        role: z.enum(["editor", "viewer"]),
      })
      .parse(await c.req.json());
    await store.db.transaction(async () => {
      const id = c.req.param("id"),
        workspace = await authorized(id, c.get("user"), true);
      await store.db.update(
        "workspaces",
        { id },
        { increment: { accessEpoch: 1 } },
      );
      const user = await store.db.one("users", { email: input.email });
      if (!user)
        throw new ApiError(
          404,
          "That person needs to register with Frame first.",
        );
      if (user.id === workspace.ownerId)
        throw new ApiError(400, "The workspace owner must retain ownership.");
      await store.db.update(
        "members",
        { workspaceId: id, userId: user.id },
        { set: { role: input.role } },
        { upsert: true },
      );
      // Synchronize with document authorization guards before changing workspace grants.
      await store.db.update(
        "decks",
        { workspaceId: id },
        { increment: { accessEpoch: 1 } },
      );
    })();
    return c.json({ ok: true });
  });
  app.delete("/api/workspaces/:id/members/:userId", async (c) => {
    await store.db.transaction(async () => {
      const id = c.req.param("id"),
        workspace = await authorized(id, c.get("user"), true);
      if (workspace.ownerId === c.req.param("userId"))
        throw new ApiError(400, "The workspace owner cannot be removed.");
      await store.db.update(
        "workspaces",
        { id },
        { increment: { accessEpoch: 1 } },
      );
      await store.db.remove("members", {
        workspaceId: id,
        userId: c.req.param("userId"),
      });
      await store.db.update(
        "decks",
        { workspaceId: id },
        { increment: { accessEpoch: 1 } },
      );
    })();
    return c.json({ ok: true });
  });
}
