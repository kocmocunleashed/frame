# Vercel version comparison

Compared the supplied standalone checkout with `/home/leohunt/frame-vercel` on 2026-11-05. The reference is at Git revision `f162bd8` with local changes; those local changes were included in the read-only comparison. Private environment files were not inspected. The standalone checkout has no Git metadata, so this is a working-tree comparison rather than a commit-to-commit diff.

The audit compared source inventories, frontend/shared implementations, route registrations, account flows, AI workflows, storage, exports, workers and deployment entry points. Every frontend and shared source file from the reference has a counterpart here. The reference delegates its active account UI to Clerk; it also retains a Better Auth implementation with optional Google/GitHub, email verification/recovery, explicit linking, encrypted OAuth tokens and database rate limits. Those account capabilities were the concrete gap in the standalone implementation.

| Area                                             | Standalone result                                                                                                                            |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Registration, login/logout, profile and password | Better Auth owns users and sessions in PostgreSQL; existing profile dialog retained                                                          |
| Google/GitHub sign-in                            | Added optional server-configured providers using Better Auth's existing integrations                                                         |
| Email verification and recovery                  | Added optional transactional email, verification/resend UI, forgot/reset forms, single-use recovery and session revocation                   |
| Connected accounts                               | Added explicit linking/unlinking in account settings; same-email implicit linking is disabled and the final sign-in method cannot be removed |
| Active sessions                                  | Added current/other session listing, individual revocation and sign-out of other sessions                                                    |
| Auth boundary                                    | Native Better Auth responses retained; trusted IP normalization, origin checks and database rate limits applied                              |
| Workspaces                                       | Standalone creation, switching, membership and server-side permissions already implemented                                                   |
| Editor, creation and AI                          | Existing canvas, document operations, templates/themes, generation/editing, source flows and progressive previews retained                   |
| Rendering and presentation                       | Existing slide renderer, rehearsal, presenter and audience sessions retained                                                                 |
| Sharing and exports                              | Existing grants, immutable publication editions, downloads and worker export pipeline retained                                               |
| Uploads                                          | Both `/api/uploads/prepare` and `/api/uploads/token` are registered; native local/S3 adapters replace Vercel Blob transport                  |

The standalone tree already has revision/conflict handling and recovery improvements absent from the reference. They were retained. Its existing colors, layout and compact account menu also differ from the older Vercel tree; this comparison does not roll back those existing choices. This account work changes no CSS and introduces no design system.

The reference's missing server files are identity adapters (`clerk-migration.ts`, `erxes.ts`, `erxes-config.ts`) and Vercel runtime glue (`runtime.ts`). They are intentionally replaced by standalone identity and the persistent Bun API/worker. Vercel Blob, Queue and serverless function wrappers are hosting implementations, not missing presentation features. Local/S3 storage and local/SQS jobs provide the corresponding standalone behavior.

Physical garbage collection differs: the standalone implementation revokes access and cleans logical records while retaining unreferenced immutable bytes. It does not copy the reference's offline physical-deletion command. Any future storage purge needs its own retention/cutover review.

This work implements the account flows identified above; it does not promise every optional Clerk product capability. The checked-in reference does not establish that MFA, enterprise SSO, billing, or additional Clerk instance features were enabled. No Clerk SDK, account migration to Clerk, or hosted identity dependency was restored.

See [account configuration](../authentication.md) for optional credentials and [the verification record](verification.md) for executed checks and external validation limits.
