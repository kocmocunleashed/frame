import {
  uid,
  type FrameDocument,
  type FrameElement,
  type Slide,
  type Theme,
} from "./schema";
import { composeSlide } from "./art-direction";
import { THEMES } from "./themes";
import { newElement } from "./operations";
const text = (
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  size: number,
  role: "heading" | "body" | "label" = "body",
  extra: Partial<FrameElement> = {},
) =>
  newElement("text", {
    text,
    name: text.slice(0, 40),
    x,
    y,
    width,
    height,
    baseFontSize: size,
    role,
    ...extra,
  });
const shape = (
  x: number,
  y: number,
  width: number,
  height: number,
  extra: Partial<FrameElement> = {},
) => newElement("shape", { x, y, width, height, ...extra });
export const LAYOUTS = [
  { id: "blank", name: "Blank" },
  { id: "title", name: "Title & subtitle" },
  { id: "section", name: "Section break" },
  { id: "two-column", name: "Comparison" },
  { id: "quote", name: "Quote" },
  { id: "statistics", name: "Statistics" },
  { id: "process", name: "Process" },
  { id: "summary", name: "Summary & next steps" },
  { id: "text-image", name: "Text & image" },
  { id: "chart", name: "Chart & insight" },
  { id: "timeline", name: "Timeline" },
  { id: "team", name: "Team" },
  { id: "questions", name: "Audience question" },
];
export function layoutSlide(
  layout = "title",
  title?: string,
  width = 1280,
  height = 720,
  theme?: Theme,
): Slide {
  let elements: FrameElement[] = [];
  switch (layout) {
    case "title":
      elements = [
        text(title || "Your next big idea.", 72, 135, 1000, 250, 88, "heading"),
        text("A clear story. A fresh perspective.", 78, 442, 900, 80, 30),
        shape(78, 580, 160, 8),
        text("Made with Frame", 78, 622, 800, 30, 18, "label"),
      ];
      break;
    case "section":
      elements = [
        text("A fresh perspective", 74, 84, 1000, 70, 24, "label", {
          color: "accent",
        }),
        text(
          title || "Let’s look at it differently.",
          74,
          225,
          1050,
          300,
          90,
          "heading",
        ),
        shape(1100, 575, 92, 92, { shape: "circle" }),
      ];
      break;
    case "two-column":
      elements = [
        text(title || "Two ways forward.", 72, 58, 1100, 95, 60, "heading"),
        shape(72, 210, 550, 410, { fill: "surface" }),
        shape(652, 210, 550, 410, { fill: "surface" }),
        text("Today", 104, 245, 460, 75, 42, "heading"),
        text(
          "Describe the current situation.\n\nWhat is working? What could be better?",
          104,
          345,
          450,
          220,
          28,
        ),
        text("Tomorrow", 685, 245, 460, 75, 42, "heading"),
        text(
          "Describe a better possibility.\n\nWhat will change? Why does it matter?",
          685,
          345,
          450,
          220,
          28,
        ),
      ];
      break;
    case "quote":
      elements = [
        text("“", 65, 50, 150, 170, 160, "heading", { color: "accent" }),
        text(
          title ||
            "Add a quotation from your source.",
          85,
          217,
          1070,
          290,
          64,
          "heading",
        ),
        text("— Add an attribution", 89, 567, 900, 54, 25),
      ];
      break;
    case "statistics":
      elements = [
        text(
          title || "The story in numbers.",
          72,
          60,
          1100,
          100,
          60,
          "heading",
        ),
        ...[
          ["01", "A key observation"],
          ["02", "A meaningful insight"],
          ["03", "A clear next step"],
        ].flatMap(([n, label], i) => [
          text(n, 76 + i * 400, 265, 340, 150, 106, "heading", {
            color: "accent",
          }),
          text(label, 80 + i * 400, 445, 330, 100, 28),
        ]),
        text(
          "Replace these illustrative values with your own data.",
          80,
          638,
          1100,
          30,
          18,
          "label",
        ),
      ];
      break;
    case "process":
      elements = [
        text(title || "From idea to action.", 72, 60, 1100, 100, 62, "heading"),
        ...[
          ["Explore", "Start with a useful question."],
          ["Shape", "Make the story your own."],
          ["Share", "Bring everyone into the room."],
        ].flatMap(([head, body], i) => [
          shape(76 + i * 400, 240, 340, 385, { fill: "surface" }),
          text(`${i + 1}`, 103 + i * 400, 270, 270, 65, 30, "label", {
            color: "accent",
          }),
          text(head, 103 + i * 400, 350, 275, 90, 36, "heading"),
          text(body, 103 + i * 400, 445, 270, 150, 25),
        ]),
      ];
      break;
    case "summary":
      elements = [
        shape(1000, -100, 500, 500, { shape: "circle", fill: "surface" }),
        text(title || "Make it happen.", 72, 130, 1050, 180, 90, "heading"),
        text(
          "One idea to remember.\nOne action to take.\nOne conversation to start.",
          80,
          355,
          1000,
          200,
          34,
        ),
        text("Thank you. Let’s talk.", 80, 624, 1000, 40, 23, "label", {
          color: "accent",
        }),
      ];
      break;
    case "chart":
      elements = [
        text(
          title || "A clearer view of the data.",
          72,
          55,
          1100,
          95,
          58,
          "heading",
        ),
        newElement("chart", { x: 80, y: 205, width: 1100, height: 390 }),
        text(
          "Illustrative data — replace with your own values.",
          80,
          650,
          1100,
          30,
          18,
          "label",
        ),
      ];
      break;
    case "timeline":
      elements = [
        text(title || "A story, over time.", 72, 55, 1100, 100, 62, "heading"),
        shape(140, 345, 1000, 5, { fill: "muted" }),
        ...["Begin", "Explore", "Build", "Launch"].flatMap((label, i) => [
          shape(120 + i * 300, 330, 32, 32, { shape: "circle" }),
          text(
            "Milestone " + (i + 1),
            90 + i * 300,
            245,
            250,
            50,
            22,
            "label",
            { color: "accent" },
          ),
          text(label, 90 + i * 300, 400, 250, 75, 38, "heading"),
          text("Add a date and a key moment.", 90 + i * 300, 493, 245, 100, 25),
        ]),
      ];
      break;
    case "team":
      elements = [
        text(
          title || "Meet the people behind it.",
          72,
          55,
          1100,
          95,
          60,
          "heading",
        ),
        ...[0, 1, 2].flatMap((i) => [
          shape(150 + i * 390, 230, 180, 180, {
            shape: "circle",
            fill: "surface",
          }),
          newElement("icon", {
            x: 195 + i * 390,
            y: 275,
            width: 90,
            height: 90,
            icon: "users",
            color: "muted",
          }),
          text("Your name", 95 + i * 390, 460, 300, 65, 34, "heading", {
            textAlign: "center",
          }),
          text(
            "Role & a little context",
            95 + i * 390,
            540,
            300,
            60,
            24,
            "body",
            { textAlign: "center" },
          ),
        ]),
      ];
      break;
    case "questions":
      elements = [
        text(
          title || "Let’s hear from the room.",
          72,
          55,
          1100,
          100,
          58,
          "heading",
        ),
        newElement("question", { x: 84, y: 225, width: 1100, height: 400 }),
      ];
      break;
    case "text-image":
      elements = [
        text(
          title || "Show the whole picture.",
          72,
          105,
          550,
          200,
          66,
          "heading",
        ),
        text(
          "Use a strong image to bring your point to life. Add context here.",
          78,
          355,
          520,
          190,
          30,
        ),
        newElement("image", {
          x: 680,
          y: 70,
          width: 525,
          height: 580,
          name: "Image frame",
          alt: "",
          fit: "cover",
        }),
      ];
      break;
  }
  elements = elements.map((el) => ({
    ...el,
    ...(el.type === "shape" &&
    (el.x < 0 || el.y < 0 || el.x + el.width > 1280 || el.y + el.height > 720)
      ? { accessibility: { decorative: true } }
      : {}),
  }));
  if (width !== 1280 || height !== 720) {
    const sx = width / 1280,
      sy = height / 720;
    elements = elements.map((el) => ({
      ...el,
      x: el.x * sx,
      y: el.y * sy,
      width: Math.max(5, el.width * sx),
      height: Math.max(5, el.height * sy),
      ...(el.baseFontSize
        ? {
            baseFontSize: Math.max(
              8,
              Math.min(300, el.baseFontSize * Math.min(sx, sy)),
            ),
          }
        : {}),
    }));
  }
  return composeSlide(
    {
      id: uid(),
      title:
        title || LAYOUTS.find((l) => l.id === layout)?.name || "Untitled slide",
      layout,
      notes: "",
      elements,
      interactions: [],
    },
    theme,
    width,
    height,
  );
}
export function makeDocument(
  ownerId: string,
  workspaceId: string,
  title = "Untitled presentation",
  template = "blank",
  themeId = "studio",
): FrameDocument {
  const slides =
    template === "blank"
      ? [layoutSlide("blank", "Untitled slide")]
      : template === "lesson"
        ? [
            layoutSlide("title", "Something worth learning."),
            layoutSlide("section", "Start with a question."),
            layoutSlide("two-column", "Connect the ideas."),
            layoutSlide("process", "Try it together."),
            layoutSlide("questions", "Check your understanding."),
            layoutSlide("summary", "What will you take away?"),
          ]
        : template === "pitch"
          ? [
              layoutSlide("title", "A better way forward."),
              layoutSlide("two-column", "The problem. The possibility."),
              layoutSlide("process", "How it comes together."),
              layoutSlide("statistics", "What matters most."),
              layoutSlide("summary", "Let’s build what’s next."),
            ]
          : [
              layoutSlide("title", "A little less noise.\nA lot more impact."),
              layoutSlide("section", "Give your idea room to breathe."),
              layoutSlide("process", "Three steps to a clearer story."),
              layoutSlide("summary", "Ready for the room."),
            ];
  if (template === "story") {
    slides[0].elements = [
      shape(967, -170, 540, 540, { shape: "circle", fill: "accent" }),
      text(
        "A little less noise.\nA lot more impact.",
        76,
        165,
        1090,
        260,
        88,
        "heading",
      ),
      text("A small guide to telling a clearer story.", 82, 476, 1000, 70, 29),
      text(
        "An editable sample · Make it yours",
        82,
        635,
        1000,
        30,
        18,
        "label",
      ),
    ];
    slides[0].notes =
      "Welcome. This sample is a guide to Frame. Every piece of this slide can be selected and edited. Try changing the title or applying a theme.";
  }
  const now = new Date().toISOString();
  return {
    version: 2,
    id: uid(),
    ownerId,
    workspaceId,
    title,
    width: 1280,
    height: 720,
    themeId,
    themes: structuredClone(THEMES),
    slides,
    revision: 0,
    createdAt: now,
    updatedAt: now,
    folderId: null,
    status: "active",
    description: "",
    language: "English",
  };
}
