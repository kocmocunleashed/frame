import { runBrowserTask } from "./browser";
import pptxgen from "pptxgenjs";
import { zipSync } from "fflate";
import type { PublicDocument } from "../shared/publications";
import type { ExportFormat } from "../shared/exports";
import { staticHTML } from "./static-html";
import { JobFailure } from "./jobs";
export type RenderedExport = {
  bytes: Uint8Array;
  mime: string;
  extension: string;
  warnings: string[];
};
export async function renderExport(
  doc: PublicDocument,
  assets: Record<string, string>,
  format: ExportFormat,
  scale: number,
  context: {
    signal: AbortSignal;
    progress: (step: string, percent: number) => void | Promise<void>;
  },
): Promise<RenderedExport> {
  const warnings: string[] = [];
  const raster = format === "images" || format === "pptx";
  const pixels =
      doc.width * doc.height * doc.slides.length * (raster ? scale * scale : 1),
    elements = doc.slides.reduce((n, s) => n + s.elements.length, 0);
  if (elements > 20000 || pixels > 200000000)
    throw new JobFailure(
      "This export exceeds the render limit (20,000 objects or 200 million total pixels). Split the deck or choose a lower image resolution.",
    );
  if (format !== "html") {
    warnings.push(
      "Static export: animations, live answers and interaction controls are flattened. All presentation steps are visible.",
    );
    if (doc.slides.some((s) => s.elements.some((e) => e.type === "video")))
      warnings.push(
        "Videos appear as their poster image or a labeled placeholder.",
      );
  }
  if (
    doc.themes.some((t) =>
      [t.headingFont, t.bodyFont].some(
        (f) => f === "Georgia" || f === "Courier New",
      ),
    )
  )
    warnings.push(
      "System fonts use the export server’s installed fallback when the named font is unavailable. Use bundled fonts for consistent metrics.",
    );
  await context.progress("Preparing shared slide rendering", 15);
  const html = await staticHTML(doc, assets, format === "html");
  if (context.signal.aborted) throw new JobFailure("Export cancelled.");
  if (format === "html")
    return {
      bytes: new TextEncoder().encode(html),
      mime: "text/html; charset=utf-8",
      extension: "html",
      warnings: [
        ...warnings,
        "Private notes and hidden answer keys are excluded. Live audience participation requires a hosted session.",
      ],
    };
  await context.progress("Starting export browser", 16);
  const rendered = await runBrowserTask(
    {
      html,
      width: doc.width,
      height: doc.height,
      format: format === "pdf" ? "pdf" : "images",
      scale: raster ? scale : 1,
    },
    context.signal,
    context.progress,
  );
  if (format === "pdf")
    return {
      bytes: rendered.files[0],
      mime: "application/pdf",
      extension: "pdf",
      warnings,
    };
  const images = rendered.files;
  await context.progress("Packaging download", 92);
  if (format === "images") {
    const entries = Object.fromEntries(
      images.map((bytes, i) => [
        `slide-${String(i + 1).padStart(3, "0")}.png`,
        bytes,
      ]),
    );
    return {
      bytes: zipSync(entries, { level: 0 }),
      mime: "application/zip",
      extension: "zip",
      warnings,
    };
  }
  const pptx = new pptxgen();
  pptx.defineLayout({
    name: "FRAME",
    width: doc.width / 96,
    height: doc.height / 96,
  });
  pptx.layout = "FRAME";
  pptx.title = doc.title;
  pptx.author = "Frame";
  pptx.subject = "Image-based PowerPoint export. Slide objects are flattened.";
  pptx.company = "Frame";
  for (const image of images)
    pptx.addSlide().addImage({
      data: `image/png;base64,${Buffer.from(image).toString("base64")}`,
      x: 0,
      y: 0,
      w: doc.width / 96,
      h: doc.height / 96,
    });
  const output = await pptx.write({
    outputType: "arraybuffer",
    compression: true,
  });
  return {
    bytes: new Uint8Array(output as ArrayBuffer),
    mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extension: "pptx",
    warnings: [
      ...warnings,
      "Image-based PowerPoint: text, charts, shapes and tables are pictures, not editable PowerPoint objects.",
    ],
  };
}
