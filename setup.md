# Install Frame: instructions for AI agents

Follow this runbook when a user asks you to install, start, or connect Frame.
Install the existing application and verify the requested mode. An installation
request is not a request to rebuild the application.

For a person doing the steps themselves, use [docs/setup.md](docs/setup.md).
For AWS or a shared HTTPS installation, use [docs/deployment.md](docs/deployment.md)
and [the erxes plugin guide](frame-erxes/README.md). The local commands below do
not provision cloud services.

## 1. Inspect the computer and choose the mode

Read the applicable `AGENTS.md` files in Frame and any erxes checkout you will
modify. Reuse the user's existing installation when present. Check the working
tree, runtime versions, running services and occupied ports before changing them:

```bash
git status --short
bun --version
node --version
git --version
```

Use Bun **1.3.14** and Node **22**. Install missing prerequisites using
[the prerequisite instructions](docs/setup.md#1-install-the-prerequisites).
Do not replace a working system runtime or another project's package manager to
make this checkout work. Use a project-specific runtime when needed.

Infer the mode from the user's request and existing services:

| Request                                  | Mode                    | Required information                                                           |
| ---------------------------------------- | ----------------------- | ------------------------------------------------------------------------------ |
| Install as an erxes plugin               | `erxes`                 | Existing host checkout, host origin, authenticated tenant, MongoDB replica set |
| Install Frame with its own login         | `standalone`            | Clerk development instance and keys, MongoDB replica set                       |
| Try a disposable demo                    | `preview`               | No external account; data is deleted on shutdown                               |
| Let other computers use the installation | Shared HTTPS deployment | Domains, hosting/account access, tenant, persistent database/storage           |

If the mode is unclear, ask one concise question and continue prerequisite checks.
Do not silently substitute the disposable preview for a persistent installation
or a real erxes host. `localhost` links only work on the computer opening them.

For erxes, locate `nx.json`, `backend/erxes-api-shared` and `frontend/core-ui`.
Record the host's Git revision. The supported revision is
`d83e2fa8e4be557bce37df0882aeb234bea74d63`. A different revision requires a
compatibility check; do not reset the user's host to that commit. The tenant
comes from authenticated `context.subdomain`, not a name invented for setup.

Ask only for information or account access that you cannot discover. The user's
install request covers ordinary installation work; don't repeatedly ask whether
to continue. Complete independent work while waiting for missing account input.

## 2. Get the project and install dependencies

If no checkout exists, run this in the user's chosen parent directory:

```bash
git clone https://github.com/kocmocunleashed/frame.git
cd frame
```

Otherwise enter the existing Frame checkout. Preserve uncommitted work and use
the requested revision. Do not use a forced reset, clean, or pull over local edits.

From the Frame root:

```bash
bun install --frozen-lockfile
bunx playwright install chromium
```

Install dependencies in this checkout. Symlinking `node_modules` from an
unrelated checkout can cause Vite's private-file checks to reject modules.
On supported Debian/Ubuntu systems, missing Chromium libraries can be installed
with `bunx playwright install --with-deps chromium`, subject to available system
permissions. Do not regenerate the lockfile just to get past an install failure.

## 3. Configure Frame without overwriting an installation

If `.env`, `frame-erxes/.env.adapter`, or a service-managed Frame configuration
already exists, preserve it. Identify the active mode, database and service
configuration without printing secret values. Do not delete these files to make
the fresh-setup wizard run. Reconcile only the settings needed for the requested
installation. Preserve the database, asset paths, backup key and erxes binding.

Keep credentials in an ignored file with mode `0600`, a protected environment,
or the deployment's secret manager. Never put them in tool arguments, chat,
screenshots, Git, client bundles, or a generated setup report. Do not print an
entire environment or raw configuration file. Only Clerk's publishable key may
use a `VITE_` variable; OpenRouter and erxes secrets stay server-side.

### Fresh configuration with a terminal

```bash
bun run setup
```

The wizard masks keys, creates files exclusively, generates matching erxes
secrets, and prints the next commands. Let the user enter secret values through
the hidden terminal input. A generated file is not proof the services are running.

### Fresh configuration without an interactive terminal

Use the existing functions in `scripts/setup-config.ts`. Do not implement a
second env-file generator. Set these **non-secret** choices for the selected
mode; replace the example origin and tenant with the discovered host values:

```bash
export FRAME_SETUP_MODE=erxes
export FRAME_SETUP_DATABASE=existing
export FRAME_SETUP_ERXES_ORIGIN=http://localhost:3001
export FRAME_SETUP_ERXES_TENANT=localhost
```

Allowed modes are `erxes`, `standalone` and `preview`; database choices are
`existing` and `docker`. For standalone, supply `VITE_CLERK_PUBLISHABLE_KEY` and
`CLERK_SECRET_KEY` from the same development instance. OpenRouter is optional;
its variable is `OPENROUTER_API_KEY`.

Supply credentials through a protected process environment. If the agent tool
has no secure environment channel, have the user place them in a private env file
outside the checkout. For that case, replace `--no-env-file` below with
`--env-file=/absolute/path/to/private/frame-install.env`. Put only the file path
in the command, never its contents. Keep the non-secret choices above in the
environment, or include them in that private file.

Run from the Frame root on a **fresh** installation:

```bash
bun --no-env-file - <<'TS'
import { makeSetup, setupOptions, writeSetup } from './scripts/setup-config.ts';

try {
  const parsed = setupOptions.safeParse({
    mode: process.env.FRAME_SETUP_MODE,
    database: process.env.FRAME_SETUP_DATABASE,
    erxesOrigin: process.env.FRAME_SETUP_ERXES_ORIGIN,
    erxesTenant: process.env.FRAME_SETUP_ERXES_TENANT,
    clerkPublishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY || undefined,
    clerkSecretKey: process.env.CLERK_SECRET_KEY || undefined,
    openrouterKey: process.env.OPENROUTER_API_KEY || '',
  });
  if (!parsed.success) {
    console.error('Setup inputs are missing or invalid. Check the selected mode and required settings; no values were logged.');
    process.exit(1);
  }
  const setup = makeSetup(await Bun.file('.env.example').text(), parsed.data);
  await writeSetup(process.cwd(), setup);
  console.log('Created private local setup files. Existing files were not overwritten.');
  console.log(`Frame origin: ${setup.origin}`);
  console.log(setup.commands.join('\n'));
} catch {
  console.error('Setup could not create its files. Check for existing configuration and directory permissions. No secret values were logged.');
  process.exitCode = 1;
}
TS
```

This helper accepts local loopback origins only. Use the deployment guide for
HTTPS. It writes `.env` and, in erxes mode, `frame-erxes/.env.adapter`. It does
not start services or contact providers. Do not print the returned `setup`
object: it contains secrets. Load the adapter file through Bun's env-file loader,
not shell `source`.

## 4. Start the selected mode

### Persistent standalone or erxes

Frame requires a MongoDB replica set. If using the project's Docker service and
port 27017 is free:

```bash
docker compose up -d --wait
docker compose exec mongo mongosh --quiet --eval 'rs.status().ok'
```

If erxes already has MongoDB, verify it is a replica set and use a **separate
Frame database**. Skip the Docker command. Never reinitialize a running host's
database or put Frame records into erxes core collections. The fresh helper uses
`frame_erxes_dev` for erxes and `frame_dev` for standalone.

After confirming the intended database and configuration:

```bash
bun run db:migrate
bun run dev
```

Keep the dev launcher running in a managed terminal or the user's existing
service manager. It starts API, Vite and worker processes. Record how to restart
them; do not claim they survive closing the terminal unless configured to do so.
Persistent defaults are UI `http://localhost:5174` and API port 3158.

Standalone uses Clerk. Enable email sign-in and primary-email verification in
the chosen development instance. Use its existing integration; don't run a
Clerk/framework scaffolder over Frame. Confirm a real sign-in when user account
access is available. Erxes mode needs no Clerk keys and must launch from the host.

### Disposable preview

```bash
bun run dev:fixture
```

Open `http://127.0.0.1:5174`. This starts a temporary real MongoDB replica set
and a labeled test identity/AI harness. The preview API uses port 3141.
`FRAME_MONGOD=/absolute/path/to/mongod` can select a local MongoDB binary if the
fixture download is unavailable. `FRAME_WEB_PORT` and `FRAME_API_PORT` override
preview ports. Stopping the preview deletes its database.

Use `bun run dev:fixture --live-ai` only when real OpenRouter usage is requested
and configured. It still uses a test identity and temporary database.

## 5. Complete the erxes plugin connection

For erxes mode, follow every host step in
[Connect your local erxes host](docs/setup.md#connect-your-local-erxes-host).
Finish the following work rather than stopping after copying the plugins:

1. Run `bun run erxes:test` and `bun run erxes:build`, then install with
   `bun run erxes:install /absolute/path/to/erxes`. The installer refuses existing
   plugin directories. For an update, compare and merge the two plugin directories
   while preserving host changes; don't delete them to bypass the check.
2. Inspect the host's federation configuration. Apply the supplied singleton patch
   only after `git apply --check` succeeds and the fix is absent. If it conflicts,
   reconcile that configuration; don't force it or replace the host lockfile.
3. In the host checkout, run the native builds for `frame_api` and `frame_ui`.
   The guide provides the Nx commands. Source packaging alone is insufficient.
4. Load `frame-erxes/.env.adapter` on the host's `frame_api` service alongside its
   existing Redis/discovery settings. Preserve other enabled plugins when adding
   `frame` to `ENABLED_PLUGINS`. Start one adapter and serve the remote at its
   configured `UI_ENTRY_URL`; default ports are 3319 and 3019 respectively.
5. Restart the affected gateway/UI services and verify discovery using:

   ```bash
   bun --no-env-file frame-erxes/scripts/check-host.ts http://localhost:4000
   ```

   This check is for local hosts. Adjust the port to the actual gateway.

6. Give only the intended users `frame:user` / `frameStudioOpen` through the
   host's permission controls. Open the actual erxes `/frame` route. Verify
   automatic studio launch, editor save/reload, and a fresh new-tab launch.

Use the host's authenticated tenant and exact origin consistently. An existing
Frame database stays bound to its original tenant/issuer. Do not change that
binding to make another host connect. Do not grant Frame administrator access
as a shortcut for fixing launch permissions.

If the host is missing or incompatible, finish the independent Frame setup and
plugin checks, then report the specific host dependency. A fixture host is not
evidence of successful real-host integration.

## 6. Guide the user through OpenRouter

AI is optional. Missing credentials must not block manual editing or exports.
When AI is requested, guide the user to OpenRouter's
[credits page](https://openrouter.ai/settings/credits) and
[API key page](https://openrouter.ai/settings/keys). Have them choose a spending
limit and enter the key through the protected input described above. Do not
purchase credits or raise a spending cap on their behalf unless authorized.
Detailed instructions are in [Connect OpenRouter](docs/setup.md#connect-openrouter).

Preserve `meta/muse-spark-1.3-contributor` and
`OPENROUTER_MUSE_CONTRIBUTOR_ENABLED=true`. Frame's current application ceilings
are $0.10 per million input tokens and $0.20 per million output tokens; runtime
catalog checks determine current access and prices. Do not silently select a
different paid model. Frame's unlimited presentation credits do not make provider
requests free.

After server-side configuration, run:

```bash
bun run check:openrouter
```

This checks key authentication without generation. It does not establish model
access or sufficient balance. Restart API and worker after changing their
settings. Perform paid generation checks only within the user's authorized scope
and budget. `bun run check:ai --once` makes **five** real provider checks; do not
mistake it for a free connectivity test.

## 7. Verify and hand off

Run the setup checks and build from the Frame root:

```bash
bun --no-env-file test tests/setup.test.ts
bun run build
```

For a running persistent local installation:

```bash
curl --fail http://localhost:3158/api/health
curl --fail http://localhost:3158/api/ready
curl --fail http://localhost:3158/api/auth/provider
```

Use port 3141 for a default preview, or the actual configured origin/port.
`/api/auth/provider` must match the chosen mode. A 200 response from the frontend
alone does not verify authentication, database readiness or saving.

Open the browser, authenticate through the chosen mode, create a named blank
deck, edit it, wait for saved state, and reload it. Check an export if Chromium
was newly installed. For erxes, test the actual host route and relaunch the
studio to confirm identity and persistence. If user sign-in is required, ask
them to complete it; don't invent a successful authentication result.

Leave the requested service running when supported by the environment. Hand off:

- The tested URL and sign-in method.
- The installation path, database name, and whether work persists after shutdown.
- Start/stop/restart commands and any terminal that must remain open.
- Checks actually run and their results, including whether AI was configured,
  key-checked, or tested with real generation.
- Specific remaining user actions or external verification gates.

Never include credentials, session tokens, tickets or raw configuration in the
handoff. Stop only services started for this installation or expressly included
in the user's request. Use `docker compose stop` to retain local data; do not
use `docker compose down -v` to stop a workspace the user wants to keep.
