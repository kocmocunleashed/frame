# Deploy Frame

Frame runs as an independent Bun/Hono API with a Vite frontend and background workers. Neon PostgreSQL stores identity and application data. Private assets and export bytes use S3; SQS wakes workers. The checked-in CDK stack retains the existing ECS, CloudFront, Route53, S3, SQS and scheduled maintenance architecture.

## Vercel hosting

The same application can run on the existing Vercel project. `vercel.json` packages the Bun API, a signed Queue consumer, a protected cron sweep and the existing studio HTML. Select `FRAME_STORAGE=blob` and `FRAME_QUEUE_DRIVER=vercel`, connect a private Blob store with `BLOB_READ_WRITE_TOKEN`, and retain a stable `CRON_SECRET`. Set `DATABASE_URL` to the reviewed Neon database, `APP_ORIGIN` to the HTTPS custom domain and keep `BETTER_AUTH_SECRET` stable. Existing AI and optional account-provider credentials stay server-side.

The API dispatches the PostgreSQL outbox through Vercel Queues. Messages carry the job ID and dispatch generation; the database retains leases, idempotency and revision guards. Delayed retry wakeups are scheduled before the invocation ends. The daily cron recovers expired work and staging uploads; active job polling also reconciles pending work. Auth email and dispatch tasks use `waitUntil`. The Queue trigger authenticates worker invocations, and the cron compares its bearer secret in constant time.

Uploads go directly to private Blob storage with a path-scoped, short-lived token. Token generation requires a current Frame session and upload authorization. The finish endpoint checks size, checksum and media bytes before committing an immutable asset. Download responses still pass through Frame authorization and support media byte ranges. The serverless Chromium binary is packaged with the unchanged Node browser driver for exports and fitting.

Git-triggered deployments are disabled in this configuration so pushing code cannot switch production before migrations and data verification finish. Release through the CLI:

```bash
vercel deploy --prod --skip-domain
# Verify the returned deployment, then assign the project's existing domains:
vercel promote <verified-deployment-url>
```

Update secret values through protected stdin or the provider's secret settings, never CLI `--env` or `--value` arguments. A deployment keeps its captured environment, so an existing deployment remains available for rollback. Preserve the old database and Blob objects through cutover. The [read-only PostgreSQL exporter](../scripts/export-legacy-postgres.ts) converts the earlier Vercel schema to the same validated import contract described in the [cutover guide](migration/legacy-data.md). Existing Argon2/bcrypt password hashes are accepted by Better Auth; records without a usable hash remain reserved for explicit administrator provisioning. They cannot be claimed by signing up with the same email.

## Configuration and secrets

Copy `infra/config.example.json` to a private operator-controlled configuration and set the selected environment, AWS account/region, domain/hosted zone, immutable image tag, Secrets Manager ARN and regional CloudFront origin-facing prefix list. Optional `authProviders` (`["google", "github"]`) and `authEmail` (`true`) enable secret injection for those account features. Their defaults are `[]` and `false`.

The deployment secret contains `DATABASE_URL`, `BETTER_AUTH_SECRET`, `FRAME_ADMIN_USER_IDS`, and `OPENROUTER_API_KEY` when AI is enabled. The API receives the database/auth/admin values; API and workers receive the AI key where required. Keep a separate backup key outside normal service roles. Never put credentials in CDK configuration, image build arguments, frontend environment variables, or logs.

For each enabled auth provider, add its `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` or `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET` pair to the same secret. For `authEmail`, add `RESEND_API_KEY` and `AUTH_EMAIL_FROM`. Only the API receives these values. Configure [callbacks and email delivery](authentication.md) before enabling them, then restart API instances after a configuration change.

Use a dedicated Neon database and TLS. Frame's Neon driver uses WebSockets with a small direct connection pool. The direct endpoint is needed for migration advisory locks. All API replicas share the same stable `BETTER_AUTH_SECRET` and HTTPS `APP_ORIGIN`. Cookie authentication is served on the application origin; no cross-origin auth proxy is required.

## Build and review

```bash
bun install --frozen-lockfile
bun run lint
bun run build
bun run test
bun run test:browser
bun run test:browser --config e2e/standalone.config.ts
bun run test:browser --config e2e/account-security.config.ts
bun run infra:check
```

The Dockerfile includes the compiled frontend, Bun server, Node browser driver, pinned Chromium installation and checked-in `drizzle/` migrations. There are no build-time auth credentials. Existing S3 policies, private task networking and disabled caching for dynamic requests remain in the CDK stack.

## Approved rollout

1. Create a Neon development branch and test reviewed migrations there with `bun run db:migrate`.
2. For an existing installation, complete the [data cutover](migration/legacy-data.md), identity provisioning and rollback rehearsal before changing ingress.
3. Build and push an immutable image using the deployment's existing ECR workflow. Review CDK synthesis and change sets.
4. With production approval, run the migration task once against the intended database. It validates migration checksums and takes an advisory lock. Runtime startup does not migrate or import data.
5. Roll out API, dispatcher, workers and maintenance. Configure at least two workers to retain capacity during Chromium rendering. Configure the storage adapter and SQS URLs as required by production validation.
6. Verify health/readiness, registration and session cookies, membership revocation, create/edit/reload, upload, AI generation, publishing, live presentation and downloads through the actual HTTPS origin.

Production deployment, DNS cutover and destructive database changes are operator actions requiring explicit approval. Do not use disposable preview identity or test databases in production.
