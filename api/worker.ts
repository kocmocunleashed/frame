import { handleCallback } from "@vercel/queue";
import { runtime, dispatchPending } from "../server/vercel-runtime";
import { createAIServices } from "../server/creation";
import { wakeSchema } from "../server/queue/transport";
Bun.serve({
  fetch: handleCallback(
    async (message: unknown) => {
      const wake = wakeSchema.parse(message),
        { store } = await runtime();
      const job = await store.db.one("jobs", { id: wake.jobId });
      if (
        !job ||
        job.dispatchGeneration !== wake.dispatchGeneration ||
        ["succeeded", "failed", "cancelled"].includes(job.status)
      )
        return;
      const ai = createAIServices(store);
      const ran = await ai.worker.runOnce(job.id);
      if (!ran) {
        const deferred =
          job.kind === "export" &&
          (await ai.queue.deferRendering(job.id, wake.dispatchGeneration));
        const current = await store.db.one("jobs", { id: job.id });
        if (
          !deferred &&
          current &&
          !["succeeded", "failed", "cancelled"].includes(current.status)
        )
          throw new Error("Work is already leased; retry delivery.");
      }
      await dispatchPending(store);
    },
    { visibilityTimeoutSeconds: 300 },
  ),
});
