import { writeFileSync } from "node:fs";
import { makeDocument, layoutSlide } from "../shared/templates";
import { publicProjection } from "../shared/publications";
import { renderExport } from "../server/render-export";
const doc = makeDocument(
  "qa-owner",
  "qa-workspace",
  "A workshop worth sharing",
  "story",
);
doc.slides = [
  layoutSlide("title", "A workshop worth sharing"),
  layoutSlide("chart", "Learning through practice"),
  layoutSlide("two-column", "Turn feedback into an action"),
];
doc.slides[0].notes = "PRIVATE_EXPORT_QA_NOTE";
const format = process.argv[2] || "pdf";
if (!["pdf", "images", "html", "pptx"].includes(format))
  throw new Error("Invalid format");
const output = await renderExport(
  publicProjection(doc, (id) => `/api/assets/${id}`),
  {},
  format as "pdf" | "images" | "html" | "pptx",
  1,
  {
    signal: AbortSignal.timeout(120000),
    progress: (step, percent) => console.log(JSON.stringify({ step, percent })),
  },
);
const path = `/tmp/frame-export-qa/workshop.${output.extension}`;
writeFileSync(path, output.bytes);
console.log(
  JSON.stringify({
    path,
    bytes: output.bytes.length,
    warnings: output.warnings,
  }),
);
