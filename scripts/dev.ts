import { configuration } from "../server/config";
const config = configuration();
if (config.NODE_ENV === "production")
  throw new Error("Development launcher refuses production.");
const children = [
  Bun.spawn(["bun", "--watch", "server/index.ts"], {
    stdout: "inherit",
    stderr: "inherit",
  }),
  Bun.spawn(["bun", "run", "dev:web"], {
    stdout: "inherit",
    stderr: "inherit",
  }),
  Bun.spawn(["bun", "server/workers/worker.ts"], {
    stdout: "inherit",
    stderr: "inherit",
  }),
];
if (config.FRAME_QUEUE_DRIVER === "sqs")
  children.push(
    Bun.spawn(["bun", "server/workers/dispatcher.ts"], {
      stdout: "inherit",
      stderr: "inherit",
    }),
  );
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => children.forEach((p) => p.kill(signal)));
try {
  process.exitCode = await Promise.race(children.map((p) => p.exited));
} finally {
  children.forEach((p) => p.kill());
}
