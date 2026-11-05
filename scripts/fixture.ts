if (process.env.NODE_ENV === "production")
  throw new Error("Fixtures refuse production.");
const child = Bun.spawn(
  [
    "bun",
    "--no-env-file",
    "scripts/test.ts",
    "--preview",
    ...process.argv.slice(2),
  ],
  { env: process.env, stdout: "inherit", stderr: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.once(signal, () => child.kill(signal));
process.exitCode = await child.exited;
export {};
