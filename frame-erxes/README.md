# Frame for erxes — AWS / MongoDB edition

Adds **Frame** to erxes navigation and opens the complete presentation studio
inside it. Includes an authenticated new-tab option when embedded cookies are
blocked. Frame provides its editor, AI generation, private media, collaboration,
live audience sessions, exports and presentation credits through a separate service.
It runs locally for development, with AWS and MongoDB Atlas deployment definitions
included in the parent repository.

This is an erxes **source plugin**, installed as `frame_api` and `frame_ui` in
an erxes checkout. It is not a browser extension or a marketplace listing.
Frame itself remains a separately deployed service. The small `frame_api`
adapter runs beside erxes, with access to its gateway/shared libraries/Redis.
It remains a host service; Frame runs separately on ECS.

## Preview locally

For the installed host on this workstation, see
[the persistent local erxes setup](../docs/local-erxes.md). The fixture preview
below is separate from that host.

From the Frame repository:

```sh
bun run erxes:preview
```

Open http://127.0.0.1:41359; the studio opens automatically. This uses the actual
plugin component, Frame editor, a real isolated MongoDB replica set and signed launch
tickets. The erxes shell and permission decision are fixtures. AI also uses a
fixture; no paid requests run. Preview data is ephemeral and removed on shutdown.
Ports 41358 and 41359 must be free. Override them with
`FRAME_ERXES_TEST_FRAME_PORT` and `FRAME_ERXES_TEST_HOST_PORT` if necessary.
Stop with Ctrl+C.

## Configure a dedicated Frame deployment

Keep the MongoDB, private S3, SQS, AI and Chromium settings from the
parent README. Use one Frame deployment/database/storage namespace per erxes
tenant. Start with a fresh MongoDB database and private S3 namespace; existing
Clerk accounts are not automatically migrated or linked by email.

Set these **server-only** environment variables on the Frame deployment:

```dotenv
APP_ORIGIN=https://slides.example.org
FRAME_ERXES_ORIGIN=https://work.example.org
FRAME_ERXES_TENANT=school
FRAME_ERXES_SECRET=<random-secret-of-at-least-32-bytes>
```

Generate the secret locally with:

```sh
bun -e 'console.log(require("node:crypto").randomBytes(32).toString("hex"))'
```

Never put the secret in a `VITE_*` variable, client code, URL, or source control.
Origins must be exact HTTPS origins without a path or trailing slash. HTTP
loopback origins are accepted for local development only.

Apply migrations with the dedicated database configured:

```sh
bun run db:migrate
bun run build
```

Deploy through the AWS release process in [the deployment runbook](../docs/deployment.md).
The MongoDB index migration provisions identity, ticket, session and deployment
binding collections. Builds do not migrate production databases.
The first successful launch binds the database to the configured workspace.

When these variables are absent, Frame uses Clerk as before. When present,
Frame uses erxes exclusively and the browser does not mount ClerkProvider.
The mode is read from `/api/auth/provider`, so an erxes deployment needs no
Clerk publishable key. All protected APIs, private publication downloads,
media and credits use the same session resolver.

## Host compatibility

Integration targets erxes commit `d83e2fa8e4be557bce37df0882aeb234bea74d63`.
Use that host's compatible shared dependencies and native Nx/Rspack commands.
The source package does not promise compatibility with every older host.
See [VERIFICATION.md](VERIFICATION.md) for native-build and real-host status.

For the supported Nx 20 host using Bun's text lockfile, include the host runtime
sharing fix in [patches/core-ui-singletons.patch](patches/core-ui-singletons.patch).
It declares React, React DOM, and Apollo as shared singletons so Frame uses the
host's React tree and Apollo client. From the erxes checkout, review and apply:

```sh
git apply --check /absolute/path/to/frame/frame-erxes/patches/core-ui-singletons.patch
git apply /absolute/path/to/frame/frame-erxes/patches/core-ui-singletons.patch
```

Then rebuild/restart `core-ui` along with the remote. Skip this patch when the
host already has these exact shared declarations. If the check fails against a
different host revision, reconcile its federation configuration before applying
changes. The plugin installer does not modify host core files automatically.

## Install the erxes adapter

From the Frame repository:

```sh
bun run erxes:test
bun run erxes:build
bun run erxes:install /absolute/path/to/erxes
```

The installer checks the host layout and copies only
`backend/plugins/frame_api` and `frontend/plugins/frame_ui`. It refuses to
overwrite existing plugins. If an older Frame adapter is already installed,
review and merge these directories manually.

Build the projects using the host's installed dependencies:

```sh
cd /absolute/path/to/erxes
bunx nx build frame_api
bunx nx build frame_ui
```

The upstream erxes monorepo uses pnpm-specific workspace aliases. This package
uses Bun, but does not convert the host dependency layout or replace its
lockfile. `erxes:build` checks and packages the plugin **sources**; the native
Nx/Rspack builds above are required to produce the executable API and remote.

Add `frame` to the erxes host's existing `ENABLED_PLUGINS`. On the **erxes
frame_api service**, set `FRAME_ERXES_TENANTS` to a JSON object like this:

```json
{
  "school": {
    "frameOrigin": "https://slides.example.org",
    "erxesOrigin": "https://work.example.org",
    "secret": "<same-secret-as-the-Frame-deployment>"
  }
}
```

The key must equal the authenticated erxes context's `subdomain`; it is not a
label chosen by the browser. Assign **Frame User** (`frame:user`) or grant
`frameStudioOpen` to eligible erxes users. Keep the adapter behind the trusted
erxes gateway/private network; it relies on erxes authentication and permissions.

API port defaults to 3319 (`FRAME_ERXES_API_PORT` overrides it); UI dev port is
3019. Start the adapter using the same service discovery settings as other
plugins, and serve the generated UI assets from your static host.
On current erxes hosts supporting custom remotes, configure `UI_ENTRY_URL` on
the plugin API to the complete public `frame_ui/remoteEntry.js` URL. Confirm
`/get-frontend-plugins` returns that URL before testing navigation. Older hosts
may require their standard custom-plugin asset routing; this package does not
patch erxes core or publish assets to erxes' own CDN.

## Embedding and sign-in

Use HTTPS sibling subdomains such as `work.example.org` and
`slides.example.org` for embedded sign-in. Unrelated Frame and erxes domains are cross-site; use **Open in new tab** if the browser
blocks cookies. Frame sets a host-only, HttpOnly, Secure, SameSite=Lax cookie.

The adapter issues a 60-second signed ticket using the authenticated erxes
user ID. The browser POSTs it to `/integrations/erxes/launch`; it is never put
in a URL. A MongoDB transaction atomically consumes the ticket and creates a one-hour
session. Identity is mapped by tenant and immutable erxes user ID, not email.
Changing the configured tenant or issuer cannot reassign that database.

CloudFront forwards exchanges and uncached SPA HTML to Hono on ECS.
Hono applies the runtime `frame-ancestors` policy. Fingerprinted assets are
served from private S3 through CloudFront. If erxes has a CSP, allow the Frame origin in `frame-src` and
`form-action`. Do not add conflicting X-Frame-Options/CSP headers upstream.

Frame document permissions and credit limits still apply. Each new erxes user
gets an empty personal workspace. erxes logout or permission removal prevents
new launches; already-issued Frame sessions expire within one hour. Frame
sign-out revokes its session immediately. There is no automatic account,
team, role, or existing deck migration.

## Verify

```sh
bun run test
bun run build
bun run erxes:test
bun run erxes:build
bun run erxes:test:browser
```

The browser check needs Chromium installed for Playwright. It tests the real
plugin component and Frame app with a simulated host: embedded launch,
automatic launch once under React StrictMode, create/edit/save/reload,
new-tab launch with the same identity, automatic relaunch, and failed-launch retry.

Before enabling a real workspace, also check actual erxes gateway login,
permissions, native remote loading, production HTTPS cookies, uploads, AI,
exports, sharing and audience sessions. See [VERIFICATION.md](VERIFICATION.md)
for what was actually executed. No deployment or marketplace publication is
performed by these scripts.

For a running local host, additional checks are available:

```sh
bun --no-env-file frame-erxes/scripts/check-host.ts http://localhost:4000
node frame-erxes/scripts/check-host-render.mjs http://localhost:3001
```

The first checks actual gateway discovery and anonymous access. The second
renders the real host and remote together using a browser-only identity fixture;
it grants no server access and refuses mutations. Test real sign-in and launch
separately. Nx 20 expects the old `bun.lockb`; with a newer Bun text lockfile,
verify that the host federation manifest includes React, React DOM, and Apollo
as shared singletons. A successful remote build alone does not prove sharing.

References: [erxes plugin development](https://erxes.io/docs/create-plugin),
[custom remote discovery](https://erxes.io/docs/create-plugin-standalone).
