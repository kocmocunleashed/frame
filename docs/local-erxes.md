# Try Frame inside the local erxes installation

Open **http://localhost:3001/frame** and sign in with your existing erxes account.
Your Frame studio opens automatically. The **Frame** navigation item opens the same page.
If the connection fails, use **Retry**.
Use **Open in new tab** if your browser blocks embedded cookies.

Use `localhost` consistently. `127.0.0.1` is a different origin and does not
match this installation's authenticated tenant and launch policy.

Installed source plugins:

- `/home/leohunt/erxes/backend/plugins/frame_api`
- `/home/leohunt/erxes/frontend/plugins/frame_ui`

Frame itself runs from `/home/leohunt/erxes-frame` at
`http://localhost:3158`. It uses erxes identity, so opening this address without
an erxes launch shows return-to-erxes guidance. New identities receive an empty
personal workspace. Standalone demonstration decks are kept separately.

## Start and stop

```sh
~/.local/bin/frame-erxes-local start
~/.local/bin/frame-erxes-local status
~/.local/bin/frame-erxes-local logs
~/.local/bin/frame-erxes-local stop
```

These user systemd services are not enabled for automatic login startup.
Starting the existing `erxes-local` helper also includes Frame. Stopping retains
the databases and uploaded files.

## Local storage and configuration

- MongoDB replica set: `127.0.0.1:27017`, `rs0`.
- Frame database: `frame_erxes_local`, separate from erxes core collections.
- Persistent database files: `/home/leohunt/.local/share/erxes/mongo`.
- Frame assets/exports: `/home/leohunt/.local/share/frame-erxes`.
- Private Frame environment: `/home/leohunt/.config/frame-erxes/frame.env`.
- Private adapter environment: `/home/leohunt/.config/frame-erxes/adapter.env`.
- The host's `.env` enables `frame`; its prior configuration is backed up in
  `/home/leohunt/.config/frame-erxes/host.env.before-frame`.

This host uses Nx 20, which does not discover npm packages from Bun's newer
text lockfile. With your approval, `frontend/core-ui/module-federation.config.ts`
explicitly shares React, React DOM and Apollo Client as singletons. The Frame
remote declares the same contract. This prevents duplicate React runtimes and
the resulting invalid-hook-call crash; it does not replace host dependencies
or change its lockfile.

The adapter listens on 3319; the UI remote uses 3019. The existing host serves
the main UI on 3001 and authenticated gateway on 4000. The Frame worker uses
MongoDB-backed local job delivery, and a one-minute timer runs recovery.

Real OpenRouter Muse requests are enabled using the server-only key already
provided. Manual editing works without requesting AI. Frame keeps its configured
model and pricing ceilings. Credentials are never exposed to the host UI.

## Permissions

The host's existing owner policy permits opening Frame. Other erxes accounts
need `frame:user` or `frameStudioOpen` through erxes permission management.
Opening Frame does not make an erxes owner a Frame credit administrator and
does not grant access to another person's presentations.

## Rebuild after changing plugin code

```sh
cd /home/leohunt/erxes
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx build frame_api
NX_DAEMON=false NX_ISOLATE_PLUGINS=false bunx nx build frame_ui
systemctl --user restart erxes-frame-api erxes-gateway erxes-ui
```

After changing Frame code, run `bun run build` in `/home/leohunt/erxes-frame`,
then restart `frame-studio` and `frame-worker`. Ordinary restarts preserve work.
This local installation is separate from an AWS/HTTPS deployment.
