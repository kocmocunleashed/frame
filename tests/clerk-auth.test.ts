import { afterEach, beforeEach, expect, test } from "bun:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { sessionUser } from "../server/auth-session";
import { createApp } from "../server/app";
import { Store } from "./mongo";
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const realFetch = globalThis.fetch;
let store: Store;
let identity: Record<string, unknown>;
let lookups = 0;
const names = [
  "CLERK_SECRET_KEY",
  "CLERK_JWT_KEY",
  "APP_ORIGIN",
  "CLERK_AUTHORIZED_PARTIES",
] as const;
let previous: (string | undefined)[];
beforeEach(() => {
  previous = names.map((n) => process.env[n]);
  process.env.CLERK_SECRET_KEY = "sk_test_fixture";
  process.env.CLERK_JWT_KEY = publicKey
    .export({ type: "spki", format: "pem" })
    .toString();
  process.env.APP_ORIGIN = "http://localhost";
  store = new Store(":memory:");
  lookups = 0;
  identity = {
    object: "user",
    id: "user_clerk_test",
    external_id: null,
    first_name: "Alex",
    last_name: null,
    primary_email_address_id: "email_test",
    email_addresses: [
      {
        object: "email_address",
        id: "email_test",
        email_address: "clerk@example.test",
        linked_to: [],
        verification: { status: "verified" },
      },
    ],
  };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("https://api.clerk.com/v1/users/")) {
      lookups++;
      return Response.json(identity, {
        headers: { "Content-Type": "application/json" },
      });
    }
    throw new Error(`Unexpected network request in auth test: ${url}`);
  }) as typeof fetch;
});
afterEach(async () => {
  globalThis.fetch = realFetch;
  names.forEach((n, i) =>
    previous[i] === undefined
      ? delete process.env[n]
      : (process.env[n] = previous[i]),
  );
  await store.db.close();
});
function token(overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test" }),
  ).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({
      iss: "https://fixture.clerk.accounts.dev",
      sub: "user_clerk_test",
      sid: "sess_test",
      azp: "http://localhost",
      iat: now,
      nbf: now - 1,
      exp: now + 60,
      ...overrides,
    }),
  ).toString("base64url");
  const data = `${head}.${body}`;
  return `${data}.${sign("RSA-SHA256", Buffer.from(data), privateKey).toString("base64url")}`;
}
const headers = (value = token()) =>
  new Headers({ Authorization: `Bearer ${value}` });
test("missing, forged, expired and wrong-origin sessions are rejected before user lookup", async () => {
  for (const h of [
    new Headers(),
    headers("forged"),
    headers(token({ exp: 1 })),
    headers(token({ azp: "https://attacker.test" })),
    headers(token({ sid: null })),
  ]) {
    expect(await sessionUser(store, h)).toBeNull();
  }
  expect(lookups).toBe(0);
});
test("Clerk user gets one workspace and cookie sessions also authenticate", async () => {
  const first = await sessionUser(store, headers());
  const second = await sessionUser(
    store,
    new Headers({ cookie: `__session=${token()}` }),
  );
  expect(first?.id).toBe("user_clerk_test");
  expect(second?.workspaceId).toBe(first?.workspaceId);
  expect(await store.db.count("workspaces")).toBe(1);
});
test("imported Clerk external ID preserves existing workspace ownership", async () => {
  const existing = await store.createUser(
    "Legacy",
    "old@example.test",
    "legacy",
  );
  identity.external_id = existing.id;
  expect(await sessionUser(store, headers())).toEqual(existing);
});
test("email match alone cannot claim an existing account", async () => {
  await store.createUser("Legacy", "clerk@example.test", "legacy");
  await expect(sessionUser(store, headers())).rejects.toThrow();
});
test("unverified and incomplete imported identities are rejected", async () => {
  identity.external_id = "missing-frame-id";
  await expect(sessionUser(store, headers())).rejects.toThrow(
    "migration is incomplete",
  );
  identity.external_id = null;
  identity.email_addresses = [
    {
      id: "email_test",
      email_address: "clerk@example.test",
      linked_to: [],
      verification: { status: "unverified" },
    },
  ];
  await expect(sessionUser(store, headers())).rejects.toThrow(
    "Verify your email",
  );
});
test("production app disables legacy sign-in and protects workspace APIs", async () => {
  const app = createApp(store);
  expect(
    (await app.request("/api/auth/signup", { method: "POST" })).status,
  ).toBe(410);
  expect((await app.request("/api/me")).status).toBe(401);
  expect((await app.request("/api/me", { headers: headers() })).status).toBe(
    200,
  );
  expect(
    (
      await app.request("/api/decks", {
        headers: headers(token({ azp: "https://evil.test" })),
      })
    ).status,
  ).toBe(401);
});

test("private publications and downloads enforce the same Clerk identity", async () => {
  const { PublicationStore } = await import("../server/publications");
  const owner = (await sessionUser(store, headers()))!;
  const doc = await store.create(owner, "Private story", "story", "studio");
  const publication = await new PublicationStore(store).publish(doc.id, owner, {
    baseRevision: 0,
    expectedEdition: null,
    visibility: "private",
    allowDownload: false,
  });
  const app = createApp(store);
  const path = `/api/publications/${publication.id}`;
  expect((await app.request(path)).status).toBe(401);
  expect((await app.request(path, { headers: headers() })).status).toBe(200);
  expect((await app.request(`${path}/download/pdf`)).status).toBe(401);
  expect(
    (await app.request(`${path}/download/pdf`, { headers: headers() })).status,
  ).toBe(403);
  const other = await store.createUser("Other", "other@example.test", "unused");
  identity.external_id = other.id;
  // A profile change cannot replace an already-bound stable provider subject.
  expect((await app.request(path, { headers: headers() })).status).toBe(200);
  identity.id = "user_clerk_other";
  expect((await app.request(path, { headers: headers(token({sub: identity.id})) })).status).toBe(403);
});

test("explicit deployment origins accept only the configured public domains", async () => {
  process.env.CLERK_AUTHORIZED_PARTIES =
    "https://frame.leoh.site,https://vercel-frame-five.vercel.app";
  expect(
    await sessionUser(
      store,
      headers(token({ azp: "https://frame.leoh.site" })),
    ),
  ).not.toBeNull();
  expect(
    await sessionUser(
      store,
      headers(token({ azp: "https://vercel-frame-five.vercel.app" })),
    ),
  ).not.toBeNull();
  expect(
    await sessionUser(
      store,
      headers(token({ azp: "https://unlisted.vercel.app" })),
    ),
  ).toBeNull();
});
