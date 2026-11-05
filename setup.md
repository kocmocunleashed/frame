# Install and verify Frame: agent runbook

Read `AGENTS.md` and [the setup guide](docs/setup.md). Reuse the existing application, setup helpers and private configuration. Preserve database contents, assets, backup keys and user identity mappings. An installation request does not authorize a redesign.

1. Inspect the checkout, available Bun/Node versions, running services and occupied ports. Use Bun 1.3.14 and Node 22. Do not reset a working tree or replace another project's configuration.
2. Run `bun install --frozen-lockfile` and `bunx playwright install chromium` from this checkout. Use its own `node_modules`.
3. For a persistent install, use a Neon development database or the local PostgreSQL service. Reuse an existing private env file when present. For a fresh configuration, run `bun run setup`, or call `makeSetup`/`writeSetup` in `scripts/setup-config.ts` with credentials supplied through a protected environment. Never print returned configuration objects.
4. If local PostgreSQL was selected, run `docker compose up -d --wait`. Apply reviewed migrations with `bun run db:migrate`; then run `bun run dev`. Complete startup, not just configuration generation.
5. For an explicitly requested disposable preview, run `bun run dev:fixture`. Its PostgreSQL container and test identity are temporary. Do not substitute it for persistent standalone authentication.
6. Verify process health, database readiness, real registration/login/logout, session persistence, workspace creation and permissions, presentation save/reload, assets, rehearsal and exports. Test live AI only when configured and authorized. Report exactly which checks ran and any external blockers.
7. Keep services in a managed terminal and report the local origin and restart command. Use [the deployment guide](docs/deployment.md) for shared HTTPS hosting. Do not deploy or modify production data without explicit approval.

An existing installation needs the [legacy data cutover](docs/migration/legacy-data.md). The importer dry-runs by default and refuses a populated target. Never delete old records or attach a new sign-in to an imported account by email.
