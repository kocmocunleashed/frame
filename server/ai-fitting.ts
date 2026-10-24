import { runBrowserTask } from "./browser";
import type { FrameDocument } from "../shared/schema";
import { documentSchema } from "../shared/schema";
import { publicProjection } from "../shared/publications";
import { resolveTheme } from "../shared/themes";
import { staticHTML } from "./static-html";
import { JobFailure } from "./jobs";
export type TextFitIssue = {
  slideIndex: number;
  objectIndex: number;
  role: string;
  width: number;
  height: number;
  characters: number;
};
export class TextFitFailure extends JobFailure {
  constructor(public issues: TextFitIssue[]) {
    super(
      "Some generated text could not fit at a readable size. Enlarge the listed text boxes or shorten their copy consistently with their supporting claims. Completed slides are preserved.",
    );
  }
}
// New AI documents get one layout pass using the actual renderer and bundled
// fonts. Existing manual documents and unrelated scoped edits are never fitted.
export async function fitGeneratedDocument(
  inputDocument: FrameDocument,
  signal: AbortSignal,
) {
  if (signal.aborted) throw new JobFailure("Generation cancelled.");
  const doc = structuredClone(inputDocument),
    html = await staticHTML(
      publicProjection(doc, (id) => `/api/assets/${id}`),
      {},
    );
  const measured = await runBrowserTask(
    {
      html,
      width: doc.width,
      height: doc.height,
      format: "measure",
      minimums: Object.fromEntries(
        doc.slides.flatMap((s) =>
          s.elements.map((e) => [
            e.id,
            ((e.role === "heading" ? 28 : e.role === "label" ? 16 : 18) *
              doc.width) /
              1280,
          ]),
        ),
      ),
    },
    signal,
  );
  if (signal.aborted) throw new JobFailure("Generation cancelled.");
  if (measured.failed.length)
    throw new TextFitFailure(
      doc.slides.flatMap((slide, slideIndex) =>
        slide.elements.flatMap((el, objectIndex) =>
          measured.failed.includes(el.id)
            ? [
                {
                  slideIndex,
                  objectIndex,
                  role: el.role || el.type,
                  width: el.width,
                  height: el.height,
                  characters: el.text?.length || 0,
                },
              ]
            : [],
        ),
      ),
    );
  const sizes = new Map(measured.changes.map((c) => [c.id, c.size]));
  for (const slide of doc.slides) {
    const theme = resolveTheme(doc, slide);
    for (const element of slide.elements) {
      const size = sizes.get(element.id);
      if (size !== undefined) {
        element.baseFontSize = Math.max(
          8,
          size / (theme.typeScale?.[element.role || "body"] || 1),
        );
        delete element.fontSize;
      }
    }
  }
  return {
    document: documentSchema.parse(doc),
    warnings: measured.changes.length
      ? [
          "Some generated text was resized to fit. Review the copy and type before creating your presentation.",
        ]
      : [],
  };
}
