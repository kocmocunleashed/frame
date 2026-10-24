import { afterEach, expect, test } from "bun:test";
import { Store } from "./mongo";
import { createApp } from "../server/app";
import { createAIServices } from "../server/creation";
import { PresentationCredits } from "../server/credits";
import { FixtureAIProvider } from "./fixtures/ai-provider";
import { makeDocument } from "../shared/templates";
import { uid } from "../shared/schema";
import type { CreationDraft } from "../shared/ai";

const stores: Store[] = [];
const originalAdmins = process.env.FRAME_ADMIN_USER_IDS;
afterEach(async () => {
  for (const store of stores.splice(0)) await store.db.close();
  if (originalAdmins === undefined) delete process.env.FRAME_ADMIN_USER_IDS;
  else process.env.FRAME_ADMIN_USER_IDS = originalAdmins;
});
const req = (method: string, cookie = "", body?: unknown) => ({
  method,
  headers: { cookie, "Content-Type": "application/json", "X-Frame-Contract":"reference" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
async function setup() {
  const store = new Store(":memory:");
  stores.push(store);
  const admin = await store.createUser(
    "Admin",
    "admin@example.test",
    "fixture",
  );
  const member = await store.createUser(
    "Member",
    "member@example.test",
    "fixture",
  );
  const services = createAIServices(store, new FixtureAIProvider());
  const adminCookie = `fixture=${uid()}`,
    cookie = `fixture=${uid()}`;
  const app = createApp(store, services, async (_store, headers) =>
    headers.get("cookie") === adminCookie
      ? admin
      : headers.get("cookie") === cookie
        ? member
        : null,
  );
  const credits = new PresentationCredits(store);
  process.env.FRAME_ADMIN_USER_IDS = ` ${admin.id} `;
  const set = async (remaining: number | null, revision?: number) =>
    app.request(
      `/api/admin/users/${member.id}/credits`,
      req("PATCH", adminCookie, {
        remaining,
        revision: revision ?? (await credits.balance(member.id)).revision,
      }),
    );
  async function draft() {
    const initial = (await (
      await app.request("/api/creation", req("POST", cookie))
    ).json()) as CreationDraft;
    initial.data.quickDraft = true;
    initial.data.brief = {
      ...initial.data.brief,
      topic: "A presentation about learning",
      slideCount: 3,
      webSearch: false,
    };
    const response = await app.request(
      `/api/creation/${initial.id}`,
      req("PUT", cookie, { revision: initial.revision, data: initial.data }),
    );
    expect(response.status).toBe(200);
    return response.json() as Promise<CreationDraft>;
  }
  const generate = (d: CreationDraft, extras = {}) =>
    app.request(
      `/api/creation/${d.id}/jobs`,
      req("POST", cookie, {
        revision: d.revision,
        kind: "generate",
        key: uid(),
        ...extras,
      }),
    );
  async function ready(d: CreationDraft) {
    const response = await generate(d);
    expect(response.status).toBe(202);
    const { job } = await response.json();
    // Accounting tests use an already validated generation result, without
    // invoking models or the browser-based typography fitting pipeline.
    await store.db.update("jobs",{id:job.id},{$set:{status:"succeeded",result:JSON.stringify({
          document: makeDocument(
            member.id,
            member.workspaceId,
            "Generated presentation",
            "story",
          ),
        })}});
    return job.id as string;
  }
  const finish = (d: CreationDraft, jobId: string) =>
    app.request(`/api/creation/${d.id}/finish`, req("POST", cookie, { jobId }));
  return {
    store,
    app,
    credits,
    admin,
    member,
    adminCookie,
    cookie,
    set,
    draft,
    generate,
    ready,
    finish,
    services,
  };
}

test("admin APIs require authenticated server-approved IDs and never expose password hashes", async () => {
  const { app, adminCookie, cookie, member, set } = await setup();
  expect((await app.request("/api/admin/users")).status).toBe(401);
  expect(
    (await app.request("/api/admin/users", req("GET", cookie))).status,
  ).toBe(403);
  expect(
    (
      await app.request(
        `/api/admin/users/${member.id}/credits`,
        req("PATCH", cookie, { remaining: 100, revision: 0, isAdmin: true }),
      )
    ).status,
  ).toBe(403);
  const list = await (
    await app.request("/api/admin/users?query=MEMBER", req("GET", adminCookie))
  ).json();
  expect(list.total).toBe(1);
  expect(list.users[0]).toEqual({
    id: member.id,
    name: "Member",
    email: member.email,
    remaining: null,
    revision: 0,
  });
  expect(
    await (await app.request("/api/credits", req("GET", cookie))).json(),
  ).toEqual({ remaining: null, revision: 0, isAdmin: false });
  process.env.FRAME_ADMIN_USER_IDS = member.email; // Email sign-up cannot grant admin.
  expect(
    (await app.request("/api/admin/users", req("GET", cookie))).status,
  ).toBe(403);
  expect((await set(5)).status).toBe(403); // Revocation affects existing sessions.
});

test("admins set exact balances, restore unlimited access and leave an audit record", async () => {
  const { set, credits, member, admin, store } = await setup();
  expect((await set(7)).status).toBe(200);
  expect(await credits.balance(member.id)).toEqual({
    remaining: 7,
    revision: 1,
  });
  expect((await set(2)).status).toBe(200);
  expect((await credits.balance(member.id)).remaining).toBe(2);
  expect((await set(0)).status).toBe(200);
  expect((await credits.balance(member.id)).remaining).toBe(0);
  expect((await set(null)).status).toBe(200);
  expect((await credits.balance(member.id)).remaining).toBeNull();
  const changes = (await store.db.find("presentationCreditChanges",{},{sort:{resultingRevision:1}})).map(({actorId,previousRemaining,remaining})=>({actorId,previousRemaining,remaining}));
  expect(changes).toEqual([
    { actorId: admin.id, previousRemaining: null, remaining: 7 },
    { actorId: admin.id, previousRemaining: 7, remaining: 2 },
    { actorId: admin.id, previousRemaining: 2, remaining: 0 },
    { actorId: admin.id, previousRemaining: 0, remaining: null },
  ]);
});

test("invalid balances, stale writes, missing users and foreign origins cannot modify credits", async () => {
  const { app, set, credits, member, adminCookie } = await setup();
  for (const remaining of [-1, 1.5, "10", 1000001, true, {}, undefined]) {
    const response = await app.request(
      `/api/admin/users/${member.id}/credits`,
      req("PATCH", adminCookie, { remaining, revision: 0 }),
    );
    expect(response.status).toBe(400);
  }
  expect((await set(4, 0)).status).toBe(200);
  expect((await set(99, 0)).status).toBe(409);
  expect(
    (
      await app.request(
        "/api/admin/users/missing/credits",
        req("PATCH", adminCookie, { remaining: 1, revision: 0 }),
      )
    ).status,
  ).toBe(404);
  const crossOrigin = req("PATCH", adminCookie, { remaining: 99, revision: 1 });
  expect(
    (
      await app.request(`/api/admin/users/${member.id}/credits`, {
        ...crossOrigin,
        headers: {
          ...crossOrigin.headers,
          Origin: "https://untrusted.example",
        },
      })
    ).status,
  ).toBe(403);
  expect(await credits.balance(member.id)).toEqual({
    remaining: 4,
    revision: 1,
  });
});

test("search is literal, paginated and validates query parameters", async () => {
  const { app, store, adminCookie } = await setup();
  for (let i = 0; i < 30; i++)
    await store.createUser(
      `Search ${i}`,
      `search-${i}@example.test`,
      "fixture",
    );
  const page = await (
    await app.request(
      "/api/admin/users?query=search&page=2",
      req("GET", adminCookie),
    )
  ).json();
  expect(page.total).toBe(30);
  expect(page.users).toHaveLength(5);
  expect(
    (
      await (
        await app.request("/api/admin/users?query=%25", req("GET", adminCookie))
      ).json()
    ).total,
  ).toBe(0);
  expect(
    (await app.request("/api/admin/users?page=-1", req("GET", adminCookie)))
      .status,
  ).toBe(400);
});

test("saving a completed AI presentation spends one credit; replay and retries do not spend again", async () => {
  const { set, credits, member, draft, ready, finish } = await setup();
  await set(1);
  const d = await draft(),
    jobId = await ready(d);
  expect((await credits.balance(member.id)).remaining).toBe(1);
  const created = await finish(d, jobId);
  expect(created.status).toBe(201);
  const document = await created.json();
  expect(await credits.balance(member.id)).toEqual({
    remaining: 0,
    revision: 2,
  });
  const replay = await finish(d, jobId);
  expect(replay.status).toBe(201);
  expect((await replay.json()).id).toBe(document.id);
  expect((await credits.balance(member.id)).remaining).toBe(0);
  expect((await set(10, 1)).status).toBe(409); // Cannot overwrite a concurrent spend.
});

test("zero blocks both generation versions and finishing; manual creation remains available", async () => {
  const {
    app,
    cookie,
    set,
    credits,
    member,
    draft,
    generate,
    ready,
    finish,
    store,
  } = await setup();
  const d = await draft(),
    jobId = await ready(d);
  await set(0);
  const next = await draft();
  for (const extras of [{}, { designVersion: 2 }]) {
    const response = await generate(next, extras);
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain(
      "no presentation credits left",
    );
  }
  expect((await finish(d, jobId)).status).toBe(403);
  expect(
    await ({n:await store.db.count("jobApplications",{})}),
  ).toEqual({ n: 0 });
  expect(
    (
      await app.request(
        "/api/decks",
        req("POST", cookie, { title: "Manual deck" }),
      )
    ).status,
  ).toBe(201);
  expect((await credits.balance(member.id)).remaining).toBe(0);
  await set(1);
  expect((await finish(d, jobId)).status).toBe(201);
  expect((await credits.balance(member.id)).remaining).toBe(0);
});

test("competing completed presentations cannot spend the last credit twice", async () => {
  const { set, credits, member, draft, ready, finish, store } = await setup();
  await set(1);
  const a = await draft(),
    aJob = await ready(a),
    b = await draft(),
    bJob = await ready(b);
  const responses = await Promise.all([finish(a, aJob), finish(b, bJob)]);
  expect(responses.map((r) => r.status).sort()).toEqual([201, 403]);
  expect((await credits.balance(member.id)).remaining).toBe(0);
  expect(
    await ({n:await store.db.count("jobApplications",{})}),
  ).toEqual({ n: 1 });
});

test("failed or cancelled work does not spend credits and failed saves roll back the debit", async () => {
  const {
    set,
    credits,
    member,
    draft,
    generate,
    ready,
    finish,
    services,
    store,
  } = await setup();
  await set(3);
  const d = await draft();
  const { job } = await (await generate(d)).json();
  await services.worker.cancel(job.id, member.id);
  expect((await finish(d, job.id)).status).toBe(409);
  expect((await credits.balance(member.id)).remaining).toBe(3);
  const second = await draft(),
    jobId = await ready(second);
  const insert = store.db.insert.bind(store.db);
  store.db.insert = async (collection, value) => {if(collection==='decks')throw new Error('Synthetic save failure');return insert(collection,value);};
  expect((await finish(second, jobId)).status).toBe(500);
  expect(await credits.balance(member.id)).toEqual({
    remaining: 3,
    revision: 1,
  });
  store.db.insert = insert;
  expect((await finish(second, jobId)).status).toBe(201);
  expect((await credits.balance(member.id)).remaining).toBe(2);
});

test("unlimited accounts continue generating and saving without gaining a finite balance", async () => {
  const { credits, member, draft, ready, finish } = await setup();
  const d = await draft(),
    jobId = await ready(d);
  expect((await finish(d, jobId)).status).toBe(201);
  expect(await credits.balance(member.id)).toEqual({
    remaining: null,
    revision: 1,
  });
});
