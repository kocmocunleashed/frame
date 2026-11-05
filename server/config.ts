import { z } from "zod";
import { storageConfig } from "./storage";

export function configuration(
  role: "api" | "worker" | "dispatcher" | "maintenance" = "api",
) {
  const env = z
    .object({
      NODE_ENV: z
        .enum(["development", "test", "production"])
        .default("development"),
      PORT: z.coerce.number().int().min(1).max(65535).default(3158),
      APP_ORIGIN: z.url(),
      DATABASE_URL: z.string().regex(/^postgres(?:ql)?:\/\//),
      FRAME_QUEUE_DRIVER: z.enum(["local", "sqs", "vercel"]),
      FRAME_JOB_TIMEOUT_MS: z.coerce
        .number()
        .int()
        .min(1000)
        .max(600000)
        .default(270000),
    })
    .parse(process.env);
  storageConfig();
  if (
    role === "api" &&
    (!process.env.BETTER_AUTH_SECRET ||
      process.env.BETTER_AUTH_SECRET.length < 32)
  )
    throw new Error("Set BETTER_AUTH_SECRET to at least 32 random characters.");
  if (env.NODE_ENV === "production") {
    if (!env.APP_ORIGIN.startsWith("https://"))
      throw new Error("Production APP_ORIGIN requires HTTPS.");
    if (env.FRAME_QUEUE_DRIVER === "vercel") {
      if (!process.env.VERCEL || !process.env.CRON_SECRET)
        throw new Error(
          "Vercel queues require the Vercel runtime and CRON_SECRET.",
        );
    } else if (
      env.FRAME_QUEUE_DRIVER !== "sqs" ||
      !process.env.FRAME_SQS_QUEUE_URL ||
      !process.env.AWS_REGION
    )
      throw new Error("Production requires a configured durable queue.");
    if (process.env.FRAME_FIXTURE_MODE || process.env.FRAME_TEST_DATABASE_URL)
      throw new Error("Fixture mode cannot run in production.");
    if (
      !/[?&]sslmode=(require|verify-full|verify-ca)(?:&|$)/.test(
        env.DATABASE_URL,
      )
    )
      throw new Error("Production PostgreSQL requires TLS.");
  }
  return env;
}
