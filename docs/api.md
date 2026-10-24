# Frame HTTP contract

The API is served on the application origin. Its canonical document, elements,
operations, rich text, themes and limits are the Zod schemas in
[`shared/schema.ts`](../shared/schema.ts). AI briefs, drafts, outlines, edit scopes
and job results use [`shared/ai.ts`](../shared/ai.ts), with the creative and source
schemas beside it. Publication and live projections are separate public types;
private documents are never sent to audience clients.

Single-resource reads and mutations return the resource. List reads return
`{ items, nextCursor }`, with `limit` from 1 to 100 and an opaque `cursor`.
Deck pages sort by `(updatedAt descending, id ascending)` and query after the
cursor. Histories expose the retained bounded window (80 document revisions).
Admin search uses `{ users, total, page, pageSize }`. Deletes return `{ ok: true }`.
Queued work returns a job and HTTP 202. Creation jobs include the updated `draft`
alongside the job's normal fields. Errors retain `{ error, code, requestId }`.

The reused source implementation's array responses and `{ draft, job }` creation
response remain available only with `X-Frame-Contract: reference`. The current
browser sends `X-Frame-Contract: 1` and adapts paginated lists to component state.
`revision` is a compatibility alias for `baseRevision` on creation drafts and
saved designs; contradictory values are rejected. The erxes ticket boundary
has no alternate protocol.

Mutations use JSON and same-origin credentials. Standalone requests include the
Clerk bearer token. Erxes requests use the host-only HttpOnly session cookie.
Audience requests use `X-Frame-Participant`; joining returns `participantToken`.
The participant cookie is retained for old clients. Identity, ownership, roles,
workspace access and credit administration are resolved on the server.

Core examples:

```json
{"baseRevision":12,"operations":[{"type":"text.set","slideId":"slide-1","id":"element-1","text":"A revised headline","richText":null}]}
```

```json
{"format":"pdf","scale":1,"baseRevision":12,"key":"client-generated-unique-key"}
```

A lost revision race returns 409. Never resubmit a stale document using the new
revision automatically. Use the reload or authorized recovery-copy workflow.
Idempotency keys are scoped to the verified user and reject different inputs.
AI edit operations return through the normal reducer and undo stack; exporting,
publishing and starting live sessions first flush the intended durable revision.

Uploads use `POST /api/uploads/prepare` with
`{ kind, name, bytes, mime, checksum, presentationId? }`. `checksum` is lowercase
SHA-256 hexadecimal. S3 policies authorize a random staging key. After direct
POST upload, `POST /api/uploads/:id/finish` with `{}` validates and promotes bytes.
The explicit local adapter instead returns a loopback API upload URL. Downloads
remain authorized proxy responses, with byte-range support for media.

Source requests accept `{ name, text }` or multipart `file`. Creation POST accepts
optional `{ data }`; omitted data copies the user's current preferences. Draft
PUT accepts `{ baseRevision, data }`. Jobs accept
`{ baseRevision, kind: "outline" | "generate", key, resumeJobId? }`. Finish accepts
`{ jobId }` and returns the same saved deck on repeated requests.

Publishing accepts `{ baseRevision, expectedEdition, visibility, allowDownload }`;
revocation accepts `{ id, expectedEdition }`. Live controls accept
`{ expectedVersion, command }`; votes accept `{ round, questionId, optionIndex }`.
Grant mutations compare `expectedRole`, credit mutations compare `revision`, and
preferences compare `baseRevision`. These are independent resource revisions.

The endpoint inventory in [master.md, section 24](../master.md) identifies the
implemented route groups. Concrete handlers and shared validators are composed
in `server/app.ts`, `creation.ts`, `design.ts`, `collaboration.ts`, `live.ts`,
`publications.ts`, `exports.ts`, `uploads.ts`, and `credits.ts`. Contract tests in
`tests/contracts.test.ts` verify canonical paging, aliases, direct jobs, errors,
and the explicit source-client adapter. Permission and concurrency suites test
those handlers against a real MongoDB replica set.
