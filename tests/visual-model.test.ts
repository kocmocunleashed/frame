import { describe, test, expect } from "bun:test";
import { documentSchema, elementSchema } from "../shared/schema";
import { makeDocument, layoutSlide, LAYOUTS } from "../shared/templates";
import { applyOperations, newElement, cloneSlides } from "../shared/operations";
import {
  richTextSchema,
  plainRichText,
  richTextPlain,
  chartSchema,
  tableSchema,
  questionSchema,
} from "../shared/content";
import { splitTextElement } from "../shared/text-fitting";
import { snapPosition } from "../shared/geometry";
describe("rich editable content and layout safety", () => {
  test("all element types and all layouts are valid source documents", () => {
    for (const type of [
      "text",
      "shape",
      "image",
      "icon",
      "table",
      "chart",
      "diagram",
      "video",
      "question",
    ] as const)
      expect(elementSchema.safeParse(newElement(type)).success).toBe(true);
    for (const layout of LAYOUTS) {
      const doc = makeDocument("o", "w");
      doc.slides = [layoutSlide(layout.id)];
      expect(documentSchema.safeParse(doc).success).toBe(true);
    }
  });
  test("missing data, inconsistent tables, invalid chart values and answers are rejected", () => {
    expect(
      elementSchema.safeParse(newElement("chart", { chart: undefined }))
        .success,
    ).toBe(false);
    expect(
      tableSchema.safeParse({ rows: [["A", "B"], ["C"]], header: true })
        .success,
    ).toBe(false);
    expect(
      chartSchema.safeParse({
        kind: "donut",
        data: [{ label: "Bad", value: -1 }],
        showValues: true,
      }).success,
    ).toBe(false);
    expect(
      questionSchema.safeParse({
        kind: "multiple-choice",
        prompt: "Question?",
        options: ["A", "B"],
        correctIndex: 2,
      }).success,
    ).toBe(false);
  });
  test("rich text accepts semantic marks and lists while rejecting executable links and HTML nodes", () => {
    const valid = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "A useful idea",
                      marks: [
                        { type: "bold" },
                        {
                          type: "link",
                          attrs: { href: "https://example.com" },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    expect(richTextSchema.safeParse(valid).success).toBe(true);
    expect(
      richTextSchema.safeParse({
        type: "doc",
        content: [{ type: "script", text: "alert()" }],
      }).success,
    ).toBe(false);
    expect(
      richTextSchema.safeParse({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Bad",
                marks: [
                  { type: "link", attrs: { href: "javascript:alert(1)" } },
                ],
              },
            ],
          },
        ],
      }).success,
    ).toBe(false);
  });
  test("rich text rejects excessive depth before recursive parsing", () => {
    let node: unknown = { type: "text", text: "x" };
    for (let i = 0; i < 100; i++) node = { type: "paragraph", content: [node] };
    expect(
      richTextSchema.safeParse({ type: "doc", content: [node] }).success,
    ).toBe(false);
  });
  test("splitting long text preserves every character and inline marks", () => {
    const text = "A thoughtful idea. ".repeat(40),
      rich = plainRichText(text);
    rich.content![0].content![0].marks = [{ type: "bold" }];
    const chunks = splitTextElement(
      newElement("text", { text, richText: rich, width: 300, height: 100 }),
      70,
    );
    expect(chunks.map((c) => c.text).join("")).toBe(text);
    expect(chunks.length).toBeGreaterThan(2);
    for (const c of chunks) {
      expect(richTextSchema.safeParse(c.richText).success).toBe(true);
      expect(JSON.stringify(c.richText)).toContain("bold");
      expect(richTextPlain(c.richText!)).toBe(c.text);
    }
  });
  test("layouts fit explicit resized slide dimensions", () => {
    for (const l of LAYOUTS) {
      const s = layoutSlide(l.id, undefined, 960, 540);
      expect(
        s.elements
          .filter((e) => !e.accessibility?.decorative)
          .every((e) => e.x + e.width <= 970 && e.y + e.height <= 550),
      ).toBe(true);
    }
  });
  test("whole-deck copies remap navigation, targets and groups without losing content", () => {
    const a = layoutSlide("title"),
      b = layoutSlide("questions");
    a.elements[0].groupId = "group";
    a.elements[1].groupId = "group";
    a.interactions = [
      {
        id: "rule",
        trigger: "click",
        target: a.elements[0].id,
        action: "navigate",
        value: b.id,
      },
    ];
    const copied = cloneSlides([a, b]);
    expect(copied[0].interactions[0].value).toBe(copied[1].id);
    expect(copied[0].interactions[0].target).toBe(copied[0].elements[0].id);
    expect(copied[0].elements[0].groupId).toBe(copied[0].elements[1].groupId);
    expect(copied[0].elements[0].groupId).not.toBe("group");
    expect(
      copied[1].elements.find((e) => e.type === "question")?.question,
    ).toEqual(b.elements.find((e) => e.type === "question")?.question);
  });
  test("snapping considers object edges and centers with an explicit tolerance", () => {
    const el = newElement("shape", { width: 100, height: 100 }),
      other = newElement("shape", { x: 330, y: 240, width: 120, height: 200 });
    const snapped = snapPosition(el, 228, 137, [other], 1280, 720, 6);
    expect(snapped.x).toBe(230);
    expect(snapped.guides.x).toBe(330);
    expect(snapped.y).toBe(140);
    const free = snapPosition(el, 201, 103, [], 1280, 720, 2);
    expect(free.x).toBe(201);
    expect(free.y).toBe(103);
  });
  test("invalid rich edits preserve the existing presentation atomically", () => {
    const doc = makeDocument("o", "w", "Test", "story"),
      before = structuredClone(doc);
    expect(() =>
      applyOperations(doc, [
        {
          type: "element.update",
          slideId: doc.slides[0].id,
          ids: [doc.slides[0].elements[0].id],
          patch: {
            chart: {
              kind: "donut",
              data: [{ label: "Invalid", value: -5 }],
              showValues: true,
            },
          },
        },
      ]),
    ).toThrow();
    expect(doc).toEqual(before);
  });
});
