import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { ApiError, type Store } from "./store";
import { uid, type User } from "../shared/schema";
import { erxesCookie, embeddingPolicy, type ErxesConfig } from "./erxes-config";
export { erxesConfig, type ErxesConfig } from "./erxes-config";

const claimsSchema = z
  .object({
    v: z.literal(1),
    iss: z.string(),
    aud: z.string(),
    tenant: z.string().min(1).max(200),
    sub: z.string().min(1).max(200),
    email: z
      .email()
      .max(254)
      .transform((email) => email.toLowerCase()),
    name: z.string().trim().min(1).max(80),
    iat: z.number().int(),
    exp: z.number().int(),
    jti: z.uuid(),
  })
  .strict();

export function verifyErxesTicket(
  token: string,
  config: ErxesConfig,
  now = Date.now(),
) {
  const invalid = () =>
    new ApiError(
      401,
      "This erxes sign-in link is invalid or expired. Open Frame from erxes again.",
    );
  if (token.length > 4096 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))
    throw invalid();
  const [payload, signature] = token.split(".");
  const expected = createHmac("sha256", config.secret).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    throw invalid();
  let claims: z.infer<typeof claimsSchema>;
  try {
    claims = claimsSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
  } catch {
    throw invalid();
  }
  const seconds = Math.floor(now / 1000);
  if (
    claims.iss !== config.origin ||
    claims.aud !== config.audience ||
    claims.tenant !== config.tenant ||
    claims.exp <= seconds ||
    claims.iat > seconds + 5 ||
    claims.iat < seconds - 65 ||
    claims.exp <= claims.iat ||
    claims.exp - claims.iat > 60
  )
    throw invalid();
  return claims;
}

// Binding lives in MongoDB, so every API instance enforces the same tenant.
async function boundDeployment(store: Store, config: ErxesConfig) {
  const deployment = await store.db.one("erxesDeployment",{id:"singleton"});
  if (
    !deployment ||
    deployment.tenant !== config.tenant ||
    deployment.issuer !== config.origin
  )
    throw new ApiError(
      503,
      "This Frame database belongs to another erxes workspace or is not bound yet. Use its configured deployment.",
    );
}

export async function erxesSessionUser(
  store: Store,
  headers: Headers,
  config: ErxesConfig,
): Promise<User | null> {
  const name = erxesCookie(config);
  const token = headers
    .get("cookie")
    ?.split(";")
    .map((v) => v.trim())
    .find((v) => v.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  if (!token || !/^[a-f0-9-]{72}$/.test(token)) return null;
  await boundDeployment(store, config);
  const session = await store.db.one("erxesSessions",{$and:[{tokenHash:createHash("sha256").update(token).digest("hex")},{expiresAt:{$gt:Date.now()}},{audience:config.audience}]});
  return session ? ((await store.user(session.userId)) ?? null) : null;
}

export function registerErxes(
  app: Hono<{ Variables: { user: User } }>,
  store: Store,
  config: ErxesConfig | undefined,
) {
  if (!config) return;
  app.use("*", async (c, next) => {
    await next();
    c.header("Content-Security-Policy", embeddingPolicy(config)!);
    c.header("Referrer-Policy", "no-referrer");
  });
  app.post(
    "/integrations/erxes/launch",
    bodyLimit({
      maxSize: 8192,
      onError: (c) =>
        c.json({ error: "The erxes sign-in request is too large." }, 413),
    }),
    async (c) => {
      c.header("Cache-Control", "no-store");
      if (c.req.header("Origin") !== config.origin)
        throw new ApiError(
          403,
          "Open Frame from the configured erxes workspace.",
        );
      const body = await c.req.parseBody();
      if (typeof body.ticket !== "string")
        throw new ApiError(400, "An erxes sign-in ticket is required.");
      const ticket = body.ticket;
      verifyErxesTicket(ticket, config);
      const token = uid() + uid();
      await store.db.transaction(async () => {
        const now = Date.now();
        const claims = verifyErxesTicket(ticket, config, now);
        await store.db.update("erxesDeployment",{id:"singleton"},{$setOnInsert:{id:"singleton",tenant:config.tenant,issuer:config.origin}},{upsert:true});
        await boundDeployment(store, config);
        await store.db.remove("erxesTickets",{expiresAt:{$lte:now}});
        const consumed = await store.db.update("erxesTickets",{nonce:claims.jti},{$setOnInsert:{nonce:claims.jti,expiresAt:claims.exp * 1000}},{upsert:true});
        if (!consumed.changes)
          throw new ApiError(
            401,
            "This erxes ticket was already used. Open Frame from erxes again.",
          );
        let identity = await store.db.one("erxesIdentities",{$and:[{tenant:claims.tenant},{subject:claims.sub}]});
        if (!identity) {
          if (
            await store.db.one("users",{email:claims.email})
          )
            throw new ApiError(
              409,
              "A Frame account already uses this email. Ask your administrator to migrate it; accounts are not automatically linked.",
            );
          const user = await store.createUser(claims.name, claims.email, "");
          identity = { userId: user.id };
          await store.db.insert("erxesIdentities",{tenant:claims.tenant,subject:claims.sub,userId:user.id});
        }
        await store.db.remove("erxesSessions",{expiresAt:{$lte:now}});
        await store.db.insert("erxesSessions",{tokenHash:createHash("sha256").update(token).digest("hex"),userId:identity.userId,expiresAt:now + 3600_000,audience:config.audience});
      })();
      setCookie(c, erxesCookie(config), token, {
        httpOnly: true,
        secure: config.audience.startsWith("https:"),
        sameSite: "Lax",
        path: "/",
        maxAge: 3600,
      });
      return c.redirect("/", 303);
    },
  );
  app.post("/api/auth/signout", async (c) => {
    const token = getCookie(c, erxesCookie(config));
    if (token)
      await store.db.remove("erxesSessions",{tokenHash:createHash("sha256").update(token).digest("hex")});
    deleteCookie(c, erxesCookie(config), {
      path: "/",
      secure: config.audience.startsWith("https:"),
      httpOnly: true,
      sameSite: "Lax",
    });
    return c.json({ ok: true });
  });
}
