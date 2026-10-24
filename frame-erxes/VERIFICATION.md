# erxes verification — AWS / MongoDB, 2026-10-24

The source plugin targets host revision `d83e2fa8e4be557bce37df0882aeb234bea74d63`.
Frame uses Bun 1.3.14 and an isolated MongoDB 7.0.45 replica set in local checks.
No production tenant, database, secrets or deployment were changed.

Passed locally:

- `bun run erxes:test`: three ticket and installer tests.
- `bun run erxes:build`: source validation and packaging.
- `NX_DAEMON=false bunx nx build frame_ui --skip-nx-cache` in the installed
  erxes host: native build passed, with the shared UI declaration diagnostics
  described above.
- `bun run erxes:test:browser`: actual `Frame.tsx` host component, signed POST
  launch, actual production Frame UI in the iframe, create/edit/save/reload,
  and a fresh new-tab ticket resolving the same persistent identity.
- Native `remoteEntry.js` loaded `./frame` and `./config` in Chromium, with the
  expected Frame component and navigation contract. This checks the built remote
  exports, not a production gateway session.
- MongoDB API tests cover exact origins, strict claims, HMAC verification,
  time bounds, simultaneous replay across instances, transaction rollback,
  email collision rejection, tenant binding, hashed sessions, logout, expiry,
  private resources, and runtime embedding headers.

The browser harness simulates the erxes GraphQL host and permission context.
It exercises real Frame persistence, sessions and UI; it does not demonstrate
real gateway discovery or host permission administration.

Both native commands now pass in the isolated host copy:

```bash
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx build frame_api
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx build frame_ui
```

The isolated host used its local Bun/Nx configuration. Missing Preconstruct/Babel tooling
and the shared API workspace link were prepared in that isolated copy. The
original host and lockfile were not changed during that isolated check. Rspack's required HTML entry is now
included in the shipped UI plugin. The host shared UI build reports existing
declaration portability diagnostics but produces JavaScript; the remote reports
a 4.17 MiB fallback shared-UI chunk warning. Native remote execution in the full
gateway was a separate check, described below.

## Installed local host, October 24

The user subsequently requested installation in `/home/leohunt/erxes`.
Both source plugins are installed there and both native Nx builds pass.
The actual gateway composes Core and Frame successfully and
`/get-frontend-plugins` returns `http://localhost:3019/remoteEntry.js`.
`check-host.ts` verifies anonymous availability returns false, anonymous
launch is denied, and the discovered remote responds successfully.

The host's ordinary mutation wrapper logs returned values when its logs service
is enabled. Frame launch now uses the non-logging wrapper and retains explicit
authenticated-user and `frameStudioOpen` checks. Availability uses the public
wrapper so its documented false response is not intercepted by a login error.

The first actual-host browser attempt reproduced an invalid-hook-call crash.
Nx 20's graph contained no npm packages because it expects `bun.lockb`, while
this host uses Bun's text lockfile. Its federation manifests consequently omitted
React and Apollo. The remote now explicitly declares those shared singletons;
the user also approved the matching change in the host's
`frontend/core-ui/module-federation.config.ts`. No host lockfile was replaced.
The browser regression check renders the actual shell and remote together with
a browser-only identity fixture and rejects mutations; it does not impersonate
a user at the API. The final check passed with zero browser runtime errors.
The native remote export check also passed again after the sharing fix.
The shared UI package still reports upstream declaration diagnostics during
its build, and the host dev server reports an optional `qz-tray`/`lna` warning.
Neither was suppressed or patched as part of Frame.

The persistent local Frame service uses `frame_erxes_local` on the local replica
set, separate files, real Muse configuration, and user systemd services.
See [local launch and restart instructions](../docs/local-erxes.md).

After the user refreshed the fixed host and launched Frame, the actual local
database recorded one erxes identity, two sessions, a deployment binding, and
one personal workspace across the launches. These were real gateway-issued launches, not the
browser fixture. Only counts and reference verification are recorded in
`.frame-data/verification/host-live-launch.json`; no tickets or identity claims
are included in that report.

Remaining external acceptance: non-owner host permission grant/revocation,
configured HTTPS embedding/cookies,
physical mobile audience use, real Atlas/S3/SQS/IAM and provider integration.
No marketplace publication or deployed AWS URL is claimed.

## Automatic studio entry — 2026-10-24

Entering `/frame` now automatically requests one fresh launch ticket and opens
the studio. React StrictMode effect replay does not request another ticket.
Failures retain Retry and Open in new tab; a new tab obtains its own ticket.
The installed host plugin and packaged source are synchronized.

Fresh checks passed:

- `bun run erxes:test`: 3 tests, 22 assertions.
- `bun run erxes:build`: source validation and packaging.
- `bun run erxes:test:browser --mongod /home/leohunt/.local/opt/erxes/mongodb-linux-x86_64-rhel90-7.0.45/bin/mongod`:
  automatic entry under StrictMode, actual iframe exchange and editor,
  edit/save/reload, new-tab identity continuity, automatic relaunch, and failure/retry.
- `node frame-erxes/scripts/check-host-render.mjs`: actual erxes shell and remote
  requested one automatic launch, displayed the intentionally rejected fixture
  request with Retry, and reported no browser runtime errors. This check grants
  no authenticated API access.

Logs are in `.frame-data/verification/auto-launch-*.log`.

The separate host command `bunx tsc --noEmit -p frontend/plugins/frame_ui/tsconfig.app.json`
exited 2 with 15 diagnostics in `frontend/libs/erxes-ui` (charts, exports,
email editor, icons, phone fields, and motion). It reported no diagnostics in
`frame_ui`; this is not a passing host typecheck. Shared host code was not
changed for the automatic-entry request.
