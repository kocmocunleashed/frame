import { afterEach, expect, test } from "bun:test";
import { Store } from "./mongo";
import { JobQueue } from "../server/jobs";
import { dispatchReady } from "../server/dispatch";
import { Uploads } from "../server/uploads";
import { contentHash, Database } from "../server/database";
import { objectStorage } from "../server/storage";
import { backup, verifyBackup, restoreBackup } from "../server/backup";
import { newElement } from "../shared/operations";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const stores: Store[] = [];
const create = () => {
  const s = new Store();
  stores.push(s);
  return s;
};
afterEach(async () => {
  for (const s of stores.splice(0)) await s.db.close();
});
test('migration preflight rejects duplicate identities before unique indexes and protects its checksum',async()=>{
 const db=new Database(process.env.FRAME_TEST_MONGODB_URI,'frame_test_migration_'+crypto.randomUUID().replaceAll('-',''));
 try {
  await db.ready;
  await db.raw.collection('users').insertMany([{email:'duplicate@example.test'},{email:'duplicate@example.test'}]);
  await expect(db.migrate()).rejects.toThrow('preflight found duplicates');
  expect(await db.raw.collection('schemaMigrations').countDocuments()).toBe(0);
  expect((await db.raw.collection('users').indexes()).some(i=>i.unique)).toBe(false);
  await db.raw.collection('users').deleteMany({});await db.migrate();
  await db.raw.collection('schemaMigrations').updateOne({_id:'1' as any},{$set:{checksum:'altered'}});
  await expect(db.migrate()).rejects.toThrow('checksum changed');
  expect(await db.raw.collection('operationLeases').countDocuments()).toBe(0);
 } finally {await db.close();}
});
test("two independent writers commit exactly one head and preserve immutable roots", async () => {
  const s = create(),
    user = await s.createUser("Writer", "writer@example.test"),
    doc = await s.create(user, "Race", "blank", "studio");
  const results = await Promise.allSettled(
    ["A", "B"].map((title) =>
      s.mutate(doc.id, user, 0, [
        { type: "document.update", patch: { title } },
      ]),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  expect((await s.access(doc.id, user)).revision).toBe(1);
  expect(await s.db.count("revisions", { deckId: doc.id })).toBe(2);
});
test("chunked documents exceed BSON size safely and reject altered chunks", async () => {
  const s = create(),
    u = await s.createUser("Large", "large@example.test"),
    doc = await s.create(u, "Large document", "blank", "studio");
  // Several independently valid slides assemble to more than a single BSON document.
  const text = "測".repeat(29000);
  doc.slides = Array.from({ length: 195 }, (_, i) => ({
    ...doc.slides[0],
    id: crypto.randomUUID(),
    title: `Slide ${i}`,
    notes: text,
  }));
  const root = await s.snapshot(doc);
  expect(Buffer.byteLength(JSON.stringify(doc))).toBeGreaterThan(
    16 * 1024 * 1024,
  );
  expect(await s.readSnapshot(root)).toEqual(doc);
  const payload = "x".repeat(2 * 1024 * 1024 + 1),
    id = await s.db.contentPut(u.workspaceId, payload);
  expect(await s.db.contentRead(id, u.workspaceId)).toBe(payload);
  expect(await s.db.count("contentChunks", { manifestId: id })).toBe(3);
  await s.db.raw
    .collection("contentChunks")
    .deleteOne({ manifestId: id, ordinal: 1 });
  await expect(s.db.contentRead(id, u.workspaceId)).rejects.toThrow(
    "Missing content chunk",
  );
});
test("outbox delivery failure and duplicate delivery retain one job and fenced success", async () => {
  const s = create(),
    u = await s.createUser("Queue", "queue@example.test"),
    q = new JobQueue(s),
    job = await q.enqueue(u.id, "outline", { topic: "test" }, "outbox-fixture");
  let sends = 0;
  await expect(
    dispatchReady(s, async () => {
      sends++;
      throw new Error("transport stopped after send");
    }),
  ).rejects.toThrow();
  await s.db.update("outbox", { jobId: job.id }, { $set: { availableAt: 0 } });
  await dispatchReady(s, async () => {
    sends++;
  });
  expect(sends).toBe(2);
  const first = await q.claim(job.id);
  expect(first).not.toBeNull();
  expect(await new JobQueue(s).claim(job.id)).toBeNull();
  expect(await q.complete(job.id, { ready: true }, first!.leaseToken)).toBe(
    true,
  );
  expect(await q.complete(job.id, { ready: false }, first!.leaseToken)).toBe(
    false,
  );
});
test("prepared uploads check ownership and checksums, and repeated finish returns one immutable asset", async () => {
  const s = create(),
    u = await s.createUser("Upload", "upload@example.test"),
    other = await s.createUser("Other", "other@example.test");
  const sharp = (await import("sharp")).default,
    bytes = new Uint8Array(
      await sharp({
        create: { width: 2, height: 2, channels: 3, background: "orange" },
      })
        .png()
        .toBuffer(),
    );
  const uploads = new Uploads(s);
  const policy = await uploads.prepare(u, {
    kind: "media",
    name: "small.png",
    mime: "image/png",
    bytes: bytes.length,
    checksum: contentHash(bytes),
  });
  const row = await uploads.get(policy.id, u);
  await expect(uploads.get(policy.id, other)).rejects.toThrow("not found");
  await objectStorage().put("staging", row.stagingKey, bytes, "image/png");
  const results = await Promise.all([
    uploads.finish(policy.id, u),
    uploads.finish(policy.id, u),
  ]);
  expect(results[0].id).toBe(results[1].id);
  expect(await s.db.count("assets", { ownerId: u.id })).toBe(1);
  expect((await uploads.finish(policy.id, u)).id).toBe(results[0].id);
  const bad = await uploads.prepare(u, {
    kind: "media",
    name: "bad.png",
    mime: "image/png",
    bytes: bytes.length,
    checksum: "a".repeat(64),
  });
  const b = await uploads.get(bad.id, u);
  await objectStorage().put("staging", b.stagingKey, bytes);
  await expect(uploads.finish(bad.id, u)).rejects.toThrow("checksum");
});
test("backup manifests detect corruption and restore into an empty isolated namespace", async () => {
  const s = create(),
    u = await s.createUser("Backup", "backup@example.test"),
    doc = await s.create(u, "Restored story", "story", "studio");
  const root = await mkdtemp(join(tmpdir(), "frame-backup-drill-"));
  const directory = join(root, "backup");
  const oldAssets = process.env.FRAME_ASSETS,
    oldExports = process.env.FRAME_EXPORTS;
  try {
    const manifest = await backup(s, directory);
    expect(manifest.counts.decks).toBe(1);
    await verifyBackup(directory);
    // A distinct, empty database and physical namespace are required, even in tests.
    const dest = create();
    await dest.testReady;
    await dest.db.raw.dropDatabase();
    process.env.FRAME_ASSETS = join(root, "restored-assets");
    process.env.FRAME_EXPORTS = join(root, "restored-exports");
    await restoreBackup(dest, directory);
    expect(await dest.access(doc.id, u)).toEqual(doc);
    await dest.mutate(doc.id, u, 0, [
      { type: "document.update", patch: { title: "Edited after restore" } },
    ]);
    await expect(restoreBackup(dest, directory)).rejects.toThrow("empty");
    const target = join(directory, manifest.files[0].path);
    const bytes = await readFile(target);
    await writeFile(target, Buffer.concat([bytes, Buffer.from("corrupt")]));
    await expect(verifyBackup(directory)).rejects.toThrow("checksum");
  } finally {
    process.env.FRAME_ASSETS = oldAssets;
    process.env.FRAME_EXPORTS = oldExports;
    await rm(root, { recursive: true, force: true });
  }
});

test('revocation that commits during content staging prevents the stale editor commit',async()=>{
 const {Collaboration}=await import('../server/collaboration');const store=create(),owner=await store.createUser('Owner','guard-owner@example.test'),editor=await store.createUser('Editor','guard-editor@example.test'),doc=await store.create(owner,'Guarded','blank','studio');
 const collab=new Collaboration(store);await collab.grant(doc.id,owner,{email:editor.email,role:'editor',expectedRole:null});
 let started!:()=>void,release!:()=>void;const staged=new Promise<void>(resolve=>started=resolve),gate=new Promise<void>(resolve=>release=resolve),snapshot=store.snapshot.bind(store);
 store.snapshot=async document=>{const id=await snapshot(document);started();await gate;return id;};
 const saving=store.mutate(doc.id,editor,0,[{type:'document.update',patch:{title:'Revoked edit'}}]);
 await staged;await collab.revoke(doc.id,owner,editor.id,'editor');release();
 await expect(saving).rejects.toThrow('not found');expect((await store.access(doc.id,owner)).revision).toBe(0);expect((await store.access(doc.id,owner)).title).toBe('Guarded');
});

test('unlimited finish and finite credit adjustment serialize on the same revision guard',async()=>{
 const {PresentationCredits}=await import('../server/credits');const store=create(),user=await store.createUser('Credits','credit-race@example.test'),admin=await store.createUser('Admin','credit-admin@example.test'),credits=new PresentationCredits(store),previous=process.env.FRAME_ADMIN_USER_IDS;
 process.env.FRAME_ADMIN_USER_IDS=admin.id;
 try{
  const results=await Promise.allSettled([store.db.transaction(()=>credits.consume(user.id))(),credits.set(user.id,admin.id,0,0)]);
  // Either finish wins and makes the admin revision stale, or the zero balance wins and blocks finish.
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  const balance=await credits.balance(user.id);expect(balance.revision).toBe(1);expect([null,0]).toContain(balance.remaining);
  const audit=await store.db.find('presentationCreditChanges',{userId:user.id});expect(audit).toHaveLength(balance.remaining===0?1:0);if(audit.length)expect(audit[0].actorId).toBe(admin.id);
 }finally{if(previous===undefined)delete process.env.FRAME_ADMIN_USER_IDS;else process.env.FRAME_ADMIN_USER_IDS=previous;}
});
