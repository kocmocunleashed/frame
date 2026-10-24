import { test, expect } from "bun:test";
import { makeDocument } from "../shared/templates";
import { newElement } from "../shared/operations";
import { fitGeneratedDocument } from "../server/ai-fitting";
import { generationPreview } from "../server/ai-documents";
import { resolveFontSize, resolveTheme } from "../shared/themes";
test("new AI text uses actual font measurements to fit without changing its content or mutating the input", async () => {
  const doc = makeDocument("owner", "workspace", "Text fitting", "blank");
  doc.slides[0].elements = [
    newElement("text", {
      x: 100,
      y: 100,
      width: 600,
      height: 100,
      baseFontSize: 48,
      text: "Useful supporting copy with a longer explanation that needs a smaller but readable type size to fit its box.",
    }),
  ];
  const before = structuredClone(doc),
    fitted = await fitGeneratedDocument(doc, AbortSignal.timeout(15000));
  expect(doc).toEqual(before);
  expect(fitted.document.slides[0].elements[0].text).toBe(
    doc.slides[0].elements[0].text,
  );
  const size = resolveFontSize(
    fitted.document.slides[0].elements[0],
    resolveTheme(fitted.document),
  );
  expect(size).toBeGreaterThanOrEqual(18);
  expect(size).toBeLessThan(48);
  expect(fitted.warnings).toHaveLength(1);
}, 30000);
test("a process layout reclaims unused heading space and fits substantive copy; impossible copy is rejected", async () => {
  const base = makeDocument("owner", "workspace", "Readable process", "blank"),
    doc = generationPreview(
      base,
      [
        {
          title: "A practical workshop plan",
          layout: "process",
          headline: "Build a useful workshop plan",
          claims: [
            {
              text: "Set a realistic length and divide the time into short segments so energy stays high.",
              sourceId: null,
              quote: null,
            },
            {
              text: "Plan one or two hands-on activities that let people practice the outcome together.",
              sourceId: null,
              quote: null,
            },
            {
              text: "Prepare materials and a simple agenda in advance, then share the agenda with participants ahead of time.",
              sourceId: null,
              quote: null,
            },
            {
              text: "Reserve time at the end for questions and reflection.",
              sourceId: null,
              quote: null,
            },
          ],
          labels: [],
          data: [],
          notes: "Private notes",
          question: null,
        },
      ],
      [],
    );
  const fitted = await fitGeneratedDocument(doc, AbortSignal.timeout(15000));
  expect(
    fitted.document.slides[0].elements
      .filter((e) => e.role === "body")
      .every((e) => resolveFontSize(e, resolveTheme(fitted.document)) >= 18),
  ).toBe(true);
  expect(
    fitted.document.slides[0].elements
      .filter((e) => e.role === "label")
      .map((e) => e.text),
  ).toEqual(["1", "2", "3"]);
  const impossible = structuredClone(base);
  impossible.slides[0].elements = [
    newElement("text", {
      width: 20,
      height: 20,
      text: "Too much text for a readable box. ".repeat(100),
    }),
  ];
  await expect(
    fitGeneratedDocument(impossible, AbortSignal.timeout(15000)),
  ).rejects.toThrow("readable size");
}, 45000);
