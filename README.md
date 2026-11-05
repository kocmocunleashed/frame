# Frame

Frame is a standalone presentation studio with an editable slide canvas, themes and templates, AI generation and editing, private sharing, live sessions, and presentation exports. The existing React interface and slide document format are retained.

Frame owns its users, password authentication, sessions, workspaces, memberships, presentations, and application logic. PostgreSQL is the primary database; Neon connections use the Neon WebSocket driver with Drizzle ORM. Drizzle Kit manages versioned SQL migrations. Local PostgreSQL is supported for development and tests.

## Run locally

Use Bun 1.3.14 and Node 22. Node runs the existing Chromium export driver.

```bash
bun install --frozen-lockfile
bunx playwright install chromium
bun run setup
```

Choose standalone mode and provide a Neon development connection through the wizard's hidden input, or select local PostgreSQL with Docker Compose. The wizard creates a private `.env` and never overwrites an existing one. Follow its generated commands:

```bash
# Only when using the local PostgreSQL option:
docker compose up -d --wait
bun run db:migrate
bun run dev
```

Open `http://127.0.0.1:5174` and create an account. The dev launcher starts the API, Vite and background worker. AI requires separately configured provider credentials; manual editing and exports remain available without them. See [setup](docs/setup.md) for prerequisites, private configuration and startup verification.

`bun run dev:fixture` starts an explicitly labeled disposable development workspace with a real PostgreSQL database and test identity/AI. It requires Docker or Podman. Its data is deleted when stopped. It is not the standalone authentication path.

## Product and services

- Presentation editor: text, rich content, shapes, images/video, groups, data objects, motion, interactions, notes, undo/redo, autosave and local recovery.
- Themes, brand kits, templates, saved compositions, and AI theme creation use the existing document schemas and rendering components.
- AI creation includes sources, reviewed outlines, progressive generation, preview, retry/resume and explicit application. AI edits pass through the same document operations as manual edits.
- Workspace owners can create workspaces and manage registered members as editors or viewers. The existing workspace switch opens management. Presentation sharing also supports direct grants and comments.
- Accounts use Better Auth with password changes, session management, optional Google/GitHub sign-in, explicit account linking, and optional verification/recovery email. [Configure account features](docs/authentication.md) on the server.
- Publishing retains immutable editions, private/unlisted/public access and download permissions. Local rehearsal, presenter view, and audience sessions use the existing renderers.
- PDF, PNG, PowerPoint, offline HTML and JSON exports run through the existing worker pipeline. Assets use a private local directory in development or S3 in production.

## Verify changes

```bash
bun run typecheck
bun run lint
bun run test
bun run test:browser
bun run test:browser --config e2e/standalone.config.ts
bun run test:browser --config e2e/account-security.config.ts
bun run test:browser --config e2e/admin.config.ts
bun run test:browser --config e2e/agent.config.ts
bun run build
bun run infra:check
```

Tests start disposable PostgreSQL through Docker/Podman, or use an explicitly supplied `FRAME_TEST_DATABASE_URL` whose database name begins `frame_test`. Each run gets isolated schemas, removed at shutdown. They never load the developer's `.env` or provider keys. Existing AI tests use explicit test providers; live paid-provider verification requires credentials and is separate.

## Database and deployment

```bash
bun run db:generate
bun run db:migrate
```

Review generated SQL before applying it. The migrator takes a database advisory lock and checks applied migration hashes. Runtime startup does not import old data or apply migrations. Use a Neon development branch for verification before an approved production rollout.

- [Environment and local setup](docs/setup.md)
- [API contracts](docs/api.md)
- [Architecture audit and migration plan](docs/migration/phase1.md)
- [Vercel version comparison](docs/migration/vercel-parity.md)
- [Legacy data cutover](docs/migration/legacy-data.md)
- [Deployment](docs/deployment.md)
- [Operations and recovery](docs/operations.md)
- [Agent setup runbook](setup.md)
