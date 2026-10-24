# `frame_ui` Plugin Guide

## Identity

- **Plugin:** `frame`
- **Project:** `frame_ui`
- **Layer:** Frontend UI
- **Path:** `frontend/plugins/frame_ui`
- **Last synchronized:** 2026-10-24

## Scope

### Owns

- `/frame` launch UI, iframe, connection state, and new-tab fallback.

### Does not own

- Frame's editor/runtime, tenant configuration, or authentication secrets.

## Current Capabilities

- Automatically launch once per visit via GraphQL; POST tickets to a named iframe.
- Keep retry/reconnect and a user-initiated new-tab fallback available.
- Validate Frame readiness messages by exact origin and source window.

## Architecture

| Area       | Path                          | Responsibility                   |
| ---------- | ----------------------------- | -------------------------------- |
| Navigation | `src/config.tsx`              | Host plugin metadata             |
| Studio     | `src/Frame.tsx`               | Full Frame service embedding     |
| Federation | `module-federation.config.ts` | `./config` and `./frame` exposes |

## Contracts

### Provides

- Named `Frame` React component and `CONFIG` metadata.

### Consumes

- Host Apollo client and `erxes-ui` Button/Spinner.
- `frameLaunch` mutation and `frame-erxes:ready` message from Frame.

## Data and State

- Launch results use `no-cache`. Tickets exist only for form submission.

## Local Invariants

- No signing keys or user-supplied Frame URLs.
- Use the host's UI primitives and keep Frame's React runtime inside its iframe.
- Verify both source and origin on messages.
- Maintain working error, loading, retry and new-tab paths.
- React effect replay must not request duplicate automatic launch tickets.
- Keep both root and wildcard aliases for the public host libraries, matching
  erxes plugin TypeScript resolution.
- Explicitly share React 18.3.1, React DOM 18.3.1 and Apollo Client 3 as
  singletons. The host must share the same runtimes; loading a remote alone
  does not prove it can render within the host's React tree.

## Validation

- `bunx nx build frame_ui`
- `bunx nx typecheck frame_ui`
- Verify iframe and new-tab launch against the configured Frame service.
