# Frame release verification

Local verification date: **2026-10-24**. This is an implementation and local
acceptance report, not a statement that an AWS production deployment exists.
The complete product contract is in [master.md](../master.md).

## Initial setup update — 2026-10-24

Added `bun run setup` with preview, standalone Clerk and local erxes choices;
masked key entry; exclusive configuration-file creation; and generated next
commands. [The setup guide](setup.md) covers prerequisites, OpenRouter credits
and keys, persistent storage, plugin installation and troubleshooting.

Checks run for this update:

- `bun install --frozen-lockfile`: passed, 328 installs across 398 packages.
- `bun --no-env-file test tests/setup.test.ts`: 7 passed, 0 failed, 47 assertions.
  Includes Bun loading the generated erxes settings, matching launch secrets,
  file permissions, concurrent setup/overwrite protection, unsafe input rejection,
  and mocked read-only OpenRouter checks without credential disclosure.
- `bun run typecheck`: passed. `bun run build`: passed with Vite's existing
  large-chunk advisory; 2,257 modules transformed.
- Interactive terminal checks in temporary checkouts: preview setup, erxes
  defaults, masked fixture key entry, and cancellation without writing files.
- Fresh temporary checkout with its own frozen-lockfile dependency install:
  generated preview configuration started successfully; health/readiness passed;
  Chromium opened the local workspace, created a named blank deck, confirmed it
  through the API, and reloaded the editor with zero browser runtime errors.
- Local guide links resolve; `git diff --check` passed.

No real provider calls, new Clerk account, AWS deployment, or new erxes host
installation were performed for this setup update. The connection-check command
uses only OpenRouter's key endpoint; it does not generate content.

## Delivered application

The repository includes the React workspace and full editor, all ten object
kinds, rich text, themes and editable compositions, brand kits, creation studio,
source inspection, structured AI previews and scoped edits, account preferences,
credit administration, review/comments/presence, sharing and recovery copies,
presenter and audience controls, public editions/Explore, and four export formats.
The 46 theme records and existing renderer/editor were reused from the supplied
local reference source. Story, pitch and lesson templates use the brief's
illustrative content and slide counts.

The reference checkout is `/home/leohunt/frame-vercel`. A direct comparison
confirmed 24 shared-model/design files and 68 frontend files reused unchanged.
`shared/themes.ts`, `shared/featured-themes.ts` and `server/extract-core.ts`
match it exactly. Persistence, hosting, authentication boundaries and affected
client contracts were adapted for this rebuild; the reference remains untouched.

MongoDB replaces the SQL persistence layer. The runtime uses the official driver,
replica-set transactions, explicit index migrations, immutable content manifests
and binary chunks, optimistic revisions, permission guards, durable jobs and
outbox records. S3 uses task credentials, staging uploads and authorized proxy
downloads. SQS has an outbox dispatcher and fenced consumers. Local adapters are
explicit; production configuration rejects them. AWS CDK, containers, migrations,
backup/verification/restore tooling and a CI workflow are included.

Both identity modes use the same application services. Standalone Clerk verifies
tokens and verified primary email; stable provider mappings never link by email.
Erxes has both source plugins, the version-1 HMAC exchange, replay protection,
persistent tenant binding, hashed sessions, iframe readiness and fresh-ticket
new-tab fallback. Administrators are explicit Frame IDs.

## Environment and commands

Bun 1.3.14, Node 22.23.1 for the browser driver and fixture manager, MongoDB 7.0.45 as a real local
single-node replica set, MongoDB driver 6.21.0, Playwright 1.64.1 and its installed
Chromium were used. Tests strip inherited cloud/provider credentials and use
isolated databases. The local installed MongoDB binary was selected with
`--mongod /absolute/path/to/mongod`; operators can use `FRAME_MONGOD` or let the
fixture manager download the pinned binary.

Commands actually executed:

| Command                                                                | Observed result                                                                                                          |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `bun install --frozen-lockfile --ignore-scripts`                       | Passed; 322 installs across 392 packages, no changes.                                                                    |
| `bun run build`                                                        | Passed after typechecking; Vite transformed 2,249 modules. Main bundle approximately 505 kB, with a chunk-size advisory. |
| `bun run test`                                                         | 233 passed, 0 failed; 14,454 assertions across 36 files in 136.03 seconds, including browser recycling and cleanup. |
| Focused repository/API rerun                                           | 45 passed, 0 failed, 302 assertions.                                                                                     |
| `bun run test:browser`                                                 | 54 passed, 0 failed in 7.5 minutes on the final browser-driver implementation. |
| Browser exports and manual journeys after worker changes              | 6 passed, 0 failed.                                                                                                      |
| Auth and creation browser checks after shell changes                   | 7 passed, 0 failed, including mobile theme navigation.                                                                    |
| Rendering capacity, deferral and fencing repository checks            | 10 passed, 0 failed; 61 assertions on a real replica set.                                                                 |
| `bun run test:browser --config e2e/admin.config.ts`                    | 3 passed.                                                                                                                |
| `bun run test:browser --config e2e/agent.config.ts`                    | 3 passed.                                                                                                                |
| `bun run test:browser e2e/slides.visual.spec.ts --update-snapshots`    | 1 passed; seven images refreshed and visually inspected.                                                                 |
| `bun run erxes:test`                                                   | 3 passed.                                                                                                                |
| `bun run erxes:build`                                                  | Source validation and package creation passed.                                                                           |
| Native `nx build frame_api` / `nx build frame_ui`                      | Both passed in the isolated supported host checkout.                                                                     |
| `bun frame-erxes/scripts/check-native-remote.ts HOST_REMOTE_DIRECTORY` | Chromium loaded both real federation exports and checked their contract.                                                 |
| `bun run erxes:test:browser`                                           | Passed against the production frontend; iframe edit/reload and fresh-ticket new-tab launch.                              |
| `bun run infra:check`                                                  | CDK synthesized and checked both fixture stacks; no AWS resources deployed.                                              |
| `bun run check:ai --transport --once`                                 | Five real Muse Contributor checks passed: outline, editable slides, scoped edit, theme generation and refinement.         |
| `bun scripts/check-live-studio.ts`                                   | Real Muse research → outline → native slides → visual review → save → reload passed: three slides, 46 editable objects. |
| `podman build --target api -t localhost/frame:verified .`             | Passed, including the production TypeScript/Vite build and pinned Chromium installation. |
| `bun scripts/check-image.ts localhost/frame:verified`                | Passed all four real export formats with networking disabled, running as UID 1000. |

The first broad runs found outdated reference assertions and several real issues.
Corrections included stable Clerk mapping tests, source evidence quotations,
client handling of a null publication, persistent creation navigation, sample
names/theme counts, explicit development-file denial, and local worker polling.
Diagnostic runs were interrupted after identifying failures. Their partial counts
are not treated as a passing release suite.

## What the tests demonstrate

Database tests exercise competing revisions, last-credit finishes, unlimited to
finite credit adjustments, permission revocation during staging, single-use
launches across two application instances, duplicate uploads and queue deliveries,
lease loss, cancellation, resumed stages, and outbox recovery. A reconstructed
195-slide document exceeds MongoDB's single-document BSON limit without exceeding
Frame's assembled bound. Modified chunks fail integrity checks. Migration preflight
rejects duplicate identities before unique indexes; changed checksums are rejected.

Backup tests create an actual logical backup with object manifests, reject modified
hashes and nonempty restore destinations, restore into an isolated database and
storage namespace, then read and edit the restored documents. This is a local
restore drill; managed Atlas recovery and production RPO/RTO are not measured.

Browser checks use actual application forms, canvas gestures, rich text, save and
reload, keyboard/touch emulation, undo/redo, offline recovery, sharing and conflicts,
creation previews, theme and brand editing, live questions and publication policies.
Axe checks cover normal, error and dialog states without disabling contrast rules.
They do not substitute for a screen-reader or physical-device review.

Export tests create and inspect actual PDF, PNG ZIP, offline HTML and image-based
PPTX files using the shared renderer. PowerPoint elements remain slide images.
Public projections remove notes, answer keys, source evidence and private theme
instructions. Hosted downloads check current access and publication revocation.
External images require bounded public HTTPS retrieval with DNS address pinning;
private, metadata and mapped-loopback addresses are rejected.

Visual inspection includes title/process, chart/table, rich text/diagram, image/
glass, question and phone viewer screenshots. The current fixture banner shifts
the stage crop by one pixel from the reference. Updated baselines retain the
actual renderer and fixture labeling; they do not hide layout changes with a
broader pixel threshold.

## Deployment and host gates

No AWS account, region, domain, Atlas project, Clerk instance,
production erxes tenant or alert recipient was selected or changed. These remain
external release gates:

- Deploy the CDK resources, build/push the container image, run migrations and
  test real Atlas, S3 versioned uploads, IAM, SQS duplicates/recovery and task replacement.
- Exercise real Clerk verification/reset/social/account controls and provider
  cancellation, research citations and visual review on HTTPS staging.
- Verify gateway discovery and federation in the running erxes host, including
  real authenticated permission grant/denial. Both native project builds pass.
- Check HTTPS iframe cookies and new-tab fallback, a physical phone joining by
  QR, screen-reader behavior, and production backup/restore objectives.

The supported erxes host revision is
`d83e2fa8e4be557bce37df0882aeb234bea74d63`. Both `nx build frame_api` and
`nx build frame_ui` passed in `/tmp/frame-erxes-host`, an isolated copy. The
original host and lockfile were not modified. The supplied dependency tree needed
Preconstruct, Babel module resolver/preset, and a link to the built shared API
package. Those were prepared only in the isolated copy using Bun. The plugin UI
now includes the HTML entry required by the host's Rspack configuration.

The host shared UI build emits existing declaration-portability diagnostics; its
build script produces JavaScript successfully. The remote build reports a 4.17 MiB
fallback shared-UI chunk advisory. These are recorded limitations, not evidence of
runtime gateway or federation acceptance. The passing browser harness mounts the
real plugin component against a simulated GraphQL host and the real production
Frame frontend/backend.

Container construction is checked separately from application builds. The initial
Bun-hosted Playwright browser installer stalled on a partial download. The image
now uses pinned Node 22.23.1 for that installer and browser execution while Bun
1.3.14 remains the package manager and application/worker runtime. The image built and passed
the network-disabled export check as UID 1000. Its local image ID is
`ebd11942b35368f6b713c4eb5f7cd6fac4f0c2866ea5272ff6295068f221d493`
(1,947,068,599 bytes). This is a local image identity, not an ECR deployment digest.
The two-slide check produced a 55,895-byte PDF, 57,370-byte PNG ZIP,
862,635-byte standalone HTML file and 107,064-byte image-based PPTX.

Unreferenced content and physical objects are deliberately retained until an
exclusive, reference-aware sweep is implemented. Logical deletion revokes access
and schedules durable cleanup. This avoids racing a content commit with unsafe
age-only deletion, but requires monitoring storage growth.

## Capacity measurements

Separate reproducible workloads are provided in `benchmarks/`. They record a
100-slide document with ten elements per slide, API save timings, mounted
thumbnails and pointer-to-frame latency, plus 200 participants over three polling
waves. On an Intel i5-1240P (16 logical CPUs), 15 GiB RAM, Fedora 44, Bun 1.3.14,
MongoDB 7.0.45 and Chromium 156.0.8078.4:

- Twenty saves of a 100-slide / 1,000-element document: p95 **596.5 ms**.
- Two hundred participants across three polling waves (600 reads): p95 **615.1 ms**.
- The 100-slide editor mounted nine thumbnails; 91 pointer samples at
  1440 × 1000 measured p95 **1.1 ms** to the next animation frame.

These are local service and browser measurements, excluding WAN and polling
interval delays. Pointer-to-animation-frame timing is not a full paint measurement.
A deliberately contended earlier run exceeded the one-second save target; the
reported quiet-environment measurements do not establish AWS capacity.

## Live AI verification

The user supplied an OpenRouter key, stored only in the ignored server `.env`.
The catalog confirmed `meta/muse-spark-1.3-contributor` at $0.10/M input and
$0.20/M output. Five direct structured checks passed with a reported combined
cost of $0.003571174. Price ceilings, Meta-only routing, returned-model and usage
checks remained enabled; no model fallback was used. An earlier attempt completed
its outline but encountered connection failures on subsequent requests. Its
incomplete requests are not included in that successful-run cost total.

The optional `--live-ai` loopback harness labels real usage and keeps credentials
out of its frontend process. Deterministic tests still remove all provider keys.

The full studio journey also passed with the real provider. It retrieved three
web sources, generated and visually reviewed three slides, saved 46 native
editable objects, and reloaded the persisted deck. The nine completed provider
calls reported $0.016175544, including optional web research and visual review.
The result JSON is retained locally at `.frame-data/integration/muse-studio.json`;
it is a private verification artifact, excluded from Git and container builds.

One later browser rerun was interrupted after a local `.env` edit reloaded an
accessibility-check page. Vite test environments now disable local env-file
loading; the affected full creation journey passed afterward. A host restart
also interrupted diagnostic runs and removed their temporary files. Neither
interrupted run is reported as a successful suite.

One broad browser rerun had 53 passes and one export deadline failure. A later
run exposed the same problem during AI fitting. A direct rendering loop then
reproduced it at launch 11: Chromium reported that its control pipe disconnected
under Bun 1.3.14. The observation matches the runtime/version in
[Bun issue 34785](https://github.com/oven-sh/bun/issues/34785).
The original durable job timed out and succeeded on attempt two, preserving its
inputs. The final implementation runs Playwright browser execution in a bounded
Node subprocess, with the same shared HTML, credential-free environment,
network restrictions and private scratch cleanup. A 60-export repetition passed;
permanent regression tests cover 24 browser recycles and cancellation cleanup.
Additional persisted progress distinguishes preparing HTML, starting Chromium
and loading fonts/media. These diagnostic failures remain recorded rather than
being counted as passing acceptance runs.

The final local preview runs at `http://127.0.0.1:5192` with an explicit test
identity and real configured Muse requests. The earlier preview was retained
to preserve its work. Preview databases are temporary. A verified local backup
was saved at `.frame-data/backups/preview-2026-10-24T04-54-57.775Z` containing
three decks and three creation drafts at that snapshot boundary; later edits
are not included. These private local artifacts are excluded from Git and images.


## Follow-up: installed local erxes host

At the user's request, Frame is now installed in `/home/leohunt/erxes` as
`frame_api` and `frame_ui`, with persistent local Frame storage and real Muse
configuration. This supersedes the earlier statement that the original host
was untouched. Its lockfile and prior unrelated source changes were preserved.
The user explicitly approved a small core UI federation configuration fix for
Nx 20's inability to discover packages from Bun's text lockfile.

Both native plugin builds, the native remote check, actual gateway discovery,
anonymous access checks, and actual-host browser rendering passed. The latter
uses a browser-only identity fixture and does not claim authenticated launch.
The reproduced duplicate-React crash is covered by that regression check.
See `frame-erxes/VERIFICATION.md` and `docs/local-erxes.md` for details.

The user's subsequent real host launch also completed the signed exchange:
the dedicated local database recorded the bound deployment, identity, session,
and personal workspace. `host-live-launch.json` records counts and reference
checks without tickets or personal identity claims. This does not substitute
for HTTPS deployment or non-owner permission administration checks.

Logs: `host-frame-api-final.log`, `host-frame-ui-final.log`,
`host-native-remote-final.log`, `host-api-check.log`, and
`host-render-regression-final.log` in `.frame-data/verification/`.
