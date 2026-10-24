import { expect, test } from "bun:test";
import { zodTextFormat } from "openai/helpers/zod";
import {
  deckResponseFor,
  generatedSlideSchema,
  type GeneratedSlide,
  type VisualPlan,
} from "../shared/ai";
import { FEATURED_THEMES } from "../shared/featured-themes";
import { makeDocument } from "../shared/templates";
import { documentSchema } from "../shared/schema";
import { generatedSlide } from "../server/ai-documents";
import { fitGeneratedDocument } from "../server/ai-fitting";
import { pastedChart, pastedTable } from "../src/lib/spreadsheet-data";
const base: GeneratedSlide = {
  title: "Useful feedback",
  layout: "process",
  headline: "Make the next conversation useful.",
  claims: [
    {
      text: "Describe an observation the other person can recognize and act on.",
      sourceId: null,
      quote: null,
    },
    {
      text: "Ask a specific question and leave room to hear their perspective.",
      sourceId: null,
      quote: null,
    },
    {
      text: "Agree on one practical next step and a time to check progress.",
      sourceId: null,
      quote: null,
    },
  ],
  labels: ["Observe", "Listen", "Act"],
  data: [],
  notes: "Private coaching detail remains in the speaker notes.",
  question: null,
};
const plan = (kind: VisualPlan["kind"], n = 3): VisualPlan => ({
  kind,
  arrangement: "process",
  items: base.labels.slice(0, n).map((label, i) => ({
    label,
    claimIndex: i,
    icon: i === 0 ? "target" : i === 1 ? "message" : "check",
    shape: i === 0 ? "circle" : i === 1 ? "polygon" : "blob",
  })),
});
test("visual plans stay compatible with saved responses and strict provider schemas", () => {
  expect(generatedSlideSchema.safeParse(base).success).toBe(true);
  expect(
    generatedSlideSchema.safeParse({ ...base, visual: plan("diagram") })
      .success,
  ).toBe(true);
  expect(
    generatedSlideSchema.safeParse({
      ...base,
      visual: {
        ...plan("cards"),
        items: [{ ...plan("cards").items[0], shape: "script" }],
      },
    }).success,
  ).toBe(false);
  const format = zodTextFormat(deckResponseFor(3), "visual_slides");
  expect(format.strict).toBe(true);
  expect(JSON.stringify(format.schema)).toContain('"visual"');
});
test("visual tools preserve every claim, notes, citations and editable object IDs", () => {
  for (const kind of [
    "cards",
    "comparison",
    "timeline",
    "diagram",
    "table",
  ] as const) {
    const n = kind === "comparison" ? 2 : 3;
    const spec = {
      ...base,
      claims: base.claims.slice(0, n),
      visual: plan(kind, n),
    };
    const slide = generatedSlide(spec, [], 1280, 720, FEATURED_THEMES[5]);
    const serialized = JSON.stringify(slide.elements);
    for (const claim of spec.claims) expect(serialized).toContain(claim.text);
    expect(slide.notes).toBe(base.notes);
    expect(new Set(slide.elements.map((el) => el.id)).size).toBe(
      slide.elements.length,
    );
    expect(
      slide.elements.some(
        (el) =>
          el.type ===
          (kind === "diagram"
            ? "diagram"
            : kind === "table"
              ? "table"
              : "shape"),
      ),
    ).toBe(true);
    if (kind === "cards" || kind === "comparison")
      expect(slide.elements.filter((el) => el.type === "icon")).toHaveLength(n);
  }
  expect(() =>
    generatedSlide(
      {
        ...base,
        visual: {
          ...plan("diagram"),
          items: plan("diagram").items.map((item) => ({
            ...item,
            claimIndex: 0,
          })),
        },
      },
      [],
      1280,
      720,
      FEATURED_THEMES[0],
    ),
  ).toThrow("visual plan did not match");
});
test("every visual kind fits all featured themes using the real renderer", async () => {
  const doc = makeDocument("fixture", "fixture", "Visual tools", "blank");
  doc.themes = structuredClone(FEATURED_THEMES);
  doc.themeId = doc.themes[0].id;
  doc.slides = [];
  for (const theme of FEATURED_THEMES)
    for (const kind of [
      "cards",
      "comparison",
      "timeline",
      "diagram",
      "table",
    ] as const) {
      const n = kind === "comparison" ? 2 : 3;
      doc.slides.push({
        ...generatedSlide(
          { ...base, claims: base.claims.slice(0, n), visual: plan(kind, n) },
          [],
          1280,
          720,
          theme,
        ),
        themeId: theme.id,
      });
    }
  for (const theme of FEATURED_THEMES) {
    const claims = [
      ...base.claims,
      {
        text: "Follow up after the conversation to recognize progress and adjust the next step.",
        sourceId: null,
        quote: null,
      },
    ];
    const items = [
      ...plan("cards").items,
      {
        label: "Follow through",
        claimIndex: 3,
        icon: "flag" as const,
        shape: "rounded" as const,
      },
    ];
    doc.slides.push({
      ...generatedSlide(
        {
          ...base,
          claims,
          visual: { kind: "cards", arrangement: "process", items },
        },
        [],
        1280,
        720,
        theme,
      ),
      themeId: theme.id,
    });
  }
  // Keep each render fixture within the same 200-slide limit as real decks.
  const fittedSlides: typeof doc.slides = [];
  for (let start = 0; start < doc.slides.length; start += 180) {
    const batch = { ...doc, slides: doc.slides.slice(start, start + 180) };
    expect(documentSchema.safeParse(batch).success).toBe(true);
    const result = await fitGeneratedDocument(
      batch,
      AbortSignal.timeout(15000),
    );
    fittedSlides.push(...result.document.slides);
  }
  expect(fittedSlides).toHaveLength(FEATURED_THEMES.length * 6);
  for (const slide of fittedSlides)
    for (const el of slide.elements.filter(
      (el) => !el.accessibility?.decorative,
    ))
      expect(
        el.x >= 0 &&
          el.y >= 0 &&
          el.x + el.width <= 1281 &&
          el.y + el.height <= 721,
      ).toBe(true);
}, 30000);
test("spreadsheet paste validates complete batches instead of silently changing invalid numbers", () => {
  expect(
    pastedChart("Category\tValue\nA\t12\nB\t-4", "bar", true).data,
  ).toEqual([
    { label: "A", value: 12 },
    { label: "B", value: -4 },
  ]);
  expect(() => pastedChart("A\t", "bar", true)).toThrow("numeric");
  expect(() => pastedChart("A\t-4", "donut", true)).toThrow("non-negative");
  expect(() => pastedChart("A\tInfinity", "line", true)).toThrow("numeric");
  expect(pastedTable("A\tB\nC\t", true).rows).toEqual([
    ["A", "B"],
    ["C", ""],
  ]);
  expect(() => pastedTable("A\tB\nC", true)).toThrow("rectangular");
  expect(() =>
    pastedChart(
      Array.from({ length: 13 }, (_, i) => `A${i}\t${i}`).join("\n"),
      "bar",
      true,
    ),
  ).toThrow("12 data points");
});
