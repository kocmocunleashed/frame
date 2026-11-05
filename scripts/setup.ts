import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  MUSE_CONTRIBUTOR_MODEL,
  PINNED_OPENROUTER_MODELS,
} from "../shared/openrouter-models";
import {
  makeSetup,
  databaseUrl,
  writeSetup,
  type SetupOptions,
} from "./setup-config";

class SetupMessage extends Error {}

async function answer<T>(result: Promise<T>): Promise<Exclude<T, symbol>> {
  const value = await result;
  if (p.isCancel(value)) {
    p.cancel("Setup cancelled. No configuration was written.");
    process.exit(0);
  }
  return value as Exclude<T, symbol>;
}

async function main() {
  if (process.argv.includes("--help")) {
    console.log(
      "bun run setup\n\nInteractive local setup: preview or standalone PostgreSQL.\nCreates .env without overwriting it, masks secrets, and prints exact next commands.\nDoes not start services, migrate data, send paid AI requests.\nSee docs/setup.md for the noninteractive copy-and-paste instructions.",
    );
    return;
  }
  if (process.argv.length > 2)
    throw new SetupMessage(
      "Unknown option. Use bun run setup or bun run setup --help.",
    );
  if (process.env.NODE_ENV === "production")
    throw new SetupMessage(
      "This wizard is for local setup. Use docs/deployment.md for production.",
    );
  const root = fileURLToPath(new URL("..", import.meta.url));
  if (existsSync(join(root, ".env")))
    throw new SetupMessage(
      ".env already exists. It was not read or changed. Follow docs/setup.md to update OpenRouter or resume setup.",
    );
  if (!process.stdin.isTTY || !process.stdout.isTTY)
    throw new SetupMessage(
      "Run bun run setup in an interactive terminal. For copy-and-paste setup, see docs/setup.md.",
    );
  p.intro("Frame · local setup");
  if (Bun.version !== "1.3.14")
    p.log.warn(
      `This project is tested with Bun 1.3.14; you have ${Bun.version}.`,
    );
  const node = Bun.which("node")
    ? Bun.spawnSync(["node", "--version"], { stdout: "pipe", stderr: "pipe" })
    : null;
  if (
    !node ||
    node.exitCode !== 0 ||
    !node.stdout.toString().trim().startsWith("v22.")
  )
    p.log.warn(
      "Install Node.js 22 before starting Frame: https://nodejs.org/en/download",
    );
  const mode = await answer(
    p.select<SetupOptions["mode"]>({
      message: "How will you use Frame?",
      options: [
        {
          value: "preview",
          label: "Try it on this computer",
          hint: "no account needed; database is deleted when stopped",
        },
        {
          value: "standalone",
          label: "Standalone with built-in sign-in",
          hint: "your own sign-in; saved work persists",
        },
      ],
    }),
  );
  const options: SetupOptions = { mode, openrouterKey: "", database: "docker" };
  if (mode === "standalone") {
    options.database = await answer(
      p.select({
        message: "PostgreSQL database",
        options: [
          { value: "existing", label: "Connect Neon or existing PostgreSQL" },
          {
            value: "docker",
            label: "Start local PostgreSQL with Docker Compose",
          },
        ],
      }),
    );
    if (options.database === "existing")
      options.databaseUrl = await answer(
        p.password({
          message: "PostgreSQL connection URL (hidden)",
          validate: (value) =>
            databaseUrl.safeParse(value).success
              ? undefined
              : "Use a PostgreSQL connection URL.",
        }),
      );
  }
  const ai = await answer(
    p.confirm({
      message: "Connect OpenRouter for real, billable AI?",
      initialValue: false,
    }),
  );
  if (ai) {
    options.openrouterModel = await answer(
      p.select<NonNullable<SetupOptions["openrouterModel"]>>({
        message: "AI model",
        initialValue: MUSE_CONTRIBUTOR_MODEL,
        options: PINNED_OPENROUTER_MODELS.map((model) => ({
          value: model.id,
          label: model.label,
          hint: `$${model.inputPrice.toFixed(2)}/M input, $${model.outputPrice.toFixed(2)}/M output ceilings`,
        })),
      }),
    );
    p.note(
      `1. Sign in at https://openrouter.ai\n2. Add credits at https://openrouter.ai/settings/credits\n3. Create a key with a spending limit at https://openrouter.ai/settings/keys\n4. Paste it below. The key stays in your ignored .env.\n\nFrame pins ${options.openrouterModel}.\nAvailability, access and current prices are checked at generation time; no fallback to a different model.\nRead the model's current data-use terms before sending private material.`,
      "OpenRouter",
    );
    options.openrouterKey = await answer(
      p.password({
        message: "OpenRouter API key (hidden)",
        validate: (value) =>
          /^sk-or-v1-[a-zA-Z0-9_-]{16,500}$/.test(value || "")
            ? undefined
            : "Paste the full OpenRouter key beginning sk-or-v1-.",
      }),
    );
  }
  const setup = makeSetup(
    await readFile(join(root, ".env.example"), "utf8"),
    options,
  );
  await writeSetup(root, setup);
  p.log.success(
    "Created .env with private file permissions. Keys were not sent to any service.",
  );
  p.note(
    setup.commands.join("\n"),
    "Copy and run these commands from the Frame folder",
  );
  p.note(
    `Open ${setup.origin}\n${mode === "preview" ? "This preview uses a test identity and an ephemeral database. Work is deleted when you stop it." : "Register with your email and password. Your work is stored in PostgreSQL."}\n${mode === "preview" && !ai ? "Preview AI uses clearly labeled fixtures." : !ai ? "AI is unconfigured. Manual creation, editing and exports work." : "AI requests use your OpenRouter balance."}`,
    "Open Frame",
  );
  p.outro("Setup files are ready. Start the services with the commands above.");
}

main().catch((cause) => {
  // Validation and filesystem exceptions may include input values; never print them.
  console.error(
    cause instanceof SetupMessage
      ? cause.message
      : "Frame setup did not complete. No existing settings were overwritten. Check that setup files do not already exist and the checkout is writable. See docs/setup.md.",
  );
  process.exitCode = 1;
});
