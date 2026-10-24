import { configuration } from "../config";
import { Store } from "../store";
import { createAIServices } from "../creation";
import { SqsTransport, parseWake } from "../queue/transport";
import { operationalEvent } from "../telemetry";
const config = configuration("worker"),
  store = new Store(),
  ai = createAIServices(store);
let stopping = false;
const transport =
  config.FRAME_QUEUE_DRIVER === "sqs" ? new SqsTransport() : null;
async function heartbeat() {
  await store.db.update(
    "workerHeartbeats",
    { id: ai.queue.workerId },
    {
      $set: {
        kind: "worker",
        updatedAt: new Date().toISOString(),
        expiresAt: Date.now() + 60000,
      },
    },
    { upsert: true },
  );
}
const ticker = setInterval(
  () =>
    void heartbeat().catch(() => operationalEvent("worker_heartbeat_failed")),
  10000,
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, async () => {
    stopping = true;
    await ai.worker.stop();
  });
try {
  while (!stopping) {
    try {
      await heartbeat();
      await ai.queue.recover();
      await ai.workflows.reconcile();
      if (!transport) {
        if (!(await ai.worker.runOnce())) await Bun.sleep(500);
        continue;
      }
      const messages = await transport.receive();
      // MongoDB remains authoritative even after a lost transport wakeup.
      if (!messages.length) await ai.worker.runOnce();
      for (const message of messages) {
        if (stopping) break;
        const receipt = message.ReceiptHandle;
        if (!receipt) continue;
        const wake = parseWake(message.Body);
        // Leave malformed transport messages for the configured bounded DLQ policy.
        if (!wake) {
          operationalEvent("invalid_queue_message");
          continue;
        }
        const job = await store.db.one("jobs", { id: wake.jobId });
        if (
          !job ||
          job.dispatchGeneration !== wake.dispatchGeneration ||
          ["succeeded", "failed", "cancelled"].includes(job.status)
        ) {
          await transport.acknowledge(receipt);
          continue;
        }
        const renewal = setInterval(
          () =>
            void transport.heartbeat(receipt).catch(() =>
              operationalEvent("queue_visibility_renewal_failed", {
                jobId: job.id,
              }),
            ),
          10000,
        );
        try {
          await ai.workflows.reconcile();
          const ran = await ai.worker.runOnce(job.id);
          const current = await store.db.one("jobs", { id: job.id });
          if (
            !current ||
            ["succeeded", "failed", "cancelled"].includes(current.status) ||
            (ran &&
              (current.status !== "running" || current.leaseOwner === null))
          )
            await transport.acknowledge(receipt);
          if (
            !ran &&
            current?.kind === "export" &&
            (await ai.queue.deferRendering(current.id, wake.dispatchGeneration))
          )
            await transport.acknowledge(receipt);
          // Meanwhile this worker can advance other persisted, runnable work.
          if (!ran) await ai.worker.runOnce();
        } finally {
          clearInterval(renewal);
        }
      }
    } catch {
      operationalEvent("worker_iteration_failed", { category: "dependency" });
      if (!stopping) await Bun.sleep(1000);
    }
  }
} finally {
  clearInterval(ticker);
  transport?.close();
  await ai.worker.stop();
  await store.db.close();
}
