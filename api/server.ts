import { waitUntil } from "@vercel/functions";
import { runtime, dispatchPending } from "../server/vercel-runtime";
Bun.serve({
  async fetch(request) {
    const { app, store } = await runtime();
    const response = await app.fetch(request);
    const path = new URL(request.url).pathname;
    if (
      (request.method === "POST" || path.startsWith("/api/jobs")) &&
      !/^\/api\/(auth|audience|live)/.test(path)
    )
      waitUntil(
        dispatchPending(store).catch(() =>
          console.error(
            JSON.stringify({ event: "queue_dispatch_failed", level: "error" }),
          ),
        ),
      );
    return response;
  },
});
