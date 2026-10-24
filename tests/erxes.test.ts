import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { createApp } from "../server/app";
import { Store } from "./mongo";
import {
  erxesConfig,
  verifyErxesTicket,
  type ErxesConfig,
} from "../server/erxes";
import { embeddingPolicy } from "../server/erxes-config";
import { studioResponse } from "../server/studio-response";
import {
  createFrameLaunch,
  frameTarget,
} from "../frame-erxes/backend/plugins/frame_api/src/ticket";
const config: ErxesConfig = {
  origin: "https://school.example.test",
  audience: "https://slides.example.test",
  tenant: "school",
  secret: "test-only-secret-with-at-least-32-bytes",
};
const target = {
  erxesOrigin: config.origin,
  frameOrigin: config.audience,
  secret: config.secret,
};
const identity = {
  id: "teacher-1",
  email: "teacher@example.test",
  name: "Teacher",
};
const names = [
  "FRAME_ERXES_ORIGIN",
  "FRAME_ERXES_TENANT",
  "FRAME_ERXES_SECRET",
  "APP_ORIGIN",
] as const;
let saved: (string | undefined)[];
let store: Store;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  saved = names.map((name) => process.env[name]);
  Object.assign(process.env, {
    FRAME_ERXES_ORIGIN: config.origin,
    FRAME_ERXES_TENANT: config.tenant,
    FRAME_ERXES_SECRET: config.secret,
    APP_ORIGIN: config.audience,
  });
  store = new Store(":memory:");
  app = createApp(store);
});
afterEach(async () => {
  await store.db.close();
  names.forEach((name, i) =>
    saved[i] === undefined
      ? delete process.env[name]
      : (process.env[name] = saved[i]),
  );
});
const ticket = (user = identity) =>
  createFrameLaunch(target, config.tenant, user).ticket;
const launch = (value = ticket(), origin = config.origin, instance = app) =>
  instance.request("/integrations/erxes/launch", {
    method: "POST",
    headers: { Origin: origin },
    body: new URLSearchParams({ ticket: value }),
  });
const cookieHeaders = (res: Response) => ({
  Cookie: res.headers.get("set-cookie")!.split(";")[0],
});
const count = async (table: string) =>
  (await ({n:await store.db.count(table,{})})).n;
function sign(claims: object) {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${createHmac("sha256", config.secret).update(payload).digest("base64url")}`;
}

describe("erxes integration on MongoDB", () => {
  test("configuration is opt-in and fails closed for incomplete or unsafe origins", () => {
    expect(erxesConfig()).toEqual(config);
    for (const name of names) delete process.env[name];
    expect(erxesConfig()).toBeUndefined();
    process.env.FRAME_ERXES_TENANT = "school";
    expect(erxesConfig).toThrow();
    Object.assign(process.env, {
      FRAME_ERXES_ORIGIN: config.origin,
      FRAME_ERXES_TENANT: config.tenant,
      FRAME_ERXES_SECRET: config.secret,
      APP_ORIGIN: config.audience,
    });
    for (const value of [
      "https://school.example.test/path",
      "http://school.example.test",
      "https://school.example.test/",
      "https://user@school.example.test",
    ]) {
      process.env.FRAME_ERXES_ORIGIN = value;
      expect(erxesConfig).toThrow();
    }
  });
  test("issuer tickets are interoperable and reject tampering and invalid claims", () => {
    const now = Date.now(),
      value = ticket(),
      claims = verifyErxesTicket(value, config, now);
    expect(claims.sub).toBe(identity.id);
    for (const value of ["", "a.b.c", "x".repeat(5000), ticket() + "x"])
      expect(() => verifyErxesTicket(value, config)).toThrow();
    expect(() => verifyErxesTicket(value, config, now + 61000)).toThrow();
    expect(() =>
      verifyErxesTicket(value, { ...config, secret: "wrong" }),
    ).toThrow();
    for (const patch of [
      { tenant: "other" },
      { iss: config.audience },
      { aud: config.origin },
      { exp: claims.iat + 3600 },
      { exp: claims.iat },
      { iat: claims.iat + 20 },
      { email: "invalid" },
      { jti: "invalid" },
      { v: 2 },
    ])
      expect(() =>
        verifyErxesTicket(sign({ ...claims, ...patch }), config, now),
      ).toThrow();
  });
  test("unknown tenants and prototype keys cannot select a deployment", () => {
    const raw = JSON.stringify({ school: target });
    expect(frameTarget(raw, "school")).toEqual(target);
    for (const name of ["other", "__proto__", "constructor"])
      expect(() => frameTarget(raw, name)).toThrow();
  });
  test("launch creates a persistent identity, a bounded secure session and an editable workspace", async () => {
    const value = ticket(),
      res = await launch(value);
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("content-security-policy")).toBe(
      embeddingPolicy(config) ?? null,
    );
    const cookie = res.headers.get("set-cookie")!;
    for (const part of [
      "__Host-frame_erxes=",
      "HttpOnly",
      "Secure",
      "SameSite=Lax",
      "Max-Age=3600",
      "Path=/",
    ])
      expect(cookie).toContain(part);
    const headers = cookieHeaders(res);
    const me = await (await app.request("/api/me", { headers })).json();
    expect(me.user.email).toBe(identity.email);
    expect(me.integration.erxesOrigin).toBe(config.origin);
    const create = await app.request("/api/decks", {
      method: "POST",
      headers: {
        ...headers,
        Origin: config.audience,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "Lesson", template: "lesson" }),
    });
    expect(create.status).toBe(201);
    expect((await launch(value)).status).toBe(401);
    expect(
      (await launch(ticket({ ...identity, email: "changed@example.test" })))
        .status,
    ).toBe(303);
    expect(await count("users")).toBe(1);
    const other = await launch(
      ticket({ id: "teacher-2", email: "second@example.test", name: "Second" }),
    );
    expect(
      await (
        await app.request("/api/decks", { headers: cookieHeaders(other) })
      ).json(),
    ).toEqual({items:[],nextCursor:null});
    const doc = await create.json();
    expect(
      (
        await app.request(`/api/decks/${doc.id}`, {
          headers: cookieHeaders(other),
        })
      ).status,
    ).toBe(404);
    const session = await store.db.one("erxesSessions",{},{limit:1});
    expect(session.expiresAt - Date.now()).toBeLessThanOrEqual(3600_000);
  });
  test("concurrent redemption across app instances creates exactly one session", async () => {
    const value = ticket();
    const second = createApp(store);
    const results = await Promise.all([
      launch(value),
      launch(value, config.origin, second),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([303, 401]);
    expect(await count("erxesSessions")).toBe(1);
    expect(await count("users")).toBe(1);
  });
  test("wrong origins, missing tickets and oversized requests cannot create identities", async () => {
    expect((await launch(ticket(), "https://attacker.test")).status).toBe(403);
    expect(
      (
        await app.request("/integrations/erxes/launch", {
          method: "POST",
          body: new URLSearchParams({ ticket: ticket() }),
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await app.request("/integrations/erxes/launch", {
          method: "POST",
          headers: { Origin: config.origin },
          body: new URLSearchParams(),
        })
      ).status,
    ).toBe(400);
    expect((await launch("x".repeat(9000))).status).toBe(413);
    expect(await count("users")).toBe(0);
  });
  test("email collisions do not link accounts and roll back ticket consumption", async () => {
    await store.createUser("Existing", "Teacher@example.test", "unused");
    expect((await launch()).status).toBe(409);
    expect(await count("erxesIdentities")).toBe(0);
    expect(await count("erxesTickets")).toBe(0);
    expect(await count("erxesDeployment")).toBe(0);
    for (const action of ["signin", "signup"])
      expect(
        (await app.request(`/api/auth/${action}`, { method: "POST" })).status,
      ).toBe(403);
  });
  test("database binding prevents tenant or issuer reconfiguration from accessing old accounts", async () => {
    const res = await launch();
    process.env.FRAME_ERXES_TENANT = "other";
    let other = createApp(store);
    const otherTicket = createFrameLaunch(target, "other", identity).ticket;
    expect((await launch(otherTicket, config.origin, other)).status).toBe(503);
    expect(
      (await other.request("/api/me", { headers: cookieHeaders(res) })).status,
    ).toBe(503);
    process.env.FRAME_ERXES_TENANT = config.tenant;
    process.env.FRAME_ERXES_ORIGIN = "https://other.example.test";
    other = createApp(store);
    expect(
      (await other.request("/api/me", { headers: cookieHeaders(res) })).status,
    ).toBe(503);
  });
  test("logout and expiration invalidate sessions and CSRF cannot sign users out", async () => {
    const res = await launch(),
      headers = cookieHeaders(res);
    expect(
      (
        await app.request("/api/auth/signout", {
          method: "POST",
          headers: { ...headers, Origin: "https://evil.test" },
        })
      ).status,
    ).toBe(403);
    expect((await app.request("/api/me", { headers })).status).toBe(200);
    expect(
      (await app.request("/api/auth/signout", { method: "POST", headers }))
        .status,
    ).toBe(200);
    expect((await app.request("/api/me", { headers })).status).toBe(401);
    const again = await launch();
    await store.db.update("erxesSessions",{},{$set:{expiresAt:0}});
    expect(
      (await app.request("/api/me", { headers: cookieHeaders(again) })).status,
    ).toBe(401);
  });
  test("legacy cookies and forged Clerk tokens never authenticate in erxes mode", async () => {
    for (const headers of [
      { Cookie: "frame_session=legacy" },
      { Cookie: "__session=forged" },
      { Authorization: "Bearer forged" },
      { Cookie: "__Host-frame_erxes=invalid" },
    ] as Record<string, string>[])
      expect((await app.request("/api/me", { headers })).status).toBe(401);
    expect(await (await app.request("/api/auth/provider")).json()).toEqual({
      provider: "erxes", erxesOrigin: config.origin,
    });
    for (const name of names) delete process.env[name];
    const plain = createApp(store);
    expect(await (await plain.request("/api/auth/provider")).json()).toEqual({
      provider:"clerk",erxesOrigin: null,
    });
    expect(
      (await plain.request("/api/auth/signup", { method: "POST" })).status,
    ).toBe(410);
    expect(
      (await plain.request("/integrations/erxes/launch", { method: "POST" }))
        .status,
    ).toBe(404);
  });
  test("private published decks honor the erxes session", async () => {
    const { PublicationStore } = await import("../server/publications");
    const res = await launch(),
      headers = cookieHeaders(res);
    const { user } = await (await app.request("/api/me", { headers })).json();
    const doc = await store.create(user, "Private lesson", "blank", "studio");
    const publication = await new PublicationStore(store).publish(
      doc.id,
      user,
      {
        baseRevision: 0,
        expectedEdition: null,
        visibility: "private",
        allowDownload: false,
      },
    );
    const path = `/api/publications/${publication.id}`;
    expect((await app.request(path)).status).toBe(401);
    expect((await app.request(path, { headers })).status).toBe(200);
    expect(
      (await app.request(`${path}/download/pdf`, { headers })).status,
    ).toBe(403);
  });
  test("SPA HTML enforces the configured embedding policy and no shared caching", async () => {
    const response = studioResponse(
      new Request(config.audience, { method: "HEAD" }),
    );
    expect(response.headers.get("content-security-policy")).toBe(
      embeddingPolicy(config) ?? null,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(
      studioResponse(new Request(config.audience, { method: "POST" })).status,
    ).toBe(405);
    const unknown=await app.request('/api/not-a-resource');
    expect(unknown.status).toBe(401);

  });
});
