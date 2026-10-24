import {supportingExcerpt} from './evidence';
import {
  type FrameDocument,
  type Slide,
  type Theme,
  slideSchema,
  uid,
} from "../shared/schema";
import { composeSlide } from "../shared/art-direction";
import { resolveTheme } from "../shared/themes";
import { type GeneratedSlide, type SourceRecord } from "../shared/ai";
import { layoutSlide } from "../shared/templates";
import { newElement } from "../shared/operations";
import { JobFailure } from "./jobs";
import { visualSlide } from "./ai-visuals";
export function generatedSlide(
  spec: GeneratedSlide,
  sources: Pick<SourceRecord, "id" | "name" | "text" | "url">[],
  width = 1280,
  height = 720,
  theme?: Theme,
): Slide {
  const evidence: NonNullable<Slide["sourceSupport"]>["evidence"] = [],
    suggestions: string[] = [];
  for (const claim of spec.claims) {
    const source = sources.find((s) => s.id === claim.sourceId);
    if (!source) {
      suggestions.push(claim.text);
      continue;
    }
    evidence.push({
      sourceId: source.id,
      sourceName: source.name,
      ...(source.url ? { url: source.url } : {}),
      claim: claim.text,
      quote: supportingExcerpt(source.text,claim.text,claim.quote),
    });
  }
  if (spec.data.length) {
    const supported = new Set(
      sources
        .filter((source) => evidence.some((e) => e.sourceId === source.id))
        .flatMap((source) =>
          [
            ...source.text
              .replace(/[−–]/g, "-")
              .matchAll(
                /[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:%|e[+-]?\d+)?/gi,
              ),
          ].flatMap((m) => {
            const percent = m[0].endsWith("%"),
              value = Number(m[0].replaceAll(",", "").replace("%", ""));
            return percent ? [value, value / 100] : [value];
          }),
        ),
    );
    if (spec.data.some((item) => !supported.has(item.value)))
      throw new JobFailure(
        "A generated chart value could not be traced to the included source data. Nothing was applied. Include the chart data, then try again.",
      );
  }
  let layout = spec.layout;
  // The statistics composition has exactly three number cards. A chart keeps
  // every supplied value editable when a different count would leave blanks
  // or silently omit later data points.
  if (layout === "statistics" && spec.data.length && spec.data.length !== 3)
    layout = "chart";
  if (
    (layout === "chart" || layout === "statistics") &&
    (!spec.data.length || !evidence.length)
  )
    layout = "two-column";
  if (layout === "questions" && !spec.question) layout = "summary";
  const slide = layoutSlide(layout, spec.title, width, height),
    headings = slide.elements.filter(
      (e) => e.type === "text" && e.role === "heading",
    ),
    bodies = slide.elements.filter(
      (e) => e.type === "text" && e.role === "body",
    ),
    labels = slide.elements.filter(
      (e) => e.type === "text" && e.role === "label",
    );
  for (const el of slide.elements)
    if (el.type === "text") {
      el.text = "";
      el.name = "Text";
    }
  headings.forEach((el, i) => {
    if (layout === "quote" && i === 0) {
      el.text = "“";
      el.name = "Quotation mark";
      return;
    }
    el.text =
      i === 0 || (layout === "quote" && i === 1)
        ? spec.headline
        : spec.data[i - 1]
          ? String(spec.data[i - 1].value)
          : spec.labels[i - 1] || "";
    el.name = el.text.slice(0, 100) || "Text";
  });
  labels.forEach((el, i) => {
    el.text =
      layout === "process"
        ? String(i + 1)
        : spec.labels[i] || spec.data[i]?.label || "";
    el.name = el.text.slice(0, 100) || "Label";
  });
  // Reuse an empty card heading's space for supporting copy. All generated
  // geometry remains ordinary editable document data.
  if (["process", "team", "timeline", "two-column"].includes(layout))
    bodies.forEach((body, i) => {
      const heading = headings[i + 1];
      if (
        heading &&
        !heading.text?.trim() &&
        heading.x < body.x + body.width &&
        heading.x + heading.width > body.x
      ) {
        const top = Math.min(body.y, heading.y);
        body.height += body.y - top;
        body.y = top;
      }
    });
  if (layout === "section" && headings[0]) {
    headings[0].y = height * 0.22;
    headings[0].height = height * 0.34;
  }
  if (bodies.length) {
    const chunks = Array.from({ length: bodies.length }, () => [] as string[]);
    spec.claims.forEach((claim, i) =>
      chunks[
        Math.min(
          bodies.length - 1,
          Math.floor((i * bodies.length) / Math.max(1, spec.claims.length)),
        )
      ].push(claim.text),
    );
    bodies.forEach((el, i) => {
      el.text = chunks[i].join("\n\n");
      el.name = el.text.slice(0, 100) || "Body";
    });
  } else if (
    spec.claims.length &&
    layout !== "questions" &&
    ((layout !== "chart" && layout !== "statistics") || theme?.artVersion === 2)
  )
    slide.elements.push(
      newElement("text", {
        x: width * 0.06,
        y: height * 0.65,
        width: width * 0.85,
        height: height * 0.22,
        baseFontSize: (26 * width) / 1280,
        role: "body",
        text: spec.claims.map((c) => c.text).join("\n\n"),
      }),
    );
  for (const el of slide.elements) {
    if (el.type === "chart" && spec.data.length)
      el.chart = { kind: "bar", data: spec.data, showValues: true };
    if (el.type === "question" && spec.question) {
      const q = spec.question;
      el.question = {
        kind: q.kind,
        prompt: q.prompt,
        options: q.options,
        ...(q.correctIndex !== null ? { correctIndex: q.correctIndex } : {}),
        ...(q.explanation !== null ? { explanation: q.explanation } : {}),
      };
    }
  }
  slide.notes = spec.notes;
  slide.sourceSupport = { evidence, suggestions, reviewRequired: true };
  // Ordinary animation/interaction data works in rehearsal, live delivery and HTML.
  if (theme?.artDirection) {
    for (const el of slide.elements)
      if (el.role === "body" && !["title", "section", "quote"].includes(layout))
        el.animation = {
          type: theme.motion === "none" ? "none" : "rise",
          step: 1,
        };
    for (const el of slide.elements)
      if (el.type === "question" && el.question?.explanation)
        slide.interactions.push({
          id: uid(),
          trigger: "answer",
          target: el.id,
          action: "feedback",
          value: el.question.explanation.slice(0, 2000),
        });
  }
  try {
    return slideSchema.parse(
      visualSlide(slide, spec, theme, width, height) ||
        composeSlide(slide, theme, width, height),
    );
  } catch (error) {
    if (error instanceof JobFailure) throw error;
    throw new JobFailure(
      "The AI slide content did not pass validation. Your presentation is unchanged.",
    );
  }
}
export function generationPreview(
  base: FrameDocument,
  specs: GeneratedSlide[],
  sources: Pick<SourceRecord, "id" | "name" | "text" | "url">[],
): FrameDocument {
  return {
    ...base,
    slides: specs.map((s) =>
      generatedSlide(s, sources, base.width, base.height, resolveTheme(base)),
    ),
  };
}
