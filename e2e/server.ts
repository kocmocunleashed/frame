// Explicit loopback-only fixture server. Never used by the production entry point.
import { Store } from "../tests/mongo";
import { createApp } from "../tests/support/legacy-app";
import { createAIServices } from "../server/creation";
import { FixtureAIProvider } from "../tests/fixtures/ai-provider";
import { configuredAIProvider } from "../server/ai-provider";
if (process.env.NODE_ENV !== "test" || !process.env.FRAME_TEST_MONGODB_URI)
  throw new Error("Use the isolated browser-test launcher.");
const store = new Store(),
  services = createAIServices(
    store,
    process.env.FRAME_DEV_LIVE_AI === "true"
      ? configuredAIProvider()
      : new FixtureAIProvider(),
  );
await store.testReady;
const app = createApp(store, services);
services.worker.start();
app.get("/__fixture/diagnostics", async (c) =>
  c.json({
    worker: services.worker.status(),
    jobs: (
      await store.db.find(
        "jobs",
        { status: { $in: ["running", "queued"] } },
        { limit: 50 },
      )
    ).map((j) => ({
      id: j.id,
      parentId: j.parentId,
      kind: j.kind,
      status: j.status,
      attempts: j.attempts,
      progress: JSON.parse(j.progress),
      availableAt: j.availableAt,
      leaseUntil: j.leaseUntil,
      workflowVersion: j.workflowVersion,
    })),
  }),
);
const server = Bun.serve({
  port: Number(process.env.PORT || 3141),
  hostname: "127.0.0.1",
  fetch: app.fetch,
  maxRequestBodySize: 52 * 1024 * 1024,
});
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, async () => {
    await services.worker.stop();
    await server.stop();
    await store.db.close();
    process.exit(0);
  });
