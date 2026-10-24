import { test, expect, spyOn } from "bun:test";
import { Store } from "./mongo";
import { createApp } from "./support/legacy-app";
import { uid } from "../shared/schema";
test("readiness reports actual private storage and errors have correlatable IDs without private error messages", async () => {
  const store = new Store(":memory:"),
    app = createApp(store),
    logged = spyOn(console, "error").mockImplementation(() => {});
  try {
    expect((await app.request("/api/health")).status).toBe(200);
    await store.testReady;
    const ready = await app.request("/api/ready");
    expect(ready.status).toBe(200);
    expect(await ready.json()).toEqual({
      ok: true,
      components: { database: "ready",indexes:"ready", storage: "ready",queue:"ready" },
    });
    const signup = await app.request("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Operator test",
          email: `${uid()}@example.test`,
          password: "frame-operation-test-password",
        }),
      }),
      cookie = signup.headers.get("set-cookie")!.split(";")[0];
    const missing = await app.request("/api/unknown", { headers: { cookie } });
    expect(missing.status).toBe(404);
    expect(missing.headers.get("content-type")).toContain("application/json");
    store.list = () => {
      throw new Error("PRIVATE_ERROR_CONTENT_MUST_NOT_BE_LOGGED");
    };
    const failed = await app.request("/api/decks", {
      headers: { cookie },
    });
    expect(failed.status).toBe(500);
    expect(await failed.text()).not.toContain("PRIVATE_ERROR_CONTENT");
    const id = failed.headers.get("X-Request-ID");
    expect(id).toBeTruthy();
    const error = await store.db.one("errorEvents",{id:id!});
    expect(error).toMatchObject({
      id,
      errorType: "Error",
      method: "GET",
      route: "/api/decks",
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain(
      "PRIVATE_ERROR_CONTENT",
    );
    const previous = process.env.FRAME_STORAGE;
    process.env.FRAME_STORAGE = "invalid";
    try {
      const otherApp=createApp(store);
      const {clearReadinessCache}=await import("../server/readiness");clearReadinessCache(store);
      expect((await otherApp.request("/api/ready")).status).toBe(503);
    } finally {
      process.env.FRAME_STORAGE = previous;
    }
  } finally {
    logged.mockRestore();
    await store.db.close();
  }
});
