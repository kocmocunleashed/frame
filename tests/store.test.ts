import { afterEach, describe, test, expect } from "bun:test";
import { Store } from "./mongo";
import type { User } from "../shared/schema";
import { newElement } from "../shared/operations";
import { rmSync } from "node:fs";
const stores: Store[] = [];
const store = () => {
  const s = new Store(":memory:");
  stores.push(s);
  return s;
};
const user = async (s: Store, name = "Alex"): Promise<User> =>
  await s.createUser(
    name,
    `${name.toLowerCase()}@example.test`,
    "hashed-password",
  );
afterEach(async () => {
  for (const s of stores.splice(0)) await s.db.close();
});
describe("persistence, revisions and authorization", () => {
  test("migrations create separate records for product resources", async () => {
    const s = store();
    await s.testReady;
    const tables = await s.db.raw.listCollections().toArray();
    expect(tables.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "users",
        "workspaces",
        "decks",
        "snapshots",
        "contentChunks",
        "revisions",
        "assets",
        "themes",
        "jobs",
        "publications",
        "liveSessions",
        "comments",
      ]),
    );
  });
  test("document and slides survive a real database reopen", async () => {
    const path = `/tmp/frame-test-${crypto.randomUUID()}.sqlite`;
    const s = new Store("file:" + path),
      u = await user(s);
    const d = await s.create(u, "Persisted", "story", "studio");
    await s.db.close();
    const reopened = new Store("file:" + path);
    expect(await reopened.access(d.id, u)).toEqual(d);
    await reopened.db.close();
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(path + suffix, { recursive: true, force: true });
  });
  test("cross-workspace reading and writing are denied", async () => {
    const s = store(),
      alice = await user(s),
      bob = await user(s, "Bob"),
      d = await s.create(alice, "Private", "blank", "studio");
    await expect((async () => await s.access(d.id, bob))()).rejects.toThrow(
      "not found",
    );
    await expect(
      (async () =>
        await s.mutate(d.id, bob, 0, [
          { type: "document.update", patch: { title: "Stolen" } },
        ]))(),
    ).rejects.toThrow("not found");
    await expect((async () => await s.duplicate(d.id, bob))()).rejects.toThrow(
      "not found",
    );
  });
  test("viewers can read but cannot mutate", async () => {
    const s = store(),
      alice = await user(s),
      bob = await user(s, "Bob"),
      d = await s.create(alice, "View only", "blank", "studio");
    await s.db.insert("members", {workspaceId:alice.workspaceId,userId:bob.id,role:"viewer"});
    expect((await s.access(d.id, bob)).title).toBe("View only");
    await expect(
      (async () =>
        await s.mutate(d.id, bob, 0, [
          { type: "document.update", patch: { title: "Changed" } },
        ]))(),
    ).rejects.toThrow("view-only");
  });
  test("stale revision fails without replacing the saved version", async () => {
    const s = store(),
      u = await user(s),
      d = await s.create(u, "Original", "blank", "studio");
    const next = await s.mutate(d.id, u, 0, [
      { type: "document.update", patch: { title: "First writer" } },
    ]);
    expect(next.revision).toBe(1);
    await expect(
      (async () =>
        await s.mutate(d.id, u, 0, [
          { type: "document.update", patch: { title: "Second writer" } },
        ]))(),
    ).rejects.toThrow("another tab");
    expect((await s.access(d.id, u)).title).toBe("First writer");
  });
  test("full snapshot restores cannot transfer ownership or workspace", async () => {
    const s = store(),
      u = await user(s),
      d = await s.create(u, "Original", "blank", "studio");
    const next = await s.replace(d.id, u, 0, {
      ...d,
      ownerId: "attacker",
      workspaceId: "another",
    });
    expect(next.ownerId).toBe(u.id);
    expect(next.workspaceId).toBe(u.workspaceId);
    expect(next.createdAt).toBe(d.createdAt);
  });
  test("a failed operation batch does not create partial revisions", async () => {
    const s = store(),
      u = await user(s),
      d = await s.create(u, "Original", "blank", "studio");
    await expect(
      (async () =>
        await s.mutate(d.id, u, 0, [
          { type: "document.update", patch: { title: "Unsaved" } },
          {
            type: "element.insert",
            slideId: "missing",
            elements: [newElement("text")],
          },
        ]))(),
    ).rejects.toThrow();
    expect(await s.access(d.id, u)).toEqual(d);
    expect(
      (
        (await ({n:await s.db.count("revisions",{})})) as {
          n: number;
        }
      ).n,
    ).toBe(1);
  });
  test("archive, trash and restore preserve slide content", async () => {
    const s = store(),
      u = await user(s),
      d = await s.create(u, "Keep me", "story", "studio");
    let revision = 0;
    for (const status of ["archived", "trashed", "active"] as const) {
      const next = await s.mutate(d.id, u, revision++, [
        { type: "document.update", patch: { status } },
      ]);
      expect(next.status).toBe(status);
      expect(next.slides).toEqual(d.slides);
    }
  });
  test("duplicate decks have fresh IDs and can coexist", async () => {
    const s = store(),
      u = await user(s),
      d = await s.create(u, "Original", "story", "studio");
    const copy = await s.duplicate(d.id, u);
    expect(copy.id).not.toBe(d.id);
    expect(copy.slides[0].elements[0].id).not.toBe(d.slides[0].elements[0].id);
    expect(await s.list(u)).toHaveLength(2);
  });
  test("revision retention is bounded at 80", async () => {
    const s = store(),
      u = await user(s),
      d = await s.create(u, "History", "blank", "studio");
    for (let i = 0; i < 83; i++)
      await s.mutate(d.id, u, i, [
        { type: "document.update", patch: { title: `Version ${i + 1}` } },
      ]);
    const count = (await ({n:await s.db.count("revisions",{deckId:d.id})})) as {
      n: number;
    };
    expect(count.n).toBe(80);
    expect((await s.access(d.id, u)).revision).toBe(83);
  });
});
