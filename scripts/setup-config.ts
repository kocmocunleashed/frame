import { randomBytes } from "node:crypto";
import { lstat, open, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import {
  GEMMA4_MODEL,
  MUSE_CONTRIBUTOR_MODEL,
} from "../shared/openrouter-models";

export const setupOrigin = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (
      url.origin === value &&
      !url.username &&
      !url.password &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}, "Use an exact local origin, such as http://localhost:3001, without a trailing slash.");

export const setupOptions = z
  .object({
    mode: z.enum(["preview", "standalone", "erxes"]),
    openrouterModel: z.enum([MUSE_CONTRIBUTOR_MODEL, GEMMA4_MODEL]).optional(),
    openrouterKey: z
      .string()
      .regex(/^sk-or-v1-[a-zA-Z0-9_-]{16,500}$/)
      .or(z.literal(""))
      .default(""),
    clerkPublishableKey: z
      .string()
      .regex(/^pk_test_[a-zA-Z0-9_-]+$/)
      .optional(),
    clerkSecretKey: z
      .string()
      .regex(/^sk_test_[a-zA-Z0-9_-]+$/)
      .optional(),
    erxesOrigin: setupOrigin.optional(),
    erxesTenant: z
      .string()
      .regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/)
      .optional(),
    database: z.enum(["docker", "existing"]).default("docker"),
  })
  .superRefine((value, ctx) => {
    if (
      value.mode === "standalone" &&
      (!value.clerkPublishableKey || !value.clerkSecretKey)
    )
      ctx.addIssue({
        code: "custom",
        message: "Standalone setup requires both Clerk development keys.",
      });
    if (value.mode === "erxes" && (!value.erxesOrigin || !value.erxesTenant))
      ctx.addIssue({
        code: "custom",
        message:
          "erxes setup requires its local origin and authenticated tenant.",
      });
  });
export type SetupOptions = z.infer<typeof setupOptions>;

export function makeSetup(template: string, input: SetupOptions) {
  const options = setupOptions.parse(input);
  const database = options.mode === "erxes" ? "frame_erxes_dev" : "frame_dev";
  const hostname =
    options.mode === "erxes"
      ? new URL(options.erxesOrigin!).hostname
      : options.mode === "preview"
        ? "127.0.0.1"
        : "localhost";
  const origin = `http://${hostname}:5174`;
  const secret =
    options.mode === "erxes" ? randomBytes(32).toString("hex") : "";
  const values: Record<string, string> = {
    NODE_ENV: "development",
    PORT: "3158",
    APP_ORIGIN: origin,
    MONGODB_URI: `mongodb://127.0.0.1:27017/${database}?replicaSet=rs0`,
    MONGODB_DATABASE: database,
    FRAME_STORAGE: "local",
    FRAME_QUEUE_DRIVER: "local",
    VITE_CLERK_PUBLISHABLE_KEY:
      options.mode === "standalone" ? options.clerkPublishableKey! : "",
    CLERK_SECRET_KEY:
      options.mode === "standalone" ? options.clerkSecretKey! : "",
    CLERK_AUTHORIZED_PARTIES: origin,
    FRAME_AI_PROVIDER: "openrouter",
    OPENROUTER_API_KEY: options.openrouterKey,
    OPENROUTER_MODEL: options.openrouterModel ?? MUSE_CONTRIBUTOR_MODEL,
    OPENROUTER_MUSE_CONTRIBUTOR_ENABLED: String(
      !options.openrouterModel ||
        options.openrouterModel === MUSE_CONTRIBUTOR_MODEL,
    ),
    FRAME_ERXES_ORIGIN: options.mode === "erxes" ? options.erxesOrigin! : "",
    FRAME_ERXES_TENANT: options.mode === "erxes" ? options.erxesTenant! : "",
    FRAME_ERXES_SECRET: secret,
    FRAME_BACKUP_KEY: randomBytes(32).toString("hex"),
  };
  const used = new Set<string>();
  const env =
    template
      .split("\n")
      .map((line) => {
        const key = /^([A-Z_][A-Z0-9_]*)=/.exec(line)?.[1];
        if (!key || !(key in values)) return line;
        used.add(key);
        return `${key}=${JSON.stringify(values[key])}`;
      })
      .join("\n") +
    "\n" +
    Object.entries(values)
      .filter(([key]) => !used.has(key))
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") +
    "\nHOST=127.0.0.1\n";
  const adapter =
    options.mode === "erxes"
      ? [
          "# Server-only Frame adapter configuration. Load alongside the host's existing environment.",
          // All interpolated values reject apostrophes. Bun preserves escaped double
          // quotes in env values, so quote the JSON once with single quotes instead.
          `FRAME_ERXES_TENANTS='${JSON.stringify({
            [options.erxesTenant!]: {
              frameOrigin: origin,
              erxesOrigin: options.erxesOrigin!,
              secret,
            },
          })}'`,
          "FRAME_ERXES_API_PORT=3319",
          'UI_ENTRY_URL="http://localhost:3019/remoteEntry.js"',
          "",
        ].join("\n")
      : undefined;
  const commands = ["bunx playwright install chromium"];
  if (options.openrouterKey) commands.push("bun run check:openrouter");
  if (options.mode === "preview")
    commands.push(
      `bun run dev:fixture${options.openrouterKey ? " --live-ai" : ""}`,
    );
  else {
    if (options.database === "docker")
      commands.push("docker compose up -d --wait");
    commands.push("bun run db:migrate", "bun run dev");
  }
  return { env, adapter, commands, origin };
}

/** Exclusive creation protects existing settings, including concurrent setup runs. */
export async function writeSetup(
  root: string,
  setup: ReturnType<typeof makeSetup>,
) {
  const files: [string, string][] = [[join(root, ".env"), setup.env]];
  if (setup.adapter)
    files.push([join(root, "frame-erxes", ".env.adapter"), setup.adapter]);
  for (const [path] of files) {
    const exists = await lstat(path).then(
      () => true,
      (error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return false;
        throw error;
      },
    );
    if (exists)
      throw new Error(
        "Setup files already exist. Nothing was overwritten; see docs/setup.md to update them.",
      );
  }
  const created: string[] = [];
  try {
    for (const [path, content] of files) {
      const file = await open(path, "wx", 0o600);
      created.push(path);
      try {
        await file.writeFile(content);
      } finally {
        await file.close();
      }
    }
  } catch (error) {
    await Promise.all(created.map((path) => unlink(path)));
    throw error;
  }
}
