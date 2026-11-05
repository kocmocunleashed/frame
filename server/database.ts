import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import {
  and,
  or,
  eq,
  ne,
  lt,
  lte,
  gt,
  inArray,
  isNull,
  isNotNull,
  asc,
  desc,
  sql,
  getTableColumns,
  type SQL,
} from "drizzle-orm";
import { tables, type TableName } from "./db/schema";
import { documentSchema } from "../shared/schema";

export const contentHash = (bytes: Uint8Array | string) =>
  createHash("sha256").update(bytes).digest("hex");
export const MAX_DOCUMENT_BYTES = 32 * 1024 * 1024;
export type Predicate = Record<string, unknown>;
type Patch = {
  set?: Record<string, unknown>;
  insertValues?: Record<string, unknown>;
  increment?: Record<string, number>;
};
type QueryOptions = {
  sort?: Record<string, number>;
  limit?: number;
  skip?: number;
  hydrateSnapshot?: boolean;
  upsert?: boolean;
};
const migrationsFolder = new URL("../drizzle", import.meta.url).pathname;

/** Relational repositories share the current SQL transaction across services. */
export class Database {
  readonly client: Pool;
  readonly orm: NodePgDatabase<typeof tables>;
  readonly ready: Promise<void>;
  readonly ephemeral = false;
  readonly name: string;
  private context = new AsyncLocalStorage<NodePgDatabase<typeof tables>>();
  constructor(uri = process.env.DATABASE_URL, namespace = "public") {
    if (!uri || !/^postgres(?:ql)?:\/\//.test(uri))
      throw new Error("Set DATABASE_URL to a PostgreSQL connection string.");
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(namespace))
      throw new Error("Invalid database namespace.");
    this.name = namespace;
    neonConfig.webSocketConstructor = WebSocket;
    const url = new URL(uri),
      isNeon = url.hostname.endsWith(".neon.tech");
    // Frame owns a small long-lived pool. Direct endpoints support migration locks and session settings.
    if (isNeon) url.hostname = url.hostname.replace("-pooler.", ".");
    const Driver = isNeon ? NeonPool : Pool;
    this.client = new Driver({
      connectionString: url.toString(),
      max: 8,
      connectionTimeoutMillis: 10000,
      idleTimeoutMillis: 10000,
      ...(namespace === "public"
        ? {}
        : { options: `-c search_path=${namespace}` }),
    }) as unknown as Pool;
    this.client.on("error", () => {
      /* Requests report connection failures without logging credentials. */
    });
    this.orm = drizzle(this.client, { schema: tables });
    this.ready = this.client
      .query(
        namespace === "public"
          ? "SELECT 1"
          : `CREATE SCHEMA IF NOT EXISTS "${namespace}"`,
      )
      .then(() => {});
  }
  get inTransaction() {
    return !!this.context.getStore();
  }
  get query() {
    return this.context.getStore() || this.orm;
  }
  table(name: string) {
    if (!Object.hasOwn(tables, name))
      throw new Error(`Unknown repository: ${name}`);
    return tables[name as TableName];
  }
  private column(name: string, field: string): any {
    const columns = getTableColumns(this.table(name));
    if (!Object.hasOwn(columns, field))
      throw new Error(`Unknown field in ${name}: ${field}`);
    return (columns as any)[field];
  }
  private value(column: any, value: any): any {
    if (value == null) return value;
    if (column.dataType === "date") return new Date(value);
    if (column.dataType === "json" && typeof value === "string")
      return JSON.parse(value);
    return value;
  }
  private where(name: string, predicate: Predicate = {}): SQL {
    const parts: SQL[] = [];
    for (const [key, value] of Object.entries(predicate)) {
      if (key === "all" || key === "any") {
        if (!Array.isArray(value))
          throw new Error("Invalid repository predicate.");
        parts.push(
          (key === "all" ? and : or)(
            ...value.map((v) => this.where(name, v)),
          ) || sql`${key === "all"}`,
        );
        continue;
      }
      const col = this.column(name, key),
        convert = (v: unknown) => this.value(col, v);
      if (
        value &&
        typeof value === "object" &&
        !(value instanceof Date) &&
        !Array.isArray(value)
      ) {
        for (const [operator, operand] of Object.entries(value)) {
          switch (operator) {
            case "inList":
              parts.push(
                Array.isArray(operand) && operand.length
                  ? inArray(col, operand.map(convert))
                  : sql`false`,
              );
              break;
            case "present":
              parts.push(operand ? isNotNull(col) : isNull(col));
              break;
            case "notEqual":
              parts.push(
                operand === null
                  ? isNotNull(col)
                  : or(ne(col, convert(operand)), isNull(col))!,
              );
              break;
            case "lessThan":
              parts.push(lt(col, convert(operand)));
              break;
            case "atMost":
              parts.push(lte(col, convert(operand)));
              break;
            case "greaterThan":
              parts.push(gt(col, convert(operand)));
              break;
            case "containsInsensitive":
              parts.push(
                sql`${col} ILIKE ${"%" + String(operand).replace(/[\\%_]/g, "\\$&") + "%"}`,
              );
              break;
            default:
              throw new Error(`Unknown repository comparison: ${operator}`);
          }
        }
      } else parts.push(value == null ? isNull(col) : eq(col, convert(value)));
    }
    return and(...parts) || sql`true`;
  }
  private order(name: string, order: Record<string, number> = { id: 1 }) {
    return Object.entries(order).map(([field, direction]) =>
      direction < 0
        ? desc(this.column(name, field))
        : asc(this.column(name, field)),
    );
  }
  private async encode(name: string, value: Record<string, any>) {
    const row = { ...value };
    if ((name === "publications" || name === "liveSessions") && row.document) {
      row.snapshotId = await this.snapshotPut(JSON.parse(row.document));
      delete row.document;
    }
    if (name === "jobs" && row.payload) {
      const payload =
        typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
      if (
        payload.workflowVersion !== undefined &&
        row.workflowVersion === undefined
      )
        row.workflowVersion = payload.workflowVersion;
      if (payload.draftId !== undefined && row.draftId === undefined)
        row.draftId = payload.draftId;
    }
    return Object.fromEntries(
      Object.entries(row)
        .filter(([, v]) => v !== undefined)
        .map(([key, value]) => [
          key,
          this.value(this.column(name, key), value),
        ]),
    );
  }
  private async decode(
    name: string,
    input: any,
    hydrateSnapshot = true,
  ): Promise<any> {
    if (!input) return null;
    const row = { ...input };
    for (const [key, col] of Object.entries(
      getTableColumns(this.table(name)),
    )) {
      if (row[key] instanceof Date) row[key] = row[key].toISOString();
      if (
        col.dataType === "json" &&
        row[key] != null &&
        !["snapshots", "slides", "uploadIntents"].includes(name)
      )
        row[key] = JSON.stringify(row[key]);
    }
    if (
      hydrateSnapshot &&
      (name === "publications" || name === "liveSessions") &&
      row.snapshotId
    )
      row.document = JSON.stringify(await this.snapshotRead(row.snapshotId));
    return row;
  }
  async one(
    name: string,
    predicate: Predicate = {},
    options: QueryOptions = {},
  ): Promise<any> {
    return (
      (await this.find(name, predicate, { ...options, limit: 1 }))[0] || null
    );
  }
  async find(
    name: string,
    predicate: Predicate = {},
    options: QueryOptions = {},
  ): Promise<any[]> {
    await this.ready;
    const rows = await this.query
      .select()
      .from(this.table(name))
      .where(this.where(name, predicate))
      .orderBy(...this.order(name, options.sort))
      .limit(options.limit ?? 1000)
      .offset(options.skip || 0);
    return Promise.all(
      rows.map((row) => this.decode(name, row, options.hydrateSnapshot)),
    );
  }
  async count(name: string, predicate: Predicate = {}) {
    await this.ready;
    const [row] = await this.query
      .select({ n: sql<number>`count(*)::int` })
      .from(this.table(name))
      .where(this.where(name, predicate));
    return row.n;
  }
  async insert(name: string, value: Record<string, unknown>) {
    await this.ready;
    await this.query
      .insert(this.table(name))
      .values((await this.encode(name, { id: randomUUID(), ...value })) as any);
    return { changes: 1 };
  }
  async insertMany(name: string, values: Record<string, unknown>[]) {
    await this.ready;
    for (let offset = 0; offset < values.length; offset += 100) {
      const rows = [];
      for (const value of values.slice(offset, offset + 100))
        rows.push(await this.encode(name, { id: randomUUID(), ...value }));
      await this.query.insert(this.table(name)).values(rows as any);
    }
    return { changes: values.length };
  }
  private async change(
    name: string,
    predicate: Predicate,
    patch: Patch,
    options: QueryOptions,
    single: boolean,
  ): Promise<any[]> {
    await this.ready;
    const table = this.table(name),
      values: Record<string, unknown> = await this.encode(
        name,
        patch.set || {},
      );
    for (const [key, amount] of Object.entries(patch.increment || {}))
      values[key] = sql`coalesce(${this.column(name, key)}, 0) + ${amount}`;
    if (options.upsert) {
      const equalities = Object.fromEntries(
        Object.entries(predicate).filter(
          ([key, value]) =>
            key !== "all" &&
            key !== "any" &&
            (value === null || typeof value !== "object"),
        ),
      );
      const candidate: any = {
        id: contentHash(name + JSON.stringify(predicate)),
        ...equalities,
        ...patch.insertValues,
        ...patch.set,
      };
      for (const [key, amount] of Object.entries(patch.increment || {}))
        candidate[key] = Number(candidate[key] || 0) + amount;
      const inserted = await this.query
        .insert(table)
        .values((await this.encode(name, candidate)) as any)
        .onConflictDoNothing()
        .returning();
      if (inserted.length) return inserted;
    }
    if (!Object.keys(values).length) return [];
    if (single)
      return this.query.transaction(async (tx) => {
        const [target]: any[] = await tx
          .select({ id: table.id })
          .from(table)
          .where(this.where(name, predicate))
          .orderBy(...this.order(name, options.sort))
          .limit(1)
          .for("update", { skipLocked: true });
        if (!target) return [];
        return tx
          .update(table)
          .set(values)
          .where(and(eq(table.id, target.id), this.where(name, predicate)))
          .returning();
      });
    return this.query
      .update(table)
      .set(values)
      .where(this.where(name, predicate))
      .returning();
  }
  async update(
    name: string,
    predicate: Predicate,
    patch: Patch,
    options: QueryOptions = {},
  ) {
    return {
      changes: (await this.change(name, predicate, patch, options, false))
        .length,
    };
  }
  async atomic(
    name: string,
    predicate: Predicate,
    patch: Patch,
    options: QueryOptions = {},
  ) {
    return this.decode(
      name,
      (await this.change(name, predicate, patch, options, true))[0],
    );
  }
  async remove(name: string, predicate: Predicate) {
    await this.ready;
    return {
      changes: (
        await this.query
          .delete(this.table(name))
          .where(this.where(name, predicate))
          .returning({ id: this.table(name).id })
      ).length,
    };
  }
  async groupedCount(name: string, field: string, predicate: Predicate) {
    await this.ready;
    const col = this.column(name, field);
    return this.query
      .select({ value: col, n: sql<number>`count(*)::int` })
      .from(this.table(name))
      .where(this.where(name, predicate))
      .groupBy(col);
  }
  transaction<T>(callback: () => Promise<T> | T) {
    return async (): Promise<T> => {
      await this.ready;
      if (this.inTransaction) return callback();
      for (let attempt = 0; ; attempt++) {
        try {
          return await this.orm.transaction(
            (tx) => this.context.run(tx as any, async () => callback()),
            { isolationLevel: "serializable" },
          );
        } catch (error: any) {
          if (
            !["40001", "40P01", "23505"].includes(
              error.code || error.cause?.code,
            ) ||
            attempt >= 4
          )
            throw error;
          await Bun.sleep(10 * (attempt + 1));
        }
      }
    };
  }
  async snapshotPut(input: unknown, snapshotId: string = randomUUID()) {
    const doc = documentSchema.parse(input);
    if (Buffer.byteLength(JSON.stringify(doc)) > MAX_DOCUMENT_BYTES)
      throw Object.assign(new Error("Content exceeds the 32 MiB limit."), {
        status: 413,
      });
    const { slides, ...metadata } = doc;
    await this.transaction(async () => {
      await this.insert("snapshots", {
        id: snapshotId,
        workspaceId: doc.workspaceId,
        schemaVersion: doc.version,
        metadata,
      });
      for (let position = 0; position < slides.length; position++)
        await this.insert("slides", {
          snapshotId,
          slideId: slides[position].id,
          position,
          content: slides[position],
        });
    })();
    return snapshotId;
  }
  async snapshotRead(id: string) {
    const root = await this.one("snapshots", { id });
    if (!root) throw new Error("Missing presentation snapshot.");
    const rows = await this.find(
      "slides",
      { snapshotId: id },
      { sort: { position: 1 }, limit: 201 },
    );
    const doc = { ...root.metadata, slides: rows.map((row) => row.content) };
    if (Buffer.byteLength(JSON.stringify(doc)) > MAX_DOCUMENT_BYTES)
      throw new Error("Oversized snapshot.");
    return documentSchema.parse(doc);
  }
  async migrate() {
    await this.ready;
    const client = await this.client.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtext($1))", [
        `frame-migrations:${this.name}`,
      ]);
      if (
        (
          await client.query("SELECT to_regclass($1) AS name", [
            `${this.name}.__drizzle_migrations`,
          ])
        ).rows[0].name
      ) {
        const existing = await client.query(
            `SELECT hash, created_at FROM "${this.name}".__drizzle_migrations ORDER BY created_at`,
          ),
          migrations = readMigrationFiles({ migrationsFolder });
        for (const row of existing.rows)
          if (
            !migrations.some(
              (m) =>
                m.folderMillis === Number(row.created_at) &&
                m.hash === row.hash,
            )
          )
            throw new Error("Migration checksum changed. Add a new migration.");
      }
      await migrate(drizzle(client), {
        migrationsFolder,
        migrationsSchema: this.name,
      });
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [
        `frame-migrations:${this.name}`,
      ]);
      client.release();
    }
  }
  async migrationReady() {
    await this.ready;
    const expected = readMigrationFiles({ migrationsFolder }).at(-1)!;
    const result = await this.client.query(
      `SELECT hash FROM "${this.name}".__drizzle_migrations WHERE created_at = $1`,
      [expected.folderMillis],
    );
    return result.rows[0]?.hash === expected.hash;
  }
  async ping() {
    await this.ready;
    await this.query.execute(sql`select 1`);
    return true;
  }
  async close() {
    await this.client.end();
  }
}
