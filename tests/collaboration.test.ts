import { afterEach, expect, test } from "bun:test";
import { Store } from "./mongo";
import { createApp } from "./support/legacy-app";
import { createAIServices } from "../server/creation";
import { Collaboration } from "../server/collaboration";
import { LiveSessions } from "../server/live";
import { PublicationStore } from "../server/publications";
import { newElement } from "../shared/operations";
import { uid, type User } from "../shared/schema";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
const stores: Store[] = [],
  files: string[] = [];
afterEach(async () => {
  for (const s of stores.splice(0)) await s.db.close();
  for (const path of files.splice(0)) rmSync(path, { force: true });
});
const req = (method: string, cookie = "", body?: unknown): RequestInit => ({
  method,
  headers: { cookie, "content-type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
async function setup() {
  const store = new Store(":memory:");
  stores.push(store);
  const ai = createAIServices(store),
    app = createApp(store, ai);
  async function account(name: string) {
    const email = `${uid()}@example.test`,
      res = await app.request(
        "/api/auth/signup",
        req("POST", "", { name, email, password: "sharing-test-passphrase" }),
      ),
      { user } = (await res.json()) as {
        user: User;
      };
    return {
      user,
      email,
      cookie: res.headers.get("set-cookie")!.split(";")[0],
    };
  }
  const owner = await account("Owner"),
    other = await account("Reviewer"),
    stranger = await account("Stranger"),
    doc = await store.create(
      owner.user,
      "A reviewable story",
      "story",
      "studio",
    );
  doc.slides[0].notes = "PRIVATE_REVIEW_NOTES";
  doc.slides[0].elements.push(
    newElement("question", {
      question: {
        kind: "multiple-choice",
        prompt: "Choose one",
        options: ["A", "B"],
        correctIndex: 1,
        explanation: "PRIVATE_REVIEW_ANSWER",
      },
    }),
  );
  const saved = await store.replace(doc.id, owner.user, 0, doc);
  let now = 1000;
  const collaboration = new Collaboration(store, () => now);
  return {
    store,
    app,
    ai,
    owner,
    other,
    stranger,
    doc: saved,
    collaboration,
    advance: (ms: number) => (now += ms),
  };
}
test("owner grants and revokes cross-workspace viewer/editor roles with conflict checks; list/review projections keep private data out", async () => {
  const { app, owner, other, stranger, doc, collaboration, store } =
    await setup();
  const endpoint = `/api/decks/${doc.id}/access`;
  expect(
    (
      await app.request(
        endpoint,
        req("POST", stranger.cookie, {
          email: other.email,
          role: "editor",
          expectedRole: null,
        }),
      )
    ).status,
  ).toBe(404);
  let access = await collaboration.grant(doc.id, owner.user, {
    email: other.email,
    role: "viewer",
    expectedRole: null,
  });
  expect(access.grants[0].role).toBe("viewer");
  expect(await store.role(doc.id, other.user)).toBe("viewer");
  for (const path of [
    `/api/decks/${doc.id}`,
    `/api/decks/${doc.id}/revisions`,
    `/api/decks/${doc.id}/exports`,
  ])
    expect((await app.request(path, req("GET", other.cookie))).status).toBe(
      403,
    );
  const review = await (
    await app.request(`/api/decks/${doc.id}/review`, req("GET", other.cookie))
  ).json();
  expect(review.role).toBe("viewer");
  expect(JSON.stringify(review)).not.toContain("PRIVATE_REVIEW");
  expect(JSON.stringify(review)).not.toContain("correctIndex");
  const list = await (
    await app.request("/api/decks", req("GET", other.cookie))
  ).json();
  const item = list.find((value: { id: string }) => value.id === doc.id);
  expect(item.accessRole).toBe("viewer");
  expect(JSON.stringify(item)).not.toContain("PRIVATE_REVIEW");
  await expect(
    (async () =>
      await collaboration.grant(doc.id, other.user, {
        email: stranger.email,
        role: "editor",
        expectedRole: null,
      }))(),
  ).rejects.toThrow("Only the presentation owner");
  await expect(
    (async () =>
      await collaboration.grant(doc.id, owner.user, {
        email: other.email,
        role: "editor",
        expectedRole: null,
      }))(),
  ).rejects.toThrow("another window");
  access = await collaboration.grant(doc.id, owner.user, {
    email: other.email,
    role: "editor",
    expectedRole: "viewer",
  });
  expect(access.grants[0].role).toBe("editor");
  expect(
    (await app.request(`/api/decks/${doc.id}`, req("GET", other.cookie)))
      .status,
  ).toBe(200);
  const saved = await store.mutate(doc.id, other.user, doc.revision, [
    {
      type: "element.update",
      slideId: doc.slides[0].id,
      ids: [doc.slides[0].elements[0].id],
      patch: { text: "An editor revision" },
    },
  ]);
  expect(saved.revision).toBe(doc.revision + 1);
  await expect(
    (async () =>
      await store.mutate(doc.id, owner.user, doc.revision, [
        { type: "document.update", patch: { title: "A stale overwrite" } },
      ]))(),
  ).rejects.toThrow("changed in another tab");
  await expect(
    (async () =>
      await store.mutate(doc.id, other.user, saved.revision, [
        { type: "document.update", patch: { status: "trashed" } },
      ]))(),
  ).rejects.toThrow("Only the owner");
  await expect(
    (async () => await store.duplicate(doc.id, other.user))(),
  ).rejects.toThrow("Only the owner");
  await collaboration.revoke(doc.id, owner.user, other.user.id, "editor");
  expect(await store.role(doc.id, other.user)).toBeNull();
  expect(
    (await app.request(`/api/decks/${doc.id}/review`, req("GET", other.cookie)))
      .status,
  ).toBe(404);
});
test("comments support viewer review, anchor validation, author removal and editor resolution without executable content", async () => {
  const { owner, other, stranger, doc, collaboration } = await setup();
  await collaboration.grant(doc.id, owner.user, {
    email: other.email,
    role: "viewer",
    expectedRole: null,
  });
  const comment = await collaboration.addComment(doc.id, other.user, {
    body: "Please explain this term. <script>alert(1)</script>",
    slideId: doc.slides[0].id,
    elementId: doc.slides[0].elements[0].id,
  });
  expect(comment.author).toBe("Reviewer");
  expect(comment.canDelete).toBe(true);
  expect((await collaboration.comments(doc.id, owner.user))[0].body).toContain(
    "<script>",
  );
  await expect(
    (async () => await collaboration.comments(doc.id, stranger.user))(),
  ).rejects.toThrow("not found");
  await expect(
    (async () =>
      await collaboration.addComment(doc.id, other.user, {
        body: "A comment",
        slideId: "missing",
        elementId: null,
      }))(),
  ).rejects.toThrow("removed");
  const ownerComment = await collaboration.addComment(doc.id, owner.user, {
    body: "A general review note",
    slideId: null,
    elementId: null,
  });
  await expect(
    (async () =>
      await collaboration.updateComment(
        doc.id,
        other.user,
        ownerComment.id,
        true,
      ))(),
  ).rejects.toThrow("author or an editor");
  expect(
    (await collaboration.updateComment(doc.id, owner.user, comment.id, true))
      .resolvedAt,
  ).not.toBeNull();
  expect(
    (await collaboration.updateComment(doc.id, other.user, comment.id, false))
      .resolvedAt,
  ).toBeNull();
  await expect(
    (async () =>
      await collaboration.deleteComment(doc.id, other.user, ownerComment.id))(),
  ).rejects.toThrow("author or owner");
  await collaboration.deleteComment(doc.id, other.user, comment.id);
  expect(await collaboration.comments(doc.id, owner.user)).toHaveLength(1);
});
test("presence expires and revocation ends the removed editor’s session and blocks their old job results", async () => {
  const { store, app, ai, owner, other, doc, collaboration, advance } =
    await setup();
  await collaboration.grant(doc.id, owner.user, {
    email: other.email,
    role: "editor",
    expectedRole: null,
  });
  await collaboration.heartbeat(doc.id, other.user, "edit");
  expect(
    (await collaboration.presence(doc.id, owner.user)).peers[0],
  ).toMatchObject({
    name: "Reviewer",
    role: "editor",
    mode: "edit",
  });
  advance(31000);
  expect((await collaboration.presence(doc.id, owner.user)).peers).toEqual([]);
  await collaboration.heartbeat(doc.id, other.user, "edit");
  const live = new LiveSessions(store),
    session = await live.start(doc.id, other.user, doc.revision),
    guest = await live.join(session.code),
    job = await ai.queue.enqueue(
      other.user.id,
      "edit",
      { private: "PRIVATE_JOB" },
      uid(),
      doc.id,
    );
  await store.db.update("jobs",{id:job.id},{$set:{status:"succeeded",result:JSON.stringify({ secret: "PRIVATE_RESULT" })}});
  await collaboration.grant(doc.id, owner.user, {
    email: other.email,
    role: "viewer",
    expectedRole: "editor",
  });
  expect((await live.audience(session.code, guest.token)).ended).toBe(true);
  await expect(
    (async () => await collaboration.heartbeat(doc.id, other.user, "edit"))(),
  ).rejects.toThrow("view-only");
  expect(
    (await app.request(`/api/jobs/${job.id}`, req("GET", other.cookie))).status,
  ).toBe(403);
  expect(
    (
      await app.request(
        `/api/jobs/${job.id}/cancel`,
        req("POST", other.cookie, {}),
      )
    ).status,
  ).toBe(403);
  const jobs = await (
    await app.request("/api/jobs", req("GET", other.cookie))
  ).json();
  expect(jobs.some((j: { id: string }) => j.id === job.id)).toBe(false);
});
test("viewers can access only visible referenced media and private publications; revocation stops both immediately", async () => {
  const { store, app, owner, other, doc, collaboration } = await setup(),
    visible = uid(),
    unused = uid();
  const root = process.env.FRAME_ASSETS || ".frame-data/assets";
  mkdirSync(root, { recursive: true });
  for (const id of [visible, unused]) {
    const path = `${root}/${id}`;
    writeFileSync(path, "visible media fixture");
    files.push(path);
    await store.db.insert("assets",{id:id,ownerId:owner.user.id,workspaceId:owner.user.workspaceId,name:"fixture.webp",mime:"image/webp",bytes:21,storageKey:id,createdAt:new Date().toISOString()});
  }
  doc.slides[0].elements.push(
    newElement("image", { src: `/api/assets/${visible}` }),
  );
  await store.replace(doc.id, owner.user, doc.revision, doc);
  await collaboration.grant(doc.id, owner.user, {
    email: other.email,
    role: "viewer",
    expectedRole: null,
  });
  const publications = new PublicationStore(store),
    pub = await publications.publish(doc.id, owner.user, {
      baseRevision: doc.revision + 1,
      expectedEdition: null,
      visibility: "private",
      allowDownload: false,
    });
  expect(
    (await app.request(`/api/publications/${pub.id}`, req("GET", other.cookie)))
      .status,
  ).toBe(200);
  expect(
    (
      await app.request(
        `/api/decks/${doc.id}/review/assets/${visible}`,
        req("GET", other.cookie),
      )
    ).status,
  ).toBe(200);
  expect(
    (await app.request(`/api/assets/${visible}`, req("GET", other.cookie)))
      .status,
  ).toBe(200);
  expect(
    (await app.request(`/api/assets/${unused}`, req("GET", other.cookie)))
      .status,
  ).toBe(404);
  await collaboration.revoke(doc.id, owner.user, other.user.id, "viewer");
  expect(
    (await app.request(`/api/publications/${pub.id}`, req("GET", other.cookie)))
      .status,
  ).toBe(403);
  expect(
    (await app.request(`/api/assets/${visible}`, req("GET", other.cookie)))
      .status,
  ).toBe(404);
  expect(
    (
      await app.request(
        `/api/decks/${doc.id}/review/assets/${visible}`,
        req("GET", other.cookie),
      )
    ).status,
  ).toBe(404);
});
test("a stale shared edit can become an owned recovery copy with independent media authorization, while unrelated media is rejected", async () => {
  const { store, app, owner, other, doc, collaboration } = await setup(),
    asset = uid(),
    unrelated = uid();
  const root = process.env.FRAME_ASSETS || ".frame-data/assets";
  mkdirSync(root, { recursive: true });
  for (const id of [asset, unrelated]) {
    const path = `${root}/${id}`;
    writeFileSync(path, "copied media fixture");
    files.push(path);
    await store.db.insert("assets",{id:id,ownerId:owner.user.id,workspaceId:owner.user.workspaceId,name:"recovery.webp",mime:"image/webp",bytes:20,storageKey:id,createdAt:new Date().toISOString()});
  }
  doc.slides[0].elements.push(
    newElement("image", { src: `/api/assets/${asset}` }),
  );
  const saved = await store.replace(doc.id, owner.user, doc.revision, doc);
  await collaboration.grant(doc.id, owner.user, {
    email: other.email,
    role: "editor",
    expectedRole: null,
  });
  const local = await structuredClone(saved);
  local.slides[0].elements[0].text = "A preserved local edit";
  await store.mutate(doc.id, owner.user, saved.revision, [
    { type: "document.update", patch: { title: "A newer shared version" } },
  ]);
  const copy = await collaboration.recoveryCopy(doc.id, other.user, local);
  expect(copy.ownerId).toBe(other.user.id);
  expect(copy.workspaceId).toBe(other.user.workspaceId);
  expect(copy.slides[0].id).not.toBe(local.slides[0].id);
  const src = copy.slides[0].elements.find((e) => e.type === "image")!.src!;
  expect(src).not.toBe(`/api/assets/${asset}`);
  expect(
    (
      (await store.db.one("assets",{id:src.slice(12)})) as {
        storageKey: string;
      }
    ).storageKey,
  ).toBe(asset);
  await collaboration.revoke(doc.id, owner.user, other.user.id, "editor");
  expect((await app.request(src, req("GET", other.cookie))).status).toBe(200);
  expect(
    (await app.request(`/api/assets/${asset}`, req("GET", other.cookie)))
      .status,
  ).toBe(404);
  expect(
    (await store.access(copy.id, other.user)).slides[0].elements[0].text,
  ).toBe("A preserved local edit");
  await collaboration.grant(doc.id, owner.user, {
    email: other.email,
    role: "editor",
    expectedRole: null,
  });
  const malicious = await structuredClone(local);
  malicious.slides[0].elements.find((e) => e.type === "image")!.src =
    `/api/assets/${unrelated}`;
  const count = (
    (await ({n:await store.db.count("decks",{})})) as {
      n: number;
    }
  ).n;
  await expect(
    (async () =>
      await collaboration.recoveryCopy(doc.id, other.user, malicious))(),
  ).rejects.toThrow("outside your authorized presentation");
  expect(
    (
      (await ({n:await store.db.count("decks",{})})) as {
        n: number;
      }
    ).n,
  ).toBe(count);
});
