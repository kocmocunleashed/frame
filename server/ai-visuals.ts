import type { GeneratedSlide, VisualPlan } from "../shared/ai";
import { newElement } from "../shared/operations";
import {
  uid,
  type FrameElement,
  type Slide,
  type Theme,
} from "../shared/schema";
import { THEMES } from "../shared/themes";
import { JobFailure } from "./jobs";
/** Trusted composition of AI-selected tools; no generated geometry or executable code. */
export function visualSlide(
  slide: Slide,
  spec: GeneratedSlide,
  theme = THEMES[0],
  width = 1280,
  height = 720,
): Slide | null {
  if (
    [
      "title",
      "section",
      "quote",
      "chart",
      "statistics",
      "questions",
      "text-image",
    ].includes(slide.layout)
  )
    return null;
  let plan: VisualPlan | null | undefined = spec.visual;
  if (!plan && theme.artVersion === 2 && spec.claims.length <= 4) {
    const labels = spec.labels;
    plan = {
      kind:
        slide.layout === "process"
          ? "diagram"
          : slide.layout === "timeline"
            ? "timeline"
            : slide.layout === "two-column" && spec.claims.length === 2
              ? "comparison"
              : "cards",
      arrangement: "process",
      items: spec.claims.map((_, i) => ({
        label:
          labels[i] ||
          (spec.claims.length === 1 ? "Takeaway" : `Key idea ${i + 1}`),
        claimIndex: i,
        icon: slide.layout === "summary" ? "target" : "lightbulb",
        shape: "circle",
      })),
    };
  }
  if (!plan) return null;
  const indexes = new Set(plan.items.map((item) => item.claimIndex));
  if (
    plan.items.length !== spec.claims.length ||
    indexes.size !== spec.claims.length ||
    plan.items.some((item) => !spec.claims[item.claimIndex]) ||
    (plan.kind === "comparison" && plan.items.length !== 2)
  )
    throw new JobFailure(
      "The visual plan did not match its supporting points. Nothing was applied. Try generating the slide again.",
    );
  const elements: FrameElement[] = [];
  const add = (type: FrameElement["type"], patch: Partial<FrameElement>) => {
    const el = newElement(type, patch);
    elements.push(el);
    return el;
  };
  const text = (
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    size: number,
    extra: Partial<FrameElement> = {},
  ) =>
    add("text", {
      text: value,
      name: value.slice(0, 80),
      x,
      y,
      width: w,
      height: h,
      baseFontSize: size,
      lineHeight: 1.16,
      ...extra,
    });
  const shape = (
    x: number,
    y: number,
    w: number,
    h: number,
    extra: Partial<FrameElement> = {},
  ) =>
    add("shape", {
      x,
      y,
      width: w,
      height: h,
      fill: "surface",
      radius: theme.radius,
      shadow: false,
      name: "Visual panel",
      accessibility: { decorative: true },
      ...extra,
    });
  let headingX = 64,
    headingWidth = 1148,
    headingSize = 62,
    headingColor = "foreground";
  switch (theme.artDirection) {
    case "monochrome":
      shape(0, 0, 1280, 178, { fill: "foreground", radius: 0 });
      headingColor = "background";
      break;
    case "rage":
      shape(1160, -10, 30, 175, {
        fill: "foreground",
        rotation: 18,
        radius: 0,
      });
      headingSize = 88;
      headingWidth = 1040;
      break;
    case "liquid":
      shape(44, 25, 1190, 143, {
        fill: "#ffffff10",
        material: "glass",
        radius: 40,
        stroke: "#ffffff44",
        strokeWidth: 1,
      });
      headingSize = 58;
      break;
    case "material":
      shape(44, 25, 1190, 143, { fill: "foreground", radius: 72 });
      headingColor = "background";
      headingX = 90;
      headingWidth = 1100;
      break;
    case "future":
      shape(64, 180, 1148, 4, { fill: "accent", radius: 0 });
      break;
    case "y2k":
      shape(1130, 34, 100, 100, {
        shape: "spark",
        fill: "#e7edff",
        gradient: true,
      });
      headingWidth = 1040;
      break;
    case "nostalgia":
      shape(1030, 23, 155, 25, { fill: "#b79a6588", rotation: 5, radius: 0 });
      break;
    case "clay":
      shape(1130, 35, 100, 100, {
        shape: "circle",
        fill: "surface",
        gradient: true,
        shadow: true,
      });
      headingWidth = 1030;
      headingSize = 66;
      break;
    case "terminal":
      text(">", 64, 56, 70, 90, 58, {
        role: "label",
        accessibility: { decorative: true },
      });
      headingX = 150;
      headingWidth = 1050;
      headingSize = 54;
      break;
  }
  text(spec.headline, headingX, 44, headingWidth, 125, headingSize, {
    role: "heading",
    color: headingColor,
    letterSpacing: -2,
    ...(theme.artDirection === "liquid"
      ? { textAlign: "center" as const }
      : {}),
  });
  const n = plan.items.length;
  if (plan.kind === "diagram" && n > 1) {
    add("diagram", {
      name: "Edit relationship diagram",
      x: 76,
      y: 188,
      width: 1128,
      height: 280,
      fontSize: 18,
      diagram: {
        layout: plan.arrangement,
        nodes: plan.items.map((item) => ({ id: uid(), label: item.label })),
      },
    });
    plan.items.forEach((item, i) => {
      const w = 1128 / n;
      text(item.label, 76 + i * w + 12, 496, w - 24, 50, 25, {
        role: "heading",
      });
      text(
        spec.claims[item.claimIndex].text,
        76 + i * w + 12,
        556,
        w - 24,
        128,
        22,
        { role: "body" },
      );
    });
  } else if (plan.kind === "table") {
    add("table", {
      name: "Edit comparison table",
      x: 76,
      y: 210,
      width: 1128,
      height: 440,
      fontSize: 24,
      table: {
        header: false,
        rows: plan.items.map((item) => [
          item.label,
          spec.claims[item.claimIndex].text,
        ]),
      },
    });
  } else if (plan.kind === "timeline" && n > 1) {
    plan.items.forEach((item, i) => {
      const w = 1128 / n,
        x = 76 + i * w;
      if (i < n - 1)
        shape(x + 92, 264, w - 65, 10, {
          fill: "foreground",
          radius: 0,
          name: "Sequence connector",
        });
      shape(x, 222, 90, 90, { shape: "circle", fill: "foreground" });
      text(String(i + 1).padStart(2, "0"), x, 241, 90, 55, 34, {
        role: "label",
        textAlign: "center",
        color: "background",
      });
      text(item.label, x, 349, w - 32, 90, 34, { role: "heading" });
      text(spec.claims[item.claimIndex].text, x, 460, w - 32, 190, 26, {
        role: "body",
      });
    });
  } else {
    plan.items.forEach((item, i) => {
      const grid = n === 4,
        columns = grid ? 2 : n,
        w = 1128 / columns - 20;
      const x = 76 + (i % columns) * (1128 / columns),
        y = grid ? 205 + Math.floor(i / 2) * 232 : 215;
      const h = grid ? 208 : 438;
      const inverse = plan.kind === "comparison" && i === 1;
      const color = inverse ? "background" : "foreground";
      shape(x, y, w, h, {
        fill: inverse ? "foreground" : "surface",
        name: `${item.label} panel`,
        radius:
          theme.artDirection === "terminal" || theme.artDirection === "rage"
            ? 0
            : Math.max(16, theme.radius),
        shadow: theme.artDirection === "clay",
        material: theme.artDirection === "liquid" ? "glass" : "flat",
      });
      const badge = grid ? 58 : 88;
      shape(x + 24, y + 24, badge, badge, {
        shape: item.shape,
        fill: inverse ? "background" : "foreground",
        radius: 16,
        name: `${item.label} shape`,
      });
      add("icon", {
        icon: item.icon,
        name: `${item.label} icon`,
        x: x + 24 + badge * 0.24,
        y: y + 24 + badge * 0.24,
        width: badge * 0.52,
        height: badge * 0.52,
        color: inverse ? "foreground" : "background",
        accessibility: { decorative: true },
      });
      text(
        item.label,
        grid ? x + 105 : x + 27,
        grid ? y + 24 : y + 145,
        grid ? w - 135 : w - 54,
        grid ? 61 : 105,
        grid ? 31 : 37,
        { role: "heading", color },
      );
      text(
        spec.claims[item.claimIndex].text,
        grid ? x + 105 : x + 28,
        grid ? y + 101 : y + 267,
        grid ? w - 135 : w - 56,
        grid ? 94 : 145,
        grid ? 24 : 27,
        { role: "body", color },
      );
    });
  }
  const sx = width / 1280,
    sy = height / 720;
  return {
    ...slide,
    elements: elements.map((el) => ({
      ...el,
      x: el.x * sx,
      y: el.y * sy,
      width: Math.max(5, el.width * sx),
      height: Math.max(5, el.height * sy),
      ...(el.baseFontSize
        ? { baseFontSize: Math.max(8, el.baseFontSize * Math.min(sx, sy)) }
        : {}),
      ...(el.fontSize
        ? { fontSize: Math.max(8, el.fontSize * Math.min(sx, sy)) }
        : {}),
    })),
  };
}
