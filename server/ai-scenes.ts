import type {
  FrameDocument,
  FrameElement,
  Operation,
  Theme,
} from "../shared/schema";
import {
  documentSchema,
  slideSchema,
  themeSchema,
  uid,
} from "../shared/schema";
import { newElement, applyOperations } from "../shared/operations";
import {
  readablePalette,
  contrast as contrastRatio,
} from "../shared/design-library";
import { type SceneSlide, sceneSlideSchema } from "../shared/ai-scene";
import type { SourceRecord, EditScope } from "../shared/ai";
import { generatedSlide } from "./ai-documents";
import { resolveColor } from "../shared/themes";
import { JobFailure } from "./jobs";
import { reconcileSceneClaims } from "./scene-claims";

function repairEdgeOverflow(spec: SceneSlide): string[] {
  const groups = new Map<string, SceneSlide["objects"]>();
  spec.objects.forEach((object, index) => {
    const key = object.group ? `group:${object.group}` : `object:${index}`;
    groups.set(key, [...(groups.get(key) || []), object]);
  });
  let moved = false;
  for (const objects of groups.values()) {
    const content = objects.filter((o) => !o.decorative);
    if (!content.length || objects.some((o) => o.rotation !== 0)) continue;
    const left = Math.min(...content.map((o) => o.x));
    const top = Math.min(...content.map((o) => o.y));
    const right = Math.max(...content.map((o) => o.x + o.width));
    const bottom = Math.max(...content.map((o) => o.y + o.height));
    if (right - left > 1280 || bottom - top > 720) continue;
    const dx = left < 0 ? -left : right > 1280 ? 1280 - right : 0;
    const dy = top < 0 ? -top : bottom > 720 ? 720 - bottom : 0;
    // Only correct small edge spills. Larger/rotated compositions still need
    // model repair. Preserve dimensions, text, and relative group positions.
    if (Math.abs(dx) > 32 || Math.abs(dy) > 32 || (!dx && !dy)) continue;
    objects.forEach((o) => {
      o.x += dx;
      o.y += dy;
    });
    moved = true;
  }
  return moved ? ["Moved edge content inside the slide bounds."] : [];
}
export function composeScene(
  raw: SceneSlide,
  sources: Pick<SourceRecord, "id" | "name" | "text" | "url">[],
  width = 1280,
  height = 720,
  assets: string[] = [],
) {
  const { scene: spec, warnings: claimWarnings } = reconcileSceneClaims(
    sceneSlideSchema.parse(raw),
  );
  if (new Set(spec.objects.map((o) => o.key)).size !== spec.objects.length)
    throw new JobFailure("The AI reused an object key. Nothing was applied.");
  if (
    spec.objects.reduce(
      (n, o) => n + (o.type === "shape" ? o.path?.length || 0 : 0),
      0,
    ) > 256
  )
    throw new JobFailure(
      "The illustration exceeded the vector complexity limit.",
    );
  const data = spec.objects.flatMap((o) =>
    o.type === "chart" ? o.chart.data : [],
  );
  // Share source references and numeric-data checks with legacy generation.
  const support = generatedSlide(
    {
      title: spec.title,
      layout: "title",
      headline: spec.title,
      notes: spec.notes,
      claims: spec.claims,
      data,
      labels: [],
      question: null,
    },
    sources,
  ).sourceSupport;
  const theme = themeSchema.parse({
    ...spec.theme,
    id: uid(),
    custom: true,
    colors: readablePalette(spec.theme.colors),
  });
  const groups = new Map<string, string>();
  const warnings: string[] = [...claimWarnings, ...repairEdgeOverflow(spec)];
  const elements = spec.objects.map((o, index) => {
    if (
      !o.decorative &&
      (o.x < 0 || o.y < 0 || o.x + o.width > 1281 || o.y + o.height > 721)
    )
      throw new JobFailure(
        "AI content fell outside the slide. Try a simpler composition.",
      );
    const { key, group, decorative, animation, ...fields } = o;
    const sx = width / 1280,
      sy = height / 720;
    const patch: Partial<FrameElement> = {
      ...fields,
      x: o.x * sx,
      y: o.y * sy,
      width: o.width * sx,
      height: o.height * sy,
      accessibility: { decorative, label: decorative ? undefined : o.name },
      ...(animation ? { animation } : {}),
    } as Partial<FrameElement>;
    if (group) {
      if (!groups.has(group)) groups.set(group, uid());
      patch.groupId = groups.get(group);
    }
    if ("fontSize" in o) {
      patch.baseFontSize = o.fontSize * sx;
      delete patch.fontSize;
    }
    if (o.type === "shape") {
      patch.path = o.path || undefined;
      if (o.shape === "path" && !o.path)
        throw new JobFailure("A vector illustration is missing its path.");
    }
    if (o.type === "timeline")
      patch.timeline = {
        ...o.timeline,
        items: o.timeline.items.map((item) => ({ ...item, id: uid() })),
      };
    if (o.type === "diagram")
      patch.diagram = {
        ...o.diagram,
        nodes: o.diagram.nodes.map((node) => ({ ...node, id: uid() })),
      };
    if (o.type === "question")
      patch.question = {
        ...o.question,
        correctIndex: o.question.correctIndex ?? undefined,
        explanation: o.question.explanation ?? undefined,
      };
    if (o.type === "image") {
      if (!assets.includes(o.assetId))
        throw new JobFailure(
          "The AI requested an image outside the authorized assets.",
        );
      patch.src = `/api/assets/${o.assetId}`;
    }
    if (o.type === "text") {
      const minimum = o.role === "heading" ? 28 : o.role === "body" ? 24 : 18;
      if (o.fontSize < minimum)
        throw new JobFailure(
          `Use at least ${minimum}px for ${o.role} text in the composition.`,
        );
      const panel = spec.objects
        .slice(0, index)
        .reverse()
        .find(
          (other) =>
            other.type === "shape" &&
            ["rectangle", "rounded"].includes(other.shape) &&
            other.fill !== "transparent" &&
            other.opacity >= 0.95 &&
            other.x <= o.x &&
            other.y <= o.y &&
            other.x + other.width >= o.x + o.width &&
            other.y + other.height >= o.y + o.height,
        );
      const color = resolveColor(o.color, theme),
        background =
          panel && panel.type === "shape"
            ? resolveColor(panel.fill, theme)
            : theme.colors.background;
      const required = o.role === "heading" && o.fontSize >= 28 ? 3 : 4.5;
      if (
        color === "transparent" ||
        contrastRatio(color, background) < required ||
        (!o.decorative && o.opacity < 1)
      ) {
        if (!o.decorative) patch.opacity = 1;
        patch.color = [
          theme.colors.foreground,
          theme.colors.background,
          "#000000",
          "#ffffff",
        ].sort(
          (a, b) => contrastRatio(b, background) - contrastRatio(a, background),
        )[0];
        warnings.push(
          "Adjusted some text colors for contrast. Review the custom look before applying it.",
        );
      }
    }
    return newElement(o.type, patch);
  });
  return {
    warnings: [...new Set(warnings)],
    theme,
    slide: slideSchema.parse({
      id: uid(),
      title: spec.title,
      notes: spec.notes,
      layout: "free",
      themeId: theme.id,
      elements,
      interactions: [],
      sourceSupport: support,
    }),
  };
}
export function sceneEditOperations(
  doc: FrameDocument,
  scope: EditScope,
  scenes: ReturnType<typeof composeScene>[],
  mode: "design" | "illustrate",
) {
  if (scope.kind === "objects")
    throw new JobFailure(
      "Choose slide scope to add illustrations or redesign a composition.",
    );
  if (scenes.length !== scope.slideIds.length)
    throw new JobFailure(
      "The AI design did not match the selected slide count.",
    );
  const ops: Operation[] = [];
  scope.slideIds.forEach((id, index) => {
    const current = doc.slides.find((s) => s.id === id);
    if (!current) throw new JobFailure("The selected slide no longer exists.");
    const { theme, slide } = scenes[index];
    if (mode === "illustrate") {
      const groupId = uid();
      const elements = slide.elements
        .filter((e) => e.type !== "text" || e.role === "label")
        .map((e) => ({
          ...e,
          groupId: e.groupId || groupId,
          ...Object.fromEntries(
            (["fill", "color", "stroke"] as const)
              .filter((k) => e[k])
              .map((k) => [k, resolveColor(e[k], theme)]),
          ),
        }));
      if (!elements.length)
        throw new JobFailure(
          "The AI did not return any editable illustration parts.",
        );
      ops.push({ type: "element.insert", slideId: id, elements });
    } else {
      if (current.elements.some((e) => e.locked))
        throw new JobFailure(
          "Unlock the slide’s objects before redesigning its composition.",
        );
      ops.push(
        { type: "theme.apply", theme, slideIds: [id] },
        {
          type: "element.delete",
          slideId: id,
          ids: current.elements.map((e) => e.id),
        },
        { type: "element.insert", slideId: id, elements: slide.elements },
        {
          type: "slide.update",
          slideId: id,
          patch: {
            title: slide.title,
            layout: "free",
            notes: slide.notes,
            sourceSupport: current.sourceSupport?.reviewRequired
              ? {
                  evidence: [],
                  suggestions: [],
                  ...slide.sourceSupport,
                  reviewRequired: true,
                }
              : slide.sourceSupport,
            interactions: [],
          },
        },
      );
    }
  });
  try {
    documentSchema.parse(applyOperations(doc, ops));
  } catch {
    throw new JobFailure(
      "This design exceeds the presentation’s object or document limits. Remove some objects or choose fewer slides, then try again.",
    );
  }
  return ops;
}
