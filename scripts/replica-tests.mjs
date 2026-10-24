import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
if (process.env.NODE_ENV === "production")
  throw new Error("Tests refuse production configuration.");
const args = process.argv.slice(2);
const logIndex = args.indexOf("--log");
const logfile = logIndex >= 0 ? args.splice(logIndex, 2)[1] : null;
const binaryIndex = args.indexOf("--mongod");
const systemBinary =
  binaryIndex >= 0 ? args.splice(binaryIndex, 2)[1] : process.env.FRAME_MONGOD;
const mongo = await MongoMemoryReplSet.create({
  binary: {
    version: "7.0.45",
    systemBinary,
    downloadDir:
      process.env.FRAME_MONGO_BINARY_CACHE || "/tmp/frame-mongodb-binaries",
  },
  replSet: { count: 1, storageEngine: "wiredTiger", name: "frame_tests" },
  instanceOpts: [{ args: ["--wiredTigerCacheSizeGB", "0.25"] }],
});
const env = {
  ...process.env,
  NODE_ENV: "test",
  FRAME_TEST_MONGODB_URI: mongo.getUri("frame_test_run"),
  MONGODB_URI: mongo.getUri("frame_test_run"),
  MONGODB_DATABASE: "frame_test_run",
  FRAME_QUEUE_DRIVER: "local",
  FRAME_STORAGE: "local",
  FRAME_DEV_LIVE_AI: "false",
};
for (const key of Object.keys(env))
  if (
    /^(AWS_|OPENAI_|OPENROUTER_|TOKENROUTER_|CLERK_|FRAME_ERXES_|FRAME_S3_|FRAME_ADMIN_|BLOB_|VERCEL|DATABASE_URL)/.test(
      key,
    )
  )
    delete env[key];
let child;
try {
  const browser = args[0] === "--browser";
  const erxes = args[0] === "--erxes";
  if (browser) {
    const port = () =>
      new Promise((resolve, reject) => {
        const server = createServer();
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
          const value = server.address().port;
          server.close(() => resolve(String(value)));
        });
      });
    env.FRAME_E2E_WEB_PORT = await port();
    env.FRAME_E2E_API_PORT = await port();
  }
  child = spawn(
    "bun",
    erxes
      ? [
          "--no-env-file",
          "frame-erxes/tests/browser/smoke.ts",
          ...args.slice(1),
        ]
      : browser
        ? ["--no-env-file", "run", "playwright", "test", ...args.slice(1)]
        : [
            "--no-env-file",
            "test",
            "--timeout",
            "60000",
            ...(args.length ? args : ["tests"]),
          ],
    {
      env,
      detached: process.platform !== "win32",
      stdio: logfile ? ["inherit", "pipe", "pipe"] : "inherit",
    },
  );
  if (logfile) {
    const file = createWriteStream(logfile);
    child.stdout.on("data", (data) => {
      process.stdout.write(data);
      file.write(data);
    });
    child.stderr.on("data", (data) => {
      process.stderr.write(data);
      file.write(data);
    });
    child.once("close", () => file.end());
  }
  const stop = (sig) => {
    try {
      if (process.platform !== "win32") process.kill(-child.pid, sig);
      else child.kill(sig);
    } catch {}
  };
  for (const sig of ["SIGINT", "SIGTERM"]) process.once(sig, () => stop(sig));
  process.exitCode = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code ?? 1));
    child.on("error", () => resolve(1));
  });
} finally {
  await mongo.stop();
}
