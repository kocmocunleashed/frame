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
  setupOrigin,
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
      "bun run setup\n\nInteractive local setup: preview, standalone Clerk, or erxes.\nCreates .env without overwriting it, masks secrets, and prints exact next commands.\nDoes not start services, migrate data, modify erxes, or send paid AI requests.\nSee docs/setup.md for the noninteractive copy-and-paste instructions.",
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
          value: "erxes",
          label: "Connect an existing local erxes host",
          hint: "real erxes login; saved work persists",
        },
        {
          value: "standalone",
          label: "Standalone with Clerk",
          hint: "your own sign-in; saved work persists",
        },
      ],
    }),
  );
  const options: SetupOptions = { mode, openrouterKey: "", database: "docker" };
  if (mode === "erxes") {
    p.note(
      "Start your existing erxes host first. This wizard creates the Frame settings and a separate adapter env file; it does not install or overwrite the host.\nUse localhost consistently for the host and Frame.\nThe tenant is the host's authenticated subdomain (usually localhost in local development).",
      "erxes connection",
    );
    options.erxesOrigin = await answer(
      p.text({
        message: "erxes origin",
        defaultValue: "http://localhost:3001",
        placeholder: "http://localhost:3001",
        validate: (value) =>
          setupOrigin.safeParse(value || "http://localhost:3001").success
            ? undefined
            : "Use http://localhost:3001 or another exact loopback origin.",
      }),
    );
    options.erxesTenant = await answer(
      p.text({
        message: "Authenticated erxes tenant",
        defaultValue: "localhost",
        placeholder: "localhost",
        validate: (value) =>
          /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(value || "localhost")
            ? undefined
            : "Enter the host tenant, using letters, numbers, dots, hyphens or underscores.",
      }),
    );
  }
  if (mode === "standalone") {
    p.note(
      "Create/select a development application at https://dashboard.clerk.com\nEnable email sign-in and email verification. Open its API keys page.\nUse both keys from that same development instance.",
      "Clerk sign-in",
    );
    options.clerkPublishableKey = await answer(
      p.text({
        message: "Clerk publishable key",
        placeholder: "pk_test_…",
        validate: (value) =>
          /^pk_test_[a-zA-Z0-9_-]+$/.test(value || "")
            ? undefined
            : "Use the development publishable key beginning pk_test_.",
      }),
    );
    options.clerkSecretKey = await answer(
      p.password({
        message: "Clerk secret key (hidden)",
        validate: (value) =>
          /^sk_test_[a-zA-Z0-9_-]+$/.test(value || "")
            ? undefined
            : "Use the development secret key beginning sk_test_.",
      }),
    );
  }
  if (mode !== "preview")
    options.database = await answer(
      p.select({
        message: "Local MongoDB",
        initialValue: mode === "erxes" ? "existing" : "docker",
        options: [
          {
            value: "docker",
            label: "Start this project's Docker Compose MongoDB",
            hint: "port 27017 must be free",
          },
          {
            value: "existing",
            label: "Use my existing replica set",
            hint: "127.0.0.1:27017, rs0; Frame uses its own database",
          },
        ],
      }),
    );
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
  if (setup.adapter)
    p.log.success(
      "Created frame-erxes/.env.adapter with the matching server-only launch secret.",
    );
  p.note(
    setup.commands.join("\n"),
    "Copy and run these commands from the Frame folder",
  );
  if (mode === "erxes")
    p.note(
      "Next, follow docs/setup.md → Connect your local erxes host.\nInstall frame_api/frame_ui, load frame-erxes/.env.adapter on frame_api, enable frame in the host, and grant Frame User.\nThen open your erxes origin + /frame; the studio opens automatically.",
      "Finish the host connection",
    );
  else
    p.note(
      `Open ${setup.origin}\n${mode === "preview" ? "This preview uses a test identity and an ephemeral database. Work is deleted when you stop it." : "Sign up and verify your email. Your work is stored in local MongoDB."}\n${mode === "preview" && !ai ? "Preview AI uses clearly labeled fixtures." : !ai ? "AI is unconfigured. Manual creation, editing and exports work." : "AI requests use your OpenRouter balance; Frame's unlimited presentation credits do not make provider usage free."}`,
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
