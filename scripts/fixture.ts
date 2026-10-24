if (process.env.NODE_ENV === "production")
  throw new Error("Fixtures refuse production.");
const child = Bun.spawn(
  ["node", "scripts/replica-fixture.mjs", ...process.argv.slice(2)],
  {
    stdout: "inherit",
    stderr: "inherit",
  },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => child.kill(signal));
process.exitCode = await child.exited;
export {};
