// Bun owns package management and runs application tests. The replica-set fixture
// launcher uses Node because mongodb-memory-server's BSON requires Node's v8 API.
if (process.env.NODE_ENV === "production")
  throw new Error("Tests refuse production configuration.");
const child = Bun.spawn(
  ["node", "scripts/replica-tests.mjs", ...process.argv.slice(2)],
  { env: process.env, stdout: "inherit", stderr: "inherit" },
);
for (const sig of ["SIGINT", "SIGTERM"] as const)
  process.once(sig, () => child.kill(sig));
process.exitCode = await child.exited;

export {};
