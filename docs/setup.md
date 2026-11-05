# Set up Frame

Use Bun 1.3.14, Node 22, and Chromium installed by the pinned Playwright package. Bun manages dependencies and scripts. Node runs the existing browser driver for exports. Install Docker or Podman if you want a disposable preview or local PostgreSQL; Neon needs neither.

```bash
bun install --frozen-lockfile
bunx playwright install chromium
bun run setup
```

On Linux, Playwright may report missing Chromium system libraries. Install the libraries it names, or use `bunx playwright install --with-deps chromium` on supported Debian/Ubuntu systems.

## Persistent standalone setup

Select standalone in the wizard. For Neon, select an existing database and paste a development connection URL into the hidden prompt. Use an empty database for a fresh install. The application uses a small pool of direct Neon WebSocket connections so interactive transactions and migration locks work. A supplied pooler hostname is normalized to its direct endpoint. No Neon Auth service is required.

The wizard generates `BETTER_AUTH_SECRET`, a separate backup encryption key, and a private `.env` with mode `0600`. It preserves any existing file. All API instances must use the same stable auth secret. No browser publishable key or external identity account is needed.

For local PostgreSQL, select the Docker option. The wizard generates a database password shared by Compose and `DATABASE_URL`.

```bash
# Local PostgreSQL only:
docker compose up -d --wait
bun run db:migrate
bun run dev
```

The UI is `http://127.0.0.1:5174`; the API uses port 3158. Keep `APP_ORIGIN` consistent with the browser's origin. Register with a name, email and password of at least 10 characters. The first protected request provisions a personal workspace, owner membership, credit balance and job quota in one transaction. There is no fabricated identity in standalone mode.

The sidebar workspace switch opens workspace creation, switching and membership management. Members need a registered Frame account. Owners grant editor or viewer access. Profile, password, connected sign-in methods and session controls remain in the account settings dialog. Optional Google/GitHub sign-in and verification/recovery email use Better Auth; see [account configuration](authentication.md).

## Existing configuration and data

Do not delete `.env`, database records, asset directories, or backup keys to rerun setup. Update only the required settings in a private editor. An existing installation using the previous database/auth stack needs the [data cutover runbook](migration/legacy-data.md). New sign-ups cannot claim imported users by matching an email address.

For noninteractive setup, reuse `makeSetup` and `writeSetup` from `scripts/setup-config.ts`. Supply credentials from a protected environment or private env file; never embed them in shell arguments or a setup report. `writeSetup` creates `.env` exclusively. It does not migrate a database or start services.

## Environment

See [`.env.example`](../.env.example) for defaults.

| Variable                                                           | Purpose                                                                                   |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                     | Server-only PostgreSQL URL; use a Neon development database locally and TLS in production |
| `BETTER_AUTH_SECRET`                                               | Stable random secret of at least 32 characters for signed session cookies                 |
| `APP_ORIGIN`                                                       | Exact browser origin, including port in development; HTTPS in production                  |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`                         | Optional Google sign-in; both values required                                             |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`                         | Optional GitHub sign-in; both values required                                             |
| `RESEND_API_KEY`, `AUTH_EMAIL_FROM`                                | Optional verified sender; enables required email verification and password recovery       |
| `PORT`                                                             | API listen port; defaults to 3158                                                         |
| `HOST`                                                             | API bind address; the wizard selects loopback for local use                               |
| `FRAME_STORAGE`                                                    | Explicit `local` or `s3` adapter                                                          |
| `FRAME_ASSETS`, `FRAME_EXPORTS`, `FRAME_STAGING`                   | Private local storage directories                                                         |
| `FRAME_QUEUE_DRIVER`                                               | `local` in development or `sqs` in production                                             |
| `FRAME_POSTGRES_PASSWORD`                                          | Optional local Compose database password; not used by Neon                                |
| `FRAME_S3_BUCKET`, `FRAME_S3_REGION`, `AWS_REGION`                 | Production private object storage; SDK credentials come from the deployment role          |
| `FRAME_SQS_QUEUE_URL`, `FRAME_SQS_DLQ_URL`                         | Production work queue and dead-letter queue                                               |
| `FRAME_ADMIN_USER_IDS`                                             | Server-approved user IDs for credit administration                                        |
| `FRAME_AI_PROVIDER`                                                | Existing `openrouter`, `openai`, or `tokenrouter` integration                             |
| `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`                           | Optional paid AI provider credentials and pinned model                                    |
| `OPENROUTER_MUSE_CONTRIBUTOR_ENABLED`                              | Explicit opt-in required by the existing Muse Contributor integration                     |
| `OPENAI_API_KEY`, `OPENAI_MODEL`, `OPENAI_BASE_URL`                | Optional existing OpenAI-compatible provider settings                                     |
| `TOKENROUTER_API_KEY`, `TOKENROUTER_MODEL`, `TOKENROUTER_BASE_URL` | Optional existing Token Router settings                                                   |
| `FRAME_BACKUP_KEY`                                                 | Independent 32-byte hexadecimal encryption key; required for production portable backups  |
| `FRAME_CHROME_PATH`, `FRAME_NODE_PATH`                             | Optional browser and Node driver paths                                                    |

No secret may have a `VITE_` prefix. Database and auth modules are server-only.

## Disposable preview

```bash
bun run dev:fixture
```

This starts an isolated PostgreSQL container, a loopback fixture API and Vite. The banner identifies the test identity and test AI. Stopping it removes the database container. Use `bun run dev:fixture --live-ai` only with a server-side OpenRouter key and an explicit intention to incur provider usage charges.

## Verify startup

1. Check `/api/health` and `/api/ready`. Readiness checks PostgreSQL, the Drizzle migration ledger, private storage and the selected queue.
2. Register, reload and sign out/in. Confirm the same user ID and workspace persist.
3. Create a presentation, edit text and notes, wait for the saved indicator and reload.
4. Upload an image, rehearse, publish a permitted link and create an export.
5. If AI is configured, run `bun run check:openrouter` for a read-only key check, then deliberately test generation. A fixture result is not proof of a live provider call.

Keep the dev launcher in a managed terminal. It does not install a permanent background service.
