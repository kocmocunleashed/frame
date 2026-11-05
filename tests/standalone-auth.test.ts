import { test, expect, afterEach } from "bun:test";
import { Store } from "./postgres";
import { createApp } from "../server/app";
const stores: Store[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.db.close();
});
const origin = "http://127.0.0.1:5174";
function harness() {
  const store = new Store();
  stores.push(store);
  const app = createApp(store);
  const request = async (
    path: string,
    method = "GET",
    body?: unknown,
    cookie?: string,
    workspaceId?: string,
  ) => {
    await store.testReady;
    return app.request(origin + "/api" + path, {
      method,
      headers: {
        origin,
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
        ...(workspaceId ? { "X-Frame-Workspace": workspaceId } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  };
  const signup = async (email: string) => {
    const result = await request("/auth/sign-up/email", "POST", {
      email,
      name: email.split("@")[0],
      password: "a-strong-test-password",
    });
    expect(result.status).toBe(200);
    const cookie = result.headers.get("set-cookie")!.split(";")[0];
    const me = await request("/me", "GET", undefined, cookie);
    expect(me.status).toBe(200);
    return { cookie, user: (await me.json()).user };
  };
  return { store, request, signup };
}
test("standalone registration, real password login, persistent sessions, profile, and logout", async () => {
  const { store, request, signup } = harness();
  const { user, cookie } = await signup("creator@example.test");
  expect(
    await store.db.count("accounts", {
      userId: user.id,
      providerId: "credential",
    }),
  ).toBe(1);
  expect(
    await store.db.count("members", {
      userId: user.id,
      workspaceId: user.workspaceId,
      role: "owner",
    }),
  ).toBe(1);
  expect((await request("/me")).status).toBe(401);
  const login = await request("/auth/sign-in/email", "POST", {
    email: user.email,
    password: "a-strong-test-password",
  });
  expect(login.status).toBe(200);
  const signedIn = login.headers.get("set-cookie")!.split(";")[0];
  expect(
    (await (await request("/me", "GET", undefined, signedIn)).json()).user.id,
  ).toBe(user.id);
  expect(
    (await request("/me", "PATCH", { name: "Saved profile" }, cookie)).status,
  ).toBe(200);
  expect(
    (await (await request("/me", "GET", undefined, signedIn)).json()).user.name,
  ).toBe("Saved profile");
  expect((await request("/auth/sign-out", "POST", {}, signedIn)).status).toBe(
    200,
  );
  expect((await request("/me", "GET", undefined, signedIn)).status).toBe(401);
  expect(
    (
      await request("/auth/sign-in/email", "POST", {
        email: user.email,
        password: "incorrect-password",
      })
    ).status,
  ).toBe(401);
});
test("workspace owners manage members, selected workspaces enforce permissions, and revocation applies immediately", async () => {
  const { request, signup } = harness();
  const alice = await signup("alice@example.test"),
    bob = await signup("bob@example.test"),
    eve = await signup("eve@example.test");
  const workspace = await (
    await request(
      "/workspaces",
      "POST",
      { name: "Team workspace" },
      alice.cookie,
    )
  ).json();
  expect(workspace.id).toBeString();
  expect(
    (
      await request(
        `/workspaces/${workspace.id}/members`,
        "PUT",
        { email: bob.user.email, role: "viewer" },
        eve.cookie,
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await request(
        `/workspaces/${workspace.id}/members`,
        "PUT",
        { email: bob.user.email, role: "viewer" },
        alice.cookie,
      )
    ).status,
  ).toBe(200);
  const deck = await (
    await request(
      "/decks",
      "POST",
      { title: "Team story" },
      alice.cookie,
      workspace.id,
    )
  ).json();
  expect(deck.workspaceId).toBe(workspace.id);
  expect(
    (
      await request(
        `/decks/${deck.id}/review`,
        "GET",
        undefined,
        bob.cookie,
        workspace.id,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await request(
        `/decks/${deck.id}`,
        "PATCH",
        {
          baseRevision: 0,
          operations: [{ type: "document.update", patch: { title: "Denied" } }],
        },
        bob.cookie,
        workspace.id,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        "/decks",
        "POST",
        { title: "Denied" },
        bob.cookie,
        workspace.id,
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        `/workspaces/${workspace.id}/members`,
        "PUT",
        { email: bob.user.email, role: "editor" },
        alice.cookie,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await request(
        `/decks/${deck.id}`,
        "PATCH",
        {
          baseRevision: 0,
          operations: [{ type: "document.update", patch: { title: "Edited" } }],
        },
        bob.cookie,
        workspace.id,
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await request(
        `/workspaces/${workspace.id}/members/${bob.user.id}`,
        "DELETE",
        undefined,
        alice.cookie,
      )
    ).status,
  ).toBe(200);
  expect(
    (await request("/me", "GET", undefined, bob.cookie, workspace.id)).status,
  ).toBe(403);
  expect(
    (await request(`/decks/${deck.id}`, "GET", undefined, bob.cookie)).status,
  ).toBe(404);
  expect(
    (
      await request(
        `/workspaces/${workspace.id}/members/${alice.user.id}`,
        "DELETE",
        undefined,
        alice.cookie,
      )
    ).status,
  ).toBe(400);
});
test("forged cookies and cross-origin mutations cannot grant workspace access", async () => {
  const { store, request, signup } = harness();
  const { user, cookie } = await signup("private@example.test");
  expect(
    (await request("/me", "GET", undefined, "frame.session_token=forged"))
      .status,
  ).toBe(401);
  const app = createApp(store);
  expect(
    (
      await app.request(origin + "/api/workspaces", {
        method: "POST",
        headers: {
          cookie,
          origin: "https://untrusted.example",
          "content-type": "application/json",
        },
        body: JSON.stringify({ name: "Denied" }),
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        `/workspaces/${user.workspaceId}/members`,
        "PUT",
        { email: user.email, role: "viewer" },
        cookie,
      )
    ).status,
  ).toBe(400);
});
