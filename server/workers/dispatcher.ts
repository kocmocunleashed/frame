import { configuration } from "../config";
import { Store } from "../store";
import { dispatchReady } from "../dispatch";
import { SqsTransport } from "../queue/transport";
const config = configuration("dispatcher");
if (config.FRAME_QUEUE_DRIVER !== "sqs")
  throw new Error("The local queue does not need a dispatcher.");
const store = new Store(),
  transport = new SqsTransport();
let stop = false;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.once(signal, () => {
    stop = true;
  });
try {
  while (!stop) {
    try {
      await dispatchReady(store, (message) => transport.publish(message));
    } catch {
      console.error(
        JSON.stringify({
          event: "outbox_dispatch_failed",
          category: "transport",
        }),
      );
    }
    await Bun.sleep(500);
  }
} finally {
  transport.close();
  await store.db.close();
}
