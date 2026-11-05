import { Pool, neonConfig, type PoolClient } from "@neondatabase/serverless";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { getTableColumns } from "drizzle-orm";
import { tables } from "../server/db/schema";
import { documentSchema } from "../shared/schema";

const stableId = (...parts: unknown[]) =>
  "legacy-" + createHash("sha256").update(JSON.stringify(parts)).digest("hex");
const json = (value: any) =>
  typeof value === "string" ? JSON.parse(value) : value;
const camel = (value: string) =>
  value.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
/** Converts the earlier relational Vercel schema into the checked legacy import contract. */
export function postgresArchive(source: Record<string, any[]>) {
  const resources: Record<string, any[]> = {},
    snapshots: { id: string; document: any }[] = [];
  const archive = {
    version: 1 as const,
    resources,
    snapshots,
    historical: { postgres: source },
  };
  const known = new Set([
    "users",
    "workspaces",
    "members",
    "presentations",
    "slides",
    "revisions",
    "publications",
    "publication_assets",
    "live_sessions",
    "live_participants",
    "live_responses",
    "jobs",
    "generation_steps",
    "job_applications",
    "export_requests",
    "agent_preferences",
    "presentation_credits",
    "presentation_credit_changes",
    "folders",
    "assets",
    "sources",
    "themes",
    "brand_kits",
    "compositions",
    "creation_drafts",
    "collaborators",
    "comments",
    "error_events",
    "sessions",
    "schema_migrations",
    "rate_limits",
    "operation_leases",
    "presence",
    "queue_dispatches",
    "upload_intents",
  ]);
  for (const [name, rows] of Object.entries(source))
    if (rows.length && !known.has(name))
      throw new Error(
        "Unknown nonempty source table; add an explicit preservation mapping.",
      );
  const users = new Map((source.users || []).map((row) => [row.id, row]));
  const workspace = (userId: string) =>
    (source.workspaces || []).find((row) => row.owner_id === userId)?.id ||
    (source.members || []).find((row) => row.user_id === userId)?.workspace_id;
  const created = (userId: string) =>
    users.get(userId)?.created_at || new Date(0).toISOString();
  const add = (table: keyof typeof tables, value: any) => {
    const fields = getTableColumns(tables[table]);
    (resources[table] ||= []).push(
      Object.fromEntries(
        Object.entries(value).filter(([key]) => Object.hasOwn(fields, key)),
      ),
    );
  };
  const snapshot = (key: string, input: any) => {
    const document = documentSchema.parse(json(input)),
      id = stableId("snapshot", key);
    snapshots.push({ id, document });
    return { id, document };
  };
  for (const row of source.users || []) {
    add("users", {
      ...row,
      createdAt: row.created_at,
      updatedAt: row.created_at,
      workspaceId: workspace(row.id),
      emailVerified: false,
    });
    add("jobQuotas", { id: row.id, active: 0, live: 0, revision: 0 });
    if (/^\$(argon2|2)/.test(row.password_hash))
      add("accounts", {
        id: stableId("password", row.id),
        userId: row.id,
        accountId: row.id,
        providerId: "credential",
        password: row.password_hash,
        createdAt: row.created_at,
        updatedAt: row.created_at,
      });
    else
      add("legacyIdentities", {
        id: stableId("identity", row.id),
        userId: row.id,
        provider: "legacy",
        issuer: "https://frame.leoh.site",
        subject: row.id,
      });
  }
  for (const row of source.workspaces || [])
    add("workspaces", {
      ...row,
      ownerId: row.owner_id,
      createdAt: created(row.owner_id),
      updatedAt: created(row.owner_id),
    });
  for (const row of source.members || [])
    add("members", {
      id: stableId("member", row.workspace_id, row.user_id),
      workspaceId: row.workspace_id,
      userId: row.user_id,
      role: row.role,
      createdAt: created(row.user_id),
    });
  for (const row of source.presentations || []) {
    const doc = {
      ...json(row.metadata),
      slides: (source.slides || [])
        .filter((slide) => slide.presentation_id === row.id)
        .sort((a, b) => a.position - b.position)
        .map((slide) => json(slide.data)),
    };
    const head = snapshot("head:" + row.id, doc),
      document = head.document;
    add("decks", {
      id: row.id,
      workspaceId: row.workspace_id,
      ownerId: row.owner_id,
      title: document.title,
      status: document.status,
      folderId: document.folderId,
      revision: document.revision,
      headSnapshotId: head.id,
      width: document.width,
      height: document.height,
      themeId: document.themeId,
      slideCount: document.slides.length,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
  }
  for (const row of source.revisions || []) {
    const root = snapshot("revision:" + row.id, row.document);
    add("revisions", {
      id: row.id,
      deckId: row.presentation_id,
      revision: row.revision,
      snapshotId: root.id,
      actorId: root.document.ownerId,
      createdAt: row.created_at,
    });
  }
  for (const row of source.publications || []) {
    const root = snapshot("publication:" + row.id, row.document);
    add("publications", {
      id: row.id,
      deckId: row.presentation_id,
      ownerId: row.owner_id,
      visibility: row.visibility,
      allowDownload: Number(row.allow_download),
      revision: row.revision,
      snapshotId: root.id,
      edition: row.edition,
      active: !row.revoked_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    });
    add("publicationEditions", {
      id: stableId("edition", row.id, row.edition),
      publicationId: row.id,
      edition: row.edition,
      documentRevision: row.revision,
      snapshotId: root.id,
      visibility: row.visibility,
      allowDownload: !!row.allow_download,
      createdAt: row.updated_at,
    });
  }
  for (const row of source.publication_assets || []) {
    const pub = (source.publications || []).find(
        (value) => value.id === row.publication_id,
      ),
      asset = (source.assets || []).find((value) => value.id === row.asset_id);
    if (!pub || !asset) throw new Error("Invalid publication asset reference.");
    add("publicationAssets", {
      id: stableId("public-asset", pub.id, pub.edition, asset.id),
      publicationId: pub.id,
      edition: pub.edition,
      assetId: asset.id,
      storageKey: asset.storage_key,
    });
  }
  for (const row of source.jobs || []) {
    const payload = json(row.payload),
      draft = payload?.draftId;
    add("jobs", {
      ...Object.fromEntries(
        Object.entries(row).map(([key, value]) => [camel(key), value]),
      ),
      deckId: row.presentation_id,
      workspaceId:
        (source.presentations || []).find(
          (value) => value.id === row.presentation_id,
        )?.workspace_id || workspace(row.owner_id),
      idempotencyKey: row.idempotency_key || row.id,
      inputHash: createHash("sha256").update(row.payload).digest("hex"),
      availableAt: 0,
      leaseToken: 0,
      draftId: (source.creation_drafts || []).some(
        (value) => value.id === draft,
      )
        ? draft
        : null,
    });
  }
  for (const row of source.live_sessions || []) {
    const pub = (source.publications || []).find(
      (value) => value.id === row.publication_id,
    );
    const root = snapshot("live:" + row.id, row.document || pub?.document);
    add("liveSessions", {
      ...Object.fromEntries(
        Object.entries(row).map(([key, value]) => [camel(key), value]),
      ),
      deckId: row.presentation_id || root.document.id,
      snapshotId: root.id,
    });
  }
  const simple: Record<string, keyof typeof tables> = {
    folders: "folders",
    assets: "assets",
    sources: "sources",
    themes: "themes",
    brand_kits: "brandKits",
    compositions: "compositions",
    creation_drafts: "creationDrafts",
    collaborators: "collaborators",
    comments: "comments",
    error_events: "errorEvents",
    generation_steps: "generationSteps",
    job_applications: "jobApplications",
    export_requests: "exportRequests",
    agent_preferences: "agentPreferences",
    presentation_credits: "presentationCredits",
    presentation_credit_changes: "presentationCreditChanges",
    live_participants: "liveParticipants",
    live_responses: "liveResponses",
  };
  for (const [oldName, target] of Object.entries(simple))
    for (const input of source[oldName] || []) {
      const row: any = Object.fromEntries(
        Object.entries(input).map(([key, value]) => [
          key === "presentation_id" ? "deckId" : camel(key),
          value,
        ]),
      );
      row.id =
        row.id === undefined
          ? stableId(oldName, ...Object.values(input))
          : String(row.id);
      if (target === "agentPreferences" || target === "presentationCredits")
        row.id = row.userId;
      if (target === "presentationCreditChanges") row.resultingRevision = 0;
      if (target === "agentPreferences") row.revision = 0;
      if (target === "liveParticipants") {
        row.expiresAt =
          (source.live_sessions || []).find(
            (value) => value.id === row.sessionId,
          )?.expires_at || 0;
        row.createdAt = new Date(row.createdAt).toISOString();
      }
      if (target === "liveResponses")
        row.createdAt = new Date(row.createdAt).toISOString();
      add(target, row);
    }
  return archive;
}

export async function exportPostgres(uri: string) {
  neonConfig.webSocketConstructor = WebSocket;
  const direct = new URL(uri);
  direct.hostname = direct.hostname.replace("-pooler.", ".");
  const pool = new Pool({
    connectionString: direct.toString(),
    max: 1,
    connectionTimeoutMillis: 15000,
    query_timeout: 120000,
  });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const names = await client.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name",
      ),
      source: Record<string, any[]> = {};
    for (const row of names.rows) {
      if (!/^[a-z_]+$/.test(row.table_name))
        throw new Error("Unexpected table name.");
      source[row.table_name] = (
        await client.query(`SELECT * FROM "${row.table_name}"`)
      ).rows;
    }
    await client.query("ROLLBACK");
    return postgresArchive(source);
  } finally {
    client?.release();
    await pool.end();
  }
}
if (import.meta.main) {
  try {
    if (
      !process.env.FRAME_LEGACY_SOURCE_URL ||
      !process.env.FRAME_LEGACY_ARCHIVE
    )
      throw new Error(
        "Configure a private source URL and archive output path.",
      );
    const archive = await exportPostgres(process.env.FRAME_LEGACY_SOURCE_URL);
    await writeFile(process.env.FRAME_LEGACY_ARCHIVE, JSON.stringify(archive), {
      mode: 0o600,
      flag: "wx",
    });
    console.log(
      JSON.stringify({
        exported: true,
        resources: Object.fromEntries(
          Object.entries(archive.resources).map(([key, value]) => [
            key,
            value.length,
          ]),
        ),
        snapshots: archive.snapshots.length,
      }),
    );
  } catch {
    console.error(
      "Read-only PostgreSQL export failed; no source records were changed or logged.",
    );
    process.exitCode = 1;
  }
}
