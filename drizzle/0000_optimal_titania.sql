CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" bigint NOT NULL,
	"byte_length" bigint,
	"storage_key" text NOT NULL,
	"object_version" text,
	"checksum" text,
	"state" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_kits" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collaborators" (
	"id" text PRIMARY KEY NOT NULL,
	"deck_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collaborators_role_check" CHECK ("collaborators"."role" in ('editor','viewer'))
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" text PRIMARY KEY NOT NULL,
	"deck_id" text NOT NULL,
	"slide_id" text NOT NULL,
	"element_id" text,
	"author_id" text NOT NULL,
	"body" text NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compositions" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"elements" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "creation_drafts" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"data" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decks" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"title" text NOT NULL,
	"folder_id" text,
	"status" text NOT NULL,
	"revision" integer NOT NULL,
	"access_epoch" integer DEFAULT 0 NOT NULL,
	"head_snapshot_id" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"theme_id" text NOT NULL,
	"slide_count" integer NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decks_revision_check" CHECK ("decks"."revision" >= 0),
	CONSTRAINT "decks_status_check" CHECK ("decks"."status" in ('active','archived','trashed'))
);
--> statement-breakpoint
CREATE TABLE "deletion_tombstones" (
	"id" text PRIMARY KEY NOT NULL,
	"deck_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "error_events" (
	"id" text PRIMARY KEY NOT NULL,
	"method" text NOT NULL,
	"route" text NOT NULL,
	"error_type" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "export_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"deck_id" text,
	"publication_id" text,
	"publication_edition" integer,
	"format" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folders" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_job_id" text NOT NULL,
	"child_job_id" text NOT NULL,
	"stage_key" text NOT NULL,
	"ordinal" integer NOT NULL,
	"input_hash" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"deck_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_quotas" (
	"id" text PRIMARY KEY NOT NULL,
	"active" integer DEFAULT 0 NOT NULL,
	"live" integer DEFAULT 0 NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"deck_id" text,
	"parent_id" text,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"progress" jsonb NOT NULL,
	"payload" jsonb NOT NULL,
	"result" jsonb,
	"error" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_until" bigint,
	"lease_token" integer DEFAULT 0 NOT NULL,
	"idempotency_key" text NOT NULL,
	"input_hash" text NOT NULL,
	"available_at" bigint NOT NULL,
	"cancel_requested_at" bigint,
	"dispatch_generation" integer DEFAULT 0 NOT NULL,
	"workflow_version" integer,
	"draft_id" text,
	"orchestration_epoch" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "jobs_status_check" CHECK ("jobs"."status" in ('queued','running','succeeded','failed','cancelled'))
);
--> statement-breakpoint
CREATE TABLE "legacy_identities" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"issuer" text NOT NULL,
	"subject" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"last_seen" bigint NOT NULL,
	"expires_at" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_responses" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"round" integer NOT NULL,
	"participant_id" text NOT NULL,
	"question_id" text NOT NULL,
	"option_index" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "live_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"deck_id" text,
	"owner_id" text NOT NULL,
	"code" text NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"snapshot_id" text NOT NULL,
	"state" jsonb NOT NULL,
	"ended_at" timestamp with time zone,
	"expires_at" bigint NOT NULL,
	"participant_guard" integer DEFAULT 0 NOT NULL,
	"vote_epoch" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "members" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "members_role_check" CHECK ("members"."role" in ('owner','editor','viewer'))
);
--> statement-breakpoint
CREATE TABLE "operation_leases" (
	"id" text PRIMARY KEY NOT NULL,
	"owner" text,
	"job_id" text,
	"lease_token" integer,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"dispatch_generation" integer NOT NULL,
	"available_at" bigint NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"lease_owner" text,
	"lease_until" bigint,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presence" (
	"id" text PRIMARY KEY NOT NULL,
	"deck_id" text NOT NULL,
	"user_id" text NOT NULL,
	"mode" text NOT NULL,
	"last_seen" bigint NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presentation_credit_changes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"previous_remaining" integer,
	"remaining" integer,
	"resulting_revision" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "presentation_credits" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"remaining" integer,
	"revision" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credits_remaining_check" CHECK ("presentation_credits"."remaining" is null or "presentation_credits"."remaining" >= 0)
);
--> statement-breakpoint
CREATE TABLE "publication_assets" (
	"id" text PRIMARY KEY NOT NULL,
	"publication_id" text NOT NULL,
	"edition" integer NOT NULL,
	"asset_id" text NOT NULL,
	"storage_key" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publication_editions" (
	"id" text PRIMARY KEY NOT NULL,
	"publication_id" text NOT NULL,
	"edition" integer NOT NULL,
	"document_revision" integer NOT NULL,
	"snapshot_id" text NOT NULL,
	"visibility" text NOT NULL,
	"allow_download" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publications" (
	"id" text PRIMARY KEY NOT NULL,
	"deck_id" text,
	"owner_id" text NOT NULL,
	"visibility" text NOT NULL,
	"allow_download" integer NOT NULL,
	"revision" integer NOT NULL,
	"snapshot_id" text NOT NULL,
	"edition" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "publication_visibility_check" CHECK ("publications"."visibility" in ('private','unlisted','public'))
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"expires_at" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"deck_id" text NOT NULL,
	"revision" integer NOT NULL,
	"snapshot_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "slides" (
	"id" text PRIMARY KEY NOT NULL,
	"snapshot_id" text NOT NULL,
	"slide_id" text NOT NULL,
	"position" integer NOT NULL,
	"content" jsonb NOT NULL,
	CONSTRAINT "slides_position_check" CHECK ("slides"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"schema_version" integer NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"asset_id" text,
	"job_id" text,
	"text" text DEFAULT '' NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "themes" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"data" jsonb NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "upload_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"deck_id" text,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" bigint NOT NULL,
	"checksum" text NOT NULL,
	"presentation_id" text,
	"staging_key" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"result_asset_id" text,
	"result_source_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"workspace_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeats" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"expires_at" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"access_epoch" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_preferences" ADD CONSTRAINT "agent_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_kits" ADD CONSTRAINT "brand_kits_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborators" ADD CONSTRAINT "collaborators_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collaborators" ADD CONSTRAINT "collaborators_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compositions" ADD CONSTRAINT "compositions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compositions" ADD CONSTRAINT "compositions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creation_drafts" ADD CONSTRAINT "creation_drafts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creation_drafts" ADD CONSTRAINT "creation_drafts_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "folders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decks" ADD CONSTRAINT "decks_head_snapshot_id_snapshots_id_fk" FOREIGN KEY ("head_snapshot_id") REFERENCES "snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deletion_tombstones" ADD CONSTRAINT "deletion_tombstones_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_requests" ADD CONSTRAINT "export_requests_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_requests" ADD CONSTRAINT "export_requests_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "export_requests" ADD CONSTRAINT "export_requests_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folders" ADD CONSTRAINT "folders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_steps" ADD CONSTRAINT "generation_steps_parent_job_id_jobs_id_fk" FOREIGN KEY ("parent_job_id") REFERENCES "jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_steps" ADD CONSTRAINT "generation_steps_child_job_id_jobs_id_fk" FOREIGN KEY ("child_job_id") REFERENCES "jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_quotas" ADD CONSTRAINT "job_quotas_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_parent_id_jobs_id_fk" FOREIGN KEY ("parent_id") REFERENCES "jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_draft_id_creation_drafts_id_fk" FOREIGN KEY ("draft_id") REFERENCES "creation_drafts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_identities" ADD CONSTRAINT "legacy_identities_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_participants" ADD CONSTRAINT "live_participants_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "live_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_responses" ADD CONSTRAINT "live_responses_session_id_live_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "live_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_responses" ADD CONSTRAINT "live_responses_participant_id_live_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "live_participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "operation_leases" ADD CONSTRAINT "operation_leases_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presence" ADD CONSTRAINT "presence_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_credit_changes" ADD CONSTRAINT "presentation_credit_changes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_credit_changes" ADD CONSTRAINT "presentation_credit_changes_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "presentation_credits" ADD CONSTRAINT "presentation_credits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_assets" ADD CONSTRAINT "publication_assets_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_assets" ADD CONSTRAINT "publication_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_editions" ADD CONSTRAINT "publication_editions_publication_id_publications_id_fk" FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publication_editions" ADD CONSTRAINT "publication_editions_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publications" ADD CONSTRAINT "publications_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "revisions" ADD CONSTRAINT "revisions_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slides" ADD CONSTRAINT "slides_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "themes" ADD CONSTRAINT "themes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "themes" ADD CONSTRAINT "themes_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_deck_id_decks_id_fk" FOREIGN KEY ("deck_id") REFERENCES "decks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_result_asset_id_assets_id_fk" FOREIGN KEY ("result_asset_id") REFERENCES "assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_intents" ADD CONSTRAINT "upload_intents_result_source_id_sources_id_fk" FOREIGN KEY ("result_source_id") REFERENCES "sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_unique" ON "accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "preferences_user_unique" ON "agent_preferences" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "assets_workspace_owner_idx" ON "assets" USING btree ("workspace_id","owner_id","created_at");--> statement-breakpoint
CREATE INDEX "assets_storage_idx" ON "assets" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "brand_kits_workspace_idx" ON "brand_kits" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "collaborators_deck_user_unique" ON "collaborators" USING btree ("deck_id","user_id");--> statement-breakpoint
CREATE INDEX "collaborators_user_idx" ON "collaborators" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "comments_deck_idx" ON "comments" USING btree ("deck_id","created_at","id");--> statement-breakpoint
CREATE INDEX "compositions_workspace_idx" ON "compositions" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "drafts_owner_page_idx" ON "creation_drafts" USING btree ("owner_id","workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "decks_workspace_page_idx" ON "decks" USING btree ("workspace_id","status","updated_at","id");--> statement-breakpoint
CREATE INDEX "decks_owner_idx" ON "decks" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "decks_folder_idx" ON "decks" USING btree ("folder_id");--> statement-breakpoint
CREATE INDEX "errors_created_idx" ON "error_events" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "export_job_unique" ON "export_requests" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "export_publication_idx" ON "export_requests" USING btree ("publication_id","publication_edition","format");--> statement-breakpoint
CREATE INDEX "folders_workspace_idx" ON "folders" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_step_unique" ON "generation_steps" USING btree ("parent_job_id","stage_key");--> statement-breakpoint
CREATE INDEX "generation_order_idx" ON "generation_steps" USING btree ("parent_job_id","ordinal");--> statement-breakpoint
CREATE UNIQUE INDEX "job_application_unique" ON "job_applications" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "jobs_idempotency_unique" ON "jobs" USING btree ("owner_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "jobs_claim_idx" ON "jobs" USING btree ("status","available_at","lease_until","created_at");--> statement-breakpoint
CREATE INDEX "jobs_parent_idx" ON "jobs" USING btree ("parent_id","status");--> statement-breakpoint
CREATE INDEX "jobs_owner_idx" ON "jobs" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "legacy_identity_unique" ON "legacy_identities" USING btree ("provider","issuer","subject");--> statement-breakpoint
CREATE UNIQUE INDEX "participant_token_unique" ON "live_participants" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "participants_session_idx" ON "live_participants" USING btree ("session_id","last_seen");--> statement-breakpoint
CREATE INDEX "participants_expiry_idx" ON "live_participants" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "live_response_unique" ON "live_responses" USING btree ("session_id","round","participant_id");--> statement-breakpoint
CREATE INDEX "live_response_question_idx" ON "live_responses" USING btree ("session_id","round","question_id");--> statement-breakpoint
CREATE UNIQUE INDEX "live_code_unique" ON "live_sessions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "live_deck_owner_idx" ON "live_sessions" USING btree ("deck_id","owner_id","ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "members_workspace_user_unique" ON "members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "members_user_idx" ON "members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_generation_unique" ON "outbox" USING btree ("job_id","dispatch_generation");--> statement-breakpoint
CREATE INDEX "outbox_dispatch_idx" ON "outbox" USING btree ("sent_at","available_at","lease_until");--> statement-breakpoint
CREATE UNIQUE INDEX "presence_deck_user_unique" ON "presence" USING btree ("deck_id","user_id");--> statement-breakpoint
CREATE INDEX "presence_expiry_idx" ON "presence" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "credit_changes_user_idx" ON "presentation_credit_changes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_changes_actor_idx" ON "presentation_credit_changes" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "credits_user_unique" ON "presentation_credits" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publication_asset_unique" ON "publication_assets" USING btree ("publication_id","edition","asset_id");--> statement-breakpoint
CREATE UNIQUE INDEX "publication_edition_unique" ON "publication_editions" USING btree ("publication_id","edition");--> statement-breakpoint
CREATE UNIQUE INDEX "publication_active_unique" ON "publications" USING btree ("deck_id") WHERE "publications"."active" = true;--> statement-breakpoint
CREATE INDEX "publications_gallery_idx" ON "publications" USING btree ("visibility","active","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_limit_key_unique" ON "rate_limits" USING btree ("key");--> statement-breakpoint
CREATE INDEX "rate_limit_expiry_idx" ON "rate_limits" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "revisions_deck_revision_unique" ON "revisions" USING btree ("deck_id","revision");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_unique" ON "sessions" USING btree ("token");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "slides_snapshot_position_unique" ON "slides" USING btree ("snapshot_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "slides_snapshot_slide_unique" ON "slides" USING btree ("snapshot_id","slide_id");--> statement-breakpoint
CREATE INDEX "snapshots_workspace_idx" ON "snapshots" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "sources_owner_page_idx" ON "sources" USING btree ("workspace_id","owner_id","created_at");--> statement-breakpoint
CREATE INDEX "themes_workspace_idx" ON "themes" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "uploads_owner_idx" ON "upload_intents" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "uploads_expiry_idx" ON "upload_intents" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_unique" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "heartbeat_expiry_idx" ON "worker_heartbeats" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "workspaces_owner_idx" ON "workspaces" USING btree ("owner_id");