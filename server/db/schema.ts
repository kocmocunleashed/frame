import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
  doublePrecision,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import type { FrameDocument, Slide } from "../../shared/schema";

const id = () => text("id").primaryKey();
const date = (name: string) => timestamp(name, { withTimezone: true });
const created = () => date("created_at").notNull().defaultNow();
const updated = () => date("updated_at").notNull().defaultNow();
const millis = (name: string) => bigint(name, { mode: "number" });
const userRef = (name = "owner_id") =>
  text(name)
    .notNull()
    .references(() => users.id);
const workspaceRef = () =>
  text("workspace_id")
    .notNull()
    .references(() => workspaces.id);
const deckRef = () =>
  text("deck_id").references(() => decks.id, { onDelete: "set null" });

export const users = pgTable(
  "users",
  {
    id: id(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    workspaceId: text("workspace_id").references(
      (): AnyPgColumn => workspaces.id,
    ),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);
export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    userId: userRef("user_id"),
    token: text("token").notNull(),
    expiresAt: date("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("sessions_token_unique").on(t.token),
    index("sessions_user_idx").on(t.userId),
    index("sessions_expiry_idx").on(t.expiresAt),
  ],
);
export const accounts = pgTable(
  "accounts",
  {
    id: id(),
    userId: userRef("user_id"),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: date("access_token_expires_at"),
    refreshTokenExpiresAt: date("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("accounts_provider_unique").on(t.providerId, t.accountId),
    index("accounts_user_idx").on(t.userId),
  ],
);
export const verifications = pgTable(
  "verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: date("expires_at").notNull(),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);
export const authRateLimits = pgTable(
  "auth_rate_limits",
  {
    id: id(),
    key: text("key").notNull(),
    count: integer("count").notNull(),
    lastRequest: millis("last_request").notNull(),
  },
  (t) => [uniqueIndex("auth_rate_limit_key_unique").on(t.key)],
);
export const workspaces = pgTable(
  "workspaces",
  {
    id: id(),
    ownerId: userRef(),
    name: text("name").notNull(),
    accessEpoch: integer("access_epoch").notNull().default(0),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("workspaces_owner_idx").on(t.ownerId)],
);
export const members = pgTable(
  "members",
  {
    id: id(),
    workspaceId: workspaceRef(),
    userId: userRef("user_id"),
    role: text("role").notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("members_workspace_user_unique").on(t.workspaceId, t.userId),
    index("members_user_idx").on(t.userId),
    check("members_role_check", sql`${t.role} in ('owner','editor','viewer')`),
  ],
);
export const folders = pgTable(
  "folders",
  {
    id: id(),
    workspaceId: workspaceRef(),
    name: text("name").notNull(),
    createdAt: created(),
  },
  (t) => [index("folders_workspace_idx").on(t.workspaceId, t.name)],
);
export const snapshots = pgTable(
  "snapshots",
  {
    id: id(),
    workspaceId: workspaceRef(),
    schemaVersion: integer("schema_version").notNull(),
    metadata: jsonb("metadata")
      .$type<Omit<FrameDocument, "slides">>()
      .notNull(),
    createdAt: created(),
  },
  (t) => [index("snapshots_workspace_idx").on(t.workspaceId)],
);
export const slides = pgTable(
  "slides",
  {
    id: id(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    slideId: text("slide_id").notNull(),
    position: integer("position").notNull(),
    content: jsonb("content").$type<Slide>().notNull(),
  },
  (t) => [
    uniqueIndex("slides_snapshot_position_unique").on(t.snapshotId, t.position),
    uniqueIndex("slides_snapshot_slide_unique").on(t.snapshotId, t.slideId),
    check("slides_position_check", sql`${t.position} >= 0`),
  ],
);
export const decks = pgTable(
  "decks",
  {
    id: id(),
    workspaceId: workspaceRef(),
    ownerId: userRef(),
    title: text("title").notNull(),
    folderId: text("folder_id").references(() => folders.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull(),
    revision: integer("revision").notNull(),
    accessEpoch: integer("access_epoch").notNull().default(0),
    headSnapshotId: text("head_snapshot_id")
      .notNull()
      .references(() => snapshots.id),
    width: doublePrecision("width").notNull(),
    height: doublePrecision("height").notNull(),
    themeId: text("theme_id").notNull(),
    slideCount: integer("slide_count").notNull(),
    deletedAt: date("deleted_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("decks_workspace_page_idx").on(
      t.workspaceId,
      t.status,
      t.updatedAt,
      t.id,
    ),
    index("decks_owner_idx").on(t.ownerId, t.updatedAt),
    index("decks_folder_idx").on(t.folderId),
    check("decks_revision_check", sql`${t.revision} >= 0`),
    check(
      "decks_status_check",
      sql`${t.status} in ('active','archived','trashed')`,
    ),
  ],
);
export const revisions = pgTable(
  "revisions",
  {
    id: id(),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    revision: integer("revision").notNull(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => snapshots.id),
    actorId: userRef("actor_id"),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("revisions_deck_revision_unique").on(t.deckId, t.revision),
  ],
);
export const assets = pgTable(
  "assets",
  {
    id: id(),
    workspaceId: workspaceRef(),
    ownerId: userRef(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    byteLength: bigint("byte_length", { mode: "number" }),
    storageKey: text("storage_key").notNull(),
    objectVersion: text("object_version"),
    checksum: text("checksum"),
    state: text("state"),
    createdAt: created(),
  },
  (t) => [
    index("assets_workspace_owner_idx").on(
      t.workspaceId,
      t.ownerId,
      t.createdAt,
    ),
    index("assets_storage_idx").on(t.storageKey),
  ],
);
export const sources = pgTable(
  "sources",
  {
    id: id(),
    workspaceId: workspaceRef(),
    ownerId: userRef(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    assetId: text("asset_id").references(() => assets.id),
    jobId: text("job_id").references((): AnyPgColumn => jobs.id),
    text: text("text").notNull().default(""),
    warnings: jsonb("warnings").notNull().default([]),
    createdAt: created(),
  },
  (t) => [
    index("sources_owner_page_idx").on(t.workspaceId, t.ownerId, t.createdAt),
  ],
);
const designColumns = () => ({
  id: id(),
  workspaceId: workspaceRef(),
  ownerId: userRef(),
  name: text("name").notNull(),
  data: jsonb("data").notNull(),
  revision: integer("revision").notNull().default(0),
  createdAt: created(),
  updatedAt: updated(),
});
export const themes = pgTable("themes", designColumns(), (t) => [
  index("themes_workspace_idx").on(t.workspaceId, t.updatedAt),
]);
export const brandKits = pgTable("brand_kits", designColumns(), (t) => [
  index("brand_kits_workspace_idx").on(t.workspaceId, t.updatedAt),
]);
export const compositions = pgTable(
  "compositions",
  {
    id: id(),
    workspaceId: workspaceRef(),
    ownerId: userRef(),
    name: text("name").notNull(),
    width: doublePrecision("width").notNull(),
    height: doublePrecision("height").notNull(),
    elements: jsonb("elements").notNull(),
    createdAt: created(),
  },
  (t) => [index("compositions_workspace_idx").on(t.workspaceId, t.createdAt)],
);
export const creationDrafts = pgTable(
  "creation_drafts",
  {
    id: id(),
    workspaceId: workspaceRef(),
    ownerId: userRef(),
    data: jsonb("data").notNull(),
    revision: integer("revision").notNull().default(0),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("drafts_owner_page_idx").on(t.ownerId, t.workspaceId, t.updatedAt),
  ],
);
export const agentPreferences = pgTable(
  "agent_preferences",
  {
    id: id(),
    userId: userRef("user_id"),
    data: jsonb("data").notNull(),
    revision: integer("revision").notNull().default(0),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("preferences_user_unique").on(t.userId)],
);
export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    workspaceId: workspaceRef(),
    ownerId: userRef(),
    deckId: deckRef(),
    parentId: text("parent_id").references((): AnyPgColumn => jobs.id),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    progress: jsonb("progress").notNull(),
    payload: jsonb("payload").notNull(),
    result: jsonb("result"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    leaseOwner: text("lease_owner"),
    leaseUntil: millis("lease_until"),
    leaseToken: integer("lease_token").notNull().default(0),
    idempotencyKey: text("idempotency_key").notNull(),
    inputHash: text("input_hash").notNull(),
    availableAt: millis("available_at").notNull(),
    cancelRequestedAt: millis("cancel_requested_at"),
    dispatchGeneration: integer("dispatch_generation").notNull().default(0),
    workflowVersion: integer("workflow_version"),
    draftId: text("draft_id").references(() => creationDrafts.id, {
      onDelete: "set null",
    }),
    orchestrationEpoch: integer("orchestration_epoch").notNull().default(0),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("jobs_idempotency_unique").on(t.ownerId, t.idempotencyKey),
    index("jobs_claim_idx").on(
      t.status,
      t.availableAt,
      t.leaseUntil,
      t.createdAt,
    ),
    index("jobs_parent_idx").on(t.parentId, t.status),
    index("jobs_owner_idx").on(t.ownerId, t.createdAt),
    check(
      "jobs_status_check",
      sql`${t.status} in ('queued','running','succeeded','failed','cancelled')`,
    ),
  ],
);
export const jobQuotas = pgTable("job_quotas", {
  id: text("id")
    .primaryKey()
    .references(() => users.id),
  active: integer("active").notNull().default(0),
  live: integer("live").notNull().default(0),
  revision: integer("revision").notNull().default(0),
});
export const generationSteps = pgTable(
  "generation_steps",
  {
    id: id(),
    parentJobId: text("parent_job_id")
      .notNull()
      .references(() => jobs.id),
    childJobId: text("child_job_id")
      .notNull()
      .references(() => jobs.id),
    stageKey: text("stage_key").notNull(),
    ordinal: integer("ordinal").notNull(),
    inputHash: text("input_hash").notNull(),
  },
  (t) => [
    uniqueIndex("generation_step_unique").on(t.parentJobId, t.stageKey),
    index("generation_order_idx").on(t.parentJobId, t.ordinal),
  ],
);
export const jobApplications = pgTable(
  "job_applications",
  {
    id: id(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    deckId: deckRef(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("job_application_unique").on(t.jobId)],
);
export const outbox = pgTable(
  "outbox",
  {
    id: id(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    dispatchGeneration: integer("dispatch_generation").notNull(),
    availableAt: millis("available_at").notNull(),
    attempts: integer("attempts").notNull().default(0),
    leaseOwner: text("lease_owner"),
    leaseUntil: millis("lease_until"),
    sentAt: date("sent_at"),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("outbox_generation_unique").on(t.jobId, t.dispatchGeneration),
    index("outbox_dispatch_idx").on(t.sentAt, t.availableAt, t.leaseUntil),
  ],
);
export const publications = pgTable(
  "publications",
  {
    id: id(),
    deckId: deckRef(),
    ownerId: userRef(),
    visibility: text("visibility").notNull(),
    allowDownload: integer("allow_download").notNull(),
    revision: integer("revision").notNull(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => snapshots.id),
    edition: integer("edition").notNull(),
    active: boolean("active").notNull().default(true),
    revokedAt: date("revoked_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("publication_active_unique")
      .on(t.deckId)
      .where(sql`${t.active} = true`),
    index("publications_gallery_idx").on(t.visibility, t.active, t.createdAt),
    check(
      "publication_visibility_check",
      sql`${t.visibility} in ('private','unlisted','public')`,
    ),
  ],
);
export const publicationEditions = pgTable(
  "publication_editions",
  {
    id: id(),
    publicationId: text("publication_id")
      .notNull()
      .references(() => publications.id),
    edition: integer("edition").notNull(),
    documentRevision: integer("document_revision").notNull(),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => snapshots.id),
    visibility: text("visibility").notNull(),
    allowDownload: boolean("allow_download").notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("publication_edition_unique").on(t.publicationId, t.edition),
  ],
);
export const publicationAssets = pgTable(
  "publication_assets",
  {
    id: id(),
    publicationId: text("publication_id")
      .notNull()
      .references(() => publications.id),
    edition: integer("edition").notNull(),
    assetId: text("asset_id")
      .notNull()
      .references(() => assets.id),
    storageKey: text("storage_key").notNull(),
  },
  (t) => [
    uniqueIndex("publication_asset_unique").on(
      t.publicationId,
      t.edition,
      t.assetId,
    ),
  ],
);
export const exportRequests = pgTable(
  "export_requests",
  {
    id: id(),
    jobId: text("job_id")
      .notNull()
      .references(() => jobs.id),
    deckId: deckRef(),
    publicationId: text("publication_id").references(() => publications.id),
    publicationEdition: integer("publication_edition"),
    format: text("format").notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("export_job_unique").on(t.jobId),
    index("export_publication_idx").on(
      t.publicationId,
      t.publicationEdition,
      t.format,
    ),
  ],
);
export const collaborators = pgTable(
  "collaborators",
  {
    id: id(),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    userId: userRef("user_id"),
    role: text("role").notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("collaborators_deck_user_unique").on(t.deckId, t.userId),
    index("collaborators_user_idx").on(t.userId),
    check("collaborators_role_check", sql`${t.role} in ('editor','viewer')`),
  ],
);
export const comments = pgTable(
  "comments",
  {
    id: id(),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    slideId: text("slide_id"),
    elementId: text("element_id"),
    authorId: userRef("author_id"),
    body: text("body").notNull(),
    resolvedAt: date("resolved_at"),
    resolvedBy: text("resolved_by").references(() => users.id),
    createdAt: created(),
  },
  (t) => [index("comments_deck_idx").on(t.deckId, t.createdAt, t.id)],
);
export const presence = pgTable(
  "presence",
  {
    id: id(),
    deckId: text("deck_id")
      .notNull()
      .references(() => decks.id, { onDelete: "cascade" }),
    userId: userRef("user_id"),
    mode: text("mode").notNull(),
    lastSeen: millis("last_seen").notNull(),
    expiresAt: millis("expires_at").notNull(),
  },
  (t) => [
    uniqueIndex("presence_deck_user_unique").on(t.deckId, t.userId),
    index("presence_expiry_idx").on(t.expiresAt),
  ],
);
export const liveSessions = pgTable(
  "live_sessions",
  {
    id: id(),
    deckId: deckRef(),
    ownerId: userRef(),
    code: text("code").notNull(),
    version: integer("version").notNull().default(0),
    snapshotId: text("snapshot_id")
      .notNull()
      .references(() => snapshots.id),
    state: jsonb("state").notNull(),
    endedAt: date("ended_at"),
    expiresAt: millis("expires_at").notNull(),
    participantGuard: integer("participant_guard").notNull().default(0),
    voteEpoch: integer("vote_epoch").notNull().default(0),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("live_code_unique").on(t.code),
    index("live_deck_owner_idx").on(t.deckId, t.ownerId, t.endedAt),
  ],
);
export const liveParticipants = pgTable(
  "live_participants",
  {
    id: id(),
    sessionId: text("session_id")
      .notNull()
      .references(() => liveSessions.id),
    tokenHash: text("token_hash").notNull(),
    lastSeen: millis("last_seen").notNull(),
    expiresAt: millis("expires_at").notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("participant_token_unique").on(t.tokenHash),
    index("participants_session_idx").on(t.sessionId, t.lastSeen),
    index("participants_expiry_idx").on(t.expiresAt),
  ],
);
export const liveResponses = pgTable(
  "live_responses",
  {
    id: id(),
    sessionId: text("session_id")
      .notNull()
      .references(() => liveSessions.id),
    round: integer("round").notNull(),
    participantId: text("participant_id")
      .notNull()
      .references(() => liveParticipants.id),
    questionId: text("question_id").notNull(),
    optionIndex: integer("option_index").notNull(),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("live_response_unique").on(
      t.sessionId,
      t.round,
      t.participantId,
    ),
    index("live_response_question_idx").on(t.sessionId, t.round, t.questionId),
  ],
);
export const presentationCredits = pgTable(
  "presentation_credits",
  {
    id: id(),
    userId: userRef("user_id"),
    remaining: integer("remaining"),
    revision: integer("revision").notNull().default(0),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("credits_user_unique").on(t.userId),
    check(
      "credits_remaining_check",
      sql`${t.remaining} is null or ${t.remaining} >= 0`,
    ),
  ],
);
export const presentationCreditChanges = pgTable(
  "presentation_credit_changes",
  {
    id: id(),
    userId: userRef("user_id"),
    actorId: userRef("actor_id"),
    previousRemaining: integer("previous_remaining"),
    remaining: integer("remaining"),
    resultingRevision: integer("resulting_revision").notNull(),
    createdAt: created(),
  },
  (t) => [
    index("credit_changes_user_idx").on(t.userId, t.createdAt),
    index("credit_changes_actor_idx").on(t.actorId, t.createdAt),
  ],
);
export const uploadIntents = pgTable(
  "upload_intents",
  {
    id: id(),
    workspaceId: workspaceRef(),
    ownerId: userRef(),
    deckId: deckRef(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    mime: text("mime").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    checksum: text("checksum").notNull(),
    presentationId: text("presentation_id"),
    stagingKey: text("staging_key").notNull(),
    expiresAt: millis("expires_at").notNull(),
    status: text("status").notNull(),
    result: jsonb("result"),
    resultAssetId: text("result_asset_id").references(() => assets.id),
    resultSourceId: text("result_source_id").references(() => sources.id),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("uploads_owner_idx").on(t.ownerId, t.createdAt),
    index("uploads_expiry_idx").on(t.expiresAt),
  ],
);
export const rateLimits = pgTable(
  "rate_limits",
  {
    id: id(),
    key: text("key").notNull(),
    attempts: integer("attempts").notNull().default(0),
    windowStart: date("window_start").notNull(),
    expiresAt: millis("expires_at").notNull(),
  },
  (t) => [
    uniqueIndex("rate_limit_key_unique").on(t.key),
    index("rate_limit_expiry_idx").on(t.expiresAt),
  ],
);
export const operationLeases = pgTable("operation_leases", {
  id: id(),
  owner: text("owner"),
  jobId: text("job_id").references(() => jobs.id),
  leaseToken: integer("lease_token"),
  expiresAt: millis("expires_at").notNull(),
});
export const errorEvents = pgTable(
  "error_events",
  {
    id: id(),
    method: text("method").notNull(),
    route: text("route").notNull(),
    errorType: text("error_type").notNull(),
    createdAt: created(),
  },
  (t) => [index("errors_created_idx").on(t.createdAt)],
);
export const workerHeartbeats = pgTable(
  "worker_heartbeats",
  {
    id: id(),
    kind: text("kind").notNull(),
    expiresAt: millis("expires_at").notNull(),
    updatedAt: updated(),
  },
  (t) => [index("heartbeat_expiry_idx").on(t.expiresAt)],
);
export const deletionTombstones = pgTable("deletion_tombstones", {
  id: id(),
  deckId: text("deck_id").notNull(),
  workspaceId: workspaceRef(),
  state: text("state").notNull(),
  createdAt: created(),
  updatedAt: updated(),
});
// Historical identity references are audit records only; they never grant sign-in.
export const legacyIdentities = pgTable(
  "legacy_identities",
  {
    id: id(),
    userId: userRef("user_id"),
    provider: text("provider").notNull(),
    issuer: text("issuer").notNull(),
    subject: text("subject").notNull(),
  },
  (t) => [
    uniqueIndex("legacy_identity_unique").on(t.provider, t.issuer, t.subject),
  ],
);

export const tables = {
  users,
  sessions,
  accounts,
  verifications,
  authRateLimits,
  workspaces,
  members,
  folders,
  snapshots,
  slides,
  decks,
  revisions,
  assets,
  sources,
  themes,
  brandKits,
  compositions,
  creationDrafts,
  agentPreferences,
  jobs,
  jobQuotas,
  generationSteps,
  jobApplications,
  outbox,
  publications,
  publicationEditions,
  publicationAssets,
  exportRequests,
  collaborators,
  comments,
  presence,
  liveSessions,
  liveParticipants,
  liveResponses,
  presentationCredits,
  presentationCreditChanges,
  uploadIntents,
  rateLimits,
  operationLeases,
  errorEvents,
  workerHeartbeats,
  deletionTombstones,
  legacyIdentities,
};
export type TableName = keyof typeof tables;
export type Row<K extends TableName> = (typeof tables)[K]["$inferSelect"];
export type Insert<K extends TableName> = (typeof tables)[K]["$inferInsert"];
