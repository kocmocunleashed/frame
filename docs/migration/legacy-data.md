# Preserve existing data during cutover

Schema migration and data migration are separate. Frame does not read or discard an old database on startup. Keep the old installation, its environment, storage namespace and verified backups until a reviewed cutover is complete.

## Export the source

Stop old API writers, workers, dispatchers and maintenance for the final export. Take the source installation's normal database backup and an inventory of private assets/export objects first.

`scripts/export-legacy.mongosh.cjs` is a one-time read-only MongoDB exporter. Run it using `mongosh` from the source installation. Frame does not install a MongoDB client package or run this utility during normal operation. Put the following values in a protected environment file outside the checkout:

- `FRAME_LEGACY_SOURCE_URI`: source replica-set connection URL.
- `FRAME_LEGACY_SOURCE_DATABASE`: exact existing Frame database.
- `FRAME_LEGACY_ARCHIVE`: new private output path.

Load that file without exposing values in arguments:

```bash
bun --env-file=/private/frame-source.env -e 'const child = Bun.spawn(["mongosh", "--nodb", "--file", "scripts/export-legacy.mongosh.cjs"], { env: process.env, stdout: "inherit", stderr: "inherit" }); process.exitCode = await child.exited;'
```

The exporter reads one snapshot transaction, checks chunk lengths and SHA-256 hashes, reconstructs every immutable presentation snapshot and slide, hydrates split workflow/theme/source fields, and preserves original IDs. It refuses an unknown nonempty collection so an unmapped resource cannot disappear silently. It exclusively creates its output with mode `0600`.

The archive retains old identity and tenant mappings for audit. They grant no authentication in the new application. Transient sessions, launch tickets, presence, expired rate limits and worker leases are intentionally not replayed. Live sessions are ended during import; existing participants and response records are retained. Source backups remain the rollback authority for the old stack and binary backup format.

Large source exports must fit the source server's transaction lifetime and the export process's memory. If that limit is exceeded, stop and use a reviewed snapshot export procedure with equivalent hashes and completeness checks; do not accept a partial archive.

## Validate and import

Create a new empty PostgreSQL database on a Neon development branch. Preserve or copy immutable asset/export bytes into the intended private namespace, keeping storage keys unchanged. Supply the target `DATABASE_URL` and storage settings through a private env file. Do not point at a populated database.

```bash
bun --env-file=/private/frame-target.env run db:migrate
bun --env-file=/private/frame-target.env scripts/import-legacy.ts /private/frame-archive.json
```

The second command is a dry run. It inserts into a transaction, validates input fields, all foreign keys, user/email uniqueness, snapshot structure, presentation head identities and asset references, then rolls everything back. Its report contains counts and intentionally skipped transient resource names, never record values or credentials.

Review the counts against the source inventory and test the archive before applying:

```bash
bun --env-file=/private/frame-target.env scripts/import-legacy.ts /private/frame-archive.json --apply
```

Apply uses one serializable transaction and refuses a populated target, including a target changed since the initial preflight. A failed import rolls back all application rows. It does not delete source records or transfer ownership. JSONB preserves slide values and array order; canonical JSON is used for new workflow hashes and idempotency comparisons.

## Give imported users local sign-in

Passwords from the old external identity providers are not available to Frame. Imported users keep their original IDs, workspaces, memberships, credit balances and documents, with no credential account. A new registration with the same email cannot claim them.

An administrator must verify the person's identity and provision their existing user ID explicitly. In a separate private environment file, set the target connection, `FRAME_PROVISION_USER_ID` and a temporary `FRAME_PROVISION_PASSWORD` of 10–128 characters. Then run:

```bash
bun --env-file=/private/frame-user-provision.env scripts/provision-password.ts
```

The tool uses Better Auth's password hasher, refuses an existing local credential, and invalidates existing sessions. Deliver temporary credentials through the organization's approved private channel. The person can change their password in Frame account settings; changing it revokes their other sessions. Automatic email delivery/reset is not configured by this migration.

## Review before production

Compare users, membership roles, presentation/revision counts, ordered slides, theme/brand-kit data, publication editions and asset keys against the source. Verify that unrelated users are denied, viewers cannot edit, revoked members lose access, and imported users sign into the same IDs. Render and export representative large and media-heavy decks. Check AI source text, generation/resume and credit idempotency with actual provider credentials.

Do not replay unfinished jobs automatically: import cancels them and requires explicit review/resume. Keep production ingress disabled during validation. Production import, DNS cutover and deployment require explicit approval. Record the tested restore boundary and rollback instructions before retiring the source.
