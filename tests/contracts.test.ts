import { afterEach, expect, test } from "bun:test";
import { Store } from "./mongo";
import { createApp } from "./support/legacy-app";
import { createAIServices } from "../server/creation";
import { FixtureAIProvider } from "./fixtures/ai-provider";
import { parseWake } from "../server/queue/transport";
import {collectionPage} from '../server/contracts';
const stores: Store[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.db.close();
});
test('cursor queries reach older records without repeats and retain a cursor across denied rows',async()=>{
 const store=new Store();stores.push(store);await store.testReady;
 for(let i=0;i<125;i++)await store.db.insert('pageFixture',{id:String(i).padStart(3,'0'),ownerId:'one',updatedAt:'2026-01-01T00:00:00.000Z'});
 await store.db.insert('pageFixture',{id:'foreign',ownerId:'two',updatedAt:'2026-01-02T00:00:00.000Z'});
 let cursor:string|null=null;const ids:string[]=[];
 do {const page:{items:string[];nextCursor:string|null}=await collectionPage<string>(store.db,'pageFixture',{ownerId:'one'},{limit:'20',...(cursor?{cursor}:{})},row=>row.id<'020'?null:row.id);ids.push(...page.items);cursor=page.nextCursor;}while(cursor);
 expect(ids).toHaveLength(105);expect(new Set(ids).size).toBe(105);expect(ids.at(-1)).toBe('124');expect(ids).not.toContain('foreign');
});
test("fresh wire contract pages lists, accepts baseRevision, returns direct jobs and retains reference compatibility", async () => {
  const store = new Store();
  stores.push(store);
  const services = createAIServices(store, new FixtureAIProvider()),
    app = createApp(store, services);
  const signup = await app.request("/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Contract reader",
      email: "contract@example.test",
    }),
  });
  const cookie = signup.headers.get("set-cookie")!.split(";")[0];
  const request = (method = "GET", body?: unknown, contract = "1") => ({
    method,
    headers: {
      cookie,
      "content-type": "application/json",
      "X-Frame-Contract": contract,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const first = await (
    await app.request("/api/decks?limit=1", request())
  ).json();
  expect(first.items).toHaveLength(1);
  expect(first.nextCursor).toBeString();
  const second = await (
    await app.request(
      `/api/decks?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`,
      request(),
    )
  ).json();
  expect(second.items).toHaveLength(1);
  expect(second.items[0].id).not.toBe(first.items[0].id);
  expect(
    Array.isArray(
      await (
        await app.request("/api/decks", request("GET", undefined, "reference"))
      ).json(),
    ),
  ).toBe(true);
  expect(
    (await app.request("/api/decks?cursor=broken", request())).status,
  ).toBe(400);
  const draft = await (
    await app.request("/api/creation", request("POST", {}))
  ).json();
  draft.data.brief.topic = "A testable story";
  const update = await app.request(
    `/api/creation/${draft.id}`,
    request("PUT", { baseRevision: 0, data: draft.data }),
  );
  expect(update.status).toBe(200);
  const job = await app.request(
    `/api/creation/${draft.id}/jobs`,
    request("POST", {
      baseRevision: 1,
      kind: "outline",
      key: "contract-outline",
    }),
  );
  expect(job.status).toBe(202);
  const body = await job.json();
  expect(body.kind).toBe("outline");
  expect(body.id).toBeString();
  expect(body.job).toBeUndefined();
  expect(body.draft.revision).toBe(2);
  const stale = await app.request(
    `/api/creation/${draft.id}`,
    request("PUT", { baseRevision: 0, data: draft.data }),
  );
  expect(stale.status).toBe(409);
  expect((await stale.json()).error).toBeString();
});
test("queue wakeups reject malformed or oversized identities without crashing the consumer", () => {
  expect(parseWake("{")).toBeNull();
  expect(parseWake(undefined)).toBeNull();
  expect(
    parseWake(
      JSON.stringify({ jobId: "x", dispatchGeneration: 0, content: "private" }),
    ),
  ).toBeNull();
  expect(
    parseWake(
      JSON.stringify({ jobId: "a".repeat(101), dispatchGeneration: 0 }),
    ),
  ).toBeNull();
  expect(
    parseWake(JSON.stringify({ jobId: "job-1", dispatchGeneration: 2 })),
  ).toEqual({ jobId: "job-1", dispatchGeneration: 2 });
});
