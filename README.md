# Frame

Frame creates editable presentations from a blank canvas, templates, or AI-assisted briefs and sources. The application includes a workspace, canvas editor, review and sharing, theme and brand libraries, presenter controls, audience questions, publications, and PDF/PNG ZIP/HTML/image-based PowerPoint exports.

The supplied reference implementation was available locally, so its React renderer, editor, schemas, 46 curated themes, AI workflows, and erxes source plugins were reused. Persistence, file delivery, job transport, operational tools, and deployment definitions have been ported to MongoDB and AWS. A build does not prove cloud or real-host deployment.

## Start here

**Installing with an AI agent?** Give it [setup.md](setup.md), or paste:

> Install Frame from https://github.com/kocmocunleashed/frame. Read the root
> setup.md and follow its installation and verification steps. Use my existing
> erxes host if available; preserve existing configuration and data. Ask me for
> any missing account access and tell me the tested URL when ready.

Install **Bun 1.3.14**, **Node.js 22**, and Git, then copy and paste:

```bash
git clone https://github.com/kocmocunleashed/frame.git
cd frame
bun install --frozen-lockfile
bun run setup
```

The wizard guides you through a local preview, standalone Clerk sign-in, or an
existing erxes host. It explains how to create an OpenRouter key, accepts it in
a hidden input, and prints the commands to start your chosen setup. AI is
optional. Existing configuration is never overwritten.

**[Follow the complete setup guide →](docs/setup.md)** for prerequisite installs,
OpenRouter credits and key checks, persistent MongoDB, erxes plugin installation,
and troubleshooting. The preview deletes its database on exit; choose Clerk or
erxes to keep your work. Persistent local storage requires Docker Compose or an
existing MongoDB replica set.

## Local development details

Prerequisites: Bun **1.3.14**, Node **22** (for the browser driver and MongoDB test fixture manager), Docker Compose or another way to run MongoDB **7.0.45** as a replica set, and Chromium installed by the pinned Playwright package. Use the official MongoDB driver **6.21.0**: newer BSON releases call a Node V8 API that Bun 1.3.14 does not implement.

The Mongo health check initializes `rs0` with `127.0.0.1:27017`; it checks `rs.status()` thereafter. Verify manually with `docker compose exec mongo mongosh --quiet --eval 'rs.status().ok'`. Run the API and worker on the host for this local profile. A standalone `mongod` without a replica set is rejected.

The wizard uses `http://localhost:5174` for persistent setups and
`http://127.0.0.1:5174` for the disposable preview. The persistent API uses port
3158; the preview API uses 3141. Use the exact origin printed by setup. Configure
a Clerk development instance in `.env`, or configure the three erxes fields
together. Missing authentication configuration produces an actionable error.
There is no default password or production administrator. AI is optional; blank
decks, editing, presentation, and exports do not require provider keys.

Playwright browser tasks run in a bounded Node subprocess to avoid Bun 1.3.14's
intermittent Chromium control-pipe failure on repeated launches. API, workers,
the shared renderer and export packaging run on Bun. The container bundles Node
22.23.1; local development finds `node` on PATH, or uses `FRAME_NODE_PATH`.
The driver receives projected HTML through private scratch files and no service
credentials. Cancellation closes Chromium and removes those files.

`bun run dev` starts the API, Vite, and local worker. When explicitly configured with SQS, it also starts the dispatcher. Production runs those processes separately. Migrations are explicit and never run during production startup or a frontend build.

For a visibly labeled, isolated demonstration without Clerk or AI credentials:

```bash
bun run dev:fixture
```

Set `FRAME_WEB_PORT` and `FRAME_API_PORT` to use different loopback ports.

This starts an ephemeral **real replica set**, a loopback-only test identity endpoint, fixture AI, and the full editor. It discards the database on exit. To reuse an installed MongoDB binary instead of downloading it, set `FRAME_MONGOD=/absolute/path/to/mongod`. Fixture code is absent from the production entry point; production rejects fixture configuration. This harness does not verify Clerk or a real erxes gateway.

To use the configured OpenRouter account in this loopback harness, run
`bun run dev:fixture --live-ai`. It retains the test identity but uses real,
billable provider requests and shows that distinction in the banner. Put
`OPENROUTER_API_KEY` only in the ignored `.env`; never use a `VITE_` key for
secrets. The example configuration pins Muse Contributor with $0.10/M input
and $0.20/M output ceilings and no paid-model fallback. Ordinary fixture and
test commands always strip provider credentials. `bun run check:openrouter`
checks key authentication without generating content. `bun run check:ai --once`
performs five bounded real provider checks. For the full studio check, launch
the live harness on port 5191 and run `bun scripts/check-live-studio.ts`.

For the embedded erxes demonstration, build the frontend then run:

```bash
bun run build
bun run erxes:preview
```

Open `http://127.0.0.1:41359`. It runs the actual launch-ticket exchange with a simulated host and an isolated MongoDB replica set. Its sibling Frame server uses port 41358. Use `FRAME_ERXES_TEST_HOST_PORT` and `FRAME_ERXES_TEST_FRAME_PORT` to change those ports.

## Tests and builds

```bash
bun run typecheck
bun run test
bun run test:browser
bun run test:visual
bun run erxes:test
bun run erxes:build
bun run erxes:test:browser
bun run infra:check
bun run build
```

The test launcher removes inherited provider/cloud credentials, starts MongoDB, and gives every repository test its own database. Tests refuse production targets. It uses MongoDB transactions, indexes, and fault injection rather than a database emulator. Pass test paths after `bun run test`; pass Playwright paths or `--grep` after `bun run test:browser`. `--mongod /path/to/mongod` selects a local binary. `--log /tmp/frame-check.log` saves the output.

Visual baselines came from the supplied reference; inspect differences before updating them. Browser tests use fixture identity and AI. Real Clerk verification, a native erxes gateway, AWS IAM/S3/SQS, provider catalog behavior, and physical-device checks are separate release gates.

## Identity and data

Standalone identity is resolved from verified Clerk sessions and verified primary email. The immutable provider subject identifies accounts; email never links existing workspaces. Configure `FRAME_ADMIN_USER_IDS` with Frame IDs for credit administration.

An erxes deployment is dedicated to one tenant and issuer. Its first successful launch binds that database persistently. Tickets are single-use, HMAC signed, and valid for 60 seconds. Frame issues a one-hour hashed session. Host roles do not confer Frame administration. See [frame-erxes/README.md](frame-erxes/README.md).

Deck metadata points to immutable snapshots; ordered slide content is stored in verified binary chunks of at most 1 MiB. Saves compare expected revisions and use an authorization guard in a MongoDB transaction. Publications and live sessions retain separate immutable snapshots. Content that becomes unreferenced is currently retained deliberately; maintenance never deletes bytes using an unsafe age-only heuristic.

S3 upload policies target random staging keys. Finish checks size, checksum, decoded content, current permission, and the pinned staging version before creating immutable media. Downloads are proxied through authorization checks. Exported PowerPoint slides are pictures; their text and shapes are not editable in PowerPoint.

## AWS deployment

Use [infra/config.example.json](infra/config.example.json) and [docs/deployment.md](docs/deployment.md). The CDK package defines separate API, worker, dispatcher and scheduled maintenance tasks, private subnets, ALB, CloudFront, private versioned S3 buckets, SQS/DLQ, task roles, logs, and alarms. Region, domain, Atlas tier, credentials, alert recipients, and account are deployment inputs.

```bash
bun run infra:check
# After configuring an environment file and AWS credentials:
cd infra
bunx cdk synth -c config=/absolute/path/to/environment.json
```

`infra:check` synthesizes fixture stacks and checks their structure without deploying. Do not deploy its fixture account or domains. Production configuration requires HTTPS, TLS MongoDB, S3, and SQS; it never falls back to local adapters.

## Operations

```bash
bun run ops status
bun run ops backup /new/backup-directory
bun run ops verify /backup-directory
bun run ops restore /backup-directory
bun run ops maintenance
bun run ops maintenance --execute
```

Restore requires an empty isolated database and empty storage namespace. Set `FRAME_BACKUP_KEY` to an independent random 32-byte hexadecimal key; encryption is mandatory for production backups. The logical backup uses one MongoDB snapshot read session and immutable objects. Retain managed Atlas backups and S3 versions separately. Sessions are invalidated, live sessions are ended, and unfinished jobs are cancelled on restore. Verify a restored environment before exposing it. See [docs/operations.md](docs/operations.md).
