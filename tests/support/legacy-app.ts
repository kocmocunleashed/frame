// Explicit test-only identity transport. Never imported by the production server.
import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import { createApp as productionApp } from "../../server/app";
import type { Store } from "../../server/store";
import { contentHash } from "../../server/database";
import { createAIServices, type AIServices } from "../../server/creation";
export function createApp(
  store: Store,
  ai: AIServices = createAIServices(store),
) {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Fixture identity is test-only.");
  const app = new Hono();
  app.use("/api/*", async (c, next) => {
    if (!c.req.header("X-Frame-Contract"))
      c.req.raw.headers.set("X-Frame-Contract", "reference");
    await next();
  });
  app.get("/api/auth/provider", (c) =>
    c.json({ provider: "fixture", liveAI: process.env.FRAME_DEV_LIVE_AI === "true" }),
  );
  app.post("/api/auth/signup", async (c) => {
    const input = z
      .object({ name: z.string().min(1), email: z.email() })
      .parse(await c.req.json());
    const id = "fixture:" + contentHash(input.email.trim().toLowerCase());
    const user =
      (await store.user(id)) ||
      (await store.createUser(input.name, input.email, "", id));
    if (!(await store.db.count("decks", { ownerId: user.id }))) await store.seed(user);
    const token = crypto.randomUUID() + crypto.randomUUID();
    await store.db.insert("sessions", {
      token: contentHash(token),
      userId: user.id,
      expiresAt: new Date(Date.now() + 3600000),
    });
    setCookie(c, "frame_fixture", token, {
      httpOnly: true,
      sameSite: "Lax",
      path: "/",
    });
    return c.json({ user });
  });
  app.post("/api/auth/signout", async (c) => {
    await store.db.remove("sessions", {
      token: contentHash(getCookie(c, "frame_fixture") || ""),
    });
    deleteCookie(c, "frame_fixture", { path: "/" });
    return c.json({ ok: true });
  });
  app.route(
    "/",
    productionApp(store, ai, async (store, headers) => {
      const token = headers
        .get("cookie")
        ?.split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith("frame_fixture="))
        ?.slice(14);
      if (!token) return null;
      const session = await store.db.one("sessions", {
        token: contentHash(token),
        expiresAt: { greaterThan: new Date() },
      });
      return session ? (await store.user(session.userId)) || null : null;
    }),
  );
  return app;
}
