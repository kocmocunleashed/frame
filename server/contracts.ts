import { z } from "zod";
import type { Hono } from "hono";
import { ApiError } from "./store";
import type { Database } from "./database";
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(2048).optional(),
});
const cursorSchema = z.tuple([z.string().max(80), z.string().max(200)]);
export function decodeCursor(cursor?: string): [string, string] | null {
  if (!cursor) return null;
  try {
    return cursorSchema.parse(
      JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")),
    );
  } catch {
    throw new ApiError(400, "The page cursor is invalid.", "INVALID_CURSOR");
  }
}
export const itemKey = (item: any): [string, string] => [
  item.updatedAt || item.createdAt || item.publication?.updatedAt || "",
  String(item.id || item.publication?.id || item.revision || ""),
];
export function paginate(items: any[], query: Record<string, string>) {
  const { limit, cursor } = pageQuerySchema.parse(query),
    after = decodeCursor(cursor);
  const key = (a: any) => itemKey(a);
  const ordered = [...items].sort(
    (a, b) =>
      key(b)[0].localeCompare(key(a)[0]) || key(a)[1].localeCompare(key(b)[1]),
  );
  const available = after
    ? ordered.filter((row) => {
        const [date, id] = key(row);
        return date < after[0] || (date === after[0] && id > after[1]);
      })
    : ordered;
  const page = available.slice(0, limit);
  return {
    items: page,
    nextCursor:
      available.length > limit
        ? Buffer.from(JSON.stringify(key(page[page.length - 1]))).toString(
            "base64url",
          )
        : null,
  };
}
/** Page the authorized database query, including rows beyond the first page's cap. */
export async function collectionPage<T>(
  db: Database,
  collection: string,
  filter: Record<string, unknown>,
  query: Record<string, string>,
  project: (row: any) => T | null | Promise<T | null>,
  field: "updatedAt" | "createdAt" = "updatedAt",
) {
  const { limit, cursor } = pageQuerySchema.parse(query),
    after = decodeCursor(cursor);
  const rows = await db.find(
    collection,
    after
      ? {
          $and: [
            filter,
            {
              $or: [
                { [field]: { $lt: after[0] } },
                { [field]: after[0], id: { $gt: after[1] } },
              ],
            },
          ],
        }
      : filter,
    { sort: { [field]: -1, _id: 1 }, limit: limit + 1 },
  );
  const selected = rows.slice(0, limit),
    items: T[] = [];
  for (const row of selected) {
    const value = await project(row);
    if (value !== null) items.push(value);
  }
  const last = selected.at(-1);
  return {
    items,
    nextCursor:
      rows.length > limit && last
        ? Buffer.from(JSON.stringify([last[field], last.id])).toString(
            "base64url",
          )
        : null,
  };
}
/** The source UI's previous array envelopes remain explicitly negotiable. */
export function registerContracts(app: Hono<any>) {
  app.use("/api/*", async (c, next) => {
    await next();
    if (
      !c.res.ok ||
      c.req.header("X-Frame-Contract") === "reference" ||
      !c.res.headers.get("content-type")?.includes("application/json")
    )
      return;
    const body = await c.res.clone().json();
    if (c.req.method === "GET" && Array.isArray(body))
      c.res = c.json(
        paginate(body, c.req.query()),
        c.res.status as any,
        Object.fromEntries(c.res.headers),
      );
    else if (
      c.req.method === "POST" &&
      /^\/api\/creation\/[^/]+\/jobs$/.test(c.req.path) &&
      body.job
    )
      c.res = c.json(
        { ...body.job, draft: body.draft },
        202,
        Object.fromEntries(c.res.headers),
      );
  });
}
/** baseRevision is canonical; revision is accepted only for source-client compatibility. */
export function revisionInput(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const body = value as Record<string, unknown>;
    if (
      body.baseRevision !== undefined &&
      body.revision !== undefined &&
      body.baseRevision !== body.revision
    )
      throw new ApiError(400, "Conflicting revision fields.");
    return { ...body, revision: body.baseRevision ?? body.revision };
  }
  return value;
}
