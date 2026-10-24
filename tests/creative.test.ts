import { afterEach, expect, test } from "bun:test";
import { zodResponseFormat } from "openai/helpers/zod";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import {
  animationState,
  vectorPathSchema,
  vectorPath,
} from "../shared/creative";
import {
  sceneBatchFor,
  designPlanFor,
  type SceneSlide,
} from "../shared/ai-scene";
import {
  documentSchema,
  elementSchema,
  uid,
  type FrameDocument,
} from "../shared/schema";
import { applyOperations, newElement } from "../shared/operations";
import { makeDocument } from "../shared/templates";
import { composeScene, sceneEditOperations } from "../server/ai-scenes";
import { CreativeWorkflows } from "../server/creative-workflows";
import { JobQueue, JobWorker, JobFailure, publicJob } from "../server/jobs";
import { Store } from "./mongo";
import { FixtureAIProvider } from "./fixtures/ai-provider";
import type { AIProvider } from "../server/ai-provider";
import { SlideRenderer } from "../src/components/SlideRenderer";
import { LiveSessions } from "../server/live";
const stores: Store[] = [];
afterEach(async () => {
  for (const s of stores.splice(0)) await s.db.close();
});
const outline = {
  title: "An independently designed story",
  sections: [
    "An opening",
    "A meaningful comparison",
    "A practical next step",
  ].map((title, i) => ({
    id: uid(),
    title,
    summary: "Explain this point clearly",
    layout: i === 0 ? "title" : i === 2 ? "summary" : "two-column",
  })),
};
const brief = {
  topic: outline.title,
  audience: "General audience",
  outcome: "Explain the main ideas",
  slideCount: 3,
  language: "English",
  tone: "Clear",
  requirements: "",
  sourceIds: [],
};
async function scenes(mode = "design") {
  const provider = new FixtureAIProvider();
  return sceneBatchFor(2).parse(
    await provider.generate(
      "creative_scene_batch",
      sceneBatchFor(2),
      "",
      {
        outline: { sections: outline.sections.slice(0, 2) },
        mode,
        sources: [],
      },
      new AbortController().signal,
    ),
  ).slides;
}
async function setup(provider: AIProvider = new FixtureAIProvider()) {
  const store = new Store(":memory:");
  stores.push(store);
  const user = await store.createUser(
    "Creative tester",
    `${uid()}@example.test`,
    "unused-hash",
  );
  let now = Date.now();
  const queue = new JobQueue(store, "creative-test", () => now);
  const workflows = new CreativeWorkflows(
    store,
    queue,
    provider,
    async (doc) => ({ document: doc, warnings: [] }),
  );
  const worker = new JobWorker(queue, async (job, context) =>
    workflows.runChild(job, context),
  );
  worker.beforeRun = async () => await workflows.reconcile();
  const payload = {
    draftId: uid(),
    draftFingerprint: "unchanged",
    brief,
    outline,
    theme: makeDocument(user.id, user.workspaceId, "Base", "blank").themes[0],
    sources: [],
  };
  return {
    store,
    user,
    queue,
    workflows,
    worker,
    payload,
    provider,
    advance: () => {
      now += 60000;
    },
  };
}
test("version-one decks retain appearance, creative objects validate, and writes use version two", () => {
  const doc = makeDocument("owner", "workspace", "Legacy", "blank");
  doc.version = 1;
  const old = JSON.stringify(doc.slides);
  expect(documentSchema.parse(doc).version).toBe(1);
  const result = applyOperations(doc, [
    { type: "document.update", patch: { title: "Updated" } },
  ]);
  expect(result.version).toBe(2);
  expect(JSON.stringify(result.slides)).toBe(old);
  const timeline = newElement("timeline");
  expect(elementSchema.safeParse(timeline).success).toBe(true);
  expect(
    elementSchema.safeParse({
      ...timeline,
      timeline: {
        ...timeline.timeline,
        items: [timeline.timeline!.items[0], timeline.timeline!.items[0]],
      },
    }).success,
  ).toBe(false);
  expect(
    elementSchema.safeParse(newElement("shape", { shape: "path" })).success,
  ).toBe(false);
  expect(
    vectorPathSchema.safeParse([{ op: "L", x: 0, y: 0 }, { op: "Z" }]).success,
  ).toBe(false);
  expect(
    vectorPathSchema.safeParse([
      { op: "M", x: 0, y: 0 },
      { op: "L", x: Infinity, y: 0 },
    ]).success,
  ).toBe(false);
  expect(
    vectorPathSchema.safeParse([
      { op: "M", x: 0, y: 0 },
      { op: "script", text: "alert(1)" },
    ]).success,
  ).toBe(false);
  expect(
    vectorPath([
      { op: "M", x: 0, y: 0 },
      { op: "Q", x1: 20, y1: 30, x: 100, y: 100 },
      { op: "Z" },
    ]),
  ).toBe("M0 0 Q20 30 100 100 Z");
});
test("two review pairs can run together and a failed review cannot discard a finished deck", async () => {
  const s = await setup({
    configured: true,
    supportsVisualReview: true,
    supportsImages: false,
    generate: (...args) =>
      (new FixtureAIProvider() as AIProvider).generate(...args),
  });
  const parent = await s.workflows.create(
    s.user.id,
    "generate",
    s.payload,
    "optional-review-failure",
  );
  for (let i = 0; i < 3; i++) await s.worker.runOnce();
  const reviews = await s.queue.store.db.find("jobs",{$and:[{parentId:parent.id},{kind:"creative-review"}]},{sort:{createdAt:1,id:1}});
  expect(reviews).toHaveLength(2);
  const handler = s.worker.handler;
  s.worker.handler = async (job, context) => {
    if (job.id === reviews[0].id)
      throw new JobFailure("Synthetic failed visual review");
    return handler(job, context);
  };
  await s.worker.runOnce(reviews[0].id);
  expect((await s.queue.get(parent.id, s.user.id)).status).toBe("running");
  await s.worker.runOnce(reviews[1].id);
  const finished = await s.queue.get(parent.id, s.user.id);
  expect(finished.status).toBe("succeeded");
  const result = JSON.parse(finished.result!);
  expect(result.document.slides).toHaveLength(3);
  expect(result.warnings.join(" ")).toContain("visual review");
  expect(result.visualReview.batches).toHaveLength(2);
  expect(
    result.visualReview.batches.every(
      (batch: { status: string }) => batch.status === "unavailable",
    ),
  ).toBe(true);
  const previews = await s.workflows.preview(finished, 0);
  expect(previews.slides).toHaveLength(3);
});
test("review previews retain every update when pairs finish out of slide order in the same millisecond", async () => {
  const s = await setup({
    configured: true,
    supportsVisualReview: true,
    supportsImages: false,
    generate: (...args) =>
      (new FixtureAIProvider() as AIProvider).generate(...args),
  });
  const parent = await s.workflows.create(
    s.user.id,
    "generate",
    s.payload,
    "review-order",
  );
  for (let i = 0; i < 3; i++) await s.worker.runOnce();
  const reviews = await s.store.db.find("jobs",{$and:[{parentId:parent.id},{kind:"creative-review"}]});
  const first = reviews.find(
    (job) => JSON.parse(job.payload).stage === "review:0",
  )!;
  const last = reviews.find(
    (job) => JSON.parse(job.payload).stage === "review:2",
  )!;
  await s.worker.runOnce(last.id);
  const partial = await s.queue.get(parent.id, s.user.id);
  const since = JSON.parse(partial.progress).previewRevision;
  expect(since).toBe(4);
  const initial = await s.workflows.preview(partial, 3);
  expect(initial.slides.map((slide) => slide.index)).toEqual([2]);
  await s.worker.runOnce(first.id);
  const final = await s.queue.get(parent.id, s.user.id);
  const update = await s.workflows.preview(final, since);
  expect(update.slides.map((slide) => slide.index)).toEqual([0, 1, 2]);
  expect(update.revision).toBe(6);
});
test("long decks keep at most two pending review pairs and start the next pair as a slot opens", async () => {
  const base = new FixtureAIProvider();
  const s = await setup({
    configured: true,
    supportsVisualReview: true,
    supportsImages: false,
    generate: (...args) => (base as AIProvider).generate(...args),
  });
  const sections = Array.from({ length: 5 }, (_, i) => ({
    ...outline.sections[Math.min(i, 2)],
    id: uid(),
    title: `Point ${i + 1}`,
  }));
  const parent = await s.workflows.create(
    s.user.id,
    "generate",
    {
      ...s.payload,
      brief: { ...brief, slideCount: 5 },
      outline: { ...outline, sections },
    },
    "bounded-review-concurrency",
  );
  for (let i = 0; i < 4; i++) await s.worker.runOnce();
  const queued = () => s.store.db.find('jobs',{parentId:parent.id,kind:'creative-review',status:{$in:['queued','running']}});
  expect(await queued()).toHaveLength(2);
  await s.worker.runOnce((await queued())[0].id);
  expect(await queued()).toHaveLength(2);
  await s.worker.runOnce((await queued())[0].id);
  expect(await queued()).toHaveLength(1);
  await s.worker.runOnce((await queued())[0].id);
  const final = await s.queue.get(parent.id, s.user.id);
  expect(final.status).toBe("succeeded");
  expect(JSON.parse(final.result!).document.slides).toHaveLength(5);
});
test("content-generation schemas require claims while front matter and illustration schemas allow empty metadata", async () => {
  const specs = await scenes();
  const empty = structuredClone(specs);
  empty[0].claims = [];
  expect(sceneBatchFor(2).safeParse({ slides: empty }).success).toBe(true);
  expect(sceneBatchFor(2, 1).safeParse({ slides: empty }).success).toBe(false);
  expect(sceneBatchFor(2, 1).safeParse({ slides: specs }).success).toBe(true);
  expect(() =>
    zodResponseFormat(sceneBatchFor(2, 1), "content_scenes"),
  ).not.toThrow();
});
test("reveal timing is deterministic, past steps finish, future steps hide and reduced motion skips delays", () => {
  const a = { type: "rise" as const, step: 2, delay: 300, duration: 600 };
  expect(animationState(a, 1, 9999).visibility).toBe("hidden");
  expect(animationState(a, 2, 200).opacity).toBe(0);
  expect(animationState(a, 2, 600).opacity).toBeGreaterThan(0.5);
  expect(animationState(a, 2, 900).transform).toBe("translateY(0px)");
  expect(animationState(a, 3, 0).opacity).toBe(1);
  expect(animationState(a, 2, 0, true).opacity).toBe(1);
});
test("AI scenes produce independent native geometry, custom looks, editable vector groups, and validated evidence", async () => {
  expect(() => zodResponseFormat(sceneBatchFor(2), "scenes")).not.toThrow();
  expect(() => zodResponseFormat(designPlanFor(3), "plan")).not.toThrow();
  const specs = await scenes(),
    pairs = specs.map((spec) => composeScene(spec, []));
  expect(pairs[0].theme.id).not.toBe(pairs[1].theme.id);
  expect(pairs[0].theme.colors).not.toEqual(pairs[1].theme.colors);
  expect(pairs[0].theme.artDirection).toBeUndefined();
  expect(pairs[0].slide.elements[0].x).not.toBe(pairs[1].slide.elements[0].x);
  for (const pair of pairs) {
    expect(pair.slide.layout).toBe("free");
    const paths = pair.slide.elements.filter((e) => e.path);
    expect(paths).toHaveLength(2);
    expect(paths[0].groupId).toBe(paths[1].groupId);
    expect(
      pair.slide.elements.find((e) => e.type === "text" && e.role === "body")
        ?.animation?.delay,
    ).toBe(150);
    const base = makeDocument("owner", "workspace", "Check", "blank");
    base.themes = [pair.theme];
    base.themeId = pair.theme.id;
    base.slides = [pair.slide];
    expect(documentSchema.safeParse(base).success).toBe(true);
    const html = renderToStaticMarkup(
      createElement(SlideRenderer, { doc: base, slide: pair.slide }),
    );
    expect(html).toContain('d="M10 90 C0 30 70 0 90 10');
    expect(html).not.toContain(pair.slide.notes);
  }
  const invalid = structuredClone(specs[0]);
  invalid.claims[0].sourceId = "missing";
  Object.assign(invalid.claims[0], { quote: "invented" });
  expect(composeScene(invalid, []).slide.sourceSupport?.suggestions).toContain(
    invalid.claims[0].text,
  );
  const outside = structuredClone(specs[0]);
  outside.objects[0].x = 1200;
  expect(() => composeScene(outside, [])).toThrow("outside");
  const missing = structuredClone(specs[0]);
  missing.objects = missing.objects.filter(
    (o) => o.type !== "text" || o.claimIndex === null,
  );
  expect(() => composeScene(missing, [])).toThrow("supporting claim");
  const unreadable = structuredClone(specs[0]);
  const claim = unreadable.objects.find(
    (o) => o.type === "text" && o.claimIndex !== null,
  )!;
  if (claim.type !== "text") throw new Error("Expected a text fixture");
  claim.decorative = true;
  expect(() => composeScene(unreadable, [])).toThrow("supporting claim");
  claim.decorative = false;
  claim.color = "transparent";
  claim.opacity = 0;
  const repaired = composeScene(unreadable, []);
  const readable = repaired.slide.elements.find((e) => e.text === claim.text)!;
  expect(readable.color).not.toBe("transparent");
  expect(readable.opacity).toBe(1);
});
test("illustration and redesign previews preserve unrelated slides and immutable themes", async () => {
  const s = await setup(),
    doc = await s.store.create(s.user, "A test deck", "blank", "studio");
  doc.slides.push({ ...structuredClone(doc.slides[0]), id: uid() });
  const original = await structuredClone(doc),
    scope = {
      kind: "slide" as const,
      slideIds: [doc.slides[0].id],
      elementIds: [],
    };
  const pair = composeScene((await scenes("illustrate"))[0], []);
  const ops = sceneEditOperations(doc, scope, [pair], "illustrate"),
    preview = applyOperations(doc, ops);
  expect(doc).toEqual(original);
  expect(preview.slides[1]).toBe(doc.slides[1]);
  expect(preview.themes).toBe(doc.themes);
  expect(preview.slides[0].elements.length).toBe(
    doc.slides[0].elements.length + 2,
  );
  const designed = applyOperations(
    doc,
    sceneEditOperations(
      doc,
      scope,
      [composeScene((await scenes())[0], [])],
      "design",
    ),
  );
  expect(designed.slides[1]).toBe(doc.slides[1]);
  expect(designed.themeId).toBe(doc.themeId);
  expect(designed.slides[0].themeId).not.toBe(doc.themeId);
  const locked = await structuredClone(doc);
  locked.slides[0].elements.push(newElement("text", { locked: true }));
  expect(() => sceneEditOperations(locked, scope, [pair], "design")).toThrow(
    "Unlock",
  );
  const full = await structuredClone(doc);
  full.slides[0].elements = Array.from({ length: 399 }, () =>
    newElement("shape"),
  );
  expect(() => sceneEditOperations(full, scope, [pair], "illustrate")).toThrow(
    JobFailure,
  );
  expect(() => sceneEditOperations(full, scope, [pair], "illustrate")).toThrow(
    "document limits",
  );
});
test("title and section-divider compositions can omit supporting claims while content slides keep their substance", async () => {
  const base = new FixtureAIProvider();
  const provider: AIProvider = {
    configured: true,
    generate: async (...args) => {
      const raw = await (base as AIProvider).generate(...args);
      if (args[0] === "creative_scene_batch") {
        const input = args[3] as {
          outline: {
            sections: {
              layout: string;
            }[];
          };
        };
        const batch = sceneBatchFor(input.outline.sections.length).parse(raw);
        batch.slides.forEach((slide, i) => {
          if (!["title", "section"].includes(input.outline.sections[i].layout))
            return;
          slide.claims = [];
          slide.objects = slide.objects.filter(
            (o) => o.type !== "text" || o.claimIndex === null,
          );
        });
        return batch;
      }
      return raw;
    },
  };
  const s = await setup(provider);
  const sections = ["title", "section", "two-column", "summary"].map(
    (layout, i) => ({
      id: uid(),
      title: `Section ${i + 1}`,
      summary: "Explain the point",
      layout,
    }),
  );
  const parent = await s.workflows.create(
    s.user.id,
    "generate",
    {
      ...s.payload,
      brief: { ...brief, slideCount: 4 },
      outline: { ...outline, sections },
    },
    "front-matter-regression",
  );
  for (let i = 0; i < 3; i++) await s.worker.runOnce();
  const finished = await s.queue.get(parent.id, s.user.id);
  expect(finished.error).toBeNull();
  expect(finished.status).toBe("succeeded");
  const doc = documentSchema.parse(JSON.parse(finished.result!).document);
  expect(doc.slides).toHaveLength(4);
  expect(
    doc.slides[0].elements.some(
      (e) => e.type === "text" && e.role === "heading",
    ),
  ).toBe(true);
  expect(doc.slides[1].sourceSupport?.suggestions).toHaveLength(0);
  expect(doc.slides[2].sourceSupport?.suggestions.length).toBeGreaterThan(0);
  expect(
    base.calls.filter((name) => name === "creative_scene_batch"),
  ).toHaveLength(2);
});
test("empty content slides receive a precise correction and retain supporting claims after refinement", async () => {
  const base = new FixtureAIProvider();
  const corrections: {
    reason: string;
    instruction: string;
    previousCandidate: unknown;
  }[] = [];
  const provider: AIProvider = {
    configured: true,
    generate: async (...args) => {
      const raw = await (base as AIProvider).generate(...args);
      if (args[0] === "creative_scene_batch") {
        const input = args[3] as {
          slideOffset: number;
          correction?: {
            reason: string;
            instruction: string;
            previousCandidate: unknown;
          };
          outline: {
            sections: unknown[];
          };
        };
        if (input.correction) corrections.push(input.correction);
        if (input.slideOffset === 0 && !input.correction) {
          const batch = sceneBatchFor(input.outline.sections.length).parse(raw);
          batch.slides[1].claims = [];
          batch.slides[1].objects = batch.slides[1].objects.filter(
            (o) => o.type !== "text" || o.claimIndex === null,
          );
          return batch;
        }
      }
      return raw;
    },
  };
  const s = await setup(provider),
    parent = await s.workflows.create(
      s.user.id,
      "generate",
      s.payload,
      "content-correction-regression",
    );
  for (let i = 0; i < 3; i++) await s.worker.runOnce();
  const finished = await s.queue.get(parent.id, s.user.id);
  expect(finished.status).toBe("succeeded");
  expect(corrections).toHaveLength(1);
  expect(corrections[0].reason).toContain("Slide 2 (two-column)");
  expect(corrections[0].instruction).toContain("claimIndex");
  expect(
    sceneBatchFor(2).parse(corrections[0].previousCandidate).slides[1].claims,
  ).toHaveLength(0);
  const doc = documentSchema.parse(JSON.parse(finished.result!).document);
  expect(doc.slides[1].sourceSupport?.suggestions.length).toBeGreaterThan(0);
});
test("initial generation uses source references without quotes or a citation repair call", async () => {
  const base = new FixtureAIProvider();
  let sceneCalls = 0;
  let original: unknown[] = [];
  const sourceText = "The sample\r\nhas\u00a025 entries.";
  const provider: AIProvider = {
    configured: true,
    generate: async (...args) => {
      if (args[0] === "creative_citation_repair")
        throw new Error("Unexpected repair");
      const raw = await (base as AIProvider).generate(...args);
      if (args[0] === "creative_scene_batch") {
        sceneCalls++;
        const input = args[3] as {
          slideOffset: number;
          sources: { text?: string }[];
        };
        expect(input).not.toHaveProperty("excerpts");
        expect(input.sources[0].text).toBe(sourceText);
        expect(
          JSON.stringify(zodResponseFormat(args[1], "scenes")),
        ).not.toContain('"quote"');
        const batch = sceneBatchFor(input.slideOffset === 0 ? 2 : 1).parse(raw);
        expect(batch.slides[0].claims[0].sourceId).toBe("source");
        if (input.slideOffset === 0)
          original = structuredClone(batch.slides[1].objects);
      }
      return raw;
    },
  };
  const s = await setup(provider);
  const parent = await s.workflows.create(
    s.user.id,
    "generate",
    {
      ...s.payload,
      sources: [{ id: "source", name: "Synthetic", text: sourceText }],
    },
    "initial-excerpt-selection",
  );
  for (let i = 0; i < 3; i++) await s.worker.runOnce();
  const finished = await s.queue.get(parent.id, s.user.id);
  expect(finished.error).toBeNull();
  expect(finished.status).toBe("succeeded");
  expect(sceneCalls).toBe(2);
  const doc = documentSchema.parse(JSON.parse(finished.result!).document);
  expect(sourceText).toContain(doc.slides[1].sourceSupport?.evidence[0].quote!);
  expect(doc.slides[1].sourceSupport?.evidence[0].sourceId).toBe("source");
  expect(doc.slides[1].sourceSupport?.suggestions).toHaveLength(0);
  expect(
    doc.slides[1].elements.map((e) => [e.x, e.y, e.width, e.height]),
  ).toEqual(
    (original as SceneSlide["objects"]).map((o) => [
      o.x,
      o.y,
      o.width,
      o.height,
    ]),
  );
});

test("general honey-chicken copy finishes without quotes and preserves completed slides", async () => {
  const base = new FixtureAIProvider();
  const text =
    "The pieces are served in a sticky honey glaze and often finished with sesame seeds.";
  const provider: AIProvider = {
    configured: true,
    generate: async (...args) => {
      const raw = await (base as AIProvider).generate(...args);
      if (
        args[0] === "creative_scene_batch" &&
        (args[3] as { slideOffset: number }).slideOffset === 2
      ) {
        const batch = sceneBatchFor(1).parse(raw);
        const slide = batch.slides[0];
        slide.title = "What honey chicken actually is";
        const body = slide.objects.find(
          (o) => o.type === "text" && o.claimIndex === 0,
        )!;
        if (body.type !== "text") throw new Error("Expected supporting text");
        slide.claims.push(
          { text: "Try serving it with rice.", sourceId: null },
          { text, sourceId: null },
        );
        slide.objects.push(
          {
            ...body,
            key: "suggestion",
            type: "text",
            text: slide.claims[1].text,
            claimIndex: 1,
            y: 470,
            height: 70,
          },
          {
            ...body,
            key: "general-copy",
            type: "text",
            text,
            claimIndex: 2,
            y: 550,
            height: 130,
          },
        );
        return batch;
      }
      return raw;
    },
  };
  const s = await setup(provider);
  const parent = await s.workflows.create(
    s.user.id,
    "generate",
    {
      ...s.payload,
      sources: [
        {
          id: "source",
          name: "Recipe",
          text: "The pieces are coated in honey sauce.",
        },
      ],
    },
    "general-honey-chicken",
  );
  await s.worker.runOnce();
  await s.worker.runOnce();
  const saved = await s.workflows.preview(
    await s.queue.get(parent.id, s.user.id),
    0,
  );
  await s.worker.runOnce();
  const finished = await s.queue.get(parent.id, s.user.id);
  expect(finished.status).toBe("succeeded");
  expect(finished.error).toBeNull();
  expect(
    base.calls.filter((name) => name === "creative_scene_batch"),
  ).toHaveLength(2);
  expect(base.calls).not.toContain("creative_citation_repair");
  const doc = documentSchema.parse(JSON.parse(finished.result!).document);
  expect(doc.slides.slice(0, 2)).toEqual(
    saved.slides.map((pair) => pair.slide),
  );
  expect(doc.slides[2].sourceSupport?.suggestions).toContain(text);
  expect(doc.slides[2].elements.some((element) => element.text === text)).toBe(
    true,
  );
});

test("progressive generation checkpoints batches and resumes a failed stage without repeating completed designs", async () => {
  const base = new FixtureAIProvider();
  let broken = true;
  const provider: AIProvider = {
    configured: true,
    generate: async (...args) => {
      if (
        args[0] === "creative_scene_batch" &&
        (
          args[3] as {
            slideOffset: number;
          }
        ).slideOffset === 2 &&
        broken
      )
        throw new JobFailure("Synthetic timeout", true);
      return (base as AIProvider).generate(...args);
    },
  };
  const s = await setup(provider),
    parent = await s.workflows.create(
      s.user.id,
      "generate",
      s.payload,
      "first-attempt",
    );
  await s.worker.runOnce(); // plan
  await s.worker.runOnce(); // first two slides
  const partial = publicJob(await s.queue.get(parent.id, s.user.id));
  expect(partial.completedSlides).toBe(2);
  expect(partial.totalSlides).toBe(3);
  const saved = await s.workflows.preview(
    await s.queue.get(parent.id, s.user.id),
    0,
  );
  expect(saved.slides).toHaveLength(2);
  const savedIds = saved.slides.map((item) => item.slide.id);
  for (let i = 0; i < 3; i++) {
    await s.worker.runOnce();
    s.advance();
  }
  expect((await s.queue.get(parent.id, s.user.id)).status).toBe("failed");
  broken = false;
  const resumed = await s.workflows.create(
    s.user.id,
    "generate",
    s.payload,
    "second-attempt",
    null,
    parent.id,
  );
  expect(publicJob(resumed).completedSlides).toBe(2);
  await s.worker.runOnce();
  const final = await s.queue.get(resumed.id, s.user.id);
  expect(final.status).toBe("succeeded");
  const result = JSON.parse(final.result!).document as FrameDocument;
  expect(result.slides.map((slide) => slide.id).slice(0, 2)).toEqual(savedIds);
  expect(result.slides).toHaveLength(3);
  expect(
    base.calls.filter((name) => name === "creative_design_plan"),
  ).toHaveLength(1);
  expect(
    base.calls.filter((name) => name === "creative_scene_batch"),
  ).toHaveLength(2);
  await expect(
    (async () =>
      await s.workflows.create(
        s.user.id,
        "generate",
        { ...s.payload, brief: { ...brief, topic: "Changed inputs" } },
        "invalid-resume",
        null,
        parent.id,
      ))(),
  ).rejects.toThrow("does not match");
  await expect(
    (async () => await s.queue.get(parent.id, "another-user"))(),
  ).rejects.toThrow("not found");
});
test("coordinators do not duplicate stages or steal leases; cancellation rejects late output", async () => {
  const s = await setup(),
    parent = await s.workflows.create(
      s.user.id,
      "generate",
      s.payload,
      "idempotent",
    );
  const second = new CreativeWorkflows(
    s.store,
    new JobQueue(s.store, "second-worker"),
    s.provider,
    async (doc) => ({ document: doc, warnings: [] }),
  );
  await second.reconcile();
  await s.workflows.reconcile();
  expect(await s.workflows.steps(parent.id)).toHaveLength(1);
  const child = (await s.queue.claim())!;
  expect(child.parentId).toBe(parent.id);
  expect(await second.queue.claim()).toBeNull();
  await s.worker.cancel(parent.id, s.user.id);
  expect((await s.queue.get(child.id, s.user.id)).status).toBe("cancelled");
  expect(await s.queue.complete(child.id, { late: true })).toBe(false);
  await s.workflows.reconcile();
  expect((await s.queue.get(parent.id, s.user.id)).status).toBe("cancelled");
});
test("live reveal timestamps survive polling and reconnects, and backwards navigation finishes immediately", async () => {
  const s = await setup();
  const doc = await s.store.create(
    s.user,
    "Timed live deck",
    "blank",
    "studio",
  );
  doc.slides[0].elements.push(
    newElement("text", {
      animation: { type: "rise", step: 1, delay: 300, duration: 500 },
    }),
  );
  doc.revision++;
  await s.store.write(doc);
  let now = Date.now();
  const live = new LiveSessions(s.store, () => now),
    host = await live.start(doc.id, s.user, doc.revision),
    joined = await live.join(host.code);
  now += 1000;
  const next = await live.command(host.id, s.user, host.version, {
    type: "navigate",
    index: 0,
    step: 1,
  });
  expect(next.state.stepStartedAt).toBe(now);
  now += 500;
  const audience = await live.audience(host.code, joined.token);
  expect(audience.state.stepStartedAt).toBe(next.state.stepStartedAt);
  expect(audience.serverTime).toBe(now);
  expect((await live.host(host.id, s.user)).state.stepStartedAt).toBe(
    next.state.stepStartedAt,
  );
  const back = await live.command(host.id, s.user, next.version, {
    type: "navigate",
    index: 0,
    step: 0,
  });
  expect(back.state.stepStartedAt).toBe(0);
});

test("small grouped overflows are translated together without resizing or rewriting content", async () => {
  const spec = (await scenes())[0];
  spec.objects.forEach((o) => {
    o.group = null;
  });
  const heading = spec.objects.find(
    (o) => o.type === "text" && o.role === "heading",
  )!;
  heading.group = "edge-group";
  heading.x = 1280 - heading.width + 12;
  const other = spec.objects.find((o) => o.type === "shape")!;
  other.group = "edge-group";
  other.x = heading.x + 10;
  other.width = 20;
  const original = structuredClone(spec);
  const result = composeScene(spec, []);
  const index = spec.objects.indexOf(heading),
    otherIndex = spec.objects.indexOf(other);
  expect(result.slide.elements[index].x).toBe(1280 - heading.width);
  expect(result.slide.elements[otherIndex].x).toBe(other.x - 12);
  expect(result.slide.elements[index].width).toBe(heading.width);
  expect(result.warnings.join(" ")).toContain("slide bounds");
  expect(spec).toEqual(original);
});

test("composition refinement preserves source references across all affected slides", async () => {
  const base = new FixtureAIProvider();
  const provider: AIProvider = {
    configured: true,
    generate: async (...args) => {
      const raw = await (base as AIProvider).generate(...args);
      if (args[0] === "creative_scene_batch") {
        const input = args[3] as { slideOffset: number; correction?: unknown };
        if (input.slideOffset === 0 && !input.correction) {
          const batch = sceneBatchFor(2).parse(raw);
          batch.slides[1].claims = [];
          return batch;
        }
      }
      return raw;
    },
  };
  const s = await setup(provider);
  const parent = await s.workflows.create(
    s.user.id,
    "generate",
    {
      ...s.payload,
      sources: [
        { id: "source", name: "Synthetic", text: "The sample has 25 entries." },
      ],
    },
    "composition-with-excerpts",
  );
  for (let i = 0; i < 3; i++) await s.worker.runOnce();
  const final = await s.queue.get(parent.id, s.user.id);
  expect(final.error).toBeNull();
  expect(final.status).toBe("succeeded");
  expect(
    base.calls.filter((name) => name === "creative_scene_batch"),
  ).toHaveLength(3);
  expect(base.calls).not.toContain("creative_citation_repair");
  const doc = documentSchema.parse(JSON.parse(final.result!).document);
  expect(
    doc.slides.slice(0, 2).map((s) => s.sourceSupport?.evidence[0].sourceId),
  ).toEqual(["source", "source"]);
});

test("composition failure preserves saved batches and resume only regenerates unfinished slides", async () => {
  const base = new FixtureAIProvider();
  let broken = true;
  const offsets: number[] = [];
  const provider: AIProvider = {
    configured: true,
    generate: async (...args) => {
      const raw = await (base as AIProvider).generate(...args);
      if (args[0] === "creative_scene_batch") {
        const input = args[3] as {
          slideOffset: number;
          outline: { sections: unknown[] };
        };
        offsets.push(input.slideOffset);
        const batch = sceneBatchFor(input.outline.sections.length).parse(raw);
        if (input.slideOffset === 2 && broken)
          batch.slides[0].objects[0].x = 2000;
        return batch;
      }
      return raw;
    },
  };
  const s = await setup(provider);
  const payload = {
    ...s.payload,
    sources: [
      { id: "source", name: "Study", text: "The sample has 25 entries." },
    ],
  };
  const first = await s.workflows.create(
    s.user.id,
    "generate",
    payload,
    "citation-checkpoint",
  );
  for (let i = 0; i < 3; i++) await s.worker.runOnce();
  const failed = await s.queue.get(first.id, s.user.id);
  expect(failed.status).toBe("failed");
  expect(failed.error).toContain("composition failed validation");
  expect(publicJob(failed).completedSlides).toBe(2);
  const saved = await s.workflows.preview(failed, 0);
  expect(saved.slides).toHaveLength(2);
  broken = false;
  const resumed = await s.workflows.create(
    s.user.id,
    "generate",
    payload,
    "citation-resume",
    null,
    first.id,
  );
  await s.worker.runOnce();
  const finished = await s.queue.get(resumed.id, s.user.id);
  expect(finished.status).toBe("succeeded");
  expect(offsets).toEqual([0, 2, 2, 2]);
  const doc = documentSchema.parse(JSON.parse(finished.result!).document);
  expect(doc.slides.slice(0, 2)).toEqual(
    saved.slides.map((item) => item.slide),
  );
});
