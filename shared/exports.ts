import { z } from "zod";
export const exportRequestSchema = z.object({
  format: z.enum(["pdf", "images", "html", "pptx"]),
  scale: z.union([z.literal(0.5), z.literal(1), z.literal(2)]).default(1),
  baseRevision: z.number().int().min(0),
  key: z.string().min(8).max(100),
});
export type ExportFormat = z.infer<typeof exportRequestSchema>["format"];
export type ExportResult = {
  storageKey: string;
  filename: string;
  mime: string;
  bytes: number;
  format: ExportFormat;
  warnings: string[];
};
export const EXPORT_FORMATS = [
  {
    id: "pdf",
    name: "PDF",
    description:
      "A static document. Live interactions and video playback are flattened.",
  },
  {
    id: "images",
    name: "Slide images",
    description: "One PNG per slide, in a ZIP file. All reveals are visible.",
  },
  {
    id: "html",
    name: "Standalone HTML",
    description:
      "An offline player with embedded media and fonts. Private notes and answer keys are excluded; live participation needs a hosted session.",
  },
  {
    id: "pptx",
    name: "Image-based PowerPoint",
    description:
      "Each slide is a single picture. Text, shapes and charts are not editable in PowerPoint. Interactions and media are flattened.",
  },
] as const;
