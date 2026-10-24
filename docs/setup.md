# Set up Frame on a new computer

For an AI agent performing the installation, use the root
[agent setup runbook](../setup.md). This page is the walkthrough for people.

These steps run Frame locally. Use Linux, macOS, or a Linux terminal in Windows
WSL2. For a shared HTTPS deployment, use [the AWS guide](deployment.md).

## 1. Install the prerequisites

Install Git and [Node.js 22](https://nodejs.org/en/download). Choose the 22.x
release in the download selector; this project tests the browser driver on Node 22.

Install the project's pinned [Bun version](https://bun.com/docs/installation):

```bash
curl -fsSL https://bun.com/install | bash -s "bun-v1.3.14"
export PATH="$HOME/.bun/bin:$PATH"
bun --version
node --version
git --version
```

Expected: Bun `1.3.14`, Node `v22.x`. Reopen your terminal if `bun` is not found.
For persistent local storage, install and start
[Docker Desktop](https://docs.docker.com/get-started/get-docker/), or Docker
Engine with Compose. The disposable preview does not need Docker.

## 2. Copy, paste, and choose a setup

```bash
git clone https://github.com/kocmocunleashed/frame.git
cd frame
bun install --frozen-lockfile
bun run setup
```

The wizard asks how you want to sign in, whether to use Docker MongoDB, and
whether to connect OpenRouter. It masks secret inputs, creates `.env` with
private permissions, and prints the next commands. It does not start services,
charge for AI, or alter an erxes checkout. Cancel before completion to leave
configuration unwritten.

| Choice                               | Sign-in                 | Saved work           | Next step                                       |
| ------------------------------------ | ----------------------- | -------------------- | ----------------------------------------------- |
| Try it on this computer              | Test identity           | Deleted when stopped | [Run the preview](#run-the-preview)             |
| Connect an existing local erxes host | Your erxes account      | Local MongoDB        | [Connect erxes](#connect-your-local-erxes-host) |
| Standalone with Clerk                | Your own Clerk instance | Local MongoDB        | [Run standalone](#run-standalone-with-clerk)    |

The wizard refuses to replace an existing `.env` or adapter env file. If setup
was interrupted after creating files, keep them and run the appropriate commands
below. Edit `.env` in your text editor to add or change a key. Do not rerun setup
by deleting configuration belonging to an existing workspace.

## Connect OpenRouter

You can skip AI and still create, edit, present, and export manually.

1. Create/sign into your account at [OpenRouter](https://openrouter.ai).
2. Open [Credits](https://openrouter.ai/settings/credits) and add the balance
   you want available for testing. Frame does not purchase credits for you.
3. Open [API keys](https://openrouter.ai/settings/keys), create a key named
   `Frame local`, and set a spending limit. Copy the key into the wizard's hidden
   input. OpenRouter documents per-key limits in its
   [authentication guide](https://openrouter.ai/docs/api_reference/authentication).
4. If `.env` already exists, edit these entries there instead:

```dotenv
FRAME_AI_PROVIDER=openrouter
OPENROUTER_API_KEY=PASTE_YOUR_OWN_KEY_HERE
OPENROUTER_MODEL=meta/muse-spark-1.3-contributor
OPENROUTER_MUSE_CONTRIBUTOR_ENABLED=true
```

Keep the key in `.env`, not in a `VITE_*` variable, browser code, GitHub, or chat.
The erxes adapter does not need this key; only the Frame server and AI worker do.

Check that OpenRouter accepts the key without generating content:

```bash
bun run check:openrouter
```

This calls only OpenRouter's documented
[`GET /api/v1/key`](https://openrouter.ai/docs/api_reference/limits) endpoint.
Success checks authentication, not the availability of a model or a sufficient balance.

Frame pins **Muse Spark 1.3 Contributor**. Its application price ceilings are
**$0.10 per million input tokens and $0.20 per million output tokens**. These
are ceilings in Frame's code, not a guaranteed future OpenRouter price or access
entitlement. Frame checks the catalog before generation and refuses an unavailable
or overpriced route rather than switching to another paid model. Web research
has its own bounded allowance and may add cost. Read the model's current
contributor and data-use terms in OpenRouter before submitting private material.

**Unlimited presentation credits in Frame are not free OpenRouter usage.** Frame
credits control whether an AI result can be saved; OpenRouter bills generation
requests, including previews and retries, separately.

Restart the Frame API and worker after editing `.env`. With `bun run dev`, stop
it with Ctrl+C and run it again. Then create a small three-slide presentation.
The optional command below runs five real provider checks and can incur charges:

```bash
bun run check:ai --once
```

## Run the preview

After the wizard's preview choice:

```bash
bunx playwright install chromium
bun run dev:fixture
```

Open **http://127.0.0.1:5174**. Enter a name and email in the labeled local
workspace form. There is no real erxes or Clerk login in this preview.
AI uses fixture responses unless you explicitly choose the live command:

```bash
bun run dev:fixture --live-ai
```

The live command needs the OpenRouter entries above. It uses a test identity
with real, billable AI. Both preview modes discard MongoDB data when stopped.
Use an existing MongoDB binary with `FRAME_MONGOD=/absolute/path/to/mongod` if
the automatic MongoDB download is unavailable on your Linux distribution.

For a manual preview setup without the wizard, first run
`cp -n .env.example .env` in a fresh checkout. Then use the commands above.

## Run standalone with Clerk

In the [Clerk dashboard](https://dashboard.clerk.com), create/select a development
application and enable email sign-in and email verification. The Frame sign-in
integration is already implemented; do not run a framework scaffolder over it.
Copy the publishable and secret keys from the same instance's API keys page into
the wizard. See Clerk's [React quickstart](https://clerk.com/docs/react/getting-started/quickstart)
for dashboard/key terminology.

The wizard writes:

```dotenv
APP_ORIGIN=http://localhost:5174
VITE_CLERK_PUBLISHABLE_KEY=YOUR_PK_TEST_KEY
CLERK_SECRET_KEY=YOUR_SK_TEST_KEY
CLERK_AUTHORIZED_PARTIES=http://localhost:5174
```

It leaves all `FRAME_ERXES_*` entries blank. `CLERK_JWT_KEY` is optional here.
Then run:

```bash
bunx playwright install chromium
docker compose up -d --wait
bun run db:migrate
bun run dev
```

Open **http://localhost:5174**, sign up, and verify your primary email.
MongoDB uses the `frame_dev` database and a persistent Docker volume. No default
administrator or shared password is created. If you selected an existing
replica set, omit `docker compose up` and adjust the MongoDB URI in `.env` if
it is not `127.0.0.1:27017` / replica set `rs0`.

## Connect your local erxes host

This requires an existing, working erxes checkout with its own dependencies,
MongoDB, Redis, and gateway setup. The supported host revision is
`d83e2fa8e4be557bce37df0882aeb234bea74d63`; arbitrary host versions are not
automatically compatible. The wizard does not install erxes itself.

Choose **Connect an existing local erxes host**. The defaults are
`http://localhost:3001` and tenant `localhost`; use the tenant resolved by your
host's authenticated `context.subdomain` if different. The wizard generates a
fresh random secret and writes matching settings to:

- Frame's `.env`, including a dedicated `frame_erxes_dev` database.
- `frame-erxes/.env.adapter`, for the host's `frame_api` service only.

Both files are ignored by Git. Keep them server-side. The generated adapter
file is formatted for **Bun env-file loading**, not shell `source`.

### Start Frame

From the Frame folder:

```bash
bunx playwright install chromium
# Omit this line if erxes already supplies MongoDB on port 27017:
docker compose up -d --wait
bun run db:migrate
bun run dev
```

Leave that terminal running. Frame's UI is on `localhost:5174` and its API/worker
use port 3158. Open the studio through erxes after the plugin is connected.
Clerk keys are not required.

### Install the source plugins

In a second terminal, from the Frame folder, replace only the erxes path below:

```bash
export FRAME_PROJECT_DIR="$PWD"
export ERXES_PROJECT_DIR="/absolute/path/to/erxes"
bun run erxes:test
bun run erxes:build
bun run erxes:install "$ERXES_PROJECT_DIR"
```

The installer refuses existing Frame plugin directories. For an update, review
and merge them; do not delete an existing installation's configuration.

For the supported Nx 20 host, check and apply the included sharing fix if it
is not already present:

```bash
cd "$ERXES_PROJECT_DIR"
git apply --check "$FRAME_PROJECT_DIR/frame-erxes/patches/core-ui-singletons.patch"
git apply "$FRAME_PROJECT_DIR/frame-erxes/patches/core-ui-singletons.patch"
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx build frame_api
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx build frame_ui
```

If the patch check fails, stop and compare the host's federation configuration
with the patch. It may already contain the fix or use a different revision.
Do not force it or replace the host's lockfile.

### Configure and start the host services

Append `frame` to the host's existing `ENABLED_PLUGINS` value, retaining its other
plugins. In the `frame_api` service environment, load the generated adapter
file **alongside the existing host environment**. For a local terminal launch:

```bash
cd "$ERXES_PROJECT_DIR"
bun --env-file="$ERXES_PROJECT_DIR/.env" \
    --env-file="$FRAME_PROJECT_DIR/frame-erxes/.env.adapter" \
    run backend/plugins/frame_api/src/main.ts
```

Use the host environment that already supplies its Redis/discovery settings if
it is configured through a service manager rather than the root `.env`. Do not
start a second `frame_api` if the host launcher already manages it; add the env
file to that service instead.

Restart the erxes gateway so it discovers the plugin. Restart the host's UI dev
launcher with `frame` enabled. If that launcher does not start the remote, run
`bunx nx serve frame_ui` in another host terminal. The remote should be served at
**http://localhost:3019/remoteEntry.js**, matching the generated `UI_ENTRY_URL`.

Check discovery from the Frame folder, replacing the gateway port if necessary:

```bash
bun --no-env-file frame-erxes/scripts/check-host.ts http://localhost:4000
```

In erxes, grant testers **Frame User** (`frame:user`) or `frameStudioOpen`.
Open **http://localhost:3001/frame** and sign in to erxes. Frame opens
automatically, and each user gets their own persistent workspace. Use **Open in
new tab** if embedded sign-in is blocked. Details and HTTPS settings are in
[the plugin guide](../frame-erxes/README.md).

## Stop, restart, and troubleshoot

Stop `bun run dev` with Ctrl+C; restart it from the same folder with `bun run dev`.
Persistent-mode MongoDB data stays in the Docker volume. `docker compose stop`
stops MongoDB without removing the volume. **Do not use `docker compose down -v`
to stop a workspace you want to keep.**

| What you see                               | What to check                                                                                                               |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `bun: command not found`                   | Reopen your terminal or add `$HOME/.bun/bin` to PATH.                                                                       |
| `.env already exists`                      | Setup preserved it. Edit it directly or resume the commands for your mode.                                                  |
| Port 27017 is occupied                     | Use the existing replica set; do not start a second MongoDB on that port.                                                   |
| MongoDB transaction/replica-set error      | Verify `rs0` with `docker compose exec mongo mongosh --quiet --eval 'rs.status().ok'`. A standalone mongod is insufficient. |
| Chromium missing system libraries on Linux | On supported Debian/Ubuntu, run `bunx playwright install --with-deps chromium` (may request sudo).                          |
| Sign-in configuration unavailable          | Choose erxes or Clerk settings. Preview mode uses `bun run dev:fixture`, not `bun run dev`.                                 |
| OpenRouter 401                             | Replace an expired/invalid key in `.env`, then restart API and worker.                                                      |
| OpenRouter 402/429                         | Check balance, key caps and rate limits in OpenRouter; wait or adjust your limit there.                                     |
| Muse unavailable or pricing rejected       | Check that exact route and account access. Frame refuses a paid fallback; manual tools still work.                          |
| erxes `Login required` / permission denied | Sign into the host and grant `frameStudioOpen`; never use a shared Frame administrator login.                               |
| erxes remote `Script error`                | Verify the host and plugin share React, React DOM and Apollo; see the included compatibility patch.                         |
| erxes deployment binding mismatch          | Use a separate Frame database for a different host origin/tenant. Do not relabel an existing tenant's database.             |

When Frame is running, these local checks should respond:

```bash
curl --fail http://localhost:3158/api/health
curl --fail http://localhost:3158/api/ready
curl --fail http://localhost:3158/api/auth/provider
```

For other people's computers, host erxes and Frame once at reachable HTTPS
addresses and send them the erxes `/frame` link. `localhost` always means the
computer opening the link. Follow [deployment.md](deployment.md) for the AWS
setup; this local wizard does not provision cloud resources.
