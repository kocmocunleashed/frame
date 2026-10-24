import { unzipSync } from "fflate";
import sharp from "sharp";
import type { AIProvider } from "./ai-provider";
import type { Store } from "./store";
import type { composeScene } from "./ai-scenes";
import { JobFailure } from "./jobs";
import { objectStorage } from "./storage";
import { renderExport } from "./render-export";
import { fitGeneratedDocument } from "./ai-fitting";
import { DeadlineExceeded, withDeadline } from "./deadline";
import { makeDocument } from "../shared/templates";
import { publicProjection } from "../shared/publications";
import { applyOperations } from "../shared/operations";
import {
  documentSchema,
  operationSchema,
  type FrameDocument,
  type Operation,
  type User,
} from "../shared/schema";
import {
  visualReviewFor,
  VISUAL_REVIEW_INSTRUCTIONS,
  type VisualReview,
} from "../shared/ai-visual-review";
type Pair = ReturnType<typeof composeScene>;
export type VisualReviewBatch = {
  slides: Pair[];
  warnings: string[];
  visualReview: {
    checks: number;
    fixedSlides: number;
    remainingIssues: number;
    status: "passed" | "fixed" | "needs-review" | "unavailable";
  };
};
type Context = {
  signal: AbortSignal;
  progress: (step: string, percent: number) => void | Promise<void>;
};
async function screenshotSlides(
  doc: FrameDocument,
  store: Store,
  owner: User,
  context: Context,
) {
  if (doc.workspaceId !== owner.workspaceId)
    throw new JobFailure("Visual review cannot access this workspace.");
  const projected = publicProjection(doc, (id) => `/api/assets/${id}`);
  const ids = new Set(
    projected.slides
      .flatMap((s) => s.elements.flatMap((el) => [el.src, el.media?.poster]))
      .filter((src): src is string => !!src?.startsWith("/api/assets/"))
      .map((src) => src.slice("/api/assets/".length)),
  );
  const assets: Record<string, string> = {};
  let total = 0;
  for (const id of ids) {
    if (context.signal.aborted)
      throw new JobFailure("Visual review cancelled.");
    const asset = (await store.db.one("assets",{$and:[{id:id},{workspaceId:owner.workspaceId}]})) as {
      mime: string;
      storageKey: string;
      bytes: number;
    } | null;
    if (!asset || !asset.mime.startsWith("image/"))
      throw new JobFailure("A visual review image is unavailable.");
    total += asset.bytes;
    if (total > 32 * 1024 * 1024)
      throw new JobFailure("Visual review media exceeds its 32 MB limit.");
    const bytes = await objectStorage().read(
      "assets",
      asset.storageKey,
      32 * 1024 * 1024,
    );
    assets[id] =
      `data:${asset.mime};base64,${Buffer.from(bytes).toString("base64")}`;
  }
  const rendered = await renderExport(projected, assets, "images", 1, {
    signal: context.signal,
    progress: () => {},
  });
  const files = Object.entries(unzipSync(rendered.bytes))
    .filter(([name]) => name.endsWith(".png"))
    .sort(([a], [b]) => a.localeCompare(b));
  if (files.length !== doc.slides.length)
    throw new JobFailure("Visual review screenshots are incomplete.");
  return await Promise.all(
    files.map(async ([, bytes]) => {
      const jpeg = await sharp(bytes)
        .resize({
          width: 1280,
          height: 720,
          fit: "inside",
          withoutEnlargement: true,
        })
        .jpeg({ quality: 88 })
        .toBuffer();
      if (jpeg.length > 2 * 1024 * 1024)
        throw new JobFailure(
          "A visual review screenshot exceeds its size limit.",
        );
      return `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    }),
  );
}
function reviewOperations(
  doc: FrameDocument,
  review: VisualReview,
): Operation[] {
  const ops: Operation[] = [];
  for (const item of review.slides) {
    const slide = doc.slides.find((s) => s.id === item.slideId);
    if (!slide) throw new JobFailure("Visual fixes target an unknown slide.");
    if (!item.issues.length) continue;
    if (item.background !== null)
      ops.push({
        type: "slide.update",
        slideId: slide.id,
        patch: { background: item.background },
      });
    if (item.elementOrder !== null) {
      if (
        slide.elements.some((el) => el.locked) ||
        item.elementOrder.length !== slide.elements.length ||
        new Set(item.elementOrder).size !== slide.elements.length ||
        item.elementOrder.some(
          (id) => !slide.elements.some((el) => el.id === id),
        )
      )
        throw new JobFailure("Visual fixes contain an invalid layer order.");
      ops.push({
        type: "element.order",
        slideId: slide.id,
        ids: item.elementOrder,
      });
    }
    const seen = new Set<string>();
    for (const update of item.updates) {
      const el = slide.elements.find((e) => e.id === update.elementId);
      if (!el || el.locked || seen.has(el.id))
        throw new JobFailure("Visual fixes target an unavailable object.");
      seen.add(el.id);
      const { elementId, fontSize, ...values } = update;
      const patch = Object.fromEntries(
        Object.entries(values).filter(([, value]) => value !== null),
      );
      if (fontSize !== null) {
        const min =
          ((el.role === "heading" ? 28 : el.role === "label" ? 16 : 18) *
            doc.width) /
          1280;
        if (fontSize < min)
          throw new JobFailure("A visual fix would make text too small.");
        patch.fontSize = fontSize;
      }
      if (update.path !== null && (el.type !== "shape" || el.shape !== "path"))
        throw new JobFailure(
          "A visual fix cannot replace this object with a path.",
        );
      if (!el.accessibility?.decorative) {
        if (
          (update.opacity !== null && update.opacity < 1) ||
          (el.type === "text" && update.color === "transparent")
        )
          throw new JobFailure("A visual fix cannot hide meaningful content.");
        const x = update.x ?? el.x,
          y = update.y ?? el.y,
          width = update.width ?? el.width,
          height = update.height ?? el.height;
        if (
          x < 0 ||
          y < 0 ||
          x + width > doc.width + 1 ||
          y + height > doc.height + 1
        )
          throw new JobFailure("A visual fix moves content outside the slide.");
      }
      if (Object.keys(patch).length)
        ops.push(
          operationSchema.parse({
            type: "element.update",
            slideId: slide.id,
            ids: [elementId],
            patch,
          }),
        );
    }
  }
  return ops;
}
export async function reviewVisualBatch(
  pairs: Pair[],
  store: Store,
  owner: User,
  provider: AIProvider,
  dimensions: {
    width: number;
    height: number;
    title: string;
  },
  deckContext: unknown,
  context: Context,
  options: {
    timeoutMs?: number;
    render?: typeof screenshotSlides;
    fit?: typeof fitGeneratedDocument;
  } = {},
): Promise<VisualReviewBatch> {
  const callerSignal = context.signal;
  const reportProgress = context.progress;
  const started = Date.now();
  const base = makeDocument(
    owner.id,
    owner.workspaceId,
    dimensions.title,
    "blank",
  );
  base.width = dimensions.width;
  base.height = dimensions.height;
  base.slides = pairs.map((pair) => pair.slide);
  base.themes = pairs.map((pair) => pair.theme);
  base.themeId = base.themes[0].id;
  const original = documentSchema.parse(base);
  const schema = visualReviewFor(original.slides.map((s) => s.id));
  let checks = 0;
  let knownIssues = 0;
  let issueNotes: string[] = [];
  const inspect = async (doc: FrameDocument, previous?: VisualReview) => {
    await context.progress(
      previous
        ? "Rechecking visuals after fixes"
        : "Rendering slides for visual review",
      previous ? 75 : 10,
    );
    const images = await (options.render || screenshotSlides)(
      doc,
      store,
      owner,
      context,
    );
    await context.progress(
      previous
        ? "Rechecking visuals after fixes"
        : "Reviewing visuals with Muse",
      previous ? 85 : 30,
    );
    const projected = publicProjection(doc, (id) => `/api/assets/${id}`);
    const result = schema.parse(
      await provider.generate(
        "creative_visual_review",
        schema,
        VISUAL_REVIEW_INSTRUCTIONS,
        {
          width: doc.width,
          height: doc.height,
          imageOrder: doc.slides.map((s) => s.id),
          deckContext,
          slides: projected.slides,
          themes: projected.themes,
          previousIssues:
            previous?.slides.map((s) => ({
              slideId: s.slideId,
              issues: s.issues,
            })) || [],
        },
        context.signal,
        images,
      ),
    );
    context.signal.throwIfAborted();
    if (new Set(result.slides.map((s) => s.slideId)).size !== doc.slides.length)
      throw new JobFailure("Visual review returned duplicate slide results.");
    checks++;
    return result;
  };
  const pack = (
    doc: FrameDocument,
    warnings: string[],
    fixedSlides: number,
    remainingIssues: number,
    status: VisualReviewBatch["visualReview"]["status"],
  ): VisualReviewBatch => ({
    slides: pairs.map((pair, i) => ({ ...pair, slide: doc.slides[i] })),
    warnings,
    visualReview: { checks, fixedSlides, remainingIssues, status },
  });
  try {
    return await withDeadline(
      callerSignal,
      options.timeoutMs ?? 90000,
      async (signal) => {
        context = {
          signal,
          progress: (step, percent) => {
            signal.throwIfAborted();
            return reportProgress(step, percent);
          },
        };
        const first = await inspect(original);
        const initialIssues = first.slides.reduce(
          (n, s) => n + s.issues.length,
          0,
        );
        knownIssues = initialIssues;
        issueNotes = first.slides.flatMap((s) =>
          s.issues.map(
            (issue) =>
              `${original.slides.find((slide) => slide.id === s.slideId)!.title}: ${issue.message}`,
          ),
        );
        if (!initialIssues) return pack(original, [], 0, 0, "passed");
        const ops = reviewOperations(original, first);
        if (!ops.length)
          return pack(
            original,
            [
              "Muse flagged visual issues that need your review, but proposed no safe automatic fixes.",
              ...issueNotes,
            ],
            0,
            initialIssues,
            "needs-review",
          );
        await context.progress("Fixing layout and visual details", 55);
        const changed = documentSchema.parse(applyOperations(original, ops));
        const fitted = await (options.fit || fitGeneratedDocument)(
          changed,
          context.signal,
        );
        const second = await inspect(fitted.document, first);
        const score = (issues: VisualReview["slides"][number]["issues"]) =>
          issues.reduce((n, i) => n + (i.severity === "major" ? 10 : 1), 0);
        let fixedSlides = 0,
          remainingIssues = 0;
        const warnings = [...fitted.warnings];
        const result = {
          ...fitted.document,
          slides: original.slides.map((old) => {
            const before = first.slides.find((s) => s.slideId === old.id)!,
              after = second.slides.find((s) => s.slideId === old.id)!;
            const candidate = fitted.document.slides.find(
              (s) => s.id === old.id,
            )!;
            if (!before.issues.length) {
              remainingIssues += after.issues.length;
              for (const issue of after.issues)
                warnings.push(`${old.title}: ${issue.message}`);
              return old;
            }
            if (score(after.issues) > score(before.issues)) {
              remainingIssues += before.issues.length;
              if (before.issues.length)
                warnings.push(
                  `${old.title}: the visual repair did not improve the slide; its original design was kept.`,
                );
              return old;
            }
            remainingIssues += after.issues.length;
            if (JSON.stringify(candidate) !== JSON.stringify(old))
              fixedSlides++;
            for (const issue of after.issues)
              warnings.push(`${old.title}: ${issue.message}`);
            return candidate;
          }),
        };
        return pack(
          documentSchema.parse(result),
          [...new Set(warnings)],
          fixedSlides,
          remainingIssues,
          remainingIssues ? "needs-review" : fixedSlides ? "fixed" : "passed",
        );
      },
    );
  } catch (error) {
    if (callerSignal.aborted) throw new JobFailure("Visual review cancelled.");
    console.warn(
      JSON.stringify({
        level: "warn",
        event: "visual_review_incomplete",
        stage: checks ? "repair" : "inspection",
        type: error instanceof Error ? error.name : "unknown",
        reason: error instanceof DeadlineExceeded ? "timeout" : "review-error",
        durationMs: Date.now() - started,
      }),
    );
    return pack(
      original,
      [
        ...(error instanceof DeadlineExceeded
          ? [
              "Visual review reached its time limit. Your generated slides were kept; check their layout before presenting.",
            ]
          : []),
        checks
          ? "Muse’s visual fixes could not be confirmed. The generated design was kept for your review."
          : "Muse’s visual review could not finish. Your generated slides are available; check their layout before presenting.",
        ...(error instanceof JobFailure ? [error.message] : []),
        ...issueNotes,
      ],
      0,
      knownIssues,
      checks ? "needs-review" : "unavailable",
    );
  }
}
