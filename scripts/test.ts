import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { Pool } from "pg";
if (process.env.NODE_ENV === "production")
  throw new Error("Tests refuse production configuration.");
const args = process.argv.slice(2),
  browser = args[0] === "--browser",
  preview = args[0] === "--preview",
  liveAI = preview && args.includes("--live-ai");
if (liveAI && !process.env.OPENROUTER_API_KEY)
  throw new Error(
    "Live AI preview requires server-side OpenRouter configuration.",
  );
const logIndex = args.indexOf("--log"),
  logfile = logIndex >= 0 ? args.splice(logIndex, 2)[1] : null;
const runId = randomBytes(5).toString("hex");
const env: Record<string, string | undefined> = { ...process.env };
for (const key of Object.keys(env))
  if (
    /^(GOOGLE_|GITHUB_|RESEND_|AUTH_EMAIL_FROM|AWS_|OPENAI_|OPENROUTER_|TOKENROUTER_|FRAME_S3_|FRAME_ADMIN_|BLOB_|VERCEL|DATABASE_URL|BETTER_AUTH_)/.test(
      key,
    )
  ) {
    if (!(liveAI && key.startsWith("OPENROUTER_"))) delete env[key];
  }
Object.assign(env, {
  NODE_ENV: "test",
  FRAME_TEST_RUN_ID: runId,
  FRAME_QUEUE_DRIVER: "local",
  FRAME_STORAGE: "local",
  FRAME_DEV_LIVE_AI: liveAI ? "true" : "false",
  BETTER_AUTH_SECRET: "test-only-auth-secret-at-least-32-characters",
});
const port = () =>
  new Promise<string>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const value = String((server.address() as { port: number }).port);
      server.close(() => resolve(value));
    });
  });
const command = async (cmd: string[], childEnv = env) => {
  const child = Bun.spawn(cmd, {
    env: childEnv,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, code] = await Promise.all([
    new Response(child.stdout).text(),
    child.exited,
  ]);
  if (code)
    throw new Error(
      "PostgreSQL test harness command failed. Check the container runtime and database availability.",
    );
  return stdout.trim();
};
let container: { runtime: string; name: string } | undefined;
let child: ReturnType<typeof Bun.spawn> | undefined;
try {
  if (!env.FRAME_TEST_DATABASE_URL) {
    const runtime = Bun.which("docker") || Bun.which("podman");
    if (!runtime)
      throw new Error(
        "Set FRAME_TEST_DATABASE_URL to an isolated frame_test database, or install Docker/Podman.",
      );
    const name = `frame-tests-${runId}`,
      password = randomBytes(24).toString("hex"),
      dbPort = await port();
    await command(
      [
        runtime,
        "run",
        "--detach",
        "--name",
        name,
        "-p",
        `127.0.0.1:${dbPort}:5432`,
        "--env",
        "POSTGRES_PASSWORD",
        "--env",
        "POSTGRES_DB",
        "postgres:17-alpine",
      ],
      { ...env, POSTGRES_PASSWORD: password, POSTGRES_DB: "frame_test" },
    );
    container = { runtime, name };
    env.FRAME_TEST_DATABASE_URL = `postgresql://postgres:${password}@127.0.0.1:${dbPort}/frame_test`;
  }
  if (
    !/^\/frame_test[a-z0-9_]*$/.test(
      new URL(env.FRAME_TEST_DATABASE_URL).pathname,
    )
  )
    throw new Error(
      "Tests require a dedicated database whose name begins frame_test.",
    );
  const pool = new Pool({
    connectionString: env.FRAME_TEST_DATABASE_URL,
    connectionTimeoutMillis: 1000,
  });
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        await pool.query("select 1");
        break;
      } catch {
        if (attempt > 30)
          throw new Error("Test PostgreSQL did not become ready.");
        await Bun.sleep(250);
      }
    }
  } finally {
    await pool.end();
  }
  if (browser) {
    env.FRAME_E2E_WEB_PORT = await port();
    env.FRAME_E2E_API_PORT = await port();
  }
  if (preview)
    Object.assign(env, {
      FRAME_WEB_PORT: process.env.FRAME_WEB_PORT || "5174",
      FRAME_API_PORT: process.env.FRAME_API_PORT || "3141",
      PORT: process.env.FRAME_API_PORT || "3141",
      APP_ORIGIN: `http://127.0.0.1:${process.env.FRAME_WEB_PORT || "5174"}`,
    });
  child = Bun.spawn(
    [
      "bun",
      "--no-env-file",
      ...(preview
        ? ["scripts/preview.ts"]
        : browser
          ? ["run", "playwright", "test", ...args.slice(1)]
          : [
              "test",
              "--timeout",
              "60000",
              ...(args.length ? args : ["tests"]),
            ]),
    ],
    {
      env,
      stdout: logfile ? "pipe" : "inherit",
      stderr: logfile ? "pipe" : "inherit",
    },
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const)
    process.once(signal, () => child?.kill(signal));
  const output: Promise<void>[] = [];
  if (logfile) {
    const writer = Bun.file(logfile).writer();
    for (const [stream, target] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ] as const)
      output.push(
        (async () => {
          const reader = (stream as ReadableStream<Uint8Array>).getReader();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            target.write(value);
            writer.write(value);
          }
        })(),
      );
    await Promise.all(output);
    await writer.end();
  }
  process.exitCode = await child.exited;
} finally {
  if (container)
    await command([
      container.runtime,
      "rm",
      "--force",
      "--volumes",
      container.name,
    ]);
  else if (env.FRAME_TEST_DATABASE_URL) {
    const pool = new Pool({ connectionString: env.FRAME_TEST_DATABASE_URL });
    try {
      const result = await pool.query(
        "select schema_name from information_schema.schemata where starts_with(schema_name, $1)",
        [`frame_test_${runId}_`],
      );
      for (const row of result.rows)
        if (/^frame_test_[a-f0-9]+_[a-f0-9]+$/.test(row.schema_name))
          await pool.query(`DROP SCHEMA "${row.schema_name}" CASCADE`);
    } finally {
      await pool.end();
    }
  }
}
export {};
