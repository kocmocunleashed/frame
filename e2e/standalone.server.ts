// Real production authentication with a dedicated PostgreSQL test namespace.
import { Store } from "../tests/postgres";
import { createApp } from "../server/app";
if (process.env.NODE_ENV !== "test")
  throw new Error("Standalone acceptance server is test-only.");
const store = new Store();
await store.testReady;
const app = createApp(store);
// Test-only mail capture. This module is excluded from every runtime entry point.
if (process.env.FRAME_TEST_AUTH_EMAIL === "true") {
  process.env.RESEND_API_KEY = "test-mail-key";
  process.env.AUTH_EMAIL_FROM = "Frame <auth@example.test>";
  process.env.GOOGLE_CLIENT_ID = "test-google-id";
  process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
  process.env.GITHUB_CLIENT_ID = "test-github-id";
  process.env.GITHUB_CLIENT_SECRET = "test-github-secret";
  const captured: { to: string[]; text: string; subject: string }[] = [],
    originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "https://api.resend.com/emails") {
      captured.push(JSON.parse(String(init?.body)));
      return Response.json({ id: "test-message" });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  app.get("/__fixture/auth-mail", (c) =>
    c.json(
      captured.filter((message) =>
        message.to.includes(c.req.query("email") || ""),
      ),
    ),
  );
}
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(process.env.FRAME_API_PORT || 3141),
  fetch: app.fetch,
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, async () => {
    await server.stop();
    await store.db.close();
    process.exit(0);
  });
