import { generatedSlide } from "../server/ai-documents";
import { afterEach, expect, test } from "bun:test";
import { zodTextFormat } from "openai/helpers/zod";
import { uid, type User, type FrameDocument } from "../shared/schema";
import { makeDocument } from "../shared/templates";
import { applyOperations } from "../shared/operations";
import {
  editResponseSchema,
  type EditResponse,
  type AIJob,
} from "../shared/ai";
import { editOperations, resolveEditScope } from "../server/ai-edits";
import { Store } from "./mongo";
import { createApp } from "./support/legacy-app";
import { createAIServices } from "../server/creation";
import { FixtureAIProvider } from "./fixtures/ai-provider";
const update = (slideId: string, elementId: string, text: string | null) => ({
  slideId,
  elementId,
  text,
  fill: null,
  color: null,
  x: null,
  y: null,
  width: null,
  height: null,
  fontSize: null,
  radius: null,
  opacity: null,
  material: null,
});
const empty = (): EditResponse => ({
  summary: "A scoped edit",
  updates: [],
  replacements: [],
  insertions: [],
});
test("serialized AI text replacement clears old rich content and preserves geometry and unrelated identities", () => {
  const doc = makeDocument("u", "w", "Scoped", "story"),
    s = doc.slides[0],
    el = s.elements.find((e) => e.type === "text")!;
  el.richText = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "Original formatted words",
            marks: [{ type: "bold" }],
          },
        ],
      },
    ],
  };
  el.text = "Original formatted words";
  const scope = resolveEditScope(doc, {
      kind: "objects",
      slideIds: [s.id],
      elementIds: [el.id],
    }),
    response = {
      ...empty(),
      updates: [update(s.id, el.id, "Clear new words.")],
    };
  const operations = JSON.parse(
    JSON.stringify(editOperations(doc, scope, response, [])),
  );
  expect(operations[0].type).toBe("text.set");
  const result = applyOperations(doc, operations);
  const changed = result.slides[0].elements.find((e) => e.id === el.id)!;
  expect(changed.richText).toBeUndefined();
  expect(changed.text).toBe("Clear new words.");
  expect(changed.x).toBe(el.x);
  expect(changed.width).toBe(el.width);
  expect(result.slides[1]).toBe(doc.slides[1]);
  expect(el.richText.content![0].content![0].text).toBe(
    "Original formatted words",
  );
});
test("scope validation rejects unrelated objects, slide replacement under object scope and empty edits", () => {
  const doc = makeDocument("u", "w", "Scoped", "story"),
    s = doc.slides[0],
    el = s.elements.find((e) => e.type === "text")!,
    other = doc.slides[1].elements[0];
  const scope = resolveEditScope(doc, {
    kind: "objects",
    slideIds: [s.id],
    elementIds: [el.id],
  });
  expect(() =>
    editOperations(
      doc,
      scope,
      { ...empty(), updates: [update(doc.slides[1].id, other.id, "Outside")] },
      [],
    ),
  ).toThrow("outside");
  expect(() => editOperations(doc, scope, empty(), [])).toThrow(
    "did not propose",
  );
  expect(() =>
    resolveEditScope(doc, {
      kind: "objects",
      slideIds: [s.id],
      elementIds: ["unknown"],
    }),
  ).toThrow("existing objects");
  expect(() =>
    resolveEditScope(doc, {
      kind: "slide",
      slideIds: doc.slides.map((s) => s.id),
      elementIds: [],
    }),
  ).toThrow("exactly one");
});
test("slide regeneration preserves slide identity and untouched slides while giving generated objects fresh IDs", () => {
  const doc = makeDocument("u", "w", "Scoped", "story"),
    slide = doc.slides[1];
  const spec = {
    title: "Regenerated section",
    layout: "two-column" as const,
    headline: "A clearer idea.",
    claims: [{ text: "Review this suggestion.", sourceId: null, quote: null }],
    labels: ["Explore", "Apply"],
    data: [],
    notes: "New private guidance.",
    question: null,
  };
  const response = {
    ...empty(),
    replacements: [{ slideId: slide.id, slide: spec }],
  };
  const scope = resolveEditScope(doc, {
    kind: "slide",
    slideIds: [slide.id],
    elementIds: [],
  });
  const operations = editOperations(doc, scope, response, []),
    result = applyOperations(doc, operations);
  expect(result.slides[1].id).toBe(slide.id);
  expect(result.slides[1].title).toBe(spec.title);
  expect(result.slides[0]).toBe(doc.slides[0]);
  expect(
    result.slides[1].elements.some((el) =>
      slide.elements.some((old) => old.id === el.id),
    ),
  ).toBe(false);
  expect(() =>
    editOperations(
      doc,
      {
        kind: "objects",
        slideIds: [slide.id],
        elementIds: [slide.elements[0].id],
      },
      response,
      [],
    ),
  ).toThrow("cannot replace");
  const inserted = editOperations(
    doc,
    scope,
    {
      ...empty(),
      insertions: [
        {
          afterSlideId: slide.id,
          slide: { ...spec, title: "First insertion" },
        },
        {
          afterSlideId: slide.id,
          slide: { ...spec, title: "Second insertion" },
        },
      ],
    },
    [],
  );
  const insertionResult = applyOperations(doc, inserted);
  expect(insertionResult.slides.slice(2, 4).map((s) => s.title)).toEqual([
    "First insertion",
    "Second insertion",
  ]);
});
const stores: Store[] = [];
afterEach(async () => {
  for (const s of stores.splice(0)) await s.db.close();
});
const req = (method: string, cookie: string, body?: unknown) => ({
  method,
  headers: { cookie, "content-type": "application/json" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
test("AI edit jobs require ownership, remain previews, and refuse application after intervening saves", async () => {
  const store = new Store(":memory:");
  stores.push(store);
  const services = createAIServices(store, new FixtureAIProvider()),
    app = createApp(store, services);
  const auth = await app.request(
      "/api/auth/signup",
      req("POST", "", {
        name: "Editor",
        email: `${uid()}@example.test`,
        password: "secure-ai-editor-test",
      }),
    ),
    cookie = auth.headers.get("set-cookie")!.split(";")[0],
    { user } = (await auth.json()) as {
      user: User;
    };
  const doc = await store.create(user, "Editable story", "story", "studio"),
    slide = doc.slides[0],
    el = slide.elements.find((e) => e.type === "text")!;
  const response = await app.request(
    `/api/decks/${doc.id}/ai`,
    req("POST", cookie, {
      baseRevision: doc.revision,
      scope: { kind: "objects", slideIds: [slide.id], elementIds: [el.id] },
      instruction: "Make this clearer.",
      sourceIds: [],
      key: uid(),
    }),
  );
  expect(response.status).toBe(202);
  const job = (await response.json()) as AIJob;
  await services.worker.runOnce();
  expect(
    (await store.access(doc.id, user)).slides[0].elements.find(
      (e) => e.id === el.id,
    )!.text,
  ).toBe(el.text);
  const preview = await (
    await app.request(`/api/jobs/${job.id}`, req("GET", cookie))
  ).json();
  expect(preview.status).toBe("succeeded");
  expect(
    preview.result.preview.slides[0].elements.find(
      (e: { id: string }) => e.id === el.id,
    ).text,
  ).toBe("Clearer words for your audience.");
  const ready = await app.request(
    `/api/decks/${doc.id}/ai/${job.id}/operations`,
    req("POST", cookie, {}),
  );
  expect(ready.status).toBe(200);
  expect((await ready.json()).operations[0].type).toBe("text.set");
  await store.mutate(doc.id, user, doc.revision, [
    { type: "document.update", patch: { title: "A manual change" } },
  ]);
  expect(
    (
      await app.request(
        `/api/decks/${doc.id}/ai/${job.id}/operations`,
        req("POST", cookie, {}),
      )
    ).status,
  ).toBe(409);
  const other = await store.createUser(
    "Other",
    `${uid()}@example.test`,
    "unused",
  );
  await expect(
    (async () => await services.queue.get(job.id, other.id))(),
  ).rejects.toThrow("not found");
});
test("the scoped edit response uses a strict structured-output schema", () => {
  expect(zodTextFormat(editResponseSchema, "edits").strict).toBe(true);
});
test("numeric AI charts require the actual values in their source data without quotes, including grouped and percentage numbers", () => {
  const spec = {
    title: "Source data",
    layout: "chart" as const,
    headline: "A supported comparison",
    claims: [
      {
        text: "The sample has 1,400 entries and a 25% share.",
        sourceId: "source",
        quote: "The sample has 1,400 entries and a 25% share.",
      },
    ],
    labels: [],
    data: [
      { label: "Entries", value: 1400 },
      { label: "Share", value: 0.25 },
    ],
    notes: "",
    question: null,
  };
  const source = { id: "source", name: "Source", text: spec.claims[0].quote };
  expect(generatedSlide(spec, [source]).layout).toBe("chart");
  expect(() =>
    generatedSlide({ ...spec, data: [{ label: "Invented", value: 999 }] }, [
      source,
    ]),
  ).toThrow("could not be traced");
  expect(() =>
    generatedSlide(
      {
        ...spec,
        claims: [{ text: "A suggestion", sourceId: null, quote: null }],
      },
      [],
    ),
  ).toThrow("could not be traced");
});
test("generated statistics preserve every supplied value when the data does not match three cards", () => {
  for (const count of [1, 2, 3, 4, 12]) {
    const data = Array.from({ length: count }, (_, i) => ({
      label: `Session ${i + 1}`,
      value: (i + 1) * 10,
    }));
    const quote = data.map((item) => `${item.label}: ${item.value}`).join("; ");
    const slide = generatedSlide(
      {
        title: "Session comparison",
        layout: "statistics",
        headline: "Participation by session",
        claims: [
          {
            text: "A comparison of participation across the supplied sessions.",
            sourceId: "source",
            quote,
          },
        ],
        labels: [],
        data,
        notes: "",
        question: null,
      },
      [{ id: "source", name: "Synthetic source", text: quote }],
    );
    if (count === 3) {
      expect(slide.layout).toBe("statistics");
      expect(
        slide.elements
          .filter((element) => element.role === "heading")
          .slice(1)
          .map((element) => element.text),
      ).toEqual(["10", "20", "30"]);
    } else {
      expect(slide.layout).toBe("chart");
      expect(
        slide.elements.find((element) => element.type === "chart")?.chart?.data,
      ).toEqual(data);
    }
    expect(slide.sourceSupport?.evidence[0]?.quote).toBeString();
  }
});
