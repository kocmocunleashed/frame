import type { Hono } from "hono";
import { z } from "zod";
import {
  type FrameDocument,
  type Operation,
  type User,
  operationSchema,
} from "../shared/schema";
import {
  editScopeSchema,
  editRequestSchema,
  editResponseSchema,
  type EditScope,
  type EditResponse,
  type SourceRecord,
} from "../shared/ai";
import { applyOperations } from "../shared/operations";
import { generatedSlide } from "./ai-documents";
import { resolveTheme } from "../shared/themes";
import { ApiError } from "./store";
import { AI_INSTRUCTIONS } from "./ai-provider";
import { JobFailure, publicJob, type JobRow } from "./jobs";
import type { AIServices } from "./creation";
import { motionResponseSchema, SCENE_INSTRUCTIONS } from "../shared/ai-scene";
export function resolveEditScope(
  doc: FrameDocument,
  input: EditScope,
): EditScope {
  const scope = editScopeSchema.parse(input),
    slideIds =
      scope.kind === "deck"
        ? doc.slides.map((s) => s.id)
        : [...new Set(scope.slideIds)];
  if (
    !slideIds.length ||
    slideIds.some((id) => !doc.slides.some((s) => s.id === id))
  )
    throw new ApiError(400, "Select slides that exist in this presentation.");
  if (scope.kind === "slide" && slideIds.length !== 1)
    throw new ApiError(400, "Current-slide scope requires exactly one slide.");
  const elementIds = [...new Set(scope.elementIds)];
  if (
    scope.kind === "objects" &&
    (!elementIds.length ||
      elementIds.some(
        (id) =>
          !doc.slides.some(
            (s) =>
              slideIds.includes(s.id) && s.elements.some((e) => e.id === id),
          ),
      ))
  )
    throw new ApiError(
      400,
      "Select existing objects within the chosen slides.",
    );
  return {
    kind: scope.kind,
    slideIds,
    elementIds: scope.kind === "objects" ? elementIds : [],
  };
}
export function editOperations(
  doc: FrameDocument,
  scope: EditScope,
  response: EditResponse,
  sources: SourceRecord[],
): Operation[] {
  const ops: Operation[] = [];
  const allowedSlide = (id: string) => scope.slideIds.includes(id);
  for (const update of response.updates) {
    const slide = doc.slides.find((s) => s.id === update.slideId),
      element = slide?.elements.find((e) => e.id === update.elementId);
    if (
      !allowedSlide(update.slideId) ||
      !element ||
      (scope.kind === "objects" && !scope.elementIds.includes(update.elementId))
    )
      throw new JobFailure(
        "The AI proposed an edit outside the selected scope. Nothing was applied.",
      );
    const { slideId, elementId, ...values } = update;
    const patch = Object.fromEntries(
      Object.entries(values).filter(([, value]) => value !== null),
    );
    if (update.text !== null) {
      if (element.type !== "text")
        throw new JobFailure(
          "The AI tried to rewrite a non-text object. Nothing was applied.",
        );
      delete patch.text;
      ops.push({
        type: "text.set",
        slideId,
        id: elementId,
        text: update.text,
        richText: null,
      });
    }
    if (Object.keys(patch).length)
      ops.push(
        operationSchema.parse({
          type: "element.update",
          slideId,
          ids: [elementId],
          patch,
        }),
      );
  }
  if (
    scope.kind === "objects" &&
    (response.replacements.length || response.insertions.length)
  )
    throw new JobFailure(
      "Selected-object edits cannot replace or insert slides. Choose a broader scope for layout changes.",
    );
  if (
    new Set(response.replacements.map((r) => r.slideId)).size !==
    response.replacements.length
  )
    throw new JobFailure(
      "The AI returned duplicate slide replacements. Nothing was applied.",
    );
  for (const replacement of response.replacements) {
    if (!allowedSlide(replacement.slideId))
      throw new JobFailure(
        "The AI proposed replacing a slide outside the selected scope.",
      );
    const old = doc.slides.find((s) => s.id === replacement.slideId)!;
    const slide = generatedSlide(
      replacement.slide,
      sources,
      doc.width,
      doc.height,
      resolveTheme(doc, old),
    );
    ops.push(
      {
        type: "element.delete",
        slideId: old.id,
        ids: old.elements.map((e) => e.id),
      },
      { type: "element.insert", slideId: old.id, elements: slide.elements },
      {
        type: "slide.update",
        slideId: old.id,
        patch: {
          title: slide.title,
          layout: slide.layout,
          notes: slide.notes,
          sourceSupport: slide.sourceSupport,
          interactions: slide.interactions,
        },
      },
    );
  }
  let working: FrameDocument;
  try {
    working = applyOperations(doc, ops);
  } catch {
    throw new JobFailure(
      "The AI edit did not pass document validation. Nothing was applied.",
    );
  }
  const inserted = new Map<string, number>();
  for (const insertion of response.insertions) {
    if (!allowedSlide(insertion.afterSlideId))
      throw new JobFailure(
        "The AI proposed an insertion outside the selected scope.",
      );
    const anchor = working.slides.find((s) => s.id === insertion.afterSlideId)!;
    const slide = generatedSlide(
      insertion.slide,
      sources,
      doc.width,
      doc.height,
      resolveTheme(doc, anchor),
    );
    slide.themeId = anchor.themeId;
    const offset = inserted.get(anchor.id) || 0;
    const op: Operation = {
      type: "slide.insert",
      slide,
      index: working.slides.findIndex((s) => s.id === anchor.id) + 1 + offset,
    };
    ops.push(op);
    try {
      working = applyOperations(working, [op]);
    } catch {
      throw new JobFailure(
        "The AI insertion exceeds the document limits. Nothing was applied.",
      );
    }
    inserted.set(anchor.id, offset + 1);
  }
  if (!ops.length)
    throw new JobFailure(
      "The AI did not propose any changes. Try a more specific instruction.",
    );
  return ops;
}
export async function runEditJob(
  job: JobRow,
  services: Pick<AIServices, "provider">,
  context: {
    signal: AbortSignal;
    progress: (step: string, percent: number) => void | Promise<void>;
  },
) {
  const payload = JSON.parse(job.payload),
    doc = payload.document as FrameDocument,
    scope = resolveEditScope(doc, payload.scope);
  await context.progress("Reviewing the selected content", 20);
  if (payload.mode === "animate") {
    const targets = doc.slides
      .filter((s) => scope.slideIds.includes(s.id))
      .map((s) => ({
        id: s.id,
        elements: s.elements.filter(
          (e) =>
            !e.locked &&
            (scope.kind !== "objects" || scope.elementIds.includes(e.id)),
        ),
      }));
    const response = motionResponseSchema.parse(
      await services.provider.generate(
        "creative_motion",
        motionResponseSchema,
        SCENE_INSTRUCTIONS +
          " Choreograph only the supplied objects. Return animations using their exact slide and element IDs. Put related objects into presenter-controlled reveal steps, then use restrained delays and durations within each step. Do not change content or geometry.",
        { instruction: payload.instruction, slides: targets },
        context.signal,
      ),
    );
    const ops: Operation[] = [];
    for (const entry of response.animations) {
      if (
        !targets.some(
          (s) =>
            s.id === entry.slideId &&
            s.elements.some((e) => e.id === entry.elementId),
        )
      )
        throw new JobFailure(
          "The AI proposed animating an object outside the selected scope.",
        );
      ops.push({
        type: "element.update",
        slideId: entry.slideId,
        ids: [entry.elementId],
        patch: { animation: entry.animation },
      });
    }
    if (
      new Set(response.animations.map((e) => e.elementId)).size !==
      response.animations.length
    )
      throw new JobFailure("The AI returned duplicate animation targets.");
    for (const slide of targets)
      ops.push({
        type: "slide.update",
        slideId: slide.id,
        patch: {
          interactions: doc.slides
            .find((s) => s.id === slide.id)!
            .interactions.filter(
              (i) =>
                !(
                  i.action === "animate" &&
                  response.animations.some((a) => a.elementId === i.target)
                ),
            ),
        },
      });
    return {
      summary: response.summary,
      baseRevision: doc.revision,
      scope,
      operations: ops,
      preview: applyOperations(doc, ops),
    };
  }
  const slides = doc.slides
    .filter((s) => scope.slideIds.includes(s.id))
    .map((s) => ({
      ...s,
      sourceSupport: undefined,
      elements:
        scope.kind === "objects"
          ? s.elements.filter((e) => scope.elementIds.includes(e.id))
          : s.elements,
    }));
  const response = editResponseSchema.parse(
    await services.provider.generate(
      "presentation_edits",
      editResponseSchema,
      AI_INSTRUCTIONS +
        " Return only updates to the allowed element IDs or replacements/insertions within the allowed slide IDs. Use null for unchanged update properties. Fill and color accept semantic palette names or hex colors. A text update rewrites only that text object. For regeneration, return exactly one replacement and no other edits. Use the visual specification to build editable shapes, icons, diagrams and comparisons instead of paragraphs when asked to visualize or improve layout. For broader visual edits, use replacements within the allowed slides; selected-object scope must remain updates only. Replaced slides receive fresh objects and their old element interactions are cleared.",
      {
        instruction: payload.instruction,
        mode: payload.mode,
        scope,
        document: {
          title: doc.title,
          language: doc.language,
          width: doc.width,
          height: doc.height,
          themes: doc.themes,
          themeId: doc.themeId,
          slides,
        },
        sources: payload.sources,
      },
      context.signal,
    ),
  );
  if (
    payload.mode === "regenerate" &&
    (response.replacements.length !== 1 ||
      response.updates.length ||
      response.insertions.length)
  )
    throw new JobFailure(
      "Slide regeneration returned an unexpected edit scope. Nothing was applied.",
    );
  await context.progress("Validating scope and preparing a preview", 80);
  const operations = editOperations(doc, scope, response, payload.sources);
  return {
    summary: response.summary,
    baseRevision: doc.revision,
    scope,
    operations,
    preview: applyOperations(doc, operations),
  };
}
export function registerEditRoutes(
  app: Hono<{
    Variables: {
      user: User;
    };
  }>,
  services: AIServices,
) {
  const { store, queue, provider, sources } = services;
  app.get("/api/decks/:id/ai-jobs", async (c) => {
    await store.access(c.req.param("id"), c.get("user"), true);
    return c.json(
      (await queue.list(c.get("user").id))
        .filter(
          (j) => j.deckId === c.req.param("id") && j.kind === "edit",
        )
        .map(publicJob),
    );
  });
  app.post("/api/decks/:id/ai", async (c) => {
    const user = c.get("user"),
      doc = await store.access(c.req.param("id"), user, true),
      input = editRequestSchema.parse(await c.req.json());
    if (!provider.configured)
      throw new ApiError(
        503,
        "AI is not configured. Ask the server owner to connect an AI provider. Manual editing is available.",
      );
    if (input.baseRevision !== doc.revision)
      throw new ApiError(
        409,
        "Save the current document before starting an AI edit.",
      );
    const scope = resolveEditScope(doc, input.scope);
    if (
      input.mode === "regenerate" &&
      (scope.kind !== "slide" || scope.slideIds.length !== 1)
    )
      throw new ApiError(400, "Regenerate one current slide at a time.");
    let included = await sources.selected(input.sourceIds, user);
    if (["design", "illustrate"].includes(input.mode)) {
      if (scope.slideIds.length > 30)
        throw new ApiError(400, "Design up to 30 slides at a time.");
      // Reuse only excerpts already shared in the selected document, without
      // granting access to another author's private source library.
      const inherited = new Map<string, SourceRecord>();
      for (const slide of doc.slides.filter((s) =>
        scope.slideIds.includes(s.id),
      ))
        for (const evidence of slide.sourceSupport?.evidence || []) {
          if (
            !evidence.quote ||
            included.some((s) => s.id === evidence.sourceId)
          )
            continue;
          const prior = inherited.get(evidence.sourceId);
          inherited.set(evidence.sourceId, {
            id: evidence.sourceId,
            name: evidence.sourceName,
            ...(evidence.url ? { url: evidence.url } : {}),
            text: prior ? prior.text + "\n" + evidence.quote : evidence.quote,
            mime: "text/plain",
            warnings: [],
            status: "ready",
            error: null,
            jobId: null,
            createdAt: doc.createdAt,
          });
        }
      included = [...included, ...inherited.values()];
      if (included.reduce((n, s) => n + s.text.length, 0) > 120000)
        throw new ApiError(
          400,
          "These slides contain too much source evidence for one design request. Select fewer slides.",
        );
    }
    const enqueue = ["design", "illustrate"].includes(input.mode)
      ? async (
          owner: string,
          kind: string,
          payload: Record<string, unknown>,
          key: string,
          id: string,
        ) =>
          await services.workflows.create(
            owner,
            "edit",
            payload,
            key,
            id,
            input.resumeJobId,
          )
      : async (
          owner: string,
          kind: string,
          payload: Record<string, unknown>,
          key: string,
          id: string,
        ) => await queue.enqueue(owner, kind, payload, key, id);
    if (
      ["design", "illustrate"].includes(input.mode) &&
      scope.kind === "objects"
    )
      throw new ApiError(
        400,
        "Choose slide scope for a composition or illustration.",
      );
    const job = await enqueue(
      user.id,
      "edit",
      {
        document: doc,
        scope,
        instruction: input.instruction,
        mode: input.mode,
        sources: included,
      },
      input.key,
      doc.id,
    );
    return c.json(publicJob(job), 202);
  });
  app.post("/api/decks/:id/ai/:jobId/operations", async (c) => {
    const input=z.object({baseRevision:z.number().int().nonnegative().optional()}).parse(await c.req.json());
    const user = c.get("user"),
      doc = await store.access(c.req.param("id"), user, true),
      job = await queue.get(c.req.param("jobId"), user.id);
    if (job.kind !== "edit" || job.deckId !== doc.id)
      throw new ApiError(404, "AI edit not found.");
    if (job.status !== "succeeded" || !job.result)
      throw new ApiError(409, "Wait for this AI edit to finish.");
    const result = JSON.parse(job.result);
    if (result.baseRevision !== doc.revision || (input.baseRevision!==undefined&&input.baseRevision!==doc.revision))
      throw new ApiError(
        409,
        "This document changed after the AI edit started. Your work is preserved. Start a new edit against the current version.",
      );
    const operations = z
      .array(operationSchema)
      .min(1)
      .max(500)
      .parse(result.operations);
    applyOperations(doc, operations);
    return c.json({ operations });
  });
}
