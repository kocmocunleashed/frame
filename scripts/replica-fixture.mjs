import { MongoMemoryReplSet } from "mongodb-memory-server";
import { spawn } from "node:child_process";
if (process.env.NODE_ENV === "production")
  throw new Error("Fixtures refuse production.");
const liveAI = process.argv.includes("--live-ai");
if (liveAI && (!process.env.OPENROUTER_API_KEY || process.env.FRAME_AI_PROVIDER !== "openrouter"))
  throw new Error("Live AI preview requires server-side OpenRouter configuration in .env.");
const mongo = await MongoMemoryReplSet.create({
  binary: { version: "7.0.45", systemBinary: process.env.FRAME_MONGOD },
  replSet: { count: 1, storageEngine: "wiredTiger" },
});
const env = {
  ...process.env,
  NODE_ENV: "test",
  FRAME_TEST_MONGODB_URI: mongo.getUri("frame_test_fixture"),
  FRAME_STORAGE: "local",
  FRAME_QUEUE_DRIVER: "local",
  APP_ORIGIN: `http://127.0.0.1:${process.env.FRAME_WEB_PORT || "5174"}`,
  FRAME_WEB_PORT: process.env.FRAME_WEB_PORT || "5174",
  FRAME_API_PORT: process.env.FRAME_API_PORT || "3141",
  PORT: process.env.FRAME_API_PORT || "3141",
  FRAME_DEV_LIVE_AI: liveAI ? "true" : "false",
};
for (const key of Object.keys(env))
  if (
    /^(AWS_|OPENAI_|OPENROUTER_|CLERK_|TOKENROUTER_|FRAME_ERXES_|FRAME_S3_|FRAME_ADMIN_|BLOB_|VERCEL)/.test(
      key,
    ) && !(liveAI && key.startsWith("OPENROUTER_"))
  )
    delete env[key];
const webEnv = { ...env };
for (const key of Object.keys(webEnv)) if (key.startsWith("OPENROUTER_")) delete webEnv[key];
const children = [
  spawn("bun", ["--no-env-file", "e2e/server.ts"], { env, stdio: "inherit" }),
  spawn("bun", ["--no-env-file", "run", "dev:web"], { env: webEnv, stdio: "inherit" }),
];
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => children.forEach((p) => p.kill(signal)));
try {
  process.exitCode = await Promise.race(
    children.map(
      (p) =>
        new Promise((resolve) => p.on("exit", (code) => resolve(code ?? 1))),
    ),
  );
} finally {
  children.forEach((p) => p.kill());
  await mongo.stop();
}
