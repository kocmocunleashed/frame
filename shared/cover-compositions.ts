import type { FrameElement, Slide, Theme } from "./schema";
import type { PathCommand } from "./creative";
import { newElement } from "./operations";

const DIRECTIONS = new Set([
  "melt-eyez",
  "brat",
  "hard-soft",
  "question-mark",
  "i-am-you",
  "igor",
  "hunter",
  "league",
  "phoenix",
  "viper",
  "reyna",
  "neon",
  "yoru",
]);
type Region = { x: number; y: number; w: number; h: number };

/** Album and character art directions, made entirely from editable slide objects. */
export function composeCoverTheme(
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
      width: Math.max(5, w),
      height: Math.max(5, h),
      fill: "surface",
      radius: 0,
      strokeWidth: 0,
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
      stroke: "accent",
      strokeWidth: 2,
      ...extra,
    });
  const polygon = (
    x: number,
    y: number,
    w: number,
    h: number,
    points: number[][],
    fill: string,
    extra: Partial<FrameElement> = {},
  ) =>
    path(
      x,
      y,
      w,
      h,
      [
        ...points.map(([px, py], i) => ({
          op: i ? ("L" as const) : ("M" as const),
          x: px,
          y: py,
        })),
        { op: "Z" },
      ],
      { fill, strokeWidth: 0, ...extra },
    );
  const ring = (
    x: number,
    y: number,
    w: number,
    h: number,
    stroke = "accent",
    weight = 2,
  ) =>
    box(x, y, w, h, {
      shape: "ellipse",
      fill: "transparent",
      stroke,
      strokeWidth: weight,
    });
  const put = (
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
        lineHeight: 1.12,
        letterSpacing: 0,
        ...extra,
      });
  };

  // The same mark is large on covers and compact on content slides. Coordinates
  // are local to a 360 × 480 illustration, so it never controls text geometry.
  function motif(x: number, y: number, scale: number) {
    const b = (
      a: number,
      c: number,
      w: number,
      h: number,
      extra: Partial<FrameElement> = {},
    ) => box(x + a * scale, y + c * scale, w * scale, h * scale, extra);
    const p = (
      a: number,
      c: number,
      w: number,
      h: number,
      points: number[][],
      fill: string,
      extra: Partial<FrameElement> = {},
    ) =>
      polygon(
        x + a * scale,
        y + c * scale,
        w * scale,
        h * scale,
        points,
        fill,
        extra,
      );
    const r = (
      a: number,
      c: number,
      w: number,
      h: number,
      color = "accent",
      weight = 2,
    ) =>
      ring(x + a * scale, y + c * scale, w * scale, h * scale, color, weight);
    const line = (
      a: number,
      c: number,
      w: number,
      h: number,
      commands: PathCommand[],
      extra: Partial<FrameElement> = {},
    ) =>
      path(x + a * scale, y + c * scale, w * scale, h * scale, commands, extra);
    switch (direction) {
      case "melt-eyez":
        // A warped profile, with the facial planes broken into lateral echoes.
        p(
          35,
          22,
          290,
          443,
          [
            [38, 0],
            [83, 5],
            [100, 26],
            [85, 52],
            [68, 66],
            [86, 100],
            [0, 100],
            [23, 77],
            [26, 65],
            [8, 56],
            [0, 43],
            [21, 38],
            [14, 21],
          ],
          "#172341",
        );
        for (let i = 0; i < 17; i++) {
          const drift = Math.sin(i * 0.68) * 29;
          b(22 + drift, 30 + i * 24, 264 + Math.cos(i * 1.3) * 44, 20, {
            fill: ["#176c78", "#23537f", "#4c5686", "#4b8c8b"][i % 4],
            opacity: 0.58,
          });
        }
        p(
          48,
          82,
          224,
          298,
          [
            [33, 0],
            [80, 3],
            [100, 24],
            [85, 57],
            [64, 67],
            [72, 100],
            [22, 100],
            [26, 78],
            [8, 66],
            [22, 59],
            [0, 51],
            [18, 42],
            [14, 24],
          ],
          "#3f617d",
        );
        p(
          70,
          41,
          230,
          140,
          [
            [13, 0],
            [69, 4],
            [98, 28],
            [100, 58],
            [70, 53],
            [36, 100],
            [0, 91],
            [16, 50],
            [0, 30],
          ],
          "#192e50",
        );
        b(33, 184, 126, 15, { fill: "#102440" });
        b(17, 212, 99, 9, { fill: "#647d99", opacity: 0.8 });
        b(29, 256, 119, 13, { fill: "#253250" });
        b(55, 283, 139, 11, { fill: "#2d4c6c" });
        b(22, 314, 122, 14, { fill: "#40647b", opacity: 0.7 });
        line(
          185,
          171,
          58,
          96,
          [
            { op: "M", x: 20, y: 12 },
            { op: "C", x1: 100, y1: -10, x2: 100, y2: 100, x: 0, y: 85 },
          ],
          { stroke: "#91a1ac", strokeWidth: 4, opacity: 0.55 },
        );
        break;
      case "hard-soft":
        p(
          71,
          3,
          222,
          280,
          [
            [4, 8],
            [86, 0],
            [100, 93],
            [0, 100],
          ],
          "#d9eafa",
        );
        p(
          91,
          25,
          181,
          238,
          [
            [4, 6],
            [84, 0],
            [100, 94],
            [0, 100],
          ],
          "#52799a",
        );
        p(
          102,
          31,
          140,
          234,
          [
            [0, 0],
            [94, 4],
            [100, 99],
            [0, 90],
          ],
          "#eaf4f6",
        );
        p(
          81,
          279,
          243,
          162,
          [
            [0, 0],
            [75, 0],
            [100, 100],
            [10, 100],
          ],
          "#32678b",
          { opacity: 0.22 },
        );
        for (let i = 0; i < 5; i++)
          r(
            25 + i * 51,
            324 + (i % 3) * 29,
            9 + i * 2,
            9 + i * 2,
            "#85b4d2",
            1,
          );
        break;
      case "question-mark":
        for (let i = 0; i < 6; i++) {
          const col = i % 2,
            row = Math.floor(i / 2),
            px = col * 165 + 3,
            py = row * 147;
          b(px, py, 153, 130, {
            fill: i % 2 ? "#b3b2ae" : "foreground",
            rotation: i % 2 ? 5 : -4,
          });
          if (i === 0 || i === 5) {
            p(
              px + 21,
              py + 14,
              110,
              111,
              [
                [36, 0],
                [75, 9],
                [92, 47],
                [64, 80],
                [100, 100],
                [0, 100],
                [24, 65],
                [13, 32],
              ],
              i === 0 ? "#bcbcb8" : "#333333",
            );
            b(px + 46, py + 52, 33, 5, {
              fill: i === 0 ? "#1d1d1d" : "#eeeeeb",
              rotation: -8,
            });
          } else if (i === 1) {
            for (let k = 0; k < 5; k++)
              r(
                px + 22 + k * 9,
                py + 15 + k * 9,
                108 - k * 18,
                100 - k * 18,
                "#3e3e3b",
                1.5,
              );
          } else if (i === 2) {
            line(
              px + 14,
              py + 19,
              126,
              91,
              [
                { op: "M", x: 0, y: 90 },
                { op: "L", x: 25, y: 55 },
                { op: "L", x: 4, y: 20 },
                { op: "L", x: 70, y: 0 },
                { op: "L", x: 100, y: 100 },
                { op: "M", x: 1, y: 0 },
                { op: "L", x: 90, y: 72 },
              ],
              { stroke: "#e4e4df", strokeWidth: 2 },
            );
          } else if (i === 3) {
            p(
              px + 11,
              py + 12,
              131,
              108,
              [
                [0, 100],
                [25, 3],
                [39, 37],
                [60, 0],
                [73, 66],
                [100, 45],
                [93, 100],
              ],
              "#252525",
            );
          } else {
            b(px + 26, py + 17, 91, 95, { shape: "ellipse", fill: "#e3e2dd" });
            p(
              px + 10,
              py + 66,
              130,
              47,
              [
                [0, 40],
                [100, 0],
                [86, 100],
                [13, 80],
              ],
              "#565654",
            );
          }
          for (let k = 0; k < 3; k++)
            b(px + 13, py + 102 + k * 7, 124, 2, {
              fill: i % 2 ? "#252525" : "#eeeeeb",
              opacity: 0.45,
            });
        }
        break;
      case "i-am-you": {
        const paints = ["#00a4c2", "#a6ce31", "#e74790", "#f6bd43"];
        for (let i = 0; i < 9; i++) {
          const c = paints[i % 4],
            a = (i * 71) % 280,
            top = 20 + i * 43;
          p(
            a,
            top,
            58 + (i % 3) * 22,
            30,
            [
              [0, 20],
              [20, 0],
              [100, 18],
              [91, 69],
              [18, 100],
              [8, 58],
            ],
            c,
            { rotation: i % 2 ? 22 : -17 },
          );
          b(a + 9, top + 21, 4, 40 + (i % 3) * 22, { fill: c, radius: 2 });
          b(a + 29, top + 20, 3, 28 + (i % 2) * 44, { fill: c, radius: 2 });
        }
        line(
          10,
          34,
          300,
          375,
          [
            { op: "M", x: 8, y: 100 },
            { op: "C", x1: 90, y1: 0, x2: 0, y2: 60, x: 100, y: 8 },
          ],
          { stroke: "#0085a1", strokeWidth: 3 },
        );
        break;
      }
      case "igor":
        p(
          10,
          309,
          342,
          161,
          [
            [0, 100],
            [10, 35],
            [40, 0],
            [71, 5],
            [100, 100],
          ],
          "#1c1c1c",
        );
        p(
          72,
          51,
          225,
          329,
          [
            [13, 0],
            [81, 2],
            [100, 28],
            [87, 77],
            [50, 100],
            [6, 76],
            [0, 25],
          ],
          "#252525",
        );
        p(
          85,
          64,
          195,
          300,
          [
            [0, 0],
            [70, 0],
            [100, 17],
            [65, 51],
            [72, 78],
            [44, 100],
            [0, 69],
          ],
          "#b8b8b6",
        );
        p(
          83,
          47,
          211,
          102,
          [
            [0, 10],
            [55, 0],
            [100, 17],
            [100, 87],
            [64, 66],
            [0, 100],
          ],
          "#202020",
        );
        p(
          166,
          166,
          103,
          133,
          [
            [18, 0],
            [65, 12],
            [49, 58],
            [100, 72],
            [54, 100],
            [0, 68],
          ],
          "#ededeb",
        );
        b(112, 173, 46, 10, { fill: "#2a2a2a", rotation: -9 });
        b(199, 174, 43, 10, { fill: "#2a2a2a", rotation: 8 });
        b(143, 291, 74, 9, { fill: "#343434", rotation: -3 });
        break;
      case "hunter":
        r(15, 71, 322, 322, "#74a56c", 1);
        r(53, 109, 246, 246, "accent", 2);
        p(
          35,
          95,
          281,
          280,
          [
            [0, 0],
            [30, 0],
            [100, 100],
            [70, 100],
          ],
          "accent",
        );
        p(
          35,
          95,
          281,
          280,
          [
            [70, 0],
            [100, 0],
            [30, 100],
            [0, 100],
          ],
          "#f46248",
        );
        p(
          145,
          9,
          59,
          45,
          [
            [50, 0],
            [100, 100],
            [50, 75],
            [0, 100],
          ],
          "accent",
        );
        for (let i = 0; i < 5; i++)
          b(35 + i * 61, 429, 24, 5, { fill: "accent" });
        break;
      case "league":
        r(2, 65, 346, 346, "accent", 2);
        r(24, 87, 302, 302, "#7c885f", 1);
        p(
          35,
          54,
          280,
          368,
          [
            [50, 0],
            [100, 50],
            [50, 100],
            [0, 50],
          ],
          "transparent",
          { stroke: "accent", strokeWidth: 2 },
        );
        p(
          95,
          117,
          160,
          246,
          [
            [50, 0],
            [100, 42],
            [50, 100],
            [0, 42],
          ],
          "#37bed2",
        );
        p(
          95,
          117,
          160,
          246,
          [
            [50, 0],
            [50, 100],
            [0, 42],
          ],
          "#d5f7eb",
        );
        p(
          95,
          117,
          160,
          246,
          [
            [50, 100],
            [100, 42],
            [50, 55],
          ],
          "#087a9d",
        );
        for (const a of [0, 1, 2, 3])
          b(168, 41 + a * 132, 11, 11, { fill: "accent", rotation: 45 });
        break;
      case "phoenix":
        r(7, 102, 336, 336, "#a14e2e", 2);
        p(
          14,
          5,
          330,
          450,
          [
            [47, 0],
            [44, 33],
            [70, 13],
            [68, 49],
            [90, 35],
            [100, 73],
            [82, 96],
            [41, 100],
            [10, 82],
            [0, 50],
            [26, 64],
            [22, 32],
          ],
          "#ff6d2f",
        );
        p(
          80,
          154,
          212,
          289,
          [
            [50, 0],
            [42, 34],
            [79, 19],
            [70, 62],
            [100, 48],
            [89, 88],
            [49, 100],
            [0, 70],
            [28, 80],
            [15, 35],
          ],
          "#ffc460",
        );
        p(
          136,
          282,
          109,
          156,
          [
            [56, 0],
            [50, 41],
            [100, 32],
            [81, 88],
            [42, 100],
            [0, 69],
            [22, 28],
          ],
          "#fff1d1",
        );
        break;
      case "viper":
        for (let i = 0; i < 5; i++)
          line(
            20 + i * 19,
            12 + i * 25,
            279 - i * 13,
            412 - i * 18,
            [
              { op: "M", x: 25, y: 100 },
              { op: "C", x1: -25, y1: 65, x2: 110, y2: 60, x: 60, y: 33 },
              { op: "C", x1: 20, y1: 8, x2: 70, y2: 4, x: 90, y: 0 },
            ],
            {
              stroke: i % 2 ? "#306f3a" : "accent",
              strokeWidth: i ? 3 : 16,
              opacity: i ? 0.8 : 0.4,
            },
          );
        p(
          77,
          166,
          210,
          155,
          [
            [0, 0],
            [50, 25],
            [100, 0],
            [77, 69],
            [50, 100],
            [23, 69],
          ],
          "#0b2418",
          { stroke: "accent", strokeWidth: 3 },
        );
        p(
          95,
          192,
          168,
          45,
          [
            [0, 0],
            [43, 30],
            [37, 100],
            [11, 68],
          ],
          "accent",
        );
        p(
          95,
          192,
          168,
          45,
          [
            [100, 0],
            [57, 30],
            [63, 100],
            [89, 68],
          ],
          "accent",
        );
        break;
      case "reyna":
        r(43, 92, 266, 266, "#a768c6", 2);
        r(74, 123, 204, 204, "accent", 4);
        line(
          0,
          144,
          352,
          161,
          [
            { op: "M", x: 0, y: 50 },
            { op: "Q", x1: 50, y1: -22, x: 100, y: 50 },
            { op: "Q", x1: 50, y1: 122, x: 0, y: 50 },
            { op: "Z" },
          ],
          { fill: "#9f35b0", stroke: "#f8b5f4", strokeWidth: 3 },
        );
        b(136, 171, 80, 107, { shape: "ellipse", fill: "#f7a6ef" });
        p(
          162,
          174,
          28,
          100,
          [
            [50, 0],
            [100, 50],
            [50, 100],
            [0, 50],
          ],
          "#291331",
        );
        for (const [a, c] of [
          [43, 28],
          [290, 385],
          [87, 390],
        ])
          b(a, c, 18, 18, { shape: "circle", fill: "accent" });
        break;
      case "neon":
        for (let i = 0; i < 6; i++)
          p(
            i * 49,
            7 + i * 11,
            59,
            451 - i * 12,
            [
              [80, 0],
              [100, 0],
              [20, 100],
              [0, 100],
            ],
            i % 2 ? "#51d8fa" : "#3662d6",
          );
        p(
          41,
          21,
          260,
          414,
          [
            [61, 0],
            [100, 0],
            [55, 39],
            [91, 39],
            [0, 100],
            [30, 51],
            [0, 51],
          ],
          "#fff065",
        );
        p(
          47,
          45,
          249,
          402,
          [
            [61, 0],
            [100, 0],
            [55, 39],
            [91, 39],
            [0, 100],
            [30, 51],
            [0, 51],
          ],
          "transparent",
          { stroke: "#f3ffff", strokeWidth: 2 },
        );
        break;
      case "yoru":
        p(
          0,
          42,
          352,
          384,
          [
            [50, 0],
            [100, 43],
            [54, 100],
            [0, 58],
          ],
          "#2849b4",
        );
        p(
          41,
          7,
          289,
          453,
          [
            [43, 0],
            [100, 37],
            [52, 100],
            [0, 56],
          ],
          "transparent",
          { stroke: "#78b9fa", strokeWidth: 2 },
        );
        p(
          63,
          80,
          243,
          300,
          [
            [0, 0],
            [31, 22],
            [68, 22],
            [100, 0],
            [89, 69],
            [50, 100],
            [11, 69],
          ],
          "#b4d9f4",
        );
        p(
          66,
          155,
          237,
          144,
          [
            [0, 0],
            [43, 29],
            [37, 51],
            [11, 39],
            [30, 100],
            [0, 74],
          ],
          "#173677",
        );
        p(
          66,
          155,
          237,
          144,
          [
            [100, 0],
            [57, 29],
            [63, 51],
            [89, 39],
            [70, 100],
            [100, 74],
          ],
          "#173677",
        );
        p(
          141,
          253,
          89,
          91,
          [
            [0, 0],
            [50, 25],
            [100, 0],
            [72, 100],
            [50, 56],
            [28, 100],
          ],
          "#e95847",
        );
        break;
    }
  }

  const heads = elements.filter(
    (el) => el.type === "text" && el.role === "heading",
  );
  const main = slide.layout === "quote" ? heads[1] || heads[0] : heads[0];
  const subheads = heads.filter(
    (el) => el !== main && !(slide.layout === "quote" && el === heads[0]),
  );
  if (slide.layout === "quote" && heads[0] !== main) heads[0].hidden = true;
  const bodies = elements.filter(
    (el) => el.type === "text" && el.role === "body",
  );
  const labels = elements.filter(
    (el) => el.type === "text" && el.role === "label",
  );
  const icons = elements.filter((el) => el.type === "icon");
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

  if (direction === "melt-eyez") {
    box(0, 0, 58, 720, { fill: "#ed9e43" });
    for (let i = 0; i < 16; i++)
      box(15, 24 + i * 43, 27, 24, {
        fill: "#14283b",
        opacity: i % 3 ? 0.8 : 0.3,
      });
  }
  if (direction === "hard-soft") {
    for (let i = 0; i < 4; i++)
      path(
        0,
        611 + i * 22,
        1280,
        34,
        [
          { op: "M", x: 0, y: 50 },
          { op: "C", x1: 22, y1: 0, x2: 62, y2: 100, x: 100, y: 30 },
        ],
        { stroke: "#447ca3", opacity: 0.22 },
      );
  }
  if (direction === "i-am-you") {
    for (let i = 0; i < 11; i++)
      box(24 + i * 118, i % 2 ? 674 : 23, 43 + (i % 3) * 11, 8, {
        fill: ["#18a4bd", "#a6c942", "#e25b91", "#f5c14a"][i % 4],
        rotation: i % 2 ? 8 : -11,
      });
  }
  if (cover) {
    if (direction === "brat") {
      put(main, 105, 161, 1070, 325, 126, {
        textAlign: "center",
        lineHeight: 1.02,
        letterSpacing: -5,
        fontWeight: 400,
      });
      put(bodies[0], 195, 524, 890, 124, 29, { textAlign: "center" });
      put(labels[0], 125, 64, 1030, 47, 18, { textAlign: "center" });
    } else if (direction === "i-am-you") {
      motif(-16, 163, 0.62);
      motif(1070, 91, 0.62);
      put(main, 203, 147, 874, 323, 100, {
        textAlign: "center",
        lineHeight: 1.02,
        letterSpacing: -4,
      });
      put(bodies[0], 222, 526, 836, 128, 29, { textAlign: "center" });
      put(labels[0], 205, 68, 870, 46, 18, { textAlign: "center" });
    } else {
      const covers: Record<
        string,
        [number, number, number, number, number, number, number, number]
      > = {
        "melt-eyez": [98, 143, 704, 335, 107, 846, 104, 0.98],
        "hard-soft": [88, 258, 750, 248, 88, 917, 26, 0.86],
        "question-mark": [76, 119, 686, 355, 105, 853, 145, 0.96],
        igor: [76, 116, 710, 363, 132, 850, 145, 1],
        hunter: [81, 171, 720, 311, 105, 850, 124, 0.96],
        league: [85, 176, 712, 302, 87, 848, 119, 0.98],
        phoenix: [74, 136, 716, 351, 117, 853, 102, 1.02],
        viper: [85, 211, 726, 271, 94, 848, 119, 1],
        reyna: [77, 183, 715, 301, 100, 850, 112, 1],
        neon: [78, 149, 740, 331, 120, 846, 106, 1.02],
        yoru: [76, 162, 710, 313, 106, 846, 112, 1],
      };
      const [hx, hy, hw, hh, hs, mx, my, ms] = covers[direction];
      motif(mx, my, ms);
      put(main, hx, hy, hw, hh, hs, {
        lineHeight: direction === "league" ? 1.08 : 0.99,
        letterSpacing: direction === "league" ? -2 : -3,
        ...(direction === "neon" ? { italic: true } : {}),
      });
      put(bodies[0], 87, 532, 706, 119, 28, { color: "secondary" });
      put(labels[0], 85, 66, 700, 46, 18, {
        color: "accent",
        letterSpacing: 2,
      });
      if (direction === "igor") box(80, 490, 690, 6, { fill: "foreground" });
      if (direction === "league")
        polygon(
          81,
          488,
          686,
          14,
          [
            [0, 50],
            [46, 50],
            [50, 0],
            [54, 50],
            [100, 50],
            [54, 60],
            [50, 100],
            [46, 60],
          ],
          "accent",
        );
    }
    bodies.slice(1).forEach((el, i) => put(el, 90, 648 + i * 20, 1095, 22, 18));
    labels.slice(1).forEach((el, i) => put(el, 90, 679 + i * 15, 1095, 20, 16));
  } else {
    const sidebar = ["melt-eyez", "igor", "viper"].includes(direction);
    if (direction !== "brat")
      motif(sidebar ? 1120 : 1090, 23, sidebar ? 0.16 : 0.23);
    const headings: Record<string, [number, number, number, number, number]> = {
      "melt-eyez": [95, 94, 309, 292, 72],
      brat: [105, 54, 1070, 143, 78],
      "hard-soft": [135, 62, 935, 134, 66],
      "question-mark": [75, 38, 970, 157, 86],
      "i-am-you": [127, 57, 932, 142, 72],
      igor: [79, 86, 332, 307, 94],
      hunter: [79, 44, 973, 148, 85],
      league: [108, 52, 945, 139, 65],
      phoenix: [72, 39, 996, 154, 91],
      viper: [83, 100, 325, 290, 65],
      reyna: [100, 58, 953, 137, 74],
      neon: [73, 37, 1006, 158, 89],
      yoru: [78, 47, 970, 145, 79],
    };
    const [hx, hy, hw, hh, hs] = headings[direction];
    put(main, hx, hy, hw, hh, hs, {
      lineHeight: 1.04,
      letterSpacing: -2,
      textAlign:
        direction === "brat" || direction === "hard-soft" ? "center" : "left",
      ...(direction === "neon" ? { italic: true } : {}),
    });
    if (visual) {
      const side = ["melt-eyez", "igor", "phoenix", "viper", "yoru"].includes(
        direction,
      );
      const panel =
        direction !== "brat"
          ? box(
              side ? 366 : 77,
              side ? 232 : 320,
              side ? 837 : 1126,
              side ? 381 : 305,
              { fill: "surface" },
            )
          : undefined;
      put(
        bodies[0],
        side ? 80 : 88,
        233,
        side ? 245 : 1080,
        side ? 365 : 76,
        27,
      );
      put(
        visual,
        side ? 393 : 99,
        side ? 254 : 340,
        side ? 783 : 1080,
        side ? 337 : 260,
        24,
      );
      if (sidebar) {
        put(bodies[0], 94, 415, 304, 231, 26);
        put(visual, 476, 123, 700, 485, 24);
        // Reposition the existing visual backing into the right-hand panel.
        if (panel)
          Object.assign(panel, { x: 450, y: 97, width: 750, height: 535 });
      }
      if (slide.layout === "text-image") {
        if (sidebar) put(main, 85, 48, 970, 143, 73);
        put(bodies[0], 84, 239, 484, 364, 29);
        put(visual, 655, 224, 540, 388, 24);
      }
      if (slide.layout === "questions") {
        if (sidebar) put(main, 85, 48, 970, 143, 73);
        if (bodies[0]) bodies[0].hidden = true;
        put(visual, 110, 242, 1060, 386, 25);
      }
      bodies
        .slice(1)
        .forEach((el, i) => put(el, 85, 620 + i * 24, 1100, 25, 20));
      labels.forEach((el, i) => put(el, 85, 658 + i * 23, 1100, 26, 17));
    } else {
      const stats = slide.layout === "statistics",
        team = slide.layout === "team";
      const count = Math.min(
        4,
        Math.max(subheads.length, bodies.length, stats ? 0 : labels.length, 1),
      );
      const rows =
        ["melt-eyez", "hard-soft", "igor", "viper", "reyna", "yoru"].includes(
          direction,
        ) && !stats;
      if (sidebar && stats) put(main, 85, 48, 970, 143, 73);
      const regions: Region[] = Array.from({ length: count }, (_, i) =>
        rows
          ? {
              x: sidebar ? 450 : 80,
              y: (sidebar ? 90 : 231) + (i * (sidebar ? 560 : 425)) / count,
              w: sidebar ? 750 : 1120,
              h: (sidebar ? 560 : 425) / count - 14,
            }
          : {
              x: 80 + (i * 1145) / count,
              y: 235 + (direction === "neon" ? (count - i - 1) * 15 : 0),
              w: 1145 / count - 25,
              h: direction === "neon" ? 360 : 405,
            },
      );
      regions.forEach((region, i) => {
        const { x, y, w, h } = region;
        if (["question-mark", "igor"].includes(direction))
          box(x + 7, y + 7, w, h, { fill: "foreground", opacity: 0.18 });
        if (!["brat", "i-am-you", "hunter", "league"].includes(direction))
          box(x, y, w, h, { fill: "surface" });
        if (direction === "league")
          polygon(
            x,
            y,
            w,
            h,
            [
              [0, 5],
              [5, 0],
              [95, 0],
              [100, 5],
              [100, 95],
              [95, 100],
              [5, 100],
              [0, 95],
            ],
            "transparent",
            { stroke: "accent", strokeWidth: 1 },
          );
        else if (direction === "hunter") {
          box(x, y, w, 6, { fill: i % 2 ? "#f46248" : "accent" });
          box(x, y + 7, 5, h - 7, { fill: "#5b7f4d" });
        } else if (direction === "i-am-you")
          box(x, y + w * 0.025, w, 11, {
            fill: ["#00a4c2", "#a6ce31", "#e74790", "#f6bd43"][i % 4],
            rotation: -2,
          });
        else if (direction === "brat") {
          if (i) box(x - 13, y, 2, h, { fill: "foreground" });
        } else if (direction === "neon")
          polygon(
            x,
            y,
            w,
            12,
            [
              [0, 100],
              [8, 0],
              [100, 0],
              [92, 100],
            ],
            "accent",
          );
        else
          box(x, y, rows ? 5 : w, rows ? h : 5, {
            fill: direction === "phoenix" ? "#ff8542" : "accent",
          });
        const head = subheads[i],
          body = bodies[i],
          label = stats ? undefined : labels[i];
        if (rows) {
          const hasPrefix = !!label?.text?.trim() || team;
          const inset = hasPrefix ? 116 : 25;
          put(label, x + 24, y + 18, 68, h - 28, 25, { color: "accent" });
          if (team) put(icons[i], x + 24, y + 18, 55, 55, 24);
          put(
            head,
            x + inset,
            y + 17,
            sidebar ? 220 : 300,
            h - 31,
            count === 4 ? 28 : 34,
          );
          const bodyX = head?.text?.trim()
            ? x + inset + (sidebar ? 242 : 326)
            : x + inset;
          put(body, bodyX, y + 18, x + w - bodyX - 27, h - 32, 24);
        } else {
          put(label, x + 23, y + 24, w - 46, 45, 23, { color: "accent" });
          if (team) put(icons[i], x + 25, y + 28, 56, 56, 24);
          const headY = y + (team ? 110 : label?.text?.trim() ? 92 : 35);
          put(
            head,
            x + 23,
            headY,
            w - 46,
            stats ? 124 : 99,
            stats ? 79 : count === 4 ? 30 : 39,
            { letterSpacing: -1 },
          );
          const bodyY = head?.text?.trim()
            ? headY + (stats ? 139 : 112)
            : y + 75;
          put(
            body,
            x + 23,
            bodyY,
            w - 46,
            Math.max(60, y + h - bodyY - 24),
            count === 4 ? 23 : 26,
          );
        }
      });
      if (stats)
        labels.forEach((el, i) =>
          put(el, 85, 662 + i * 20, 1100, 26, 16, { color: "secondary" }),
        );
    }
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
