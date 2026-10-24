import type { FrameElement, Slide, Theme } from "./schema";
import type { PathCommand } from "./creative";
import { newElement } from "./operations";

const DIRECTIONS = new Set([
  "thinking-space",
  "limbo",
  "sonic-wave",
  "ransom-ink",
  "beatmap",
  "street-radio",
  "save-point",
  "warehouse",
]);
type Region = { x: number; y: number; w: number; h: number };

/** Original game/music-inspired geometry using the same editable slide objects. */
export function composeCultureTheme(
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
  function box(
    x: number,
    y: number,
    w: number,
    h: number,
    extra: Partial<FrameElement> = {},
  ) {
    const el = newElement("shape", {
      x,
      y,
      width: Math.max(5, w),
      height: Math.max(5, h),
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
  }
  function line(
    x: number,
    y: number,
    w: number,
    h: number,
    commands: PathCommand[],
    extra: Partial<FrameElement> = {},
  ) {
    return box(x, y, w, h, {
      shape: "path",
      path: commands,
      fill: "transparent",
      stroke: "accent",
      strokeWidth: 2,
      ...extra,
    });
  }
  function rule(
    x: number,
    y: number,
    w: number,
    color = "foreground",
    weight = 1,
  ) {
    box(x, y, w, 5, { shape: "line", fill: color, strokeWidth: weight });
  }
  function put(
    el: FrameElement | undefined,
    x: number,
    y: number,
    w: number,
    h: number,
    size: number,
    extra: Partial<FrameElement> = {},
  ) {
    if (el)
      Object.assign(el, {
        x,
        y,
        width: w,
        height: h,
        baseFontSize: size,
        rotation: 0,
        color: "foreground",
        textAlign: "left",
        lineHeight: 1.13,
        letterSpacing: 0,
        ...extra,
      });
  }
  function ring(
    x: number,
    y: number,
    w: number,
    h = w,
    color = "accent",
    weight = 2,
  ) {
    box(x, y, w, h, {
      shape: "ellipse",
      fill: "transparent",
      stroke: color,
      strokeWidth: weight,
    });
  }
  function zigzag(
    x: number,
    y: number,
    w: number,
    h: number,
    color = "accent",
    weight = 3,
  ) {
    line(
      x,
      y,
      w,
      h,
      [
        { op: "M", x: 0, y: 70 },
        { op: "L", x: 17, y: 10 },
        { op: "L", x: 34, y: 88 },
        { op: "L", x: 51, y: 18 },
        { op: "L", x: 68, y: 88 },
        { op: "L", x: 85, y: 18 },
        { op: "L", x: 100, y: 70 },
      ],
      { stroke: color, strokeWidth: weight },
    );
  }
  function gear(x: number, y: number, size: number) {
    const commands: PathCommand[] = [];
    for (let i = 0; i < 48; i++) {
      const angle = (i * Math.PI) / 24,
        r = i % 4 < 2 ? 48 : 39;
      commands.push({
        op: i ? "L" : "M",
        x: 50 + Math.cos(angle) * r,
        y: 50 + Math.sin(angle) * r,
      });
    }
    commands.push({ op: "Z" });
    line(x, y, size, size, commands, {
      fill: "secondary",
      stroke: "foreground",
      strokeWidth: 1,
      opacity: 0.25,
    });
    box(x + size * 0.31, y + size * 0.31, size * 0.38, size * 0.38, {
      shape: "circle",
      fill: "background",
    });
  }
  function portal(x: number, y: number, size: number) {
    ring(x, y, size, size, "accent", 4);
    ring(x + 12, y + 12, size - 24, size - 24, "foreground", 1);
    for (let i = 0; i < 6; i++)
      box(x - 17 + i * 37, y + size + 18, 7, 7, {
        fill: i % 2 ? "accent" : "surface",
      });
  }
  function key(x: number, y: number, color: string, size = 64) {
    ring(x, y, size * 0.46, size * 0.46, color, 3);
    box(x + size * 0.18, y + size * 0.43, size * 0.1, size * 0.48, {
      fill: color,
    });
    box(x + size * 0.18, y + size * 0.68, size * 0.33, size * 0.1, {
      fill: color,
    });
    box(x + size * 0.18, y + size * 0.87, size * 0.28, size * 0.1, {
      fill: color,
    });
  }
  function doorway(x: number, y: number, w: number, h: number) {
    for (let i = 0; i < 3; i++)
      line(
        x + i * 12,
        y + i * 12,
        w - i * 24,
        h - i * 12,
        [
          { op: "M", x: 0, y: 100 },
          { op: "L", x: 0, y: 16 },
          { op: "L", x: 50, y: 0 },
          { op: "L", x: 100, y: 16 },
          { op: "L", x: 100, y: 100 },
        ],
        {
          stroke: i ? "secondary" : "accent",
          strokeWidth: i ? 1 : 2,
          opacity: i ? 0.32 : 0.65,
        },
      );
  }
  function hatch(
    x: number,
    y: number,
    w: number,
    h: number,
    color = "accent",
    opacity = 0.28,
  ) {
    const commands: PathCommand[] = [];
    for (let n = -90; n < 100; n += 9) {
      const start = Math.max(0, n),
        end = Math.min(100, n + 100);
      commands.push(
        { op: "M", x: start, y: Math.max(0, -n) },
        { op: "L", x: end, y: Math.min(100, 100 - n) },
      );
    }
    line(x, y, w, h, commands, { stroke: color, strokeWidth: 1, opacity });
  }
  function glasses(x: number, y: number, w: number, h: number) {
    line(
      x,
      y,
      w,
      h,
      [
        { op: "M", x: 0, y: 20 },
        { op: "Q", x1: 12, y1: 3, x: 37, y: 18 },
        { op: "Q", x1: 50, y1: 9, x: 63, y: 18 },
        { op: "Q", x1: 88, y1: 3, x: 100, y: 20 },
        { op: "L", x: 96, y: 31 },
        { op: "L", x: 92, y: 32 },
        { op: "Q", x1: 92, y1: 88, x: 71, y: 88 },
        { op: "Q", x1: 55, y1: 84, x: 54, y: 34 },
        { op: "Q", x1: 50, y1: 25, x: 46, y: 34 },
        { op: "Q", x1: 45, y1: 84, x: 29, y: 88 },
        { op: "Q", x1: 8, y1: 88, x: 8, y: 32 },
        { op: "L", x: 4, y: 31 },
        { op: "Z" },
      ],
      { strokeWidth: 3 },
    );
    ring(x + w * 0.12, y + h * 0.27, w * 0.3, h * 0.54, "accent", 1);
    ring(x + w * 0.58, y + h * 0.27, w * 0.3, h * 0.54, "accent", 1);
    hatch(x + w * 0.15, y + h * 0.37, w * 0.23, h * 0.3);
    hatch(x + w * 0.61, y + h * 0.37, w * 0.23, h * 0.3, "#ae6269", 0.8);
  }
  function speaker(x: number, y: number, size: number) {
    box(x, y, size, size * 1.3, { fill: "foreground", rotation: 8 });
    box(x + 15, y + 15, size - 30, size * 1.3 - 30, {
      fill: "surface",
      rotation: 8,
      stroke: "foreground",
      strokeWidth: 3,
    });
    ring(
      x + size * 0.19,
      y + size * 0.54,
      size * 0.62,
      size * 0.62,
      "foreground",
      6,
    );
    box(x + size * 0.39, y + size * 0.74, size * 0.22, size * 0.22, {
      shape: "circle",
      fill: "foreground",
    });
    ring(
      x + size * 0.33,
      y + size * 0.17,
      size * 0.32,
      size * 0.32,
      "foreground",
      5,
    );
  }
  function pixelFrame(x: number, y: number, w: number, h: number) {
    line(
      x,
      y,
      w,
      h,
      [
        { op: "M", x: 0, y: 8 },
        { op: "L", x: 2, y: 8 },
        { op: "L", x: 2, y: 0 },
        { op: "L", x: 98, y: 0 },
        { op: "L", x: 98, y: 8 },
        { op: "L", x: 100, y: 8 },
        { op: "L", x: 100, y: 92 },
        { op: "L", x: 98, y: 92 },
        { op: "L", x: 98, y: 100 },
        { op: "L", x: 2, y: 100 },
        { op: "L", x: 2, y: 92 },
        { op: "L", x: 0, y: 92 },
        { op: "Z" },
      ],
      { fill: "surface", stroke: "foreground", strokeWidth: 2 },
    );
  }
  function stars() {
    for (const [x, y] of [
      [73, 60],
      [1190, 70],
      [1164, 632],
      [55, 600],
      [1050, 102],
      [710, 77],
    ]) {
      box(x, y, 8, 8, { fill: "secondary" });
      box(x - 7, y + 7, 22, 8, { fill: "secondary", opacity: 0.65 });
    }
  }
  function record(x: number, y: number, size: number) {
    box(x, y, size, size, { shape: "circle", fill: "foreground" });
    for (let i = 0; i < 7; i++)
      ring(
        x + 20 + i * 14,
        y + 20 + i * 14,
        size - 40 - i * 28,
        size - 40 - i * 28,
        "background",
        1,
      );
    box(x + size * 0.35, y + size * 0.35, size * 0.3, size * 0.3, {
      shape: "circle",
      fill: "accent",
    });
    box(x + size * 0.47, y + size * 0.47, size * 0.06, size * 0.06, {
      shape: "circle",
      fill: "background",
    });
  }
  function barcode(x: number, y: number, w: number, h: number) {
    const commands: PathCommand[] = [];
    for (let i = 0; i < 32; i++)
      if (i % 5 !== 1)
        commands.push(
          { op: "M", x: i * 3, y: 0 },
          { op: "L", x: i * 3, y: 100 },
        );
    line(x, y, w, h, commands, { stroke: "foreground", strokeWidth: 3 });
  }
  const heads = elements.filter((el) => el.role === "heading"),
    main = slide.layout === "quote" ? heads[1] || heads[0] : heads[0];
  const subheads = heads.filter(
    (el) => el !== main && !(slide.layout === "quote" && el === heads[0]),
  );
  if (slide.layout === "quote" && heads[0] !== main)
    elements.splice(elements.indexOf(heads[0]), 1);
  const bodies = elements.filter((el) => el.role === "body"),
    labels = elements.filter((el) => el.role === "label");
  const visual = elements.find((el) =>
    [
      "chart",
      "table",
      "diagram",
      "question",
      "image",
      "video",
      "timeline",
    ].includes(el.type),
  );
  const cover = ["title", "section", "summary", "quote"].includes(slide.layout);
  if (direction === "thinking-space") {
    for (let i = 0; i < 7; i++) {
      box(12 + i * 187, 0, 95, 30 + (i % 3) * 19, { fill: "surface" });
      box(55 + i * 187, 637 - (i % 2) * 20, 78, 83 + (i % 2) * 20, {
        fill: "surface",
      });
    }
    line(
      5,
      43,
      1270,
      625,
      [
        { op: "M", x: 0, y: 0 },
        { op: "L", x: 3, y: 20 },
        { op: "L", x: 1, y: 35 },
        { op: "M", x: 100, y: 0 },
        { op: "L", x: 97, y: 28 },
        { op: "L", x: 99, y: 47 },
        { op: "M", x: 0, y: 100 },
        { op: "L", x: 4, y: 80 },
      ],
      { stroke: "secondary", opacity: 0.3 },
    );
  }
  if (direction === "save-point") stars();

  if (cover) {
    switch (direction) {
      case "thinking-space":
        gear(851, 106, 333);
        gear(1027, 448, 175);
        portal(960, 245, 166);
        line(
          860,
          49,
          360,
          577,
          [
            { op: "M", x: 0, y: 0 },
            { op: "L", x: 0, y: 100 },
            { op: "L", x: 100, y: 100 },
          ],
          { stroke: "foreground", opacity: 0.5 },
        );
        put(main, 73, 180, 755, 302, 110, {
          lineHeight: 0.98,
          letterSpacing: -3,
        });
        put(bodies[0], 80, 519, 720, 113, 28, { color: "secondary" });
        put(labels[0], 80, 81, 760, 42, 18, {
          color: "accent",
          letterSpacing: 3,
        });
        break;
      case "limbo": {
        doorway(190, 52, 900, 612);
        doorway(366, 121, 548, 420);
        const colors = [
          "#83dcf6",
          "#dc9af2",
          "#f68a9c",
          "#efdb8a",
          "#b6f09d",
          "#b59eff",
          "#ffbc85",
          "#b0f2e0",
        ];
        colors.forEach((color, i) =>
          key(i < 4 ? 76 : 1138, 83 + (i % 4) * 144, color, 65),
        );
        box(323, 232, 634, 192, { fill: "background" });
        put(main, 241, 226, 798, 213, 104, {
          textAlign: "center",
          lineHeight: 1.02,
          letterSpacing: -3,
        });
        put(bodies[0], 298, 502, 684, 112, 28, {
          textAlign: "center",
          color: "secondary",
        });
        put(labels[0], 290, 123, 700, 42, 18, {
          textAlign: "center",
          letterSpacing: 4,
        });
        break;
      }
      case "sonic-wave":
        for (let i = 0; i < 4; i++)
          box(871 + i * 41, 82 + i * 41, 286 - i * 42, 286 - i * 42, {
            fill: "transparent",
            stroke: i % 2 ? "foreground" : "accent",
            strokeWidth: i ? 1 : 3,
            rotation: 45,
          });
        zigzag(-30, 505, 1360, 190, "accent", 5);
        zigzag(-20, 525, 1340, 190, "#ff96c7", 2);
        box(83, 482, 870, 140, { fill: "background" });
        put(main, 83, 183, 1020, 277, 115, {
          lineHeight: 0.95,
          letterSpacing: -4,
          italic: true,
        });
        put(bodies[0], 99, 500, 820, 106, 28);
        put(labels[0], 91, 70, 880, 42, 18, {
          color: "accent",
          letterSpacing: 5,
        });
        break;
      case "ransom-ink":
        hatch(66, 48, 1144, 15);
        hatch(66, 665, 1144, 15);
        glasses(47, 315, 730, 264);
        put(main, 69, 81, 1140, 220, 132, {
          lineHeight: 0.9,
          letterSpacing: -2,
        });
        put(bodies[0], 853, 329, 341, 228, 29);
        put(labels[0], 83, 618, 1090, 40, 18, {
          fontFamily: "Courier New",
          letterSpacing: 4,
        });
        break;
      case "beatmap":
        ring(65, 149, 397, 397, "accent", 5);
        ring(33, 117, 461, 461, "accent", 1);
        ring(161, 245, 205, 205, "foreground", 2);
        line(
          425,
          256,
          629,
          320,
          [
            { op: "M", x: 0, y: 0 },
            { op: "C", x1: 25, y1: 40, x2: 68, y2: 100, x: 100, y: 65 },
          ],
          { stroke: "accent", strokeWidth: 3, opacity: 0.35 },
        );
        put(main, 533, 152, 665, 296, 91, {
          letterSpacing: -4,
          lineHeight: 1.04,
        });
        put(bodies[0], 550, 494, 623, 130, 28);
        put(labels[0], 548, 75, 650, 42, 18, {
          color: "accent",
          letterSpacing: 2,
        });
        break;
      case "street-radio":
        box(12, 83, 858, 385, { fill: "foreground", rotation: -5 });
        box(35, 62, 816, 385, {
          fill: "surface",
          rotation: -5,
          stroke: "foreground",
          strokeWidth: 4,
        });
        speaker(925, 152, 260);
        for (let i = 0; i < 4; i++)
          box(1020 + i * 44, 53, 13, 70 + i * 13, {
            fill: "foreground",
            rotation: 25,
          });
        put(main, 95, 135, 700, 270, 103, {
          rotation: -5,
          letterSpacing: -4,
          lineHeight: 1.02,
        });
        put(bodies[0], 103, 520, 713, 135, 30);
        put(labels[0], 98, 33, 730, 40, 18, {
          fontFamily: "Courier New",
          letterSpacing: 2,
        });
        break;
      case "save-point":
        pixelFrame(64, 406, 1150, 244);
        line(
          928,
          95,
          177,
          245,
          [
            { op: "M", x: 50, y: 0 },
            { op: "L", x: 91, y: 38 },
            { op: "L", x: 69, y: 83 },
            { op: "L", x: 50, y: 100 },
            { op: "L", x: 9, y: 38 },
            { op: "Z" },
            { op: "M", x: 50, y: 0 },
            { op: "L", x: 50, y: 100 },
            { op: "M", x: 9, y: 38 },
            { op: "L", x: 91, y: 38 },
          ],
          { fill: "surface", stroke: "accent", strokeWidth: 3 },
        );
        put(main, 80, 129, 786, 233, 80, {
          lineHeight: 1.06,
          letterSpacing: -3,
        });
        put(bodies[0], 106, 453, 1062, 147, 28);
        put(labels[0], 88, 65, 780, 40, 18, {
          color: "accent",
          letterSpacing: 3,
        });
        break;
      case "warehouse":
        record(798, 89, 468);
        barcode(74, 572, 450, 58);
        rule(67, 112, 1147, "foreground", 2);
        rule(67, 657, 1147);
        put(main, 68, 163, 690, 328, 130, {
          letterSpacing: -3,
          lineHeight: 0.92,
        });
        put(bodies[0], 825, 577, 380, 90, 25);
        put(labels[0], 75, 59, 1090, 38, 18, {
          fontFamily: "Courier New",
          letterSpacing: 3,
        });
        break;
    }
    bodies.slice(1).forEach((el, i) => put(el, 85, 600 + i * 24, 1100, 28, 20));
    labels.slice(1).forEach((el, i) => put(el, 85, 663 + i * 20, 1100, 25, 16));
  } else if (visual) {
    switch (direction) {
      case "thinking-space":
        gear(1079, 22, 130);
        put(main, 75, 48, 980, 137, 79, { letterSpacing: -2 });
        box(64, 221, 1148, 405, { fill: "surface" });
        box(64, 221, 9, 405, { fill: "accent" });
        put(bodies[0], 100, 245, 224, 337, 26, { color: "secondary" });
        put(visual, 372, 253, 800, 337, 24);
        break;
      case "limbo":
        doorway(59, 208, 1160, 425);
        key(73, 48, "#f68a9c", 64);
        key(1141, 50, "#83dcf6", 64);
        put(main, 183, 43, 920, 139, 70, {
          textAlign: "center",
          letterSpacing: -2,
        });
        put(bodies[0], 137, 244, 1000, 86, 26, {
          textAlign: "center",
          color: "secondary",
        });
        put(visual, 134, 343, 1010, 263, 24);
        break;
      case "sonic-wave":
        zigzag(17, 605, 1230, 110, "accent", 3);
        put(main, 70, 46, 1115, 138, 78, { italic: true, letterSpacing: -3 });
        line(
          356,
          225,
          847,
          376,
          [
            { op: "M", x: 0, y: 0 },
            { op: "L", x: 100, y: 0 },
            { op: "L", x: 100, y: 100 },
            { op: "L", x: 0, y: 100 },
          ],
          { strokeWidth: 2 },
        );
        put(bodies[0], 75, 241, 231, 340, 27, { color: "secondary" });
        put(visual, 396, 254, 770, 315, 24);
        break;
      case "ransom-ink":
        hatch(80, 182, 1110, 18);
        rule(80, 624, 1110, "accent", 2);
        put(main, 75, 42, 1120, 132, 87, { letterSpacing: -1 });
        put(bodies[0], 82, 242, 240, 337, 26, { color: "secondary" });
        put(visual, 379, 236, 790, 350, 24);
        break;
      case "beatmap":
        ring(1073, 35, 114, 114, "accent", 2);
        put(main, 72, 43, 970, 136, 74, { letterSpacing: -3 });
        put(bodies[0], 118, 199, 1045, 86, 27);
        box(77, 299, 1125, 324, { fill: "surface", radius: 42 });
        put(visual, 127, 334, 1025, 250, 24);
        break;
      case "street-radio":
        box(55, 211, 1160, 422, { fill: "foreground", rotation: -2 });
        box(72, 197, 1126, 414, {
          fill: "surface",
          stroke: "foreground",
          strokeWidth: 3,
          rotation: -2,
        });
        put(main, 65, 40, 1140, 134, 79, { letterSpacing: -3 });
        put(bodies[0], 115, 232, 1020, 83, 28);
        put(visual, 120, 333, 1020, 240, 24);
        break;
      case "save-point":
        put(main, 75, 43, 1125, 138, 61, { letterSpacing: -2 });
        pixelFrame(66, 216, 1146, 409);
        put(bodies[0], 105, 246, 990, 88, 25);
        put(visual, 111, 356, 1040, 228, 24);
        break;
      case "warehouse":
        put(main, 66, 39, 1110, 140, 92, { letterSpacing: -2 });
        rule(70, 193, 1140, "foreground", 3);
        barcode(72, 567, 235, 64);
        put(bodies[0], 74, 232, 225, 296, 26);
        put(visual, 365, 228, 822, 380, 24);
        break;
    }
    if (slide.layout === "text-image") {
      put(main, 75, 62, 1100, 132, 70);
      put(bodies[0], 100, 245, 480, 345, 28);
      put(visual, 667, 225, 507, 388, 24);
    }
    if (slide.layout === "questions") {
      put(visual, 128, 254, 1024, 361, 25);
      if (bodies[0]) bodies[0].hidden = true;
    }
    bodies.slice(1).forEach((el, i) => put(el, 85, 615 + i * 24, 1100, 25, 20));
    labels.forEach((el, i) =>
      put(el, 85, 657 + i * 23, 1100, 28, 17, { color: "secondary" }),
    );
  } else {
    const count = Math.min(
      4,
      Math.max(subheads.length, bodies.length, labels.length, 1),
    );
    const stats = slide.layout === "statistics",
      team = slide.layout === "team";
    const columns = (x: number, y: number, w: number, h: number, gap: number) =>
      Array.from({ length: count }, (_, i) => ({
        x: x + (i * (w + gap)) / count,
        y,
        w: (w - gap * (count - 1)) / count,
        h,
      }));
    let regions: Region[] = [],
      rows = false;
    switch (direction) {
      case "thinking-space":
        put(main, 73, 64, 363, 279, 86, {
          letterSpacing: -2,
          lineHeight: 1.02,
        });
        gear(68, 367, 241);
        portal(286, 495, 111);
        rows = true;
        regions = Array.from({ length: count }, (_, i) => ({
          x: 500,
          y: 89 + (i * 553) / count,
          w: 700,
          h: 553 / count - 18,
        }));
        regions.forEach((r, i) => {
          box(r.x, r.y, r.w, r.h, { fill: "surface" });
          box(r.x - 14, r.y + 10, 5, r.h - 20, {
            fill: i % 2 ? "foreground" : "accent",
          });
          box(r.x + 10, r.y + r.h + 8, 25, 14, {
            shape: "triangle",
            fill: "secondary",
            rotation: 180,
          });
        });
        break;
      case "limbo":
        put(main, 140, 46, 1000, 140, 75, {
          textAlign: "center",
          letterSpacing: -2,
        });
        regions = columns(85, 265, 1110, 350, 35);
        regions.forEach((r, i) => {
          doorway(r.x - 9, r.y - 31, r.w + 18, r.h + 58);
          key(r.x + r.w / 2 - 15, r.y - 9, i % 2 ? "#f68a9c" : "#83dcf6", 39);
        });
        break;
      case "sonic-wave":
        put(main, 76, 46, 1120, 139, 82, { italic: true, letterSpacing: -3 });
        zigzag(45, 577, 1180, 130, "accent", 2);
        regions = columns(70, 292, 1130, 316, 29);
        regions.forEach((r, i) => {
          r.y -= i * 21;
          box(r.x, r.y, r.w, r.h, { fill: "surface" });
          line(
            r.x,
            r.y,
            r.w,
            15,
            [
              { op: "M", x: 0, y: 100 },
              { op: "L", x: 4, y: 0 },
              { op: "L", x: 100, y: 0 },
            ],
            { stroke: "accent", strokeWidth: 3 },
          );
        });
        break;
      case "ransom-ink":
        put(main, 73, 39, 1125, 145, 97, {
          lineHeight: 0.98,
          letterSpacing: -1,
        });
        if (slide.layout === "two-column") {
          regions = columns(78, 245, 1120, 365, 80);
          regions.forEach((r) => {
            ring(r.x - 15, r.y - 24, r.w + 30, r.h + 64, "accent", 2);
            hatch(r.x + 20, r.y + 9, r.w - 40, 20);
          });
        } else {
          rows = true;
          regions = Array.from({ length: count }, (_, i) => ({
            x: 80,
            y: 221 + (i * 426) / count,
            w: 1115,
            h: 426 / count - 13,
          }));
          regions.forEach((r) => {
            rule(r.x, r.y + r.h, r.w, "accent", 1);
            hatch(r.x - 19, r.y + 9, 8, r.h - 14);
          });
        }
        break;
      case "beatmap":
        put(main, 75, 43, 1100, 140, 76, { letterSpacing: -3 });
        regions = columns(75, 245, 1125, 383, 35);
        line(
          100,
          248,
          1040,
          65,
          [
            { op: "M", x: 0, y: 50 },
            { op: "C", x1: 30, y1: 0, x2: 65, y2: 100, x: 100, y: 50 },
          ],
          { stroke: "accent", strokeWidth: 2, opacity: 0.25 },
        );
        regions.forEach((r) => {
          ring(r.x + r.w / 2 - 39, r.y - 11, 78, 78, "accent", 3);
          ring(r.x + r.w / 2 - 48, r.y - 20, 96, 96, "accent", 1);
        });
        break;
      case "street-radio":
        put(main, 70, 42, 1130, 138, 87, { letterSpacing: -3 });
        rows = true;
        regions = Array.from({ length: count }, (_, i) => ({
          x: i % 2 ? 113 : 73,
          y: 224 + (i * 430) / count,
          w: 1060,
          h: 430 / count - 16,
        }));
        regions.forEach((r) => {
          box(r.x + 8, r.y + 8, r.w, r.h, { fill: "foreground" });
          box(r.x, r.y, r.w, r.h, {
            fill: "surface",
            stroke: "foreground",
            strokeWidth: 3,
          });
        });
        break;
      case "save-point":
        put(main, 75, 43, 1120, 135, 62, { letterSpacing: -2 });
        rows = true;
        regions = Array.from({ length: count }, (_, i) => ({
          x: 148,
          y: 229 + (i * 420) / count,
          w: 1045,
          h: 420 / count - 12,
        }));
        box(83, 243, 5, 375, { fill: "accent" });
        regions.forEach((r, i) => {
          pixelFrame(r.x, r.y, r.w, r.h);
          box(72, r.y + 21, 27, 27, { fill: i % 2 ? "foreground" : "accent" });
        });
        break;
      case "warehouse":
        put(main, 66, 39, 1120, 137, 96, { letterSpacing: -2 });
        rule(72, 194, 1135, "foreground", 3);
        rows = true;
        regions = Array.from({ length: count }, (_, i) => ({
          x: 72,
          y: 224 + (i * 425) / count,
          w: 1135,
          h: 425 / count - 12,
        }));
        regions.forEach((r) => {
          rule(r.x, r.y + r.h, r.w);
          box(r.x + 115, r.y + 6, 5, r.h - 10, { fill: "foreground" });
        });
        break;
    }
    regions.forEach((r, i) => {
      const head = subheads[i],
        body = bodies[i],
        label = stats ? undefined : labels[i];
      if (rows) {
        const inset =
          direction === "street-radio" || direction === "save-point" ? 22 : 0;
        const prefix =
          direction === "warehouse" ? 145 : label?.text?.trim() ? 106 : inset;
        put(label, r.x + inset, r.y + 19, 80, r.h - 28, 28, {
          color: direction === "street-radio" ? "foreground" : "accent",
        });
        const hx = r.x + prefix,
          available = r.w - prefix - inset,
          headWidth = stats ? 220 : Math.min(370, available * 0.4);
        put(
          head,
          hx,
          r.y + 15,
          headWidth,
          r.h - 26,
          stats ? 67 : count === 4 ? 29 : 36,
          { letterSpacing: -1 },
        );
        put(
          body,
          head?.text?.trim() ? hx + headWidth + 24 : hx,
          r.y + 17,
          head?.text?.trim() ? available - headWidth - 24 : available,
          r.h - 29,
          24,
          {
            color: ["ransom-ink", "save-point"].includes(direction)
              ? "secondary"
              : "foreground",
          },
        );
        if (team) {
          put(
            elements.filter((el) => el.type === "icon")[i],
            r.x + inset + 10,
            r.y + 20,
            54,
            54,
            24,
          );
          put(head, r.x + inset + 98, r.y + 15, 280, r.h - 27, 32);
          put(
            body,
            r.x + inset + 412,
            r.y + 17,
            r.w - inset * 2 - 430,
            r.h - 30,
            24,
          );
        }
      } else {
        const centered = ["limbo", "beatmap"].includes(direction),
          inset = 22;
        const top =
          direction === "limbo" ? 45 : direction === "beatmap" ? 4 : 20;
        put(label, r.x + inset, r.y + top, r.w - inset * 2, 48, 23, {
          textAlign: centered ? "center" : "left",
          color: "accent",
        });
        const headY = r.y + (team ? 100 : stats ? 53 : 96);
        put(
          head,
          r.x + inset,
          headY,
          r.w - inset * 2,
          stats ? 125 : 104,
          stats ? 85 : count === 4 ? 31 : 39,
          { textAlign: centered ? "center" : "left", letterSpacing: -1 },
        );
        const bodyY = head?.text?.trim()
          ? headY + (stats ? 138 : 114)
          : r.y + 96;
        put(
          body,
          r.x + inset,
          bodyY,
          r.w - inset * 2,
          Math.max(64, r.y + r.h - bodyY - 19),
          count === 4 ? 22 : 25,
          { textAlign: centered ? "center" : "left" },
        );
        if (team)
          put(
            elements.filter((el) => el.type === "icon")[i],
            r.x + r.w / 2 - 28,
            r.y + 26,
            56,
            56,
            24,
          );
      }
    });
    if (stats)
      labels.forEach((el, i) =>
        put(el, 85, 661 + i * 20, 1100, 27, 16, { color: "secondary" }),
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
