import { afterEach, expect, test } from "bun:test";
import { Store } from "./mongo";
import { createApp } from "./support/legacy-app";
import { PublicationStore } from "../server/publications";
import { newElement } from "../shared/operations";
import { uid, type User } from "../shared/schema";
import { publicProjection } from "../shared/publications";
const stores: Store[] = [];
afterEach(async () => {
  for (const store of stores.splice(0)) await store.db.close();
});
const req = (method: string, cookie = "", body?: unknown) => ({
  method,
  headers: { cookie, "content-type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
async function setup() {
  const store = new Store(":memory:");
  stores.push(store);
  const app = createApp(store);
  async function account() {
    const response = await app.request(
      "/api/auth/signup",
      req("POST", "", {
        name: "Publisher",
        email: `${uid()}@example.test`,
        password: "a-publisher-test-password",
      }),
    );
    const { user } = (await response.json()) as {
      user: User;
    };
    return { user, cookie: response.headers.get("set-cookie")!.split(";")[0] };
  }
  const owner = await account();
  const doc = await store.create(
    owner.user,
    "A stable public story",
    "story",
    "studio",
  );
  return {
    store,
    app,
    owner,
    doc,
    account,
    publications: new PublicationStore(store),
  };
}
test("public projection removes notes, answers, source records, brand rules and hidden layers before serialization", async () => {
  const { doc } = await setup();
  doc.slides[0].notes = "SECRET_SPEAKER_NOTE";
  doc.themes[0].brandRules = "SECRET_BRAND_RULE";
  doc.slides[0].elements.push(
    newElement("text", { text: "SECRET_HIDDEN_ANSWER", hidden: true }),
    newElement("question", {
      question: {
        kind: "multiple-choice",
        prompt: "Choose a direction",
        options: ["Explore", "Build"],
        correctIndex: 1,
        explanation: "SECRET_ANSWER_EXPLANATION",
      },
    }),
  );
  doc.slides[0].sourceSupport = {
    evidence: [
      {
        sourceId: "secret-source",
        sourceName: "Private source",
        quote: "SECRET_SOURCE_QUOTE",
        claim: "An author claim.",
      },
    ],
    suggestions: [],
  };
  const projection = publicProjection(doc, (id) => `/public/${id}`),
    serialized = JSON.stringify(projection);
  expect(serialized).not.toContain("SECRET");
  expect(serialized).not.toContain("correctIndex");
  expect(serialized).not.toContain("ownerId");
  expect(serialized).not.toContain("workspaceId");
  expect(projection.slides[0].elements.some((el) => el.hidden)).toBe(false);
});
test("an unlisted snapshot stays stable through draft edits and changes only on explicit owner publication", async () => {
  const { store, app, owner, doc, publications } = await setup();
  const published = await publications.publish(doc.id, owner.user, {
    baseRevision: 0,
    expectedEdition: null,
    visibility: "unlisted",
    allowDownload: false,
  });
  expect((await app.request(`/api/publications/${published.id}`)).status).toBe(
    200,
  );
  expect(await (await app.request("/api/publications")).json()).toEqual([]);
  const changed = await store.mutate(doc.id, owner.user, 0, [
    { type: "document.update", patch: { title: "Unpublished working title" } },
  ]);
  expect(
    (await (await app.request(`/api/publications/${published.id}`)).json())
      .document.title,
  ).toBe(doc.title);
  await expect(
    (async () =>
      await publications.publish(doc.id, owner.user, {
        baseRevision: 0,
        expectedEdition: 1,
        visibility: "public",
        allowDownload: false,
      }))(),
  ).rejects.toThrow("latest presentation");
  const updated = await publications.publish(doc.id, owner.user, {
    baseRevision: changed.revision,
    expectedEdition: 1,
    visibility: "public",
    allowDownload: false,
  });
  expect(updated.id).toBe(published.id);
  expect(updated.revision).toBe(2);
  expect(
    (await (await app.request(`/api/publications/${published.id}`)).json())
      .document.title,
  ).toBe(changed.title);
  expect(
    (await (await app.request("/api/publications")).json()).map(
      (p: {
        document: {
          title: string;
        };
      }) => p.document.title,
    ),
  ).toContain(changed.title);
  await expect(
    (async () =>
      await publications.publish(doc.id, owner.user, {
        baseRevision: changed.revision,
        expectedEdition: 1,
        visibility: "public",
        allowDownload: false,
      }))(),
  ).rejects.toThrow("changed in another");
});
test("private links require authorized sign-in; only owners can publish and revocation permanently disables a link", async () => {
  const { store, app, owner, doc, account, publications } = await setup(),
    other = await account();
  const published = await publications.publish(doc.id, owner.user, {
    baseRevision: 0,
    expectedEdition: null,
    visibility: "private",
    allowDownload: false,
  });
  expect((await app.request(`/api/publications/${published.id}`)).status).toBe(
    401,
  );
  expect(
    (
      await app.request(
        `/api/publications/${published.id}`,
        req("GET", other.cookie),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await app.request(
        `/api/publications/${published.id}`,
        req("GET", owner.cookie),
      )
    ).status,
  ).toBe(200);
  expect(
    (
      await app.request(
        `/api/decks/${doc.id}/publication`,
        req("GET", other.cookie),
      )
    ).status,
  ).toBe(404);
  await store.db.insert("members", {workspaceId:owner.user.workspaceId,userId:other.user.id,role:"viewer"});
  const viewer = { ...other.user, workspaceId: owner.user.workspaceId };
  await expect(
    (async () =>
      await publications.publish(doc.id, viewer, {
        baseRevision: 0,
        expectedEdition: 1,
        visibility: "public",
        allowDownload: false,
      }))(),
  ).rejects.toThrow("view-only");
  await publications.revoke(doc.id, owner.user, published.id, 1);
  expect(
    (
      await app.request(
        `/api/publications/${published.id}`,
        req("GET", owner.cookie),
      )
    ).status,
  ).toBe(410);
  const replacement = await publications.publish(doc.id, owner.user, {
    baseRevision: 0,
    expectedEdition: null,
    visibility: "unlisted",
    allowDownload: false,
  });
  expect(replacement.id).not.toBe(published.id);
  expect((await app.request(`/api/publications/${published.id}`)).status).toBe(
    410,
  );
});
test("publication assets are limited to visible snapshot media and are denied after revocation", async () => {
  const { store, app, owner, doc, publications } = await setup(),
    visible = uid(),
    hidden = uid();
  for (const id of [visible, hidden])
    await store.db.insert("assets",{id:id,ownerId:owner.user.id,workspaceId:owner.user.workspaceId,name:"test.webp",mime:"image/webp",bytes:5,storageKey:id,createdAt:new Date().toISOString()});
  doc.slides[0].elements.push(
    newElement("image", { src: `/api/assets/${visible}` }),
    newElement("image", { src: `/api/assets/${hidden}`, hidden: true }),
  );
  await store.replace(doc.id, owner.user, 0, doc);
  const publication = await publications.publish(doc.id, owner.user, {
    baseRevision: 1,
    expectedEdition: null,
    visibility: "unlisted",
    allowDownload: false,
  });
  const view = await publications.view(publication.id, null);
  expect(view.document.slides[0].elements.find((e) => e.src)?.src).toBe(
    `/api/publications/${publication.id}/assets/${visible}`,
  );
  expect(
    (await app.request(`/api/publications/${publication.id}/assets/${hidden}`))
      .status,
  ).toBe(404);
  expect(
    (
      (await ({n:await store.db.count("publicationAssets",{publicationId:publication.id})})) as {
        n: number;
      }
    ).n,
  ).toBe(1);
  await publications.revoke(doc.id, owner.user, publication.id, 1);
  expect(
    (await app.request(`/api/publications/${publication.id}/assets/${visible}`))
      .status,
  ).toBe(410);
});
test("a source document or foreign media reference cannot be made public as a slide asset", async () => {
  const { store, owner, doc, publications } = await setup(),
    asset = uid();
  await store.db.insert("assets",{id:asset,ownerId:owner.user.id,workspaceId:owner.user.workspaceId,name:"private-source.pdf",mime:"application/pdf",bytes:5,storageKey:asset,createdAt:new Date().toISOString()});
  doc.slides[0].elements.push(
    newElement("image", { src: `/api/assets/${asset}` }),
  );
  await store.replace(doc.id, owner.user, 0, doc);
  await expect(
    (async () =>
      await publications.publish(doc.id, owner.user, {
        baseRevision: 1,
        expectedEdition: null,
        visibility: "unlisted",
        allowDownload: false,
      }))(),
  ).rejects.toThrow("unavailable media");
  expect(await publications.current(doc.id, owner.user)).toBeNull();
});
