# Operating and recovering Frame

`/api/health` checks the process. `/api/ready` checks the database, migration ledger, private storage, and configured queue with short cached probes. AI catalog readiness appears separately in `/api/ai/status`. Request logs use route templates, request IDs, statuses, durations, and error classes. They exclude slide content, source text, notes, session tokens, and credentials.

PostgreSQL is the job source of truth. API transactions create jobs and outbox rows. The dispatcher claims outbox leases, sends compact SQS wakeups, and marks dispatch. Delivery after a crash is safe to repeat. Workers claim with a fencing token, extend a 30-second database lease at most every five seconds, renew SQS visibility, and commit results before acknowledgment. Three bounded application attempts are separate from SQS delivery counts. Cancellation and authorization are checked at commit. Parent workflows yield while children work.

Chromium exports acquire a shared transactional rendering slot. Its heartbeat
uses the job's fencing token. Normal completion releases it; cancellation keeps
it until cleanup or lease expiry so a replacement cannot race a closing browser.
An unclaimed export gets a delayed replacement outbox event before the old
message is acknowledged, without consuming an application attempt or driving
normal capacity waits into the DLQ. Workers also inspect runnable database work
when SQS is empty. Deploy at least two workers to preserve AI/extraction
capacity while one export renders.

A one-minute scheduled maintenance task recovers expired leases and upload intents, expires presence and rate limits, ends expired live sessions, and completes access-revoked deck tombstones. Its logical cleanup is retryable. `bun run ops maintenance` is a dry run; `--execute` mutates state. Immutable snapshots, slide rows and physical objects are retained in this implementation. Do not add grace-period deletion without transactional root bookkeeping or an exclusive protocol shared by every attaching publisher.

Portable backups use one PostgreSQL transaction and include every application table, a file/hash manifest, and immutable asset/export bytes. JSON resource files replace the old binary format. Production requires a separate AES-256-GCM key via `FRAME_BACKUP_KEY`. Keep the key outside normal ECS runtime roles. The reader assembles each table file in memory and refuses to truncate oversized result sets. Use native PostgreSQL backups for datasets beyond its documented one-million-row-per-table limit. Neon restore history and versioned S3 remain the primary deployed recovery layers; rehearse them with the actual retention settings.

Restore procedure:

1. Select an isolated empty PostgreSQL database and private storage namespace. Keep ingress disabled.
2. Configure the backup encryption key and run `bun run ops verify DIRECTORY`.
3. Run `bun run ops restore DIRECTORY`. Nonempty targets are rejected. Invalid hashes stop restoration.
4. Check every restored deck and asset reference. Sign-in sessions are invalidated; active live sessions end. Unfinished jobs are cancelled and require explicit resume.
5. Launch the application and test read/edit/export/publish and standalone authentication before changing DNS.
6. Record elapsed time, recovered boundary, missing objects, and validation results. Initial objectives are RPO 24 hours and RTO 4 hours; they are targets until measured in the deployed environment.

For legacy data, follow [the cutover runbook](migration/legacy-data.md). The source exporter is read-only, the importer dry-runs by default, and a populated target is refused. Imported users require explicit local credential provisioning. Do not replay credits or associate users by email.
