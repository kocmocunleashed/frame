import { z } from "zod";
import { themeSchema } from "./schema";
import { ICON_NAMES } from "./content";
import { webUrlSchema } from "./ai-research";
import { AGENT_MARKDOWN_LIMIT, languageSchema } from "./agent";
export const briefSchema = z.object({
  topic: z.string().trim().min(3).max(4000),
  audience: z.string().max(300).default("General audience"),
  outcome: z.string().max(1000).default("Explain the main ideas clearly"),
  slideCount: z.number().int().min(3).max(30).default(8),
  language: languageSchema.default("English"),
  agentMarkdown: z.string().max(AGENT_MARKDOWN_LIMIT).optional(),
  tone: z.string().max(100).default("Clear and confident"),
  requirements: z.string().max(2000).default(""),
  sourceIds: z.array(z.string().min(1).max(100)).max(10).default([]),
  webSearch: z.boolean().optional(),
});
export type CreationBrief = z.infer<typeof briefSchema>;
export const aiLayoutSchema = z.enum([
  "title",
  "section",
  "two-column",
  "quote",
  "statistics",
  "process",
  "summary",
  "text-image",
  "chart",
  "timeline",
  "team",
  "questions",
]);
const outlineItemSchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().max(800),
  layout: aiLayoutSchema,
});
export const outlineResponseSchema = z.object({
  title: z.string().min(1).max(200),
  sections: z.array(outlineItemSchema).min(3).max(30),
});
export const outlineResponseFor = (count: number) =>
  outlineResponseSchema.extend({
    sections: z
      .array(
        outlineItemSchema.extend({
          layout: aiLayoutSchema.exclude(["text-image"]),
        }),
      )
      .length(count),
  });
export const outlineSchema = z.object({
  title: z.string().min(1).max(200),
  sections: z
    .array(outlineItemSchema.extend({ id: z.string().min(1).max(100) }))
    .min(1)
    .max(30),
});
export type Outline = z.infer<typeof outlineSchema>;
export const visualPlanSchema = z.object({
  kind: z.enum(["cards", "comparison", "timeline", "diagram", "table"]),
  arrangement: z.enum(["process", "cycle", "hierarchy"]),
  items: z
    .array(
      z.object({
        label: z.string().min(1).max(36),
        claimIndex: z.number().int().min(0).max(7),
        icon: z.enum(ICON_NAMES),
        shape: z.enum([
          "rounded",
          "circle",
          "polygon",
          "blob",
          "rectangle",
          "bubble",
          "arrow",
        ]),
      }),
    )
    .min(2)
    .max(4),
});
export type VisualPlan = z.infer<typeof visualPlanSchema>;
const generatedSlideBaseSchema = z.object({
  title: z.string().min(1).max(160),
  layout: aiLayoutSchema,
  headline: z.string().min(1).max(300),
  claims: z
    .array(
      z.object({
        text: z.string().min(1).max(1200),
        sourceId: z.string().max(100).nullable(),
      }),
    )
    .min(1)
    .max(8),
  labels: z.array(z.string().max(200)).max(8),
  data: z
    .array(
      z.object({
        label: z.string().min(1).max(100),
        value: z.number().finite().min(0).max(1e12),
      }),
    )
    .max(12),
  visual: visualPlanSchema.nullable().optional(),
  notes: z.string().max(5000),
  question: z
    .object({
      kind: z.enum(["multiple-choice", "poll", "true-false"]),
      prompt: z.string().min(1).max(2000),
      options: z.array(z.string().min(1).max(500)).min(2).max(8),
      correctIndex: z.number().int().min(0).max(7).nullable(),
      explanation: z.string().max(3000).nullable(),
    })
    .nullable(),
});
// Content budgets match the shipped editable layouts; detail belongs in notes.
const layoutBudgets: Record<
  z.infer<typeof aiLayoutSchema>,
  { min: number; max: number; copy: number; labels?: number }
> = {
  title: { min: 1, max: 1, copy: 240 },
  section: { min: 1, max: 1, copy: 180 },
  "two-column": { min: 1, max: 4, copy: 160 },
  quote: { min: 1, max: 1, copy: 120 },
  statistics: { min: 1, max: 3, copy: 140 },
  process: { min: 3, max: 3, copy: 120, labels: 3 },
  summary: { min: 1, max: 3, copy: 140 },
  "text-image": { min: 1, max: 2, copy: 140 },
  chart: { min: 1, max: 1, copy: 140 },
  timeline: { min: 4, max: 4, copy: 100, labels: 4 },
  team: { min: 3, max: 3, copy: 60, labels: 3 },
  questions: { min: 1, max: 1, copy: 140 },
};
const slideVariants = aiLayoutSchema.options.map((layout) => {
  const budget = layoutBudgets[layout];
  const labels = z
    .array(
      z
        .string()
        .min(1)
        .max(budget.labels ? 32 : 60),
    )
    .max(8);
  return generatedSlideBaseSchema.extend({
    layout: z.literal(layout),
    headline: z
      .string()
      .min(1)
      .max(layout === "quote" ? 350 : 140),
    claims: z
      .array(
        generatedSlideBaseSchema.shape.claims.element.extend({
          text: z.string().min(1).max(budget.copy),
        }),
      )
      .min(budget.min)
      .max(budget.max),
    labels: budget.labels ? labels.length(budget.labels) : labels,
    question: generatedSlideBaseSchema.shape.question
      .unwrap()
      .extend({
        prompt: z.string().min(1).max(200),
        options: z.array(z.string().min(1).max(100)).min(2).max(4),
      })
      .nullable(),
  });
});
export const generatedSlideSchema = z.discriminatedUnion("layout", [
  slideVariants[0],
  ...slideVariants.slice(1),
]);
export const deckResponseSchema = z.object({
  title: z.string().min(1).max(200),
  slides: z.array(generatedSlideSchema).min(1).max(30),
});
export const deckResponseFor = (count: number) =>
  deckResponseSchema.extend({
    slides: deckResponseSchema.shape.slides.length(count),
  });
// Accept legacy quote fields in callers; new model responses do not request them.
export type GeneratedSlide = Omit<
  z.infer<typeof generatedSlideSchema>,
  "claims"
> & {
  claims: (z.infer<typeof generatedSlideSchema>["claims"][number] & {
    quote?: string | null;
  })[];
};
export type SourceRecord = {
  id: string;
  name: string;
  url?: string;
  mime: string;
  text: string;
  warnings: string[];
  status: "ready" | "queued" | "running" | "failed" | "cancelled";
  error: string | null;
  jobId: string | null;
  createdAt: string;
};
export type AIJob = {
  completedSlides?: number;
  totalSlides?: number;
  previewRevision?: number;
  reviewedSlides?: number;
  webResearch?: boolean;
  id: string;
  presentationId: string | null;
  kind: string;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  progress: { step: string; percent: number };
  result: unknown;
  error: string | null;
  attempts: number;
  createdAt: string;
  updatedAt: string;
};
export const sourceInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(200000),
});
export const evidenceSchema = z.object({
  sourceId: z.string().min(1).max(100),
  sourceName: z.string().max(200),
  url: webUrlSchema.optional(),
  quote: z.string().min(1).max(1600).optional(),
  claim: z.string().min(1).max(1200),
});

export const draftDataSchema = z.object({
  brief: briefSchema.extend({
    topic: z.string().max(4000),
    language: z.string().max(60).default("English"),
  }),
  theme: themeSchema,
  outline: outlineSchema.nullable(),
  quickDraft: z.boolean(),
  outlineJobId: z.string().nullable(),
  generationJobId: z.string().nullable(),
});
export type DraftData = z.infer<typeof draftDataSchema>;
export type CreationDraft = {
  id: string;
  revision: number;
  data: DraftData;
  createdAt: string;
  updatedAt: string;
};

export const editScopeSchema = z.object({
  kind: z.enum(["objects", "slide", "slides", "deck"]),
  slideIds: z.array(z.string().min(1).max(100)).max(200),
  elementIds: z.array(z.string().min(1).max(100)).max(400),
});
export type EditScope = z.infer<typeof editScopeSchema>;
export const editRequestSchema = z.object({
  baseRevision: z.number().int().min(0),
  scope: editScopeSchema,
  instruction: z.string().trim().min(3).max(4000),
  sourceIds: z.array(z.string().min(1).max(100)).max(10),
  key: z.string().min(8).max(100),
  mode: z
    .enum(["edit", "regenerate", "design", "illustrate", "animate"])
    .default("edit"),
  resumeJobId: z.string().min(1).max(100).optional(),
});
export const editResponseSchema = z.object({
  summary: z.string().min(1).max(1000),
  updates: z
    .array(
      z.object({
        slideId: z.string(),
        elementId: z.string(),
        text: z.string().max(30000).nullable(),
        fill: z.string().max(30).nullable(),
        color: z.string().max(30).nullable(),
        x: z.number().min(-4000).max(8000).nullable(),
        y: z.number().min(-4000).max(8000).nullable(),
        width: z.number().min(5).max(8000).nullable(),
        height: z.number().min(5).max(8000).nullable(),
        fontSize: z.number().min(8).max(300).nullable(),
        radius: z.number().min(0).max(400).nullable(),
        opacity: z.number().min(0).max(1).nullable(),
        material: z.enum(["flat", "glass", "paper"]).nullable(),
      }),
    )
    .max(100),
  replacements: z
    .array(z.object({ slideId: z.string(), slide: generatedSlideSchema }))
    .max(30),
  insertions: z
    .array(z.object({ afterSlideId: z.string(), slide: generatedSlideSchema }))
    .max(10),
});
export type EditResponse = z.infer<typeof editResponseSchema>;
export type AIEditResult = {
  summary: string;
  baseRevision: number;
  scope: EditScope;
  operations: import("./schema").Operation[];
  preview: import("./schema").FrameDocument;
};
