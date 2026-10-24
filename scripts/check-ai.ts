import { JobFailure } from "../server/jobs";
import type { AIProvider } from "../server/ai-provider";
import { mkdirSync, writeFileSync } from "node:fs";
import { configuredAIProvider, AI_INSTRUCTIONS } from "../server/ai-provider";
import {
  outlineResponseSchema,
  outlineResponseFor,
  deckResponseSchema,
  deckResponseFor,
  editResponseSchema,
} from "../shared/ai";
import { makeDocument } from "../shared/templates";
import { generationPreview } from "../server/ai-documents";
import { editOperations, resolveEditScope } from "../server/ai-edits";
import { applyOperations } from "../shared/operations";
import { documentSchema, themeSchema, uid } from "../shared/schema";
import { aiThemeResponseSchema } from "../shared/ai-themes";
import { readablePalette } from "../shared/design-library";
import { OpenRouterProvider } from "../server/openrouter";
const traceFetch = (async (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => {
  const started = Date.now();
  const path = new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url,
  ).pathname;
  try {
    const response = await fetch(input, init);
    console.log(
      JSON.stringify({
        event: "provider_transport",
        path,
        status: response.status,
        headersMs: Date.now() - started,
      }),
    );
    return response;
  } catch (error) {
    console.log(
      JSON.stringify({
        event: "provider_transport_failure",
        path,
        errorType: error instanceof Error ? error.name : "unknown",
        durationMs: Date.now() - started,
      }),
    );
    throw error;
  }
}) as typeof fetch;
const provider =
  process.argv.includes("--transport") &&
  process.env.FRAME_AI_PROVIDER === "openrouter"
    ? new OpenRouterProvider(
        process.env.OPENROUTER_API_KEY,
        process.env.OPENROUTER_MODEL,
        traceFetch,
      )
    : configuredAIProvider();
if (!provider.configured) {
  console.error(
    "Live-provider check not run: configure the provider in the project .env or server environment.",
  );
  process.exit(2);
}
const generate = async (...args: Parameters<AIProvider["generate"]>) => {
  const attempts = process.argv.includes("--once") ? 1 : 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await provider.generate(...args);
    } catch (error) {
      if (
        !(error instanceof JobFailure) ||
        !error.retryable ||
        attempt === attempts
      )
        throw error;
      console.log(
        JSON.stringify({ event: "integration_retry", task: args[0], attempt }),
      );
      await Bun.sleep(2000 * attempt);
    }
  }
  throw new Error("Integration attempts exhausted.");
};
const signal = AbortSignal.timeout(600000),
  brief = {
    topic: "Planning a small community workshop",
    audience: "First-time workshop hosts",
    outcome: "Plan a clear, useful workshop",
    slideCount: 3,
    language: "English",
    tone: "Clear and practical",
    requirements: "Use no statistics or external factual claims.",
    sourceIds: [],
  };
try {
  const outline = outlineResponseSchema.parse(
    await generate(
      "integration_outline",
      outlineResponseFor(brief.slideCount),
      AI_INSTRUCTIONS +
        " Return exactly three sections: opening, practical development, conclusion.",
      { brief, sources: [] },
      signal,
    ),
  );
  if (outline.sections.length !== 3)
    throw new Error("The real provider did not return three outline sections.");
  const generated = deckResponseSchema.parse(
    await generate(
      "integration_slides",
      deckResponseFor(outline.sections.length),
      AI_INSTRUCTIONS +
        " Return exactly one slide per supplied outline section, three total. Use no chart data. All claims are suggestions with null sourceId and quote.",
      { brief, outline, sources: [] },
      signal,
    ),
  );
  if (generated.slides.length !== 3)
    throw new Error("The real provider did not return three slides.");
  const doc = documentSchema.parse(
    generationPreview(
      makeDocument(
        "integration-check",
        "integration-check",
        generated.title,
        "blank",
      ),
      generated.slides,
      [],
    ),
  );
  const slide = doc.slides[0],
    element = slide.elements.find((e) => e.type === "text")!;
  const scope = resolveEditScope(doc, {
    kind: "objects",
    slideIds: [slide.id],
    elementIds: [element.id],
  });
  const response = editResponseSchema.parse(
    await generate(
      "integration_edit",
      editResponseSchema,
      AI_INSTRUCTIONS +
        " Rewrite only the supplied text object more concisely. Return one update; no insertions or replacements. Use null for unchanged fields.",
      { scope, element, slideId: slide.id, sources: [] },
      signal,
    ),
  );
  const operations = editOperations(doc, scope, response, []);
  documentSchema.parse(applyOperations(doc, operations));
  const rawTheme = aiThemeResponseSchema.parse(
    await generate(
      "integration_theme",
      aiThemeResponseSchema,
      AI_INSTRUCTIONS +
        " Create a readable dark theme with bright lime accents using only supported tokens.",
      {
        description: "Dark workshop stage, lime accents, clear sans-serif type",
        baseTheme: null,
      },
      signal,
    ),
  );
  const theme = themeSchema.parse({
    ...rawTheme,
    id: uid(),
    custom: true,
    colors: readablePalette(rawTheme.colors),
  });
  const refined = aiThemeResponseSchema.parse(
    await generate(
      "integration_theme_refine",
      aiThemeResponseSchema,
      AI_INSTRUCTIONS +
        " Refine only the radius, keeping the other theme tokens consistent.",
      { description: "Make the corners more rounded", baseTheme: theme },
      signal,
    ),
  );
  themeSchema.parse({ ...refined, id: uid(), custom: true });
  documentSchema.parse(applyOperations(doc, [{ type: "theme.apply", theme }]));
  const root = ".frame-data/integration";
  mkdirSync(root, { recursive: true });
  writeFileSync(
    `${root}/ai-check.json`,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        provider: provider.label,
        model:
          process.env.FRAME_AI_PROVIDER === "openrouter"
            ? process.env.OPENROUTER_MODEL ||
              "nvidia/nemotron-3.5-super-vl:free"
            : process.env.FRAME_AI_PROVIDER === "tokenrouter"
              ? process.env.TOKENROUTER_MODEL
              : process.env.OPENAI_MODEL || "gpt-5-mini",
        outline,
        document: doc,
        operations,
        theme,
        refinedTheme: refined,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  console.log(
    JSON.stringify({
      ok: true,
      checks: [
        "real structured outline",
        "real structured slides",
        "source validation",
        "scoped edit validation",
        "theme generation and refinement",
      ],
      artifact: `${root}/ai-check.json`,
    }),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      ok: false,
      message:
        error instanceof Error ? error.message : "Live provider check failed.",
    }),
  );
  process.exit(1);
}
