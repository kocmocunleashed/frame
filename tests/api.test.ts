import { afterEach, describe, test, expect } from "bun:test";
import { createApp } from "./support/legacy-app";
import { Store } from "./mongo";
import { uid, type FrameDocument } from "../shared/schema";
import { rmSync } from "node:fs";
import sharp from "sharp";
const stores: Store[] = [];
afterEach(async () => {
  for (const s of stores.splice(0)) await s.db.close();
});
function setup() {
  const store = new Store(":memory:");
  stores.push(store);
  const app = createApp(store);
  return { store, app };
}
async function signup(
  app: ReturnType<typeof createApp>,
  email = `${uid()}@example.test`,
) {
  const res = await app.request("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "Alex",
      email,
      password: "a-secure-passphrase",
    }),
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("set-cookie")).toContain("HttpOnly");
  expect(res.headers.get("set-cookie")).toContain("SameSite=Lax");
  return res.headers.get("set-cookie")!.split(";")[0];
}
const request = (
  method: string,
  cookie: string,
  body?: unknown,
): RequestInit => ({
  method,
  headers: {
    cookie,
    Origin: "http://localhost",
    "Content-Type": "application/json",
  },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
describe("account and document APIs", () => {
  test("health is public but workspace data requires a session", async () => {
    const { app } = setup();
    expect((await app.request("/api/health")).status).toBe(200);
    expect((await app.request("/api/decks")).status).toBe(401);
  });
  test("verified fixture identity gets a hashed HttpOnly session and owned samples", async () => {
    const { store, app } = setup(),
      cookie = await signup(app);
    const row = await store.db.one('fixtureSessions');
    expect(row.tokenHash).toHaveLength(64);
    expect(row.token).toBeUndefined();
    expect(await store.db.count('authIdentities')).toBe(1);
    const decks = await (
      await app.request("/api/decks", request("GET", cookie))
    ).json();
    expect(decks).toHaveLength(3);
    expect(
      decks.every((d: FrameDocument) => d.ownerId === decks[0].ownerId),
    ).toBe(true);
  });
  test("create, edit, reload and sign out form one complete session", async () => {
    const { app } = setup(),
      cookie = await signup(app);
    const created = (await (
      await app.request(
        "/api/decks",
        request("POST", cookie, { title: "My story", template: "blank" }),
      )
    ).json()) as FrameDocument;
    expect(created.slides).toHaveLength(1);
    const edit = await app.request(
      `/api/decks/${created.id}`,
      request("PATCH", cookie, {
        baseRevision: 0,
        operations: [
          { type: "document.update", patch: { title: "Ready for the room" } },
        ],
      }),
    );
    expect(edit.status).toBe(200);
    const reload = await (
      await app.request(`/api/decks/${created.id}`, request("GET", cookie))
    ).json();
    expect(reload.title).toBe("Ready for the room");
    expect(reload.revision).toBe(1);
    await app.request("/api/auth/signout", request("POST", cookie));
    expect(
      (await app.request("/api/decks", request("GET", cookie))).status,
    ).toBe(401);
  });
  test("another account cannot retrieve a document, its history or duplicate it", async () => {
    const { app } = setup(),
      alice = await signup(app),
      bob = await signup(app);
    const decks = await (
      await app.request("/api/decks", request("GET", alice))
    ).json();
    for (const [path, method] of [
      [`/api/decks/${decks[0].id}`, "GET"],
      [`/api/decks/${decks[0].id}/revisions`, "GET"],
      [`/api/decks/${decks[0].id}/duplicate`, "POST"],
    ])
      expect((await app.request(path, request(method, bob))).status).toBe(404);
  });
  test("cross-origin mutation is rejected", async () => {
    const { app } = setup(),
      cookie = await signup(app);
    const res = await app.request("/api/decks", {
      ...request("POST", cookie, { title: "Rejected" }),
      headers: {
        cookie,
        "Content-Type": "application/json",
        Origin: "https://untrusted.example",
      },
    });
    expect(res.status).toBe(403);
  });
  test("permanent deletion requires trash and revokes access and schedules durable cleanup", async () => {
    const { store, app } = setup(),
      cookie = await signup(app);
    const d = await (
      await app.request("/api/decks", request("GET", cookie))
    ).json();
    const id = d[0].id;
    expect(
      (await app.request(`/api/decks/${id}`, request("DELETE", cookie))).status,
    ).toBe(400);
    await app.request(
      `/api/decks/${id}`,
      request("PATCH", cookie, {
        baseRevision: 0,
        operations: [{ type: "document.update", patch: { status: "trashed" } }],
      }),
    );
    expect(
      (await app.request(`/api/decks/${id}`, request("DELETE", cookie))).status,
    ).toBe(200);
    expect((await app.request(`/api/decks/${id}`,request('GET',cookie))).status).toBe(404);
    expect(await store.db.one('deletionTombstones',{deckId:id})).not.toBeNull();
    // Retain immutable roots until resumable reference-aware maintenance runs.
    expect(await store.db.count('revisions',{deckId:id})).toBeGreaterThan(0);
  });
  test("revision conflict and invalid operations return actionable errors", async () => {
    const { app } = setup(),
      cookie = await signup(app);
    const decks = await (
      await app.request("/api/decks", request("GET", cookie))
    ).json();
    const path = `/api/decks/${decks[0].id}`;
    const operation = { type: "document.update", patch: { title: "Edited" } };
    await app.request(
      path,
      request("PATCH", cookie, { baseRevision: 0, operations: [operation] }),
    );
    expect(
      (
        await app.request(
          path,
          request("PATCH", cookie, {
            baseRevision: 0,
            operations: [operation],
          }),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await app.request(
          path,
          request("PATCH", cookie, {
            baseRevision: 1,
            operations: [{ type: "execute", code: "alert()" }],
          }),
        )
      ).status,
    ).toBe(400);
  });
  test("uploaded images require authentication and their workspace", async () => {
    const { app } = setup(),
      alice = await signup(app),
      bob = await signup(app);
    const root = `/tmp/frame-assets-${uid()}`;
    const previous = process.env.FRAME_ASSETS;
    process.env.FRAME_ASSETS = root;
    try {
      const form = new FormData();
      form.append(
        "file",
        new File(
          [
            await sharp({
              create: {
                width: 2,
                height: 2,
                channels: 3,
                background: "#2347dd",
              },
            })
              .png()
              .toBuffer(),
          ],
          "sample.png",
          { type: "image/png" },
        ),
      );
      const res = await app.request("/api/assets", {
        method: "POST",
        headers: { cookie: alice },
        body: form,
      });
      expect(res.status).toBe(201);
      const asset = await res.json();
      expect((await app.request(asset.src, request("GET", alice))).status).toBe(
        200,
      );
      expect((await app.request(asset.src, request("GET", bob))).status).toBe(
        404,
      );
    } finally {
      if (previous === undefined) delete process.env.FRAME_ASSETS;
      else process.env.FRAME_ASSETS = previous;
      rmSync(root, { recursive: true, force: true });
    }
  });
});
test("media decoding rejects corrupt files and authenticated byte ranges work", async () => {
  const { store, app } = setup(),
    cookie = await signup(app),
    root = "/tmp/frame-media-" + uid(),
    old = process.env.FRAME_ASSETS;
  process.env.FRAME_ASSETS = root;
  try {
    const invalid = new FormData();
    invalid.set(
      "file",
      new File([new Uint8Array([137, 80, 78, 71])], "broken.png", {
        type: "image/png",
      }),
    );
    expect(
      (
        await app.request("/api/assets", {
          method: "POST",
          headers: { cookie },
          body: invalid,
        })
      ).status,
    ).toBe(400);
    expect(
      (
        (await ({n:await store.db.count("assets",{})})) as {
          n: number;
        }
      ).n,
    ).toBe(0);
    const form = new FormData(),
      bytes = await sharp({
        create: { width: 4, height: 4, channels: 3, background: "#ff5511" },
      })
        .png()
        .toBuffer();
    form.set("file", new File([bytes], "valid.png", { type: "image/png" }));
    const response = await app.request("/api/assets", {
      method: "POST",
      headers: { cookie },
      body: form,
    });
    expect(response.status).toBe(201);
    const asset = await response.json();
    expect(asset.mime).toBe("image/webp");
    expect(asset.width).toBe(4);
    const range = await app.request(asset.src, {
      headers: { cookie, Range: "bytes=0-9" },
    });
    expect(range.status).toBe(206);
    expect((await range.arrayBuffer()).byteLength).toBe(10);
    expect(range.headers.get("Content-Range")).toStartWith("bytes 0-9/");
    expect(
      (
        await app.request(asset.src, {
          headers: { cookie, Range: "bytes=999999-" },
        })
      ).status,
    ).toBe(416);
  } finally {
    if (old === undefined) delete process.env.FRAME_ASSETS;
    else process.env.FRAME_ASSETS = old;
    rmSync(root, { force: true, recursive: true });
  }
});
test("saved compositions are private to their workspace and validate editable content", async () => {
  const { app } = setup(),
    alice = await signup(app),
    bob = await signup(app);
  const element = {
    id: uid(),
    type: "shape",
    name: "A shape",
    x: 24,
    y: 24,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    locked: false,
    hidden: false,
    fill: "accent",
  };
  const created = await app.request(
    "/api/compositions",
    request("POST", alice, {
      name: "Reusable",
      width: 148,
      height: 148,
      elements: [element],
    }),
  );
  expect(created.status).toBe(201);
  const composition = await created.json();
  expect(
    await (await app.request("/api/compositions", request("GET", bob))).json(),
  ).toEqual([]);
  expect(
    (
      await app.request(
        "/api/compositions/" + composition.id,
        request("DELETE", bob),
      )
    ).status,
  ).toBe(404);
  const own = await (
    await app.request("/api/compositions", request("GET", alice))
  ).json();
  expect(own[0].elements[0]).toEqual(element);
  expect(
    (
      await app.request(
        "/api/compositions",
        request("POST", alice, {
          name: "Invalid",
          width: 100,
          height: 100,
          elements: [{ ...element, type: "chart" }],
        }),
      )
    ).status,
  ).toBe(400);
});
