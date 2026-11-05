# Standalone migration audit and plan

The supplied checkout has no `.git` directory. The audit inventoried the repository and inspected its 264 TypeScript, TSX, and JavaScript source files, package manifests, environment example, CI workflow, container configuration, and deployment stack before implementation. No source database or production deployment was changed.

## Existing architecture

| Area              | Implementation before migration                                                                                            | Migration boundary                                                                            |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Frontend          | React 19, Vite, TipTap, existing CSS and slide renderer                                                                    | Keep components, styles, document operations, and routes                                      |
| API               | Bun and Hono, Zod request contracts                                                                                        | Retain endpoints and service interfaces                                                       |
| Identity          | Clerk standalone identities or signed Erxes launch tickets                                                                 | Better Auth email/password, server-owned accounts and sessions                                |
| Persistence       | `server/database.ts`, MongoDB driver, collection indexes, snapshot transactions                                            | Drizzle repositories and PostgreSQL migrations                                                |
| Documents         | Versioned Zod document; deck head, immutable snapshot metadata, ordered slide references, 80 revisions                     | Relational presentation heads, snapshots, slides, revisions; JSONB for flexible slide content |
| Workspaces        | Users with a default workspace, membership roles, presentation grants                                                      | Preserve IDs and grants; add management and active workspace selection                        |
| AI                | OpenRouter, OpenAI and Token Router; source extraction, drafts, child workflows, edit proposals, fitting and visual review | Keep providers and workflows; persist payloads/results in JSONB                               |
| Jobs              | Durable job rows, quotas, leases, fencing tokens, transactional outbox, local/SQS transports                               | SQL row locks, serializable transactions, existing fencing rules                              |
| Storage           | Explicit local filesystem adapter or private S3, staged uploads, checksum validation                                       | Keep bytes and storage keys; relational metadata                                              |
| Publishing        | Private/unlisted/public immutable editions, asset allowlists and prepared downloads                                        | Preserve editions, snapshots and permission checks                                            |
| Presentation mode | Local rehearsal and server-hosted live sessions, participants and votes                                                    | Retain rendering and live APIs                                                                |
| Exports           | Chromium rendering, PDF, PNG, PPTX, offline HTML/JSON, immutable output storage                                            | Retain renderers, worker pipeline and downloads                                               |
| Operations        | Portable encrypted BSON backup, TTL cleanup, health/readiness, ECS/CloudFront/S3/SQS/CDK                                   | Transactional PostgreSQL JSON backups, explicit expiry cleanup, updated secret injection      |
| Tests/setup       | MongoDB replica-set fixtures, Clerk/Erxes auth tests, setup wizard, Erxes host tests                                       | Real PostgreSQL fixture, Better Auth tests, existing product browser tests                    |

Erxes dependencies were confined to `frame-erxes/`, `server/erxes*.ts`, identity resolution, provider discovery, host embedding headers, auth/account UI, Vite proxy configuration, environment/setup scripts, CI, and deployment/docs. The distribution depended on host GraphQL permissions, federation, host UI libraries and signed launch tickets. Those paths have been removed. Historical identity mappings remain private migration records and do not grant sign-in.

MongoDB affected every persisted resource through the shared database layer, direct snapshot reads/writes in `Store`, one live-response aggregation, backups, indexes/migrations, test launchers, Docker Compose, environment/setup scripts, and deployment/docs. Business services now use database-independent predicates translated into parameterized Drizzle queries. There is no document database client or query operator in the application runtime.

## Implementation order

1. Define relational schemas and checked-in Drizzle migrations. Keep ownership, membership, revision, edition, lease, timestamps and indexed lookup fields in columns. Store each immutable slide separately; use JSONB for its flexible contents.
2. Replace persistence behind the existing store and service interfaces. Keep optimistic revisions and serializable transactions; claim jobs with row locks. Canonicalize JSON hashes and idempotency comparisons because JSONB does not preserve object key order.
3. Remove the host plugin, signed launch tickets, external identity adapters, configuration and embedding assumptions.
4. Add Better Auth sessions, registration, login/logout, password changes and profiles. Add workspace creation, switching and member management. Enforce membership and document grants on the server, including after revocation.
5. Replace the test harness and backups. Provide a read-only source exporter, transactional dry-run/import and explicit account provisioning. Preserve source records and assets until a reviewed cutover succeeds.
6. Update environment examples, setup, Docker, CDK, CI and operations documentation. Run type checking, linting, production build, integration tests and browser acceptance tests, including a real-auth browser flow and an isolated Neon check.

## Data cutover

See [the cutover runbook](legacy-data.md). Nothing imports or resets an existing database on startup. `db:migrate` only applies checked-in schema migrations; it is separate from importing user data. Production migration and deployment need operator approval. The legacy exporter is a one-time tool run with the source installation's shell; it is not a runtime dependency.

Integration references used during implementation: [Better Auth with Hono](https://better-auth.com/docs/integrations/hono), [Better Auth's Drizzle adapter](https://better-auth.com/docs/adapters/drizzle), and [Neon's transaction-capable WebSocket driver](https://neon.com/docs/serverless/serverless-driver).
