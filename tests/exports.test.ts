import { afterEach, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { unzipSync, strFromU8 } from "fflate";
import sharp from "sharp";
import { Store } from "./mongo";
import { createApp } from "./support/legacy-app";
import { createAIServices } from "../server/creation";
import { PublicationStore } from "../server/publications";
import { renderExport } from "../server/render-export";
import { uid, type User } from "../shared/schema";
import { makeDocument, layoutSlide } from "../shared/templates";
import { newElement } from "../shared/operations";
import { publicProjection } from "../shared/publications";
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
  async function account() {
    const res = await app.request(
      "/api/auth/signup",
      req("POST", "", {
        name: "Export tester",
        email: `${uid()}@example.test`,
        password: "export-test-password",
      }),
    );
    const { user } = (await res.json()) as {
      user: User;
    };
    return { user, cookie: res.headers.get("set-cookie")!.split(";")[0] };
  }
  const owner = await account(),
    doc = await store.create(owner.user, "A portable story", "blank", "studio");
  return {
    store,
    ai,
    app,
    owner,
    doc,
    account,
    publications: new PublicationStore(store, ai.exports),
  };
}
test("exports authorize ownership, validate revision, deduplicate keys and serialize only the public projection", async () => {
  const { store, app, ai, owner, doc, account } = await setup(),
    other = await account();
  doc.slides[0].notes = "PRIVATE_EXPORT_NOTE";
  doc.slides[0].elements.push(
    newElement("question", {
      question: {
        kind: "multiple-choice",
        prompt: "Choose",
        options: ["A", "B"],
        correctIndex: 1,
        explanation: "PRIVATE_EXPORT_EXPLANATION",
      },
    }),
  );
  const saved = await store.replace(doc.id, owner.user, 0, doc);
  const body = {
    baseRevision: saved.revision,
    format: "html",
    scale: 1,
    key: uid(),
  };
  expect(
    (
      await app.request(
        `/api/decks/${doc.id}/exports`,
        req("POST", other.cookie, body),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await app.request(
        `/api/decks/${doc.id}/exports`,
        req("POST", owner.cookie, { ...body, baseRevision: 0 }),
      )
    ).status,
  ).toBe(409);
  const response = await app.request(
    `/api/decks/${doc.id}/exports`,
    req("POST", owner.cookie, body),
  );
  expect(response.status).toBe(202);
  const job = await response.json();
  expect(JSON.stringify(job)).not.toContain("PRIVATE_EXPORT");
  const queued = await ai.queue.get(job.id, owner.user.id);
  expect(queued.payload).not.toContain("PRIVATE_EXPORT");
  expect(queued.payload).not.toContain("correctIndex");
  const again = await (
    await app.request(
      `/api/decks/${doc.id}/exports`,
      req("POST", owner.cookie, body),
    )
  ).json();
  expect(again.id).toBe(job.id);
  expect(
    (
      await app.request(
        `/api/decks/${doc.id}/exports`,
        req("POST", owner.cookie, { ...body, format: "pdf" }),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await app.request(
        `/api/exports/${job.id}/download`,
        req("GET", other.cookie),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await app.request(
        `/api/exports/${job.id}/download`,
        req("GET", owner.cookie),
      )
    ).status,
  ).toBe(409);
  await store.db.insert("members", {workspaceId:owner.user.workspaceId,userId:other.user.id,role:"viewer"});
  expect(
    (
      await app.request(
        `/api/decks/${doc.id}/exports`,
        req("POST", other.cookie, body),
      )
    ).status,
  ).toBe(403);
});
test("published downloads stay on their edition, retries keep the snapshot, and revocation/permissions guard every request", async () => {
  const { store, app, ai, owner, doc, publications } = await setup();
  let pub = await publications.publish(doc.id, owner.user, {
    baseRevision: 0,
    expectedEdition: null,
    visibility: "unlisted",
    allowDownload: true,
  });
  expect((await publications.view(pub.id, null)).downloadsState).toBe(
    "preparing",
  );
  const linked = await ai.exports.list(doc.id, owner.user);
  expect(linked.length).toBe(2);
  const html = linked.find((j) => JSON.parse(j.payload).format === "html")!;
  const result = await ai.exports.run(html, {
    signal: AbortSignal.timeout(30000),
    progress: () => {},
  });
  files.push(
    `${process.env.FRAME_EXPORTS || ".frame-data/exports"}/${result.storageKey}`,
  );
  await store.db.update("jobs",{id:html.id},{$set:{status:"succeeded",result:JSON.stringify(result)}});
  const view = await publications.view(pub.id, null);
  expect(view.downloads[0].format).toBe("html");
  const link = view.downloads[0].href;
  const download = await app.request(link);
  expect(download.status).toBe(200);
  expect(download.headers.get("content-disposition")).toContain("attachment");
  expect(await download.text()).toContain("A portable story");
  doc.title = "Unpublished replacement";
  const saved = await store.replace(doc.id, owner.user, 0, doc);
  expect(
    (
      await app.request(
        `/api/decks/${doc.id}/publication/downloads`,
        req("POST", owner.cookie, {
          expectedEdition: pub.revision,
          key: uid(),
        }),
      )
    ).status,
  ).toBe(202);
  const retry = (await ai.exports.list(doc.id, owner.user)).find(
    (j) =>
      j.id !== html.id &&
      j.kind === "export" &&
      JSON.parse(j.payload).format === "html",
  )!;
  expect(JSON.parse(retry.payload).document.title).toBe("A portable story");
  pub = await publications.publish(doc.id, owner.user, {
    baseRevision: saved.revision,
    expectedEdition: 1,
    visibility: "unlisted",
    allowDownload: false,
  });
  expect((await app.request(link)).status).toBe(403);
  expect((await publications.view(pub.id, null)).downloads).toEqual([]);
  pub = await publications.publish(doc.id, owner.user, {
    baseRevision: saved.revision,
    expectedEdition: 2,
    visibility: "unlisted",
    allowDownload: true,
  });
  expect((await app.request(link)).status).toBe(409);
  expect((await publications.view(pub.id, null)).downloads).toEqual([]);
  await publications.revoke(doc.id, owner.user, pub.id, 3);
  expect((await app.request(link)).status).toBe(410);
}, 30000);
test("permanent deletion cancels jobs and revokes exports before retryable cleanup", async () => {
  const { store, app, ai, owner, doc } = await setup();
  const job = await ai.exports.create(doc, owner.user, "html", 1, uid());
  await store.mutate(doc.id, owner.user, 0, [
    { type: "document.update", patch: { status: "trashed" } },
  ]);
  const res = await app.request(
    `/api/decks/${doc.id}`,
    req("DELETE", owner.cookie),
  );
  expect(res.status).toBe(200);
  expect((await store.db.one('jobs',{id:job.id})).status).toBe('cancelled');
  expect((await app.request(`/api/exports/${job.id}/download`,req('GET',owner.cookie))).status).toBe(404);
  expect(await store.db.one('deletionTombstones',{deckId:doc.id})).not.toBeNull();

});
test("shared rendering creates real PDF, sized PNGs, standalone HTML and explicitly image-based PowerPoint", async () => {
  const doc = makeDocument(
    "render-owner",
    "render-workspace",
    "Render <story>",
    "blank",
  );
  doc.slides = [
    layoutSlide("title", "A clear story"),
    layoutSlide("two-column", "A next step"),
  ];
  doc.width = 1280;
  doc.height = 720;
  doc.slides[0].notes = "PRIVATE_RENDER_NOTE";
  doc.slides[0].elements.push(
    newElement("image", {
      src: "/api/assets/render-image",
      x: 1050,
      y: 500,
      width: 100,
      height: 100,
      alt: "A warm orange sample",
    }),
  );
  const png = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "#f66026" },
  })
    .png()
    .toBuffer();
  const projection = publicProjection(doc, (id) => `/api/assets/${id}`),
    assets = {
      "render-image": `data:image/png;base64,${png.toString("base64")}`,
    },
    ctx = { signal: AbortSignal.timeout(90000), progress: () => {} };
  const html = await renderExport(projection, assets, "html", 1, ctx),
    htmlText = new TextDecoder().decode(html.bytes);
  expect(htmlText).toContain("data:font/woff2;base64,");
  expect(htmlText).toContain("data:image/png;base64,");
  expect(htmlText).not.toContain("PRIVATE_RENDER_NOTE");
  expect(htmlText).toContain("Render &lt;story&gt;");
  const pdf = await renderExport(projection, assets, "pdf", 1, ctx);
  expect(Buffer.from(pdf.bytes).subarray(0, 5).toString()).toBe("%PDF-");
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({
    data: pdf.bytes,
    useSystemFonts: true,
    isOffscreenCanvasSupported: false,
  });
  const parsed = await task.promise;
  expect(parsed.numPages).toBe(2);
  const text = (await (await parsed.getPage(1)).getTextContent()).items
    .map((i) => ("str" in i ? i.str : ""))
    .join(" ");
  expect(text).toContain("A clear story");
  await task.destroy();
  const images = await renderExport(projection, assets, "images", 0.5, ctx),
    zip = unzipSync(images.bytes);
  expect(Object.keys(zip)).toEqual(["slide-001.png", "slide-002.png"]);
  expect(await sharp(zip["slide-001.png"]).metadata()).toMatchObject({
    width: 640,
    height: 360,
  });
  const pptx = await renderExport(projection, assets, "pptx", 0.5, ctx),
    parts = unzipSync(pptx.bytes);
  expect(
    Object.keys(parts).filter((k) => /^ppt\/slides\/slide\d+\.xml$/.test(k)),
  ).toHaveLength(2);
  expect(strFromU8(parts["ppt/slides/slide1.xml"])).toContain("<p:pic>");
  expect(strFromU8(parts["ppt/slides/slide1.xml"])).not.toContain("<p:sp>");
  expect(pptx.warnings.some((w) => w.includes("not editable"))).toBe(true);
}, 90000);
test("render limits, cancellation and missing media fail explicitly", async () => {
  const doc = publicProjection(
    makeDocument("owner", "workspace", "Bounded render", "story"),
    (id) => `/api/assets/${id}`,
  );
  await expect(
    renderExport({ ...doc, width: 100000, height: 100000 }, {}, "images", 2, {
      signal: new AbortController().signal,
      progress: () => {},
    }),
  ).rejects.toThrow("render limit");
  const abort = new AbortController();
  abort.abort();
  await expect(
    renderExport(doc, {}, "html", 1, {
      signal: abort.signal,
      progress: () => {},
    }),
  ).rejects.toThrow("cancelled");
});
