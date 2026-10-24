import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "./mongo";
import { JobFailure, JobQueue, JobWorker } from "../server/jobs";
const stores: Store[] = [],
  dirs: string[] = [];
afterEach(async () => {
  for (const s of stores.splice(0)) await s.db.close();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
async function setup() {
  const store = new Store(":memory:");
  stores.push(store);
  const user = await store.createUser(
    "Jobs",
    "jobs@example.test",
    "unused-test-hash",
  );
  return { store, user, queue: new JobQueue(store) };
}
test("a transactional render slot bounds Chromium while another worker advances AI", async () => {
  const { store, user } = await setup();
  let now = Date.now();
  const a = new JobQueue(store, "render-a", () => now, 1000);
  const b = new JobQueue(store, "render-b", () => now, 1000);
  const first = await a.enqueue(user.id, "export", {}, "render-first");
  const second = await a.enqueue(user.id, "export", {}, "render-second");
  const outline = await a.enqueue(user.id, "outline", {}, "render-outline");
  const claims = await Promise.all([a.claim(first.id), b.claim(second.id)]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  const owner = claims[0] ? a : b,
    other = claims[0] ? b : a;
  const held = claims.find(Boolean)!;
  const waiting = held.id === first.id ? second : first;
  expect((await other.get(waiting.id, user.id)).attempts).toBe(0);
  expect((await other.claim())?.id).toBe(outline.id);
  now += 600;
  expect(await owner.heartbeat(held.id)).toBe(true);
  now += 500;
  expect(await other.claim(waiting.id)).toBeNull();
  expect(await owner.complete(held.id, {})).toBe(true);
  expect((await other.claim(waiting.id))?.id).toBe(waiting.id);
  // A late release from the old owner cannot free somebody else's slot.
  await owner.releaseRenderSlot(held);
  expect(
    (await store.db.one("operationLeases", { id: "chromium-export" })).jobId,
  ).toBe(waiting.id);
  expect(await other.heartbeat(waiting.id)).toBe(true);
});
test("cancelled and expired rendering attempts cannot overlap a live slot or release its successor", async () => {
  const { store, user } = await setup();
  let now = Date.now();
  const a = new JobQueue(store, "render-a", () => now, 1000);
  const b = new JobQueue(store, "render-b", () => now, 1000);
  const first = await a.enqueue(user.id, "export", {}, "cancel-render");
  const second = await a.enqueue(user.id, "export", {}, "next-render");
  const held = (await a.claim(first.id))!;
  await a.cancel(first.id, user.id);
  expect(await b.claim(second.id)).toBeNull();
  expect(await a.heartbeat(first.id)).toBe(false);
  now += 1001;
  expect((await b.claim(second.id))?.id).toBe(second.id);
  await a.releaseRenderSlot(held);
  expect(await a.complete(first.id, { late: true })).toBe(false);
  expect(await b.heartbeat(second.id)).toBe(true);
  now += 1001;
  const resumed = await a.claim(second.id);
  expect(resumed?.leaseToken).toBe(2);
  expect(await b.heartbeat(second.id)).toBe(false);
  expect(await b.complete(second.id, { stale: true })).toBe(false);
  expect(await a.complete(second.id, { ready: true })).toBe(true);
});
test("render capacity deferral persists one replacement wakeup without consuming an application attempt", async () => {
  const { store, user } = await setup();
  let now = Date.now();
  const queue = new JobQueue(store, "capacity", () => now, 1000);
  const job = await queue.enqueue(user.id, "export", {}, "defer-export");
  const deferred = await Promise.all([
    queue.deferRendering(job.id, 0),
    queue.deferRendering(job.id, 0),
  ]);
  expect(deferred.filter(Boolean)).toHaveLength(1);
  expect((await queue.get(job.id, user.id)).attempts).toBe(0);
  expect(await queue.claim(job.id)).toBeNull();
  expect(
    await store.db.count("outbox", {
      jobId: job.id,
      dispatchGeneration: 1,
      sentAt: null,
    }),
  ).toBe(1);
  now += 30001;
  expect((await queue.claim(job.id))?.attempts).toBe(1);
  expect(await queue.deferRendering(job.id, 1)).toBe(false);
});
test("job enqueue is idempotent, detects changed payloads, limits outstanding work and protects ownership", async () => {
  const { queue, user } = await setup(),
    first = await queue.enqueue(
      user.id,
      "outline",
      { topic: "Story" },
      "request-1",
    );
  expect(
    (await queue.enqueue(user.id, "outline", { topic: "Story" }, "request-1"))
      .id,
  ).toBe(first.id);
  await expect(
    (async () =>
      await queue.enqueue(
        user.id,
        "outline",
        { topic: "Other" },
        "request-1",
      ))(),
  ).rejects.toThrow("different work");
  await expect(
    (async () => await queue.get(first.id, "someone-else"))(),
  ).rejects.toThrow("not found");
  for (let i = 0; i < 4; i++)
    await queue.enqueue(user.id, "outline", { i }, `request-${i + 2}`);
  await expect(
    (async () => await queue.enqueue(user.id, "outline", {}, "six"))(),
  ).rejects.toThrow("Five jobs");
  await queue.cancel(first.id, user.id);
  expect((await queue.enqueue(user.id, "outline", {}, "six")).status).toBe(
    "queued",
  );
});
test("two worker identities respect active leases and reclaim only expired work; stale completions are rejected", async () => {
  const root = mkdtempSync(join(tmpdir(), "frame-job-test-"));
  dirs.push(root);
  const path = join(root, "frame.sqlite");
  const a = new Store("file:" + path),
    b = a;
  stores.push(a);
  const user = await a.createUser(
    "Jobs",
    "jobs@example.test",
    "unused-test-hash",
  );
  let now = 100000;
  const q1 = new JobQueue(a, "worker-a", () => now, 100),
    q2 = new JobQueue(b, "worker-b", () => now, 100);
  const job = await q1.enqueue(user.id, "outline", { topic: "Story" }, "one");
  expect((await q1.claim())?.id).toBe(job.id);
  expect(await q2.claim()).toBeNull();
  new JobWorker(q2, async () => ({}));
  expect((await q2.get(job.id, user.id)).status).toBe("running");
  now += 50;
  expect(await q1.heartbeat(job.id)).toBe(true);
  now += 60;
  expect(await q2.claim()).toBeNull();
  now += 50;
  expect((await q2.claim())?.attempts).toBe(2);
  expect(await q1.complete(job.id, { wrong: true })).toBe(false);
  expect(await q2.complete(job.id, { outline: "Ready" })).toBe(true);
  expect(JSON.parse((await q1.get(job.id, user.id)).result!)).toEqual({
    outline: "Ready",
  });
});
test("worker records validated progress and durable success without changing presentations", async () => {
  const { queue, user, store } = await setup(),
    job = await queue.enqueue(user.id, "outline", { topic: "Story" }, "one");
  const worker = new JobWorker(queue, async (_job, context) => {
    await context.progress("Reviewing source material", 40);
    expect(
      JSON.parse((await queue.get(job.id, user.id)).progress).percent,
    ).toBe(40);
    return { title: "Clear narrative" };
  });
  expect(await worker.runOnce()).toBe(true);
  const result = await queue.get(job.id, user.id);
  expect(result.status).toBe("succeeded");
  expect(JSON.parse(result.result!)).toEqual({ title: "Clear narrative" });
  expect(await worker.runOnce()).toBe(false);
  expect(
    (
      (await { n: await store.db.count("decks", {}) }) as {
        n: number;
      }
    ).n,
  ).toBe(0);
});
test("cancellation cannot later publish a result, even when a provider ignores its abort signal", async () => {
  const { queue, user } = await setup(),
    job = await queue.enqueue(user.id, "outline", {}, "one");
  let finish: (v: unknown) => void = () => {};
  const worker = new JobWorker(
    queue,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const running = worker.runOnce();
  await worker.cancel(job.id, user.id);
  finish({ late: "result" });
  await running;
  expect((await queue.get(job.id, user.id)).status).toBe("cancelled");
  expect((await queue.get(job.id, user.id)).result).toBeNull();
});
test("transient failures retry with a delay and stop after three attempts; crashes also have a bounded recovery", async () => {
  const { queue, user } = await setup();
  let now = 100000;
  queue.now = () => now;
  const job = await queue.enqueue(user.id, "outline", {}, "one");
  const worker = new JobWorker(queue, async () => {
    throw new JobFailure("Provider temporarily unavailable", true);
  });
  await worker.runOnce();
  expect((await queue.get(job.id, user.id)).status).toBe("queued");
  expect(await queue.claim()).toBeNull();
  now += 10000;
  await worker.runOnce();
  now += 20000;
  await worker.runOnce();
  expect((await queue.get(job.id, user.id)).status).toBe("failed");
  expect((await queue.get(job.id, user.id)).attempts).toBe(3);
  const crashed = await queue.enqueue(user.id, "outline", {}, "two");
  for (let i = 0; i < 3; i++) {
    expect((await queue.claim())?.id).toBe(crashed.id);
    now += queue.leaseMs + 1;
  }
  expect(await queue.claim()).toBeNull();
  expect((await queue.get(crashed.id, user.id)).status).toBe("failed");
});
test("hard timeouts bound providers that never settle", async () => {
  const { queue, user } = await setup(),
    job = await queue.enqueue(user.id, "outline", {}, "one");
  let signal: AbortSignal | undefined;
  const worker = new JobWorker(
    queue,
    async (_j, c) => {
      signal = c.signal;
      await new Promise(() => {});
    },
    20,
  );
  await worker.runOnce();
  expect(signal?.aborted).toBe(true);
  expect((await queue.get(job.id, user.id)).status).toBe("queued");
  expect((await queue.get(job.id, user.id)).error).toContain("timed out");
});
test("graceful worker shutdown releases its own lease without losing pending work", async () => {
  const { queue, user } = await setup(),
    job = await queue.enqueue(user.id, "outline", {}, "one");
  const worker = new JobWorker(queue, () => new Promise(() => {}));
  const run = worker.runOnce();
  await worker.stop();
  await run;
  expect((await queue.get(job.id, user.id)).status).toBe("queued");
  const replacement = new JobQueue(queue.store, "replacement");
  expect((await replacement.claim())?.id).toBe(job.id);
  expect(await replacement.complete(job.id, { recovered: true })).toBe(true);
});
