# `frame_api` Plugin Guide

## Identity

- **Plugin:** `frame`
- **Project:** `frame_api`
- **Layer:** Backend API
- **Path:** `backend/plugins/frame_api`
- **Last synchronized:** 2026-10-24

## Scope

### Owns

- Authorized Frame launch tickets and server-only tenant deployment configuration.

### Does not own

- Frame documents, storage, editor, AI, or erxes core authentication.

## Current Capabilities

- `frameAvailable` and `frameLaunch`, with `frameStudioOpen` permission.
- One-minute HMAC tickets bound to tenant, user, issuer and audience.

## Architecture

| Area     | Path            | Responsibility                             |
| -------- | --------------- | ------------------------------------------ |
| Service  | `src/main.ts`   | GraphQL registration and permission checks |
| Protocol | `src/ticket.ts` | Tenant validation and ticket signing       |

## Contracts

### Provides

- GraphQL `frameLaunch: FrameLaunch!`; no user or tenant supplied by the caller.
- Permission group `frame:user`.

### Consumes

- Public `startPlugin`, `canGroup`, and authenticated erxes user/subdomain context.
- `FRAME_ERXES_TENANTS`, optionally `FRAME_ERXES_API_PORT`.

## Data and State

- No collections. Frame owns identity mapping and replay protection.

## Local Invariants

- Never accept user identity or target origins from GraphQL arguments.
- Never log launch tickets or expose signing secrets to the UI.
- Mark the availability query with the host's public wrapper so anonymous
  callers receive `false`; its own identity and `frameStudioOpen` checks remain
  required. Mark launch similarly to avoid the host's result logger persisting
  tickets; launch itself must always enforce authentication and permission.
- Keep changes within this plugin; consume only public shared interfaces.

## Validation

- `bunx nx build frame_api`
- `bunx nx typecheck frame_api`
- From frame-erxes distribution: `bun run test`.
- Denied user cannot launch; permitted user opens their own Frame workspace.
