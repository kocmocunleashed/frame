import { type FrameElement, type Slide, type Theme } from "./schema";
import { newElement } from "./operations";
import { composeAdditionalTheme } from "./theme-compositions";
import { composeCoverTheme } from "./cover-compositions";
import { composeCultureTheme } from "./culture-compositions";

type Region = { x: number; y: number; w: number; h: number };

/** Each direction owns its composition. Output stays ordinary editable document data. */
export function composeSlide(
  slide: Slide,
  theme?: Theme,
  width = 1280,
  height = 720,
): Slide {
  if (!theme?.artDirection || slide.layout === "blank") return slide;
  const cover = composeCoverTheme(slide, theme, width, height);
  if (cover) return cover;
  const culture = composeCultureTheme(slide, theme, width, height);
  if (culture) return culture;
  const additional = composeAdditionalTheme(slide, theme, width, height);
  if (additional) return additional;
  const direction = theme.artDirection;
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
  function shape(
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
      shadow: false,
      name: theme!.name + " artwork",
      accessibility: { decorative: true },
      ...extra,
    });
    art.push(el);
    return el;
  }
  function caption(
    value: string,
    x: number,
    y: number,
    w: number,
    h: number,
    size: number,
    extra: Partial<FrameElement> = {},
  ) {
    const el = newElement("text", {
      x,
      y,
      width: w,
      height: h,
      text: value,
      name: value,
      baseFontSize: size,
      role: "label",
      fontFamily: "Courier New",
      accessibility: { decorative: true },
      ...extra,
    });
    art.push(el);
    return el;
  }
  function place(
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
        lineHeight: 1.12,
        letterSpacing: 0,
        ...extra,
      });
  }
  function ring(
    x: number,
    y: number,
    w: number,
    h: number,
    stroke = "accent",
    weight = 2,
    rotation = 0,
  ) {
    shape(x, y, w, h, {
      shape: "ellipse",
      fill: "transparent",
      stroke,
      strokeWidth: weight,
      rotation,
    });
  }
  function glass(x: number, y: number, w: number, h: number) {
    shape(x, y, w, h, {
      fill: "#ffffff12",
      stroke: "#d6f1ff88",
      strokeWidth: 1.5,
      material: "glass",
      radius: 44,
      shadow: true,
    });
  }
  function liquidLight() {
    shape(-130, -155, 650, 650, {
      shape: "circle",
      fill: "#5264ff",
      gradient: true,
    });
    shape(890, 320, 520, 520, {
      shape: "circle",
      fill: "#1989cb",
      gradient: true,
    });
    ring(835, -145, 600, 600, "#8eeaff99", 2);
  }
  function orbitals() {
    ring(-100, 160, 1480, 385, "#dae3ff", 10, -18);
    ring(-70, 135, 1450, 440, "#6e95ff", 2, 18);
    shape(22, 60, 185, 185, {
      shape: "spark",
      fill: "#e7edff",
      gradient: true,
      rotation: -12,
    });
    shape(1050, 460, 190, 190, {
      shape: "spark",
      fill: "#e7edff",
      gradient: true,
      rotation: 14,
    });
  }
  function printEdges() {
    shape(0, 0, 125, 720, { fill: "foreground" });
    for (let i = 0; i < 8; i++)
      shape(25, 25 + i * 90, 74, 27, { fill: "background", radius: 6 });
    shape(159, 42, 1015, 625, {
      fill: "surface",
      rotation: -3,
      shadow: true,
      radius: 0,
    });
    shape(385, 25, 190, 48, { fill: "#b79a6588", rotation: -7 });
    shape(990, 618, 190, 46, { fill: "#b79a6588", rotation: 9 });
  }
  function radar() {
    for (const diameter of [540, 420, 300, 180])
      ring(
        55 + (540 - diameter) / 2,
        100 + (540 - diameter) / 2,
        diameter,
        diameter,
        "secondary",
        1,
      );
    shape(323, 80, 5, 580, { fill: "secondary", opacity: 0.45 });
    shape(30, 367, 590, 5, { fill: "secondary", opacity: 0.45 });
    shape(322, 215, 10, 300, { fill: "accent", rotation: -39 });
    shape(292, 337, 65, 65, { shape: "circle", fill: "accent" });
    for (let i = 0; i < 12; i++)
      shape(55 + i * 46, 680, 24, 12, { fill: i < 8 ? "accent" : "surface" });
  }
  const heads = elements.filter((el) => el.role === "heading");
  const main = slide.layout === "quote" ? heads[1] || heads[0] : heads[0];
  const subheads = heads.filter(
    (el) => el !== main && !(slide.layout === "quote" && el === heads[0]),
  );
  const bodies = elements.filter((el) => el.role === "body");
  if (slide.layout === "chart" && !bodies.length) {
    const takeaway = newElement("text", {
      role: "body",
      text: "Turn the numbers into a clear takeaway.",
      name: "Chart takeaway",
      baseFontSize: 26,
    });
    elements.push(takeaway);
    bodies.push(takeaway);
  }
  const labels = elements.filter((el) => el.role === "label");
  const visual = elements.find((el) =>
    ["chart", "table", "diagram", "question", "image", "video"].includes(
      el.type,
    ),
  );
  if (slide.layout === "quote" && heads[0] !== main) {
    // The quotation mark is part of the composition, rather than a second content heading.
    const i = elements.indexOf(heads[0]);
    if (i >= 0) elements.splice(i, 1);
  }

  if (["title", "section", "summary", "quote"].includes(slide.layout)) {
    const body = bodies[0],
      label = labels[0];
    switch (direction) {
      case "monochrome":
        shape(0, 282, 1280, 438, { fill: "foreground" });
        for (let i = 0; i < 4; i++)
          shape(64 + i * 57, 75, 22, 145, { fill: "foreground" });
        place(main, 58, 325, 1160, 340, 133, {
          color: "background",
          lineHeight: 0.98,
          letterSpacing: -6,
        });
        place(body, 655, 73, 540, 156, 29);
        place(label, 370, 76, 245, 80, 17, { color: "secondary" });
        break;
      case "rage":
        shape(0, 550, 1280, 170, { fill: "foreground" });
        shape(1220, -40, 45, 610, { fill: "foreground", rotation: 15 });
        shape(1160, -40, 15, 610, { fill: "foreground", rotation: 15 });
        shape(1060, 10, 180, 180, {
          shape: "star",
          fill: "surface",
          rotation: -12,
        });
        place(main, 54, 98, 960, 425, 162, {
          lineHeight: 0.84,
          letterSpacing: -4,
          rotation: -3,
        });
        place(body, 75, 580, 1000, 100, 31, { color: "background" });
        place(label, 68, 38, 800, 42, 20, {
          fontFamily: "Courier New",
          letterSpacing: 2,
        });
        caption("✳", 1120, 575, 100, 95, 80, {
          color: "background",
          fontFamily: "DM Sans",
        });
        break;
      case "liquid":
        liquidLight();
        glass(160, 84, 960, 552);
        place(main, 230, 220, 820, 245, 92, {
          textAlign: "center",
          lineHeight: 1.08,
          letterSpacing: -3,
        });
        place(body, 290, 495, 700, 90, 25, {
          textAlign: "center",
          color: "secondary",
        });
        place(label, 275, 138, 730, 48, 17, {
          textAlign: "center",
          letterSpacing: 4,
        });
        shape(580, 601, 120, 5, { fill: "#d6f1ff99", radius: 3 });
        break;
      case "material":
        shape(35, 43, 585, 635, {
          shape: "blob",
          fill: "foreground",
          rotation: -4,
        });
        shape(685, 264, 530, 245, { fill: "surface", radius: 122 });
        shape(955, 32, 250, 230, {
          shape: "blob",
          fill: "surface",
          rotation: 25,
        });
        shape(700, 555, 490, 95, { fill: "foreground", radius: 48 });
        place(main, 105, 188, 445, 355, 82, {
          color: "background",
          lineHeight: 1.03,
          letterSpacing: -4,
        });
        place(body, 746, 319, 410, 140, 29);
        place(label, 751, 586, 400, 37, 18, { color: "background" });
        shape(750, 82, 120, 120, { shape: "circle", fill: "foreground" });
        break;
      case "future":
        radar();
        shape(680, 35, 5, 650, { fill: "secondary", opacity: 0.5 });
        place(label, 737, 55, 480, 50, 17, {
          fontFamily: "Courier New",
          letterSpacing: 3,
          color: "accent",
        });
        place(main, 736, 156, 490, 325, 82, {
          lineHeight: 1,
          letterSpacing: -3,
        });
        place(body, 742, 525, 465, 110, 26, { color: "secondary" });
        caption("SIGNAL / FRAME", 65, 38, 540, 45, 18, {
          color: "secondary",
          letterSpacing: 4,
        });
        break;
      case "y2k":
        orbitals();
        place(main, 125, 185, 1030, 310, 122, {
          textAlign: "center",
          lineHeight: 1,
          letterSpacing: -6,
        });
        place(body, 330, 550, 620, 120, 27, { textAlign: "center" });
        place(label, 275, 69, 730, 46, 18, {
          textAlign: "center",
          letterSpacing: 6,
        });
        break;
      case "nostalgia":
        printEdges();
        place(main, 245, 150, 845, 355, 94, {
          textAlign: "center",
          rotation: -3,
          lineHeight: 1.03,
          letterSpacing: -3,
        });
        shape(302, 512, 760, 116, { fill: "foreground", rotation: -3 });
        place(body, 345, 530, 680, 100, 27, {
          color: "surface",
          rotation: -3,
          textAlign: "center",
        });
        place(label, 300, 85, 700, 42, 17, {
          textAlign: "center",
          rotation: -3,
          fontFamily: "Courier New",
        });
        break;
      case "clay":
        shape(760, 74, 440, 545, {
          fill: "surface",
          radius: 215,
          gradient: true,
          shadow: true,
          rotation: 10,
        });
        shape(873, 229, 200, 235, {
          fill: "background",
          radius: 95,
          rotation: 10,
        });
        shape(625, 515, 245, 160, {
          fill: "surface",
          radius: 80,
          gradient: true,
          rotation: -20,
          shadow: true,
        });
        place(main, 64, 120, 725, 320, 116, {
          lineHeight: 0.98,
          letterSpacing: -5,
        });
        place(body, 79, 483, 525, 155, 29);
        place(label, 80, 57, 670, 42, 18, { letterSpacing: 2 });
        break;
      case "terminal":
        caption(">", 55, 178, 115, 125, 112, { color: "accent" });
        shape(171, 153, 5, 458, { fill: "secondary" });
        shape(48, 646, 1184, 42, { fill: "foreground" });
        place(main, 213, 187, 1000, 302, 76, {
          lineHeight: 1.05,
          letterSpacing: -3,
        });
        place(body, 215, 521, 950, 108, 25, { color: "secondary" });
        place(label, 70, 652, 1100, 32, 18, {
          color: "background",
          fontFamily: "Courier New",
        });
        caption("FRAME / PRESENTATION", 55, 48, 1080, 50, 19, {
          letterSpacing: 3,
          color: "secondary",
        });
        shape(215, 478, 78, 15, { fill: "foreground" });
        break;
    }
  } else if (visual) {
    // Data is composed as information, rather than squeezed into the cover's geometry.
    switch (direction) {
      case "monochrome":
        shape(0, 0, 1280, 193, { fill: "foreground" });
        place(main, 70, 38, 1135, 132, 72, {
          color: "background",
          letterSpacing: -3,
        });
        place(visual, 83, 260, 1114, 337, 24);
        place(bodies[0], 83, 205, 1110, 64, 24);
        break;
      case "rage":
        shape(425, 53, 805, 590, { fill: "surface" });
        place(main, 55, 73, 340, 535, 106, {
          lineHeight: 0.91,
          letterSpacing: -2,
        });
        place(visual, 470, 225, 710, 340, 24);
        place(bodies[0], 475, 90, 705, 125, 28);
        break;
      case "liquid":
        liquidLight();
        glass(100, 193, 1080, 460);
        place(main, 160, 44, 960, 132, 64, {
          textAlign: "center",
          letterSpacing: -2,
        });
        place(visual, 152, 315, 980, 292, 24);
        place(bodies[0], 165, 220, 950, 90, 25, { textAlign: "center" });
        break;
      case "material":
        shape(51, 42, 1155, 140, { fill: "foreground", radius: 70 });
        shape(85, 239, 1110, 400, { fill: "surface", radius: 78 });
        place(main, 110, 69, 1050, 110, 68, {
          color: "background",
          letterSpacing: -3,
        });
        place(visual, 137, 325, 1005, 270, 24);
        place(bodies[0], 145, 257, 980, 70, 25);
        break;
      case "future":
        for (let x = 60; x < 1250; x += 145)
          shape(x, 205, 5, 435, { fill: "secondary", opacity: 0.12 });
        shape(61, 190, 1158, 5, { fill: "accent" });
        shape(340, 221, 5, 402, { fill: "secondary" });
        place(main, 63, 49, 1135, 130, 65, { letterSpacing: -2 });
        place(visual, 399, 241, 790, 353, 24);
        place(bodies[0], 66, 239, 235, 340, 26);
        break;
      case "y2k":
        orbitals();
        shape(94, 238, 1090, 389, {
          fill: "surface",
          radius: 70,
          stroke: "#e5edff",
          strokeWidth: 3,
        });
        place(main, 143, 45, 995, 155, 70, {
          textAlign: "center",
          letterSpacing: -3,
        });
        place(visual, 144, 320, 995, 266, 24);
        place(bodies[0], 155, 257, 970, 69, 24, { textAlign: "center" });
        break;
      case "nostalgia":
        printEdges();
        place(main, 235, 71, 895, 142, 65, { letterSpacing: -2 });
        place(visual, 235, 316, 880, 288, 24);
        place(bodies[0], 240, 230, 880, 80, 25);
        break;
      case "clay":
        shape(65, 247, 1150, 392, {
          fill: "surface",
          radius: 75,
          gradient: true,
          shadow: true,
        });
        shape(1050, 35, 165, 165, {
          shape: "circle",
          fill: "surface",
          gradient: true,
          shadow: true,
        });
        place(main, 65, 49, 940, 155, 76, { letterSpacing: -3 });
        place(visual, 117, 347, 1047, 250, 24);
        place(bodies[0], 120, 271, 1030, 74, 26);
        break;
      case "terminal":
        caption(">", 55, 54, 80, 90, 64);
        shape(150, 52, 5, 573, { fill: "secondary" });
        place(main, 194, 54, 1015, 135, 54, { letterSpacing: -1 });
        place(bodies[0], 198, 204, 995, 90, 24, { color: "secondary" });
        place(visual, 200, 325, 990, 280, 24);
        shape(194, 630, 1020, 5, { fill: "foreground" });
        break;
    }
    if (slide.layout === "questions") {
      // Questions need room for readable choices rather than a chart's axis/caption.
      place(visual, visual.x, Math.min(visual.y, 270), visual.width, 345, 25);
      if (bodies[0]) bodies[0].hidden = true;
    }
    if (slide.layout === "text-image") {
      art.splice(0, art.length);
      if (direction === "liquid") liquidLight();
      if (direction === "y2k") orbitals();
      shape(622, 48, 605, 615, {
        fill: "surface",
        radius: direction === "terminal" ? 0 : theme.radius,
        shadow: true,
      });
      place(main, 70, 80, 500, 245, 70, { color: "foreground" });
      place(bodies[0], 76, 370, 480, 200, 28, { color: "foreground" });
      place(visual, 650, 85, 540, 545, 24);
    }
    labels.forEach((el, i) =>
      place(
        el,
        direction === "nostalgia" ? 240 : 82,
        658 + i * 32,
        direction === "nostalgia" ? 930 : 1080,
        35,
        16,
        { color: "secondary" },
      ),
    );
  } else {
    const count = Math.max(subheads.length, bodies.length, labels.length, 1);
    const comparison = slide.layout === "two-column";
    const stats = slide.layout === "statistics";
    const team = slide.layout === "team";
    const slots = Math.min(count, 4);
    let regions: Region[] = [];
    // The header, rhythm, and reading order belong to each direction.
    switch (direction) {
      case "monochrome":
        place(main, 64, 45, 1145, 145, 91, { letterSpacing: -4 });
        regions = Array.from({ length: slots }, (_, i) => ({
          x: 70 + (i * 1180) / slots,
          y: 230,
          w: 1180 / slots - 35,
          h: 405,
        }));
        regions
          .slice(1)
          .forEach((r) => shape(r.x - 20, 234, 5, 398, { fill: "foreground" }));
        break;
      case "rage":
        place(main, 55, 38, 1165, 136, 102, {
          lineHeight: 0.92,
          letterSpacing: -2,
        });
        regions = Array.from({ length: slots }, (_, i) => ({
          x: 198,
          y: 192 + i * (460 / slots),
          w: 1025,
          h: 460 / slots - 16,
        }));
        regions.forEach((r) =>
          shape(r.x, r.y, r.w, r.h, { fill: "foreground" }),
        );
        break;
      case "liquid":
        liquidLight();
        place(main, 170, 49, 940, 129, 65, {
          textAlign: "center",
          letterSpacing: -2,
        });
        regions = Array.from({ length: slots }, (_, i) => ({
          x: 65 + (i * 1190) / slots,
          y: i % 2 ? 210 : 252,
          w: 1190 / slots - 22,
          h: 357,
        }));
        regions.forEach((r) => glass(r.x, r.y, r.w, r.h));
        break;
      case "material":
        place(main, 65, 40, 1130, 142, 76, { letterSpacing: -3 });
        regions = Array.from({ length: slots }, (_, i) => ({
          x: i % 2 ? 488 : 65,
          y: 205 + i * (460 / slots),
          w: 727,
          h: 460 / slots - 15,
        }));
        regions.forEach((r, i) =>
          shape(r.x, r.y, r.w, r.h, {
            fill: i % 2 ? "surface" : "foreground",
            radius: 80,
          }),
        );
        break;
      case "future":
        place(main, 65, 45, 1130, 136, 68, { letterSpacing: -2 });
        regions = Array.from({ length: slots }, (_, i) => ({
          x: 65,
          y: 214 + (i * 440) / slots,
          w: 1150,
          h: 440 / slots - 12,
        }));
        shape(42, 209, 7, 441, { fill: "accent" });
        regions.forEach((r) => {
          shape(r.x, r.y, r.w, r.h, {
            fill: "transparent",
            stroke: "secondary",
            strokeWidth: 1,
          });
        });
        break;
      case "y2k":
        orbitals();
        place(main, 120, 43, 1040, 150, 73, {
          textAlign: "center",
          letterSpacing: -3,
        });
        regions = Array.from({ length: slots }, (_, i) => ({
          x: 40 + (i * 1200) / slots,
          y: i % 2 ? 220 : 275,
          w: 1200 / slots - 12,
          h: 340,
        }));
        regions.forEach((r) =>
          shape(r.x, r.y, r.w, r.h, {
            shape: comparison ? "rounded" : "ellipse",
            fill: "surface",
            radius: 90,
            stroke: "#dce6ff",
            strokeWidth: 3,
          }),
        );
        break;
      case "nostalgia":
        printEdges();
        place(main, 225, 65, 925, 138, 67, { letterSpacing: -2 });
        regions = Array.from({ length: slots }, (_, i) => ({
          x: 180 + (i * 1050) / slots,
          y: 230 + (i % 2 ? 24 : 0),
          w: 1050 / slots - 20,
          h: 365,
        }));
        regions.forEach((r, i) => {
          shape(r.x, r.y, r.w, r.h, {
            fill: "background",
            rotation: i % 2 ? 2 : -2,
            shadow: true,
            stroke: "secondary",
            strokeWidth: 1,
          });
          shape(r.x + 30, r.y - 14, 90, 25, {
            fill: "#b79a6588",
            rotation: i % 2 ? 5 : -5,
          });
        });
        break;
      case "clay":
        place(main, 62, 35, 800, 164, 79, { letterSpacing: -3 });
        regions = Array.from({ length: slots }, (_, i) => ({
          x: 60 + (i * 1200) / slots,
          y: 325 - i * 58,
          w: 1200 / slots - 20,
          h: 320 + i * 58,
        }));
        regions.forEach((r) =>
          shape(r.x, r.y, r.w, r.h, {
            fill: "surface",
            radius: 65,
            gradient: true,
            shadow: true,
          }),
        );
        break;
      case "terminal":
        caption(">", 53, 50, 83, 95, 72);
        place(main, 180, 51, 1020, 134, 56, { letterSpacing: -1 });
        regions = Array.from({ length: slots }, (_, i) => ({
          x: 183,
          y: 215 + (i * 440) / slots,
          w: 1020,
          h: 440 / slots - 12,
        }));
        shape(154, 204, 5, 465, { fill: "secondary" });
        regions.forEach((r) =>
          shape(r.x, r.y + r.h, r.w, 5, { fill: "secondary" }),
        );
        break;
    }
    regions.forEach((r, i) => {
      const head = subheads[i],
        body = bodies[i],
        label = labels[i];
      const horizontal = ["rage", "future", "terminal", "material"].includes(
        direction,
      );
      const color =
        direction === "rage" || (direction === "material" && i % 2 === 0)
          ? "background"
          : "foreground";
      if (horizontal) {
        if (direction === "material") {
          place(
            head,
            r.x + 120,
            r.y + 25,
            r.w - 155,
            r.h - 38,
            stats ? 70 : 39,
            { color, letterSpacing: -1 },
          );
          place(body, i % 2 ? 65 : 855, r.y + 17, 340, r.h - 20, 25);
          place(label, r.x + 30, r.y + 25, 75, r.h - 35, 48, { color });
        } else if (direction === "terminal") {
          place(label, 56, r.y + 20, 90, 65, 35, { color: "secondary" });
          place(
            head,
            r.x + 10,
            r.y + 12,
            stats ? 290 : 975,
            stats ? r.h - 22 : 55,
            stats ? 66 : 32,
          );
          place(
            body,
            stats ? r.x + 340 : r.x + 13,
            r.y + (stats ? 25 : 65),
            stats ? 650 : 975,
            stats ? r.h - 35 : r.h - 65,
            stats ? 25 : 23,
            { color: "secondary" },
          );
        } else {
          const prefix = direction === "rage" ? 45 : 120;
          place(
            label,
            direction === "rage" ? 60 : r.x + 23,
            r.y + 22,
            95,
            r.h - 30,
            direction === "rage" ? 64 : 42,
            { color: direction === "rage" ? "foreground" : "accent" },
          );
          place(
            head,
            r.x + prefix,
            r.y + 20,
            stats ? 310 : 420,
            r.h - 25,
            stats ? 90 : direction === "rage" ? 51 : 38,
            { color, letterSpacing: -1 },
          );
          place(
            body,
            r.x + (stats ? 390 : 555),
            r.y + 22,
            r.w - (stats ? 435 : 585),
            r.h - 30,
            25,
            { color },
          );
        }
      } else {
        const centered = ["liquid", "y2k", "clay"].includes(direction) || stats;
        const inset = direction === "monochrome" ? 0 : 28;
        const alignment = centered ? "center" : "left";
        place(
          label,
          r.x + inset,
          r.y + 23,
          r.w - inset * 2,
          80,
          direction === "monochrome" ? 94 : 42,
          { textAlign: alignment, color: "accent" },
        );
        place(
          head,
          r.x + inset,
          r.y + (stats ? 55 : 105),
          r.w - inset * 2,
          stats ? 160 : 105,
          stats ? 118 : direction === "monochrome" ? 44 : 36,
          { textAlign: alignment, letterSpacing: -1 },
        );
        place(
          body,
          r.x + inset,
          r.y + (stats ? 235 : 230),
          r.w - inset * 2,
          r.h - (stats ? 245 : 240),
          slots === 4 ? 22 : 25,
          { textAlign: alignment },
        );
      }
    });
    const icons = elements.filter((el) => el.type === "icon");
    if (team)
      icons.forEach((el, i) => {
        const r = regions[i];
        if (r) {
          const horizontal = [
            "rage",
            "future",
            "terminal",
            "material",
          ].includes(direction);
          place(
            el,
            horizontal ? r.x + 24 : r.x + r.w / 2 - 40,
            r.y + 20,
            65,
            65,
            24,
          );
          if (horizontal && subheads[i]) {
            subheads[i].x = r.x + 110;
            subheads[i].width = 320;
          }
        }
      });
    if (slide.layout === "timeline") {
      regions.forEach((r, i) => {
        const horizontal = ["rage", "future", "terminal", "material"].includes(
          direction,
        );
        if (horizontal) {
          const color =
            direction === "rage" || (direction === "material" && i % 2 === 0)
              ? "background"
              : "foreground";
          place(labels[i], r.x + 20, r.y + 12, 130, 40, 20, { color });
          place(subheads[i], r.x + 160, r.y + 13, 285, r.h - 20, 29, { color });
          place(
            bodies[i],
            direction === "material" ? (i % 2 ? 65 : 855) : r.x + 485,
            r.y + 12,
            direction === "material" ? 340 : r.w - 510,
            r.h - 20,
            22,
            { color: direction === "material" ? "foreground" : color },
          );
        } else {
          place(labels[i], r.x + 20, r.y + 20, r.w - 40, 66, 20);
          place(subheads[i], r.x + 20, r.y + 100, r.w - 40, 100, 30);
          place(
            bodies[i],
            r.x + 20,
            r.y + 220,
            r.w - 40,
            Math.max(90, r.h - 230),
            22,
          );
        }
      });
    }
    if (comparison && direction === "monochrome" && subheads[1] && bodies[1]) {
      // One comparison actually changes polarity, rather than repeating two bordered cards.
      art.splice(0, art.length);
      shape(640, 0, 640, 720, { fill: "foreground" });
      place(main, 65, 50, 520, 145, 75, { letterSpacing: -3 });
      place(subheads[0], 65, 274, 500, 100, 50);
      place(bodies[0], 65, 414, 500, 220, 28);
      place(subheads[1], 720, 170, 480, 125, 55, { color: "background" });
      place(bodies[1], 720, 345, 480, 240, 28, { color: "background" });
    }
    if (comparison && direction === "rage") {
      place(main, 52, 65, 340, 570, 105, {
        lineHeight: 0.9,
        letterSpacing: -2,
      });
      regions.forEach((r, i) => {
        const y = 65 + i * 305;
        const card = art[i];
        if (card) Object.assign(card, { x: 425, y, width: 800, height: 265 });
        place(subheads[i], 465, y + 25, 710, 85, 58, { color: "background" });
        place(bodies[i], 470, y + 126, 700, 120, 30, { color: "background" });
      });
    }
    if (stats)
      labels.forEach((el) => {
        el.hidden = true;
      });
  }
  // Generated cards can omit their subheading. Give that space to real supporting
  // copy rather than forcing it into a small caption box below an empty title.
  subheads.forEach((heading, i) => {
    const body = bodies[i];
    if (heading.text?.trim() || !body?.text?.trim()) return;
    if (direction === "material") {
      place(body, heading.x, heading.y, heading.width, heading.height, 25, {
        color: heading.color,
      });
    } else if (
      ["rage", "future"].includes(direction) &&
      !["two-column"].includes(slide.layout)
    ) {
      const right = body.x + body.width;
      body.x = heading.x;
      body.width = right - body.x;
    } else if (body.y > heading.y) {
      body.height += body.y - heading.y;
      body.y = heading.y;
    }
  });
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
