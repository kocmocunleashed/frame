import { configuration } from "../config";
import { Store } from "../store";
import { maintain } from "../maintenance";
import { metric } from "../telemetry";
configuration("maintenance");
const store = new Store();
try {
  console.log(
    JSON.stringify(
      await maintain(store, { dryRun: process.argv.includes("--dry-run") }),
    ),
  );
  metric(
    "ActiveWorkers",
    await store.db.count("workerHeartbeats", {
      kind: "worker",
      expiresAt: { $gt: Date.now() },
    }),
  );
  const pending = await store.db.find(
    "outbox",
    { sentAt: null },
    { sort: { createdAt: 1 }, limit: 1 },
  );
  metric(
    "OutboxAge",
    pending.length
      ? Math.max(0, (Date.now() - Date.parse(pending[0].createdAt)) / 1000)
      : 0,
    "Seconds",
  );
} finally {
  await store.db.close();
}
