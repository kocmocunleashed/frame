import type { Hono } from "hono";
import { z } from "zod";
import type { User } from "../shared/schema";
import type { AdminUser, CreditBalance } from "../shared/credits";
import { ApiError, type Store } from "./store";

export function isAdmin(userId: string): boolean {
  return (process.env.FRAME_ADMIN_USER_IDS || "")
    .split(",")
    .some((id) => id.trim() === userId);
}

export class PresentationCredits {
  constructor(private store: Store) {}
  async balance(userId: string): Promise<CreditBalance> {
    const row = await this.store.db.one("presentationCredits", { userId });
    if (!row) throw new ApiError(409, "This account has not been provisioned.");
    return { remaining: row.remaining, revision: row.revision };
  }
  async requireAvailable(userId: string) {
    if ((await this.balance(userId)).remaining === 0)
      throw new ApiError(
        403,
        "You have no presentation credits left. Manual editing and exports remain available.",
      );
  }
  async consume(userId: string) {
    const prior = await this.balance(userId);
    if (prior.remaining === 0)
      throw new ApiError(
        403,
        "You have no presentation credits left. Your generated result has been retained.",
      );
    const changed = await this.store.db.update(
      "presentationCredits",
      { userId, revision: prior.revision },
      {
        $set: {
          remaining: prior.remaining === null ? null : prior.remaining - 1,
          updatedAt: new Date().toISOString(),
        },
        $inc: { revision: 1 },
      },
    );
    if (!changed.changes)
      throw new ApiError(409, "Your credit balance changed. Try again.");
  }
  async set(
    userId: string,
    actorId: string,
    remaining: number | null,
    revision: number,
  ): Promise<CreditBalance> {
    if (!isAdmin(actorId))
      throw new ApiError(403, "Administrator access is required.");
    z.number().int().min(0).max(1000000).nullable().parse(remaining);
    return this.store.db.transaction(async () => {
      if (!(await this.store.user(userId)))
        throw new ApiError(404, "User not found.");
      const previous = await this.balance(userId);
      if (previous.revision !== revision)
        throw new ApiError(
          409,
          "This balance changed while you were editing. Reload users and try again.",
        );
      await this.store.db.update(
        "presentationCredits",
        { userId, revision },
        {
          $set: { remaining, updatedAt: new Date().toISOString() },
          $inc: { revision: 1 },
        },
      );
      await this.store.db.insert("presentationCreditChanges", {
        userId,
        actorId,
        previousRemaining: previous.remaining,
        remaining,
        resultingRevision: revision + 1,
        createdAt: new Date().toISOString(),
      });
      return this.balance(userId);
    })();
  }
}

export function registerCreditRoutes(
  app: Hono<{ Variables: { user: User } }>,
  store: Store,
) {
  const credits = new PresentationCredits(store);
  app.get("/api/credits", async (c) =>
    c.json({
      ...(await credits.balance(c.get("user").id)),
      isAdmin: isAdmin(c.get("user").id),
    }),
  );
  app.use("/api/admin/*", async (c, next) => {
    if (!isAdmin(c.get("user").id))
      throw new ApiError(403, "Administrator access is required.");
    await next();
  });
  app.get("/api/admin/users", async (c) => {
    const { query, page } = z
      .object({
        query: z.string().trim().max(254).default(""),
        page: z.coerce.number().int().min(1).max(1000000).default(1),
      })
      .parse(c.req.query());
    const pageSize = 25;
    const literal = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter = {
      $or: [
        { name: { $regex: literal, $options: "i" } },
        { email: { $regex: literal, $options: "i" } },
      ],
    };
    const total = await store.db.count("users", filter);
    const records = await store.db.find("users", filter, {
      sort: { name: 1, _id: 1 },
      skip: (page - 1) * pageSize,
      limit: pageSize,
    });
    const users = [];
    for (const u of records)
      users.push({
        id: u.id,
        name: u.name,
        email: u.email,
        ...(await credits.balance(u.id)),
      });
    return c.json({ users, total: Number(total), page, pageSize });
  });
  app.patch("/api/admin/users/:id/credits", async (c) => {
    const input = z
      .object({
        remaining: z.number().int().min(0).max(1000000).nullable(),
        revision: z
          .number()
          .int()
          .min(0)
          .max(Number.MAX_SAFE_INTEGER - 1),
      })
      .strict()
      .parse(await c.req.json());
    return c.json(
      await credits.set(
        c.req.param("id"),
        c.get("user").id,
        input.remaining,
        input.revision,
      ),
    );
  });
}
