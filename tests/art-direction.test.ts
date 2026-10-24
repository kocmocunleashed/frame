import { expect, test } from "bun:test";
import { FEATURED_THEMES } from "../shared/featured-themes";
import { THEMES, themeSnapshotForDocument } from "../shared/themes";
import { applyOperations } from "../shared/operations";
import { contrastIssues } from "../shared/design-library";
import { documentSchema, slideSchema, themeSchema } from "../shared/schema";
import { layoutSlide, LAYOUTS, makeDocument } from "../shared/templates";
import { generatedSlide, generationPreview } from "../server/ai-documents";
import { fitGeneratedDocument } from "../server/ai-fitting";
import { staticHTML } from "../server/static-html";
import type { GeneratedSlide } from "../shared/ai";
import { publicProjection } from "../shared/publications";
test("featured designs have readable palettes, real grayscale monochrome, and leave legacy presets intact", () => {
  expect(FEATURED_THEMES).toHaveLength(36);
  expect(new Set(THEMES.map((theme) => theme.id)).size).toBe(THEMES.length);
  for (const theme of FEATURED_THEMES) {
    expect(themeSchema.safeParse(theme).success).toBe(true);
    expect(contrastIssues(theme.colors)).toEqual([]);
  }
  for (const hex of Object.values(FEATURED_THEMES[0].colors)) {
    expect(hex.slice(1, 3)).toBe(hex.slice(3, 5));
    expect(hex.slice(3, 5)).toBe(hex.slice(5, 7));
  }
  expect(THEMES[0].id).toBe("studio");
  expect(THEMES[0].artDirection).toBeUndefined();
  expect(layoutSlide("title").elements).toHaveLength(4);
});
test("every design emits valid editable geometry for all layouts and two slide dimensions", () => {
  for (const theme of FEATURED_THEMES)
    for (const layout of LAYOUTS)
      for (const [width, height] of [
        [1280, 720],
        [640, 360],
      ]) {
        const slide = layoutSlide(layout.id, undefined, width, height, theme);
        const parsed = slideSchema.safeParse(slide);
        expect(
          parsed.success,
          `${theme.name}: ${layout.id} (${width}×${height}) ${parsed.error?.message || ""}`,
        ).toBe(true);
        for (const el of slide.elements.filter(
          (el) => !el.hidden && !el.accessibility?.decorative,
        )) {
          expect(
            el.x >= 0 &&
              el.y >= 0 &&
              el.x + el.width <= width + 1 &&
              el.y + el.height <= height + 1,
            `${theme.name}/${layout.id}: ${el.name} leaves the slide`,
          ).toBe(true);
        }
        expect(new Set(slide.elements.map((el) => el.id)).size).toBe(
          slide.elements.length,
        );
        expect(
          slide.elements.every((el) =>
            [
              "text",
              "shape",
              "image",
              "icon",
              "table",
              "chart",
              "diagram",
              "question",
              "video",
            ].includes(el.type),
          ),
        ).toBe(true);
      }
});
const spec: GeneratedSlide = {
  title: "An idea worth sharing",
  layout: "title",
  headline: "Give your ideas a bigger stage.",
  claims: [
    {
      text: "A clear story makes room for a useful conversation.",
      sourceId: null,
      quote: null,
    },
  ],
  labels: [],
  data: [],
  notes: "Private speaker notes stay intact.",
  question: null,
};
test("art direction preserves content, traceable data and usable local interaction definitions", () => {
  for (const theme of FEATURED_THEMES) {
    const cover = generatedSlide(spec, [], 1280, 720, theme);
    expect(cover.elements.some((el) => el.text === spec.headline)).toBe(true);
    expect(cover.elements.some((el) => el.text === spec.claims[0].text)).toBe(
      true,
    );
    expect(cover.notes).toBe(spec.notes);
    const chart = generatedSlide(
      {
        ...spec,
        layout: "statistics",
        claims: [
          {
            text: "Four source values.",
            sourceId: "source",
            quote: "A 10, B 20, C 30, D 40.",
          },
        ],
        data: [10, 20, 30, 40].map((value, i) => ({ label: String(i), value })),
      },
      [{ id: "source", name: "Numbers", text: "A 10, B 20, C 30, D 40." }],
      1280,
      720,
      theme,
    );
    expect(
      chart.elements
        .find((el) => el.type === "chart")
        ?.chart?.data.map((v) => v.value),
    ).toEqual([10, 20, 30, 40]);
    const question = generatedSlide(
      {
        ...spec,
        layout: "questions",
        question: {
          kind: "multiple-choice",
          prompt: "What makes feedback useful?",
          options: ["A vague opinion", "A specific observation"],
          correctIndex: 1,
          explanation:
            "Specific observations give someone something to act on.",
        },
      },
      [],
      1280,
      720,
      theme,
    );
    expect(question.interactions[0]?.trigger).toBe("answer");
    const questionElement = question.elements.find(
      (el) => el.type === "question",
    );
    expect(questionElement).toBeDefined();
    expect(question.interactions[0]?.target).toBe(questionElement!.id);
    const privateDoc = makeDocument("test", "test", "Question", "blank");
    privateDoc.slides = [question];
    const publicDoc = publicProjection(privateDoc, (id) => id);
    expect(JSON.stringify(publicDoc)).not.toContain(
      "Specific observations give someone something to act on.",
    );
    expect(JSON.stringify(publicDoc)).not.toContain("correctIndex");
    expect(publicDoc.slides[0].interactions).toHaveLength(0);
  }
});
test("all featured designs fit real cover, comparison, chart and process copy through the shared Chromium renderer", async () => {
  const combined = makeDocument("test", "test", "Featured directions", "blank");
  combined.themes = structuredClone(FEATURED_THEMES);
  combined.themeId = FEATURED_THEMES[0].id;
  combined.slides = [];
  for (const theme of FEATURED_THEMES) {
    const base = makeDocument("test", "test", "Design acceptance", "blank");
    base.themes = [theme];
    base.themeId = theme.id;
    const chart: GeneratedSlide = {
      ...spec,
      layout: "chart",
      claims: [
        {
          text: "Participation grew across the four workshops.",
          sourceId: "counts",
          quote: "Participants: 10, 20, 30, 40.",
        },
      ],
      data: [10, 20, 30, 40].map((value, i) => ({
        label: `Workshop ${i + 1}`,
        value,
      })),
    };
    const doc = generationPreview(
      base,
      [
        spec,
        {
          ...spec,
          layout: "two-column",
          labels: ["Before", "After"],
          claims: [
            {
              text: "People leave with an observation they can use.",
              sourceId: null,
              quote: null,
            },
            {
              text: "The next conversation starts with a practical next step.",
              sourceId: null,
              quote: null,
            },
          ],
        },
        chart,
        {
          ...spec,
          layout: "process",
          labels: [],
          claims: [
            {
              text: "Start with a specific observation. Explain what happened and why it mattered, then leave room for the other person to respond.",
              sourceId: null,
              quote: null,
            },
            {
              text: "Ask an open question and listen carefully. A useful feedback conversation makes space for context and a shared understanding.",
              sourceId: null,
              quote: null,
            },
            {
              text: "Agree on a practical next step together. Return to the conversation later to check progress and offer support.",
              sourceId: null,
              quote: null,
            },
          ],
        },
      ],
      [
        {
          id: "counts",
          name: "Workshop results",
          text: "Participants: 10, 20, 30, 40.",
        },
      ],
    );
    expect(documentSchema.safeParse(doc).success).toBe(true);
    combined.slides.push(
      ...doc.slides.map((slide) => ({ ...slide, themeId: theme.id })),
    );
  }
  const fitted = await fitGeneratedDocument(
    combined,
    AbortSignal.timeout(15000),
  );
  expect(fitted.document.slides).toHaveLength(FEATURED_THEMES.length * 4);
  for (let i = 0; i < FEATURED_THEMES.length; i++) {
    expect(fitted.document.slides[i * 4].themeId).toBe(FEATURED_THEMES[i].id);
    expect(
      fitted.document.slides[i * 4].elements.some(
        (el) => el.text === spec.headline,
      ),
    ).toBe(true);
    expect(
      fitted.document.slides[i * 4 + 2].elements
        .find((el) => el.type === "chart")
        ?.chart?.data.map((d) => d.value),
    ).toEqual([10, 20, 30, 40]);
  }
}, 45000);
test("standalone rendering embeds the display fonts and preserves material effects", async () => {
  const doc = makeDocument("test", "test", "Font acceptance", "blank");
  doc.themes = [FEATURED_THEMES[1], FEATURED_THEMES[7]];
  doc.themeId = FEATURED_THEMES[1].id;
  doc.slides = [
    layoutSlide("title", "Make a point.", 1280, 720, doc.themes[0]),
    {
      ...layoutSlide("process", undefined, 1280, 720, doc.themes[1]),
      themeId: doc.themes[1].id,
    },
  ];
  const html = await staticHTML(doc, {}, true);
  expect(html).toContain("Barlow Condensed");
  expect(html).toContain("Space Grotesk Variable");
  for (const family of [
    "Syne Variable",
    "Fraunces Variable",
    "Nunito Variable",
  ])
    expect(html).toContain(family);
  expect(html).toContain("data:font/woff2;base64,");
  expect(html).toContain("inset 0 3px 4px");
});
test("themes have independent cover and content geometry, not a shared layout with different palettes", () => {
  for (const layout of ["title", "process", "chart"]) {
    const signatures = FEATURED_THEMES.map((theme) => {
      const slide = layoutSlide(
        layout,
        "Make something meaningful.",
        1280,
        720,
        theme,
      );
      const el = slide.elements.find(
        (el) => el.role === "heading" && !el.accessibility?.decorative,
      )!;
      return [
        el.x,
        el.y,
        el.width,
        el.height,
        el.baseFontSize,
        el.textAlign || "left",
      ].join(":");
    });
    expect(new Set(signatures).size).toBe(FEATURED_THEMES.length);
  }
});
test("album and agent layouts keep headings and supporting text in separate reading areas", () => {
  for (const theme of FEATURED_THEMES.slice(23))
    for (const layout of LAYOUTS) {
      const slide = layoutSlide(
        layout.id,
        "From a spark to something real.",
        1280,
        720,
        theme,
      );
      const text = slide.elements.filter(
        (el) =>
          el.type === "text" && !el.hidden && !el.accessibility?.decorative,
      );
      for (let i = 0; i < text.length; i++)
        for (let j = i + 1; j < text.length; j++) {
          const a = text[i],
            b = text[j];
          const overlapX =
            Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
          const overlapY =
            Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
          expect(
            overlapX > 1 && overlapY > 1,
            `${theme.name}/${layout.id}: ${a.text} overlaps ${b.text}`,
          ).toBe(false);
        }
    }
});
test("a refreshed featured preset can be applied without replacing an older embedded snapshot", () => {
  const current = FEATURED_THEMES[1];
  const old = {
    ...current,
    artVersion: undefined,
    colors: { ...current.colors, background: "#f7f7f7" },
  };
  const doc = makeDocument("owner", "workspace", "Older deck", "blank");
  doc.themes = [old];
  doc.themeId = old.id;
  const snapshot = themeSnapshotForDocument(doc, current);
  expect(snapshot.id).not.toBe(old.id);
  const updated = applyOperations(doc, [
    { type: "theme.apply", theme: snapshot },
  ]);
  expect(updated.themes.find((theme) => theme.id === old.id)).toEqual(old);
  expect(updated.themeId).toBe(snapshot.id);
  expect(doc.themeId).toBe(old.id);
  expect(themeSnapshotForDocument(updated, snapshot).id).toBe(snapshot.id);
});
