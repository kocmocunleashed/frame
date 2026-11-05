import { test, expect } from "bun:test";
import { Store } from "./postgres";
import { createApp } from "../server/app";

test("Better Auth session lists retain their native response contract", async () => {
  const store = new Store();
  try {
    await store.testReady;
    const app = createApp(store),
      origin = "http://127.0.0.1:5174";
    const registration = await app.request(origin + "/api/auth/sign-up/email", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({
        name: "Session owner",
        email: "sessions@example.test",
        password: "a-strong-test-password",
      }),
    });
    expect(registration.status).toBe(200);
    const cookie = registration.headers.get("set-cookie")!.split(";")[0];
    const response = await app.request(origin + "/api/auth/list-sessions", {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    const sessions = await response.json();
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBeString();
  } finally {
    await store.db.close();
  }
});
