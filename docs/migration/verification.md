# Phase 1 verification record

Verified on 2026-11-05 using Bun 1.3.14 and Node 22.23.1. The supplied directory initially had no Git metadata. The repository history was restored from `kocmocunleashed/frame` before publishing the standalone migration; existing working files were retained.

## Checks performed

| Check                                      | Result                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Frozen Bun installation                    | Passed; lockfile required no changes                                                                                           |
| `bun run typecheck`                        | Passed                                                                                                                         |
| `bun run lint`                             | Passed; this repository uses a Prettier formatting check, with TypeScript checking separately                                  |
| `bun run build`                            | Passed; Vite reported a nonblocking chunk-size warning                                                                         |
| `bun run test`                             | 231 passed, 0 failed across 38 files                                                                                           |
| `bun run test:browser`                     | 53 passed, 0 failed on the final stable run                                                                                    |
| Standalone authentication browser suite    | 1 passed: real registration, workspace creation, edit/save/reload, presentation, logout/login                                  |
| Account security browser suite             | 1 passed: email verification, connected-method controls, session revocation, password change and recovery                      |
| Administrator browser suite                | 3 passed                                                                                                                       |
| Account and agent settings browser suite   | 3 passed                                                                                                                       |
| `bun run infra:check`                      | Passed; regional/edge CDK synthesis and infrastructure assertions                                                              |
| `bun run db:generate` after implementation | No schema changes; migrations match the Drizzle schema                                                                         |
| Neon migrations                            | Four checked-in migrations applied successfully to the isolated development database                                           |
| `bun run check:standalone`                 | Passed; 1,585 API/worker runtime modules, including Vercel entry points, audited without obsolete identity or database imports |
| Frontend credential scan                   | No configured database URL, auth secret or backup key in any of 74 build artifacts                                             |
| UI preservation                            | All seven existing CSS files are byte-for-byte unchanged; editor, slide renderer and presentation components retained          |

The integration suites cover revision races, authorization and revocation, immutable large documents, idempotent jobs, worker leases, generation and resume, credits, source extraction, uploads, publishing, live responses, exports, backup/restore, and dry-run/import rollback. AI tests use explicit test providers or intercepted provider responses; they do not prove a paid live inference call.

A final clean frozen-lockfile install removed stale packages left by the baseline installation. Startup and the runtime audit were then checked again. Better Auth session-list responses were also verified to bypass Frame pagination with a regression test that failed before the boundary fix.

Earlier development runs exposed JSONB key-order hashing, nullable general comments, and obsolete fixture assertions. These were corrected and the full unit and browser suites rerun. A publishing browser timeout during active source edits passed on an isolated rerun and again in the final full suite.

## Vercel account parity follow-up

The [working-tree comparison](vercel-parity.md) identified optional social sign-in, verification/recovery email, explicit account linking and active-session controls as missing account flows. These now use Better Auth with the existing PostgreSQL tables and interface. No schema migration or CSS change was needed.

The focused native-auth suite passed 9 tests across three files. It exercises real PostgreSQL persistence, verification/reset tokens, reset replay rejection and session revocation, forged OAuth state, untrusted redirects, explicit linking, encrypted OAuth tokens, refusal to remove the last sign-in method or another user's account, and rate-limit IP normalization. External GitHub/email transports are intercepted only in tests. Google provider configuration is checked; a live Google consent flow was not exercised.

The new account-security browser suite passed verification, login, connected-provider controls, sign-out of other sessions, password change, recovery and return login through the real account APIs. Accessibility checks passed for the tested account states. This test first exposed the session-loading screen unmounting the verification form; the screen now preserves that state during session refresh. The standalone browser check also caught insufficient space between the signup button and sign-in link; the existing `auth-switch` wrapper restores that spacing without changing CSS.

CDK checks also verify optional provider/email secret injection into API tasks only and disabled defaults. CI runs the new browser suite. See [account configuration](../authentication.md) for callback URLs, sender requirements and private environment variables.

After the account changes, the running Neon-backed application returned HTTP 200 with `ok: true` from health and readiness. Public account configuration correctly reported no enabled social providers or email delivery because their optional credentials are absent. A scan of all 74 final build artifacts found none of the configured database, auth, backup or provider credentials.

## Live Neon verification

Neon MCP was used to create branch `frame-phase1-development` (`br-purple-pine-b7kgwgb0`) in project `vercel-frame`, then a separate `frame_phase1` database on that branch. Its copied parent database already contained a different PostgreSQL schema, which was left intact. The production branch was not modified.

The new database has 43 application tables plus the Drizzle migration ledger and 76 foreign keys. Credentials were transferred privately and saved in ignored `.env` configuration with mode `0600`; no values were printed or placed in command arguments.

Through the running application and real Neon driver, verified:

- Readiness with database, migration ledger, local private storage and local queue ready.
- Better Auth registration, persistent signed-cookie authentication and workspace membership.
- A new workspace and presentation, an editable text insertion, and persistence on a subsequent read.
- A real image upload and authorized asset response.
- An unlisted publication and anonymous public projection.
- Real background-worker HTML and PDF exports, followed by successful downloads.
- The existing workspace and editor in a browser using the real Neon session.

Neon uses its WebSocket driver because direct TCP access from the verification machine timed out. Frame's own small pool uses the direct Neon endpoint for transaction and migration-lock support. Local integration tests used PostgreSQL 17 in an isolated container, with separate schemas per test run.

Better Auth's upstream package manifest includes an unused Mongo adapter package and an optional MongoDB peer declaration. Frame imports `better-auth/minimal` and the Drizzle adapter. The actual MongoDB driver is absent, and neither the unused adapter nor any MongoDB code appears in the API/worker import graphs. No package substitution or fake adapter was introduced to hide this upstream metadata.

## Vercel release preparation

The existing `vercel-frame` project still owns `frame.leoh.site`. Vercel adapters now provide private Blob storage, signed Queue consumption, protected cron recovery, and packaged serverless Chromium. Existing ECS/local adapters remain available. The release uses a separate Neon branch, `frame-standalone-production`, and database `frame_phase1_release_20261105`; the former production database is retained.

A read-only PostgreSQL export preserved 7 users and workspaces, 31 presentation heads, 257 revisions, 290 snapshots, 9 assets, 7 sources, 30 creation drafts and 272 job records. A complete dry-run passed, then the same archive was imported transactionally. Two usable password hashes were preserved. Five identity records without password hashes remain reserved for explicit administrator provisioning; signing up with a matching email cannot claim them. Existing Blob object keys were retained. Transient sessions and upload intents remain in the private source archive, and pending legacy work requires deliberate review/resume after cutover.

Checksums across all 28 preserved source tables matched the private export before staging. The release test run passed 231 tests. The standalone and account-security browser suites passed, along with six export/foundation browser checks. Live private Blob metadata and byte ranges passed, and the packaged serverless Chromium produced a valid PDF through the existing Node driver. Deployment inventory checks excluded local environment files and private storage. The release is staged without moving the custom domain until hosted checks pass.

## Remaining external validation

- No live Google/GitHub application credentials or verified email sender were configured. Actual provider consent and inbox delivery remain external checks; the optional controls stay hidden until their server credentials are supplied.
- No live AI provider key was configured. Paid generation and live-provider editing were not exercised. The existing provider contracts, generation, retries/resume, preview/application and editor integration passed automated tests.
- No source dataset or source database connection was supplied. The read-only legacy source exporter was not executed against a real installation. The importer was tested with relational data and immutable snapshots, including validation failure rollback and refusal of populated targets. A real cutover still needs the [legacy data runbook](legacy-data.md).
- Live production S3/SQS behavior was not exercised. Local storage/queue behavior and CDK configuration were verified. No production deployment, DNS change, production migration or source-data deletion was performed.

Phase 1 implementation and the checks above are complete. Final acceptance of live OAuth/email, AI and a real existing-data cutover remains dependent on those external inputs.
