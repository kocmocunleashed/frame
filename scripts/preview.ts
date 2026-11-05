// Explicit development fixture. Production never imports this entry.
if (process.env.NODE_ENV !== "test" || !process.env.FRAME_TEST_DATABASE_URL)
  throw new Error("Use bun run dev:fixture.");
const webEnv = { ...process.env };
for (const key of Object.keys(webEnv))
  if (key.startsWith("OPENROUTER_")) delete webEnv[key];
const children = [
  Bun.spawn(["bun", "--no-env-file", "e2e/server.ts"], {
    env: process.env,
    stdout: "inherit",
    stderr: "inherit",
  }),
  Bun.spawn(["bun", "--no-env-file", "run", "dev:web"], {
    env: webEnv,
    stdout: "inherit",
    stderr: "inherit",
  }),
];
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => children.forEach((p) => p.kill(signal)));
try {
  process.exitCode = await Promise.race(children.map((p) => p.exited));
} finally {
  children.forEach((p) => p.kill());
}
export {};
