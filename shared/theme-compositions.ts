import type { FrameElement, Slide, Theme } from "./schema";
import type { PathCommand } from "./creative";
import { newElement } from "./operations";

const DIRECTIONS = new Set([
  "bauhaus",
  "pop",
  "blueprint",
  "deco",
  "memphis",
  "editorial",
]);
type Region = { x: number; y: number; w: number; h: number };

/** Native document compositions, rendered and exported by the existing renderer. */
export function composeAdditionalTheme(
  slide: Slide,
  theme: Theme,
  width: number,
  height: number,
): Slide | null {
  const direction = theme.artDirection;
  if (!direction || !DIRECTIONS.has(direction)) return null;
  const sx = width / 1280,
    sy = height / 720,
    unit = Math.min(sx, sy);
  const elements = slide.elements
    .filter((el) => el.type !== "shape")
    .map((el) => ({
      ...el,
      x: el.x / sx,
      y: el.y / sy,
      width: el.width / sx,
      height: el.height / sy,
      ...(el.baseFontSize ? { baseFontSize: el.baseFontSize / unit } : {}),
    }));
  const art: FrameElement[] = [];
  const box = (
    x: number,
    y: number,
    w: number,
    h: number,
    extra: Partial<FrameElement> = {},
  ) => {
    const el = newElement("shape", {
      x,
      y,
      width: w,
      height: h,
      fill: "surface",
      strokeWidth: 0,
      radius: 0,
      shadow: false,
      name: `${theme.name} artwork`,
      accessibility: { decorative: true },
      ...extra,
    });
    art.push(el);
    return el;
  };
  const path = (
    x: number,
    y: number,
    w: number,
    h: number,
    commands: PathCommand[],
    extra: Partial<FrameElement> = {},
  ) =>
    box(x, y, w, h, {
      shape: "path",
      path: commands,
      fill: "transparent",
      stroke: "foreground",
      strokeWidth: 2,
      ...extra,
    });
  const rule = (
    x: number,
    y: number,
    w: number,
    color = "foreground",
    weight = 2,
  ) => box(x, y, w, 5, { shape: "line", fill: color, strokeWidth: weight });
  const place = (
    el: FrameElement | undefined,
    x: number,
    y: number,
    w: number,
    h: number,
    size: number,
    extra: Partial<FrameElement> = {},
  ) => {
    if (el)
      Object.assign(el, {
        x,
        y,
        width: w,
        height: h,
        baseFontSize: size,
        color: "foreground",
        textAlign: "left",
        lineHeight: 1.15,
        letterSpacing: 0,
        rotation: 0,
        ...extra,
      });
  };
  function dots(x: number, y: number, w: number, h: number) {
    const commands: PathCommand[] = [];
    for (let row = 0; row < 6; row++)
      for (let col = 0; col < 5; col++) {
        const cx = 9 + col * 20,
          cy = 8 + row * 16;
        commands.push(
          { op: "M", x: cx - 2, y: cy },
          {
            op: "C",
            x1: cx - 2,
            y1: cy - 3,
            x2: cx + 2,
            y2: cy - 3,
            x: cx + 2,
            y: cy,
          },
          {
            op: "C",
            x1: cx + 2,
            y1: cy + 3,
            x2: cx - 2,
            y2: cy + 3,
            x: cx - 2,
            y: cy,
          },
          { op: "Z" },
        );
      }
    path(x, y, w, h, commands, {
      fill: "foreground",
      strokeWidth: 0,
      opacity: 0.2,
    });
  }
  function grid() {
    const commands: PathCommand[] = [];
    for (let x = 0; x <= 100; x += 5)
      commands.push({ op: "M", x, y: 0 }, { op: "L", x, y: 100 });
    for (let y = 0; y <= 100; y += 8)
      commands.push({ op: "M", x: 0, y }, { op: "L", x: 100, y });
    path(0, 0, 1280, 720, commands, {
      stroke: "secondary",
      strokeWidth: 1,
      opacity: 0.15,
    });
  }
  function decoFrame() {
    path(
      36,
      30,
      1208,
      660,
      [
        { op: "M", x: 0, y: 17 },
        { op: "L", x: 0, y: 0 },
        { op: "L", x: 32, y: 0 },
        { op: "M", x: 68, y: 0 },
        { op: "L", x: 100, y: 0 },
        { op: "L", x: 100, y: 17 },
        { op: "M", x: 100, y: 83 },
        { op: "L", x: 100, y: 100 },
        { op: "L", x: 68, y: 100 },
        { op: "M", x: 32, y: 100 },
        { op: "L", x: 0, y: 100 },
        { op: "L", x: 0, y: 83 },
      ],
      { stroke: "accent", strokeWidth: 2 },
    );
    for (const x of [56, 1209])
      box(x, 79, 15, 562, {
        fill: "transparent",
        stroke: "accent",
        strokeWidth: 1,
      });
    box(623, 42, 34, 34, {
      fill: "transparent",
      stroke: "accent",
      strokeWidth: 2,
      rotation: 45,
    });
    box(623, 644, 34, 34, { fill: "accent", rotation: 45 });
  }
  function squiggle(x: number, y: number, w: number, h: number) {
    path(
      x,
      y,
      w,
      h,
      [
        { op: "M", x: 0, y: 70 },
        { op: "L", x: 17, y: 15 },
        { op: "L", x: 34, y: 70 },
        { op: "L", x: 51, y: 15 },
        { op: "L", x: 68, y: 70 },
        { op: "L", x: 85, y: 15 },
        { op: "L", x: 100, y: 70 },
      ],
      { stroke: "accent", strokeWidth: 7 },
    );
  }
  const heads = elements.filter((el) => el.role === "heading");
  const main = slide.layout === "quote" ? heads[1] || heads[0] : heads[0];
  const subheads = heads.filter(
    (el) => el !== main && !(slide.layout === "quote" && el === heads[0]),
  );
  if (slide.layout === "quote" && heads[0] !== main)
    elements.splice(elements.indexOf(heads[0]), 1);
  const bodies = elements.filter((el) => el.role === "body"),
    labels = elements.filter((el) => el.role === "label");
  const visual = elements.find((el) =>
    ["chart", "table", "diagram", "question", "image", "video"].includes(
      el.type,
    ),
  );
  const cover = ["title", "section", "summary", "quote"].includes(slide.layout);
  if (direction === "blueprint") grid();
  if (direction === "deco") decoFrame();

  if (cover) {
    switch (direction) {
      case "bauhaus":
        box(860, 0, 420, 720, { fill: "#1b42b8" });
        box(835, 50, 355, 355, { shape: "circle", fill: "accent" });
        box(899, 437, 288, 238, { shape: "triangle", fill: "surface" });
        box(58, 574, 700, 18, { fill: "foreground" });
        place(main, 58, 150, 748, 370, 112, {
          letterSpacing: -5,
          lineHeight: 1.01,
        });
        place(bodies[0], 64, 601, 700, 95, 27);
        place(labels[0], 65, 63, 680, 45, 18, { letterSpacing: 3 });
        break;
      case "pop":
        dots(970, 10, 300, 340);
        box(115, 118, 1035, 385, { fill: "foreground", rotation: -3 });
        box(90, 90, 1035, 385, {
          fill: "surface",
          stroke: "foreground",
          strokeWidth: 4,
          rotation: -3,
        });
        box(1045, 493, 185, 185, {
          shape: "star",
          fill: "accent",
          rotation: 13,
        });
        place(main, 145, 141, 925, 290, 128, {
          lineHeight: 0.95,
          letterSpacing: -2,
        });
        place(bodies[0], 105, 533, 875, 135, 30, { fontWeight: 600 });
        place(labels[0], 80, 30, 1080, 40, 19, {
          fontFamily: "Courier New",
          letterSpacing: 2,
        });
        break;
      case "blueprint":
        box(42, 41, 1196, 634, {
          fill: "transparent",
          stroke: "foreground",
          strokeWidth: 1,
        });
        box(825, 155, 310, 310, {
          shape: "circle",
          fill: "transparent",
          stroke: "accent",
          strokeWidth: 2,
        });
        box(870, 200, 220, 220, {
          fill: "transparent",
          stroke: "accent",
          strokeWidth: 2,
          rotation: 45,
        });
        path(
          805,
          130,
          350,
          360,
          [
            { op: "M", x: 0, y: 50 },
            { op: "L", x: 100, y: 50 },
            { op: "M", x: 50, y: 0 },
            { op: "L", x: 50, y: 100 },
          ],
          { stroke: "accent", strokeWidth: 1 },
        );
        rule(78, 530, 1125, "foreground", 1);
        place(main, 82, 165, 708, 325, 82, {
          lineHeight: 1.08,
          letterSpacing: -3,
        });
        place(bodies[0], 85, 557, 1000, 95, 27);
        place(labels[0], 85, 75, 1000, 42, 18, {
          fontFamily: "Courier New",
          letterSpacing: 3,
        });
        break;
      case "deco":
        for (let i = 0; i < 5; i++) {
          rule(144 + i * 28, 150 - i * 15, 235 - i * 28, "accent", 1);
          rule(901, 150 - i * 15, 235 - i * 28, "accent", 1);
        }
        place(main, 170, 207, 940, 252, 96, {
          textAlign: "center",
          lineHeight: 1.06,
          letterSpacing: -2,
        });
        rule(464, 497, 352, "accent", 1);
        place(bodies[0], 234, 532, 812, 95, 28, {
          textAlign: "center",
          color: "secondary",
        });
        place(labels[0], 252, 105, 776, 45, 18, {
          textAlign: "center",
          letterSpacing: 4,
        });
        break;
      case "memphis":
        box(938, 68, 265, 265, {
          shape: "circle",
          fill: "surface",
          stroke: "foreground",
          strokeWidth: 4,
        });
        box(1033, 40, 110, 110, {
          shape: "triangle",
          fill: "accent",
          rotation: 18,
        });
        dots(10, 473, 235, 230);
        box(94, 135, 925, 350, { fill: "foreground", rotation: 3 });
        box(74, 113, 925, 350, {
          fill: "surface",
          stroke: "foreground",
          strokeWidth: 3,
          rotation: 3,
        });
        squiggle(970, 479, 245, 140);
        place(main, 126, 155, 815, 270, 106, {
          lineHeight: 1.03,
          letterSpacing: -4,
        });
        place(bodies[0], 264, 532, 630, 128, 29);
        place(labels[0], 86, 49, 800, 42, 18, { letterSpacing: 2 });
        break;
      case "editorial":
        rule(60, 106, 1160, "foreground", 3);
        box(1002, 148, 207, 207, { shape: "circle", fill: "accent" });
        box(878, 147, 5, 468, { fill: "foreground" });
        place(main, 59, 153, 770, 365, 104, {
          lineHeight: 1.02,
          letterSpacing: -4,
        });
        place(bodies[0], 915, 405, 295, 220, 28);
        place(labels[0], 66, 48, 1130, 43, 19, { letterSpacing: 3 });
        rule(64, 655, 1145, "foreground", 1);
        break;
    }
    // Covers normally have one supporting block; retain any additional copy.
    bodies
      .slice(1)
      .forEach((el, i) => place(el, 90, 568 + i * 36, 1090, 36, 22));
    labels
      .slice(1)
      .forEach((el, i) => place(el, 90, 660 + i * 20, 1090, 22, 16));
  } else if (visual) {
    const image = slide.layout === "text-image";
    switch (direction) {
      case "bauhaus":
        box(0, 0, 27, 720, { fill: "accent" });
        box(1098, 32, 125, 125, { shape: "circle", fill: "#1b42b8" });
        place(main, 65, 45, 995, 142, 76, { letterSpacing: -3 });
        rule(65, 198, 1150);
        place(visual, image ? 675 : 275, 245, image ? 535 : 920, 365, 24);
        place(bodies[0], 65, 250, image ? 535 : 180, 340, 27);
        break;
      case "pop":
        dots(5, 8, 215, 180);
        box(65, 206, 1165, 438, { fill: "foreground" });
        box(49, 190, 1165, 438, {
          fill: "surface",
          stroke: "foreground",
          strokeWidth: 4,
        });
        place(main, 155, 35, 1050, 122, 84, { letterSpacing: -2 });
        place(visual, image ? 670 : 100, 300, image ? 490 : 1060, 280, 24);
        place(bodies[0], 105, 210, image ? 500 : 1060, image ? 355 : 82, 28);
        break;
      case "blueprint":
        place(main, 70, 40, 1130, 130, 64, { letterSpacing: -2 });
        rule(70, 188, 1140, "accent", 1);
        box(326, 220, 885, 410, {
          fill: "transparent",
          stroke: "foreground",
          strokeWidth: 1,
        });
        place(visual, image ? 650 : 365, 252, image ? 520 : 800, 335, 24);
        place(bodies[0], 72, 238, image ? 510 : 210, 350, 26);
        break;
      case "deco":
        place(main, 140, 93, 1000, 120, 66, {
          textAlign: "center",
          letterSpacing: -1,
        });
        rule(292, 224, 696, "accent", 1);
        place(bodies[0], 160, 250, image ? 440 : 960, image ? 330 : 76, 25, {
          textAlign: image ? "left" : "center",
          color: "secondary",
        });
        place(visual, image ? 663 : 152, 345, image ? 458 : 976, 268, 24);
        break;
      case "memphis":
        box(1065, 20, 145, 145, { shape: "circle", fill: "surface" });
        squiggle(62, 180, 195, 50);
        place(main, 65, 38, 995, 140, 79, { letterSpacing: -3 });
        box(90, 259, 1100, 360, { fill: "foreground" });
        box(75, 244, 1100, 360, {
          fill: "surface",
          stroke: "foreground",
          strokeWidth: 3,
          radius: 18,
        });
        place(visual, image ? 670 : 125, 339, image ? 465 : 1000, 230, 24);
        place(bodies[0], 126, 260, image ? 480 : 995, image ? 290 : 77, 26);
        break;
      case "editorial":
        rule(60, 185, 1155, "foreground", 2);
        place(main, 65, 40, 1110, 130, 74, { letterSpacing: -2 });
        box(66, 236, 12, 374, { fill: "accent" });
        place(bodies[0], 104, 242, image ? 430 : 230, 350, 27);
        place(visual, image ? 645 : 390, 233, image ? 550 : 810, 375, 24);
        break;
    }
    if (image) place(visual, 675, 230, 510, 380, 24);
    if (slide.layout === "questions") {
      place(visual, 126, 255, 1035, 365, 25);
      if (bodies[0]) bodies[0].hidden = true;
    }
    bodies
      .slice(1)
      .forEach((el, i) => place(el, 80, 614 + i * 24, 1100, 24, 20));
    labels.forEach((el, i) =>
      place(el, 90, 651 + i * 24, 1100, 29, 17, { color: "secondary" }),
    );
  } else {
    const count = Math.min(
      4,
      Math.max(subheads.length, bodies.length, labels.length, 1),
    );
    const stats = slide.layout === "statistics",
      team = slide.layout === "team";
    let regions: Region[] = [],
      rows = false;
    const columns = (x: number, y: number, w: number, h: number, gap: number) =>
      Array.from({ length: count }, (_, i) => ({
        x: x + (i * (w + gap)) / count,
        y,
        w: (w - gap * (count - 1)) / count,
        h,
      }));
    switch (direction) {
      case "bauhaus":
        place(main, 65, 40, 1060, 140, 83, { letterSpacing: -3 });
        box(1150, 45, 70, 70, { shape: "circle", fill: "accent" });
        regions = columns(65, 240, 1150, 400, 32);
        regions.forEach((r, i) => {
          box(r.x, r.y, 8, r.h, { fill: i % 2 ? "#1b42b8" : "accent" });
          box(r.x + 24, r.y - 39, 64, 64, {
            shape: i % 2 ? "rectangle" : "circle",
            fill: "surface",
          });
        });
        break;
      case "pop":
        dots(1045, 10, 220, 160);
        place(main, 65, 36, 1010, 139, 96, {
          letterSpacing: -2,
          lineHeight: 1,
        });
        regions = columns(60, 230, 1140, 394, 30);
        regions.forEach((r, i) => {
          r.y += i % 2 ? 24 : 0;
          box(r.x + 12, r.y + 12, r.w, r.h, { fill: "foreground" });
          box(r.x, r.y, r.w, r.h, {
            fill: "surface",
            stroke: "foreground",
            strokeWidth: 3,
          });
        });
        break;
      case "blueprint":
        place(main, 70, 40, 1130, 130, 64, { letterSpacing: -2 });
        rule(70, 181, 1140, "accent", 1);
        rows = true;
        regions = Array.from({ length: count }, (_, i) => ({
          x: 75,
          y: 218 + (i * 440) / count,
          w: 1130,
          h: 440 / count - 13,
        }));
        regions.forEach((r) =>
          box(r.x, r.y, r.w, r.h, {
            fill: "background",
            stroke: "foreground",
            strokeWidth: 1,
          }),
        );
        break;
      case "deco":
        place(main, 145, 96, 990, 125, 64, {
          textAlign: "center",
          letterSpacing: -1,
        });
        rule(380, 228, 520, "accent", 1);
        regions = columns(135, 270, 1010, 350, 32);
        regions.forEach((r) => {
          rule(r.x + 20, r.y + 8, r.w - 40, "accent", 1);
          box(r.x + r.w / 2 - 12, r.y - 12, 24, 24, {
            fill: "accent",
            rotation: 45,
          });
        });
        break;
      case "memphis":
        place(main, 65, 35, 1050, 145, 81, { letterSpacing: -3 });
        squiggle(990, 160, 200, 56);
        regions = columns(65, 257, 1130, 346, 26);
        regions.forEach((r, i) => {
          r.y += i % 2 ? -25 : 20;
          box(r.x + 9, r.y + 10, r.w, r.h, {
            fill: "foreground",
            radius: i % 2 ? 42 : 8,
          });
          box(r.x, r.y, r.w, r.h, {
            fill: i % 2 ? "background" : "surface",
            stroke: "foreground",
            strokeWidth: 3,
            radius: i % 2 ? 42 : 8,
          });
        });
        break;
      case "editorial":
        rows = true;
        place(main, 62, 59, 345, 540, 74, {
          letterSpacing: -3,
          lineHeight: 1.05,
        });
        box(62, 641, 130, 12, { fill: "accent" });
        regions = Array.from({ length: count }, (_, i) => ({
          x: 452,
          y: 70 + (i * 570) / count,
          w: 755,
          h: 570 / count - 14,
        }));
        regions.forEach((r) => rule(r.x, r.y - 12, r.w, "foreground", 1));
        break;
    }
    regions.forEach((r, i) => {
      const head = subheads[i],
        body = bodies[i],
        label = stats ? undefined : labels[i];
      if (rows) {
        const inset = direction === "blueprint" ? 24 : 0;
        const hasLabel = !!label?.text?.trim();
        place(label, r.x + inset, r.y + 18, 98, r.h - 28, stats ? 20 : 24, {
          color: "accent",
        });
        const left = r.x + inset + (hasLabel ? 120 : 0),
          available = r.w - inset * 2 - (hasLabel ? 120 : 0);
        const headWidth = stats
          ? Math.min(230, available * 0.35)
          : Math.min(300, available * 0.42);
        place(head, left, r.y + 15, headWidth, r.h - 27, stats ? 68 : 35, {
          letterSpacing: stats ? -2 : -1,
        });
        place(
          body,
          head?.text?.trim() ? left + headWidth + 25 : left,
          r.y + 16,
          head?.text?.trim() ? available - headWidth - 25 : available,
          r.h - 28,
          25,
          { color: direction === "blueprint" ? "foreground" : "secondary" },
        );
        if (team) {
          const icon = elements.filter((el) => el.type === "icon")[i];
          place(icon, r.x + inset, r.y + 25, 55, 55, 24);
          place(head, r.x + inset + 85, r.y + 14, 225, r.h - 25, 32);
          place(
            body,
            r.x + inset + 330,
            r.y + 16,
            r.w - inset * 2 - 345,
            r.h - 28,
            24,
          );
        }
      } else {
        const inset = direction === "bauhaus" ? 26 : 22,
          centered = direction === "deco";
        const textWidth = r.w - inset * 2;
        place(label, r.x + inset, r.y + 18, textWidth, 52, 23, {
          textAlign: centered ? "center" : "left",
          color: direction === "pop" ? "foreground" : "accent",
        });
        const headY = r.y + (team ? 100 : stats ? 44 : 91);
        place(
          head,
          r.x + inset,
          headY,
          textWidth,
          stats ? 132 : 104,
          stats ? 88 : count === 4 ? 32 : 39,
          {
            textAlign: centered ? "center" : "left",
            letterSpacing: stats ? -3 : -1,
          },
        );
        const bodyY = head?.text?.trim()
          ? headY + (stats ? 146 : 113)
          : r.y + 91;
        place(
          body,
          r.x + inset,
          bodyY,
          textWidth,
          Math.max(70, r.y + r.h - bodyY - 20),
          count === 4 ? 22 : 25,
          { textAlign: centered ? "center" : "left" },
        );
        if (team)
          place(
            elements.filter((el) => el.type === "icon")[i],
            r.x + r.w / 2 - 30,
            r.y + 27,
            60,
            60,
            24,
          );
      }
    });
    // A statistics layout's label is a source footnote, not a fourth metric.
    if (stats)
      labels.forEach((el, i) =>
        place(el, 90, 658 + i * 20, 1100, 28, 16, { color: "secondary" }),
      );
  }
  return {
    ...slide,
    elements: [...art, ...elements].map((el) => ({
      ...el,
      x: el.x * sx,
      y: el.y * sy,
      width: Math.max(5, el.width * sx),
      height: Math.max(5, el.height * sy),
      ...(el.baseFontSize
        ? { baseFontSize: Math.max(8, Math.min(300, el.baseFontSize * unit)) }
        : {}),
      ...(el.letterSpacing ? { letterSpacing: el.letterSpacing * unit } : {}),
    })),
  };
}
