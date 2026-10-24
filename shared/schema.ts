import { z } from "zod";
import { webUrlSchema } from "./ai-research";
import { HEADING_FONTS, BODY_FONTS } from "./fonts";
import {
  animationSchema,
  timelineSchema,
  vectorPathSchema,
  motionTypes,
} from "./creative";
import {
  richTextSchema,
  ICON_NAMES,
  tableSchema,
  chartSchema,
  diagramSchema,
  questionSchema,
  safeLink,
} from "./content";

export const uid = () => crypto.randomUUID();
const id = z.string().min(1).max(100);
const color = z
  .string()
  .regex(
    /^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|transparent|foreground|background|accent|secondary|surface|muted)$/,
  );
const paletteColor = z
  .string()
  .regex(
    /^#[0-9a-fA-F]{6}$/,
    "Theme palette colors must be six-digit hex colors.",
  );
const num = (min: number, max: number) => z.number().finite().min(min).max(max);
export const themeSchema = z.object({
  id,
  name: z.string().min(1).max(80),
  family: z.string().max(80),
  description: z.string().max(300),
  colors: z.object({
    background: paletteColor,
    foreground: paletteColor,
    accent: paletteColor,
    secondary: paletteColor,
    surface: paletteColor,
    muted: paletteColor,
  }),
  headingFont: z.enum(HEADING_FONTS),
  bodyFont: z.enum(BODY_FONTS),
  artDirection: z
    .enum([
      "monochrome",
      "rage",
      "liquid",
      "material",
      "future",
      "y2k",
      "nostalgia",
      "clay",
      "terminal",
      "bauhaus",
      "pop",
      "blueprint",
      "deco",
      "memphis",
      "editorial",
      "thinking-space",
      "limbo",
      "sonic-wave",
      "ransom-ink",
      "beatmap",
      "street-radio",
      "save-point",
      "warehouse",
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
    ])
    .optional(),
  artVersion: z.literal(2).optional(),
  headingWeight: num(300, 900),
  typeScale: z
    .object({
      heading: num(0.7, 1.5),
      body: num(0.7, 1.5),
      label: num(0.7, 1.5),
    })
    .optional(),
  radius: num(0, 80),
  borderWidth: num(0, 8),
  spacing: num(8, 100),
  material: z.enum(["flat", "glass", "paper"]),
  background: z.enum(["solid", "glow", "split"]),
  shadow: z.enum(["none", "soft"]),
  motion: z.enum(["none", "fade", "rise"]),
  custom: z.boolean().optional(),
  brandRules: z.string().max(4000).optional(),
});
export type Theme = z.infer<typeof themeSchema>;
export const elementBaseSchema = z.object({
  id,
  type: z.enum([
    "text",
    "shape",
    "image",
    "icon",
    "table",
    "chart",
    "diagram",
    "video",
    "question",
    "timeline",
  ]),
  name: z.string().max(100),
  x: num(-4000, 8000),
  y: num(-4000, 8000),
  width: num(5, 8000),
  height: num(5, 8000),
  rotation: num(-360, 360).default(0),
  opacity: num(0, 1).default(1),
  locked: z.boolean().default(false),
  hidden: z.boolean().default(false),
  groupId: id.optional(),
  text: z.string().max(30000).optional(),
  richText: richTextSchema.optional(),
  link: safeLink.optional(),
  icon: z.enum(ICON_NAMES).optional(),
  table: tableSchema.optional(),
  chart: chartSchema.optional(),
  diagram: diagramSchema.optional(),
  question: questionSchema.optional(),
  timeline: timelineSchema.optional(),
  path: vectorPathSchema.optional(),
  crop: z
    .object({ x: num(0, 100), y: num(0, 100), zoom: num(1, 4) })
    .optional(),
  media: z
    .object({
      autoplay: z.boolean(),
      loop: z.boolean(),
      muted: z.boolean(),
      poster: z
        .string()
        .max(2000)
        .regex(/^\/api\/assets\//)
        .optional(),
    })
    .optional(),
  role: z.enum(["heading", "body", "label"]).optional(),
  baseFontSize: num(8, 300).optional(),
  fontSize: num(8, 300).optional(),
  fontFamily: z.enum(["theme", ...HEADING_FONTS]).optional(),
  fontWeight: num(100, 900).optional(),
  italic: z.boolean().optional(),
  underline: z.boolean().optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  lineHeight: num(0.7, 3).optional(),
  letterSpacing: num(-10, 30).optional(),
  color: color.optional(),
  fill: color.optional(),
  gradient: z.boolean().optional(),
  stroke: color.optional(),
  strokeWidth: num(0, 20).optional(),
  radius: num(0, 400).optional(),
  shadow: z.boolean().optional(),
  material: z.enum(["flat", "glass", "paper"]).optional(),
  shape: z
    .enum([
      "rectangle",
      "rounded",
      "circle",
      "ellipse",
      "triangle",
      "polygon",
      "star",
      "spark",
      "bubble",
      "arrow",
      "blob",
      "line",
      "path",
    ])
    .optional(),
  src: z
    .string()
    .max(2000)
    .refine(
      (v) => v.startsWith("/api/assets/") || /^https:\/\//.test(v),
      "Use an uploaded image or HTTPS image URL.",
    )
    .optional(),
  alt: z.string().max(1000).optional(),
  fit: z.enum(["contain", "cover"]).optional(),
  aspectLocked: z.boolean().optional(),
  animation: animationSchema.optional(),
  accessibility: z
    .object({
      label: z.string().max(1000).optional(),
      decorative: z.boolean().optional(),
    })
    .optional(),
});
export const elementSchema = elementBaseSchema.superRefine((el, ctx) => {
  const field = (
    {
      chart: "chart",
      table: "table",
      diagram: "diagram",
      question: "question",
      timeline: "timeline",
    } as const
  )[el.type as "chart" | "table" | "diagram" | "question" | "timeline"];
  if (el.shape === "path" && (el.type !== "shape" || !el.path))
    ctx.addIssue({
      code: "custom",
      message: "Vector shapes need typed path commands.",
    });
  if (field && !el[field])
    ctx.addIssue({
      code: "custom",
      message: el.type + " objects need valid editable " + field + " data.",
    });
});
export type FrameElement = z.infer<typeof elementSchema>;
export const interactionSchema = z.object({
  id,
  trigger: z.enum(["click", "answer", "step"]),
  target: id,
  action: z.enum(["show", "navigate", "feedback", "animate"]),
  value: z.string().max(2000),
  step: num(0, 100).optional(),
});
export const slideSchema = z.object({
  id,
  title: z.string().max(200),
  layout: z.string().max(50),
  themeId: id.optional(),
  background: color.optional(),
  notes: z.string().max(30000),
  elements: z.array(elementSchema).max(400),
  interactions: z.array(interactionSchema).max(200).default([]),
  sourceSupport: z
    .object({
      reviewRequired: z.boolean().optional(),
      evidence: z
        .array(
          z.object({
            sourceId: id,
            sourceName: z.string().max(200),
            url: webUrlSchema.optional(),
            quote: z.string().min(1).max(1600).optional(),
            claim: z.string().min(1).max(1200),
          }),
        )
        .max(20),
      suggestions: z.array(z.string().max(1200)).max(20),
    })
    .optional(),
});
export type Slide = z.infer<typeof slideSchema>;
export const documentSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    id,
    ownerId: id,
    workspaceId: id,
    title: z.string().min(1).max(200),
    width: num(300, 4000),
    height: num(300, 4000),
    themeId: id,
    themes: z.array(themeSchema).max(100),
    slides: z.array(slideSchema).min(1).max(200),
    revision: num(0, 1e9).int(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    folderId: id.nullable(),
    status: z.enum(["active", "archived", "trashed"]),
    description: z.string().max(2000).default(""),
    language: z.string().max(50).default("English"),
  })
  .superRefine((doc, ctx) => {
    const ids = new Set<string>();
    for (const slide of doc.slides) {
      if (ids.has(slide.id))
        ctx.addIssue({ code: "custom", message: "Slide IDs must be unique." });
      ids.add(slide.id);
      for (const el of slide.elements) {
        if (ids.has(el.id))
          ctx.addIssue({
            code: "custom",
            message: "Element IDs must be globally unique.",
          });
        ids.add(el.id);
      }
    }
    const interactionIds = new Set<string>();
    for (const slide of doc.slides) {
      for (const interaction of slide.interactions) {
        const source = slide.elements.find(
          (el) => el.id === interaction.target,
        );
        const validFlow =
          (interaction.trigger === "click" &&
            ["show", "navigate"].includes(interaction.action)) ||
          (interaction.trigger === "answer" &&
            interaction.action === "feedback") ||
          (interaction.trigger === "step" && interaction.action === "animate");
        if (
          interactionIds.has(interaction.id) ||
          !source ||
          !validFlow ||
          (interaction.action === "navigate" &&
            !doc.slides.some((s) => s.id === interaction.value)) ||
          (interaction.action === "show" &&
            !slide.elements.some((el) => el.id === interaction.value)) ||
          (interaction.action === "feedback" && source.type !== "question") ||
          (interaction.action === "animate" &&
            (interaction.step === undefined ||
              !motionTypes.includes(
                interaction.value as (typeof motionTypes)[number],
              )))
        )
          ctx.addIssue({
            code: "custom",
            message:
              "Interactions need unique IDs, valid trigger/action pairs and existing targets.",
          });
        interactionIds.add(interaction.id);
      }
    }
    const themes = new Set(doc.themes.map((t) => t.id));
    if (
      !themes.has(doc.themeId) ||
      doc.slides.some((s) => s.themeId && !themes.has(s.themeId))
    )
      ctx.addIssue({
        code: "custom",
        message: "Every theme reference must resolve.",
      });
  });
export type FrameDocument = z.infer<typeof documentSchema>;
export type User = {
  id: string;
  name: string;
  email: string;
  workspaceId: string;
};
export type Folder = { id: string; name: string };
export type DeckSummary = Omit<FrameDocument, "slides"> & {
  slideCount: number;
  cover: Slide;
  accessRole?: "owner" | "editor" | "viewer";
};

export const operationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("text.set"),
    slideId: id,
    id,
    text: z.string().max(30000),
    richText: richTextSchema.nullable(),
  }),
  z.object({
    type: z.literal("element.update"),
    slideId: id,
    ids: z.array(id).min(1).max(400),
    patch: elementBaseSchema
      .omit({ id: true, type: true })
      .partial()
      .extend({
        rotation: num(-360, 360).optional(),
        opacity: num(0, 1).optional(),
        locked: z.boolean().optional(),
        hidden: z.boolean().optional(),
      }),
  }),
  z.object({
    type: z.literal("element.reset"),
    slideId: id,
    ids: z.array(id).min(1).max(400),
  }),
  z.object({
    type: z.literal("element.insert"),
    slideId: id,
    elements: z.array(elementSchema).min(1).max(100),
  }),
  z.object({
    type: z.literal("element.delete"),
    slideId: id,
    ids: z.array(id),
  }),
  z.object({ type: z.literal("element.order"), slideId: id, ids: z.array(id) }),
  z.object({
    type: z.literal("slide.insert"),
    slide: slideSchema,
    index: num(0, 200).int(),
  }),
  z.object({ type: z.literal("slide.delete"), slideId: id }),
  z.object({
    type: z.literal("slide.update"),
    slideId: id,
    patch: slideSchema
      .omit({ id: true, elements: true })
      .partial()
      .extend({ interactions: z.array(interactionSchema).max(200).optional() }),
  }),
  z.object({ type: z.literal("slide.order"), ids: z.array(id) }),
  z.object({
    type: z.literal("theme.apply"),
    theme: themeSchema,
    slideIds: z.array(id).optional(),
  }),
  z.object({
    type: z.literal("document.update"),
    patch: z
      .object({
        title: z.string().min(1).max(200),
        folderId: id.nullable(),
        status: z.enum(["active", "archived", "trashed"]),
        width: num(300, 4000),
        height: num(300, 4000),
      })
      .partial(),
  }),
]);
export type Operation = z.infer<typeof operationSchema>;
