import { expect, test } from "bun:test";
import { zodResponseFormat } from "openai/helpers/zod";
import { generatedSlide } from "../server/ai-documents";
import {
  deckResponseSchema,
  editResponseSchema,
  type GeneratedSlide,
} from "../shared/ai";
import { sceneBatchFor } from "../shared/ai-scene";
import { slideSchema } from "../shared/schema";

const source = {
  id: "source",
  name: "Study",
  text: "The sample has 25 entries.",
  url: "https://example.com/study",
};
const spec = (
  sourceId: string | null,
  quote?: string | null,
): GeneratedSlide => ({
  title: "A useful explanation",
  layout: "title",
  headline: "The sample",
  claims: [{ text: "The sample has 25 entries.", sourceId, quote }],
  labels: [],
  data: [],
  notes: "",
  question: null,
});

test("generation, regeneration and design schemas do not ask for quotes or excerpt IDs", () => {
  for (const schema of [
    deckResponseSchema,
    editResponseSchema,
    sceneBatchFor(2),
  ]) {
    const format = JSON.stringify(zodResponseFormat(schema, "slides"));
    expect(format).not.toContain('"quote":');
    expect(format).not.toContain('"excerptId":');
    expect(format).toContain('"sourceId":');
  }
});

test("included evidence retains an actual source passage", () => {
  for (const quote of [undefined, null, "", source.text]) {
    const slide = generatedSlide(spec(source.id, quote), [source]);
    expect(slide.sourceSupport).toEqual({
      evidence: [
        {
          sourceId: source.id,
          sourceName: source.name,
          url: source.url,
          claim: "The sample has 25 entries.",
          quote:source.text,
        },
      ],
      suggestions: [],
      reviewRequired: true,
    });
    expect(slideSchema.safeParse(slide).success).toBe(true);
  }
});

test("missing or unknown source references remain general copy without invented links", () => {
  for (const sourceId of [null, "unknown", "unsupported"]) {
    const slide = generatedSlide(spec(sourceId, "An invented quotation."), [
      source,
    ]);
    expect(slide.sourceSupport?.evidence).toEqual([]);
    expect(slide.sourceSupport?.suggestions).toEqual([
      "The sample has 25 entries.",
    ]);
    expect(
      slide.elements.some(
        (element) => element.text === "The sample has 25 entries.",
      ),
    ).toBe(true);
  }
});

test("chart values use source data directly without quote matching", () => {
  const chart = {
    ...spec(source.id),
    layout: "chart" as const,
    data: [{ label: "Entries", value: 25 }],
  };
  expect(generatedSlide(chart, [source]).layout).toBe("chart");
  expect(() =>
    generatedSlide({ ...chart, data: [{ label: "Entries", value: 99 }] }, [
      source,
    ]),
  ).toThrow("chart value could not be traced");
});

test("saved documents containing old quotations remain readable", () => {
  const slide = generatedSlide(spec(source.id), [source]);
  Object.assign(slide.sourceSupport!.evidence[0], { quote: source.text });
  expect(slideSchema.parse(slide).sourceSupport?.evidence[0].quote).toBe(
    source.text,
  );
});

test("unmatched model quotations fail generation while saved documents remain readable",()=>{expect(()=>generatedSlide(spec(source.id,"An invented quotation."),[source])).toThrow("quotation did not match");});
