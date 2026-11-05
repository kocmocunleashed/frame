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
}, "Use an exact HTTP loopback origin without a trailing slash.");
export const databaseUrl = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      !/[\r\n]/.test(value) &&
      url.pathname.length > 1
    );
  } catch {
    return false;
  }
}, "Use a PostgreSQL connection URL.");
export const setupOptions = z
  .object({
    mode: z.enum(["preview", "standalone"]),
    database: z.enum(["docker", "existing"]).default("docker"),
    databaseUrl: databaseUrl.optional(),
    origin: setupOrigin.default("http://127.0.0.1:5174"),
    openrouterModel: z.enum([MUSE_CONTRIBUTOR_MODEL, GEMMA4_MODEL]).optional(),
    openrouterKey: z
      .string()
      .regex(/^sk-or-v1-[a-zA-Z0-9_-]{16,500}$/)
      .or(z.literal(""))
      .default(""),
  })
  .superRefine((value, ctx) => {
    if (
      value.mode === "standalone" &&
      value.database === "existing" &&
      !value.databaseUrl
    )
      ctx.addIssue({
        code: "custom",
        message: "Existing database setup requires a PostgreSQL URL.",
      });
  });
export type SetupOptions = z.input<typeof setupOptions>;
export function makeSetup(template: string, input: SetupOptions) {
  const options = setupOptions.parse(input),
    origin = options.origin;
  const localPassword = randomBytes(24).toString("hex");
  const values: Record<string, string> = {
    NODE_ENV: "development",
    PORT: "3158",
    APP_ORIGIN: origin,
    DATABASE_URL:
      options.databaseUrl ||
      `postgresql://frame:${localPassword}@127.0.0.1:5432/frame_dev`,
    ...(options.database === "docker"
      ? { FRAME_POSTGRES_PASSWORD: localPassword }
      : {}),
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    FRAME_STORAGE: "local",
    FRAME_QUEUE_DRIVER: "local",
    FRAME_AI_PROVIDER: "openrouter",
    OPENROUTER_API_KEY: options.openrouterKey,
    OPENROUTER_MODEL: options.openrouterModel ?? MUSE_CONTRIBUTOR_MODEL,
    OPENROUTER_MUSE_CONTRIBUTOR_ENABLED: String(
      !options.openrouterModel ||
        options.openrouterModel === MUSE_CONTRIBUTOR_MODEL,
    ),
    FRAME_BACKUP_KEY: randomBytes(32).toString("hex"),
  };
  const used = new Set<string>(),
    line = (key: string, value: string) =>
      `${key}=${JSON.stringify(value).replaceAll("$", "\\$")}`;
  const env =
    template
      .split("\n")
      .map((original) => {
        const key = /^([A-Z_][A-Z0-9_]*)=/.exec(original)?.[1];
        if (!key || !(key in values)) return original;
        used.add(key);
        return line(key, values[key]);
      })
      .join("\n") +
    "\n" +
    Object.entries(values)
      .filter(([key]) => !used.has(key))
      .map(([key, value]) => line(key, value))
      .join("\n") +
    "\nHOST=127.0.0.1\n";
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
  return { env, commands, origin };
}
/** Exclusive creation protects existing settings, including concurrent setup runs. */
export async function writeSetup(
  root: string,
  setup: ReturnType<typeof makeSetup>,
) {
  const path = join(root, ".env");
  if (
    await lstat(path).then(
      () => true,
      (e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") return false;
        throw e;
      },
    )
  )
    throw new Error(
      "Setup files already exist. Nothing was overwritten; see docs/setup.md.",
    );
  const file = await open(path, "wx", 0o600);
  try {
    await file.writeFile(setup.env);
  } catch (error) {
    await unlink(path);
    throw error;
  } finally {
    await file.close();
  }
}
