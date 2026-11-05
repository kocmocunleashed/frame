CREATE TABLE "auth_rate_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "auth_rate_limit_key_unique" ON "auth_rate_limits" USING btree ("key");--> statement-breakpoint
-- Deferred checking is used only by the all-or-nothing legacy importer and restore.
DO $$
DECLARE fk record;
BEGIN
  FOR fk IN SELECT c.conname, c.conrelid::regclass AS relation
    FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE c.contype = 'f' AND n.nspname = current_schema()
  LOOP
    EXECUTE format('ALTER TABLE %s ALTER CONSTRAINT %I DEFERRABLE INITIALLY IMMEDIATE', fk.relation, fk.conname);
  END LOOP;
END $$;
