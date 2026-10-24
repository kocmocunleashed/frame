import mammoth from "mammoth";
import { unzipSync } from "fflate";
export type ExtractedSource = {
  text: string;
  warnings: string[];
  pages?: number;
};
export const SOURCE_FILE_LIMIT = 10 * 1024 * 1024,
  SOURCE_TEXT_LIMIT = 200000;
function bound(
  text: string,
  warnings: string[],
  pages?: number,
): ExtractedSource {
  const clean = text.replace(/\u0000/g, "").trim();
  if (clean.length > SOURCE_TEXT_LIMIT)
    warnings.push(
      `Only the first ${SOURCE_TEXT_LIMIT.toLocaleString()} characters were extracted. Split this source to include more.`,
    );
  if (!clean)
    warnings.push(
      "No readable text was found. If this is a scanned document, use OCR first or paste its text.",
    );
  return { text: clean.slice(0, SOURCE_TEXT_LIMIT), warnings, pages };
}
export async function extractContent(
  bytes: Uint8Array,
  name: string,
): Promise<ExtractedSource> {
  if (!bytes.length || bytes.length > SOURCE_FILE_LIMIT)
    throw new Error("Upload a non-empty document smaller than 10 MB.");
  const ext = name.toLowerCase().split(".").pop();
  if (["txt", "md", "markdown", "csv"].includes(ext || "")) {
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error(
        "This text file is not valid UTF-8. Save it as UTF-8 and upload it again.",
      );
    }
    if (text.includes("\0"))
      throw new Error(
        "This file contains binary data. Upload a UTF-8 text file instead.",
      );
    return bound(
      text,
      ext === "csv"
        ? ["CSV is read as text. Review its columns before generation."]
        : [],
    );
  }
  if (ext === "docx") {
    let entries = 0,
      total = 0,
      documentFound = false;
    try {
      unzipSync(bytes, {
        filter: (file) => {
          entries++;
          total += file.originalSize;
          if (
            entries > 1000 ||
            !Number.isSafeInteger(total) ||
            total > 30 * 1024 * 1024 ||
            file.originalSize > 15 * 1024 * 1024
          )
            throw new Error("expanded-limit");
          if (file.name === "word/document.xml") documentFound = true;
          return false;
        },
      });
    } catch {
      throw new Error(
        "This DOCX is damaged or exceeds the expanded-document limit (30 MB, 1,000 files). Export a smaller document or paste its text.",
      );
    }
    if (!documentFound)
      throw new Error(
        "This file is not a Word DOCX document. Export it as DOCX or plain text.",
      );
    try {
      const result = await mammoth.extractRawText({
        buffer: Buffer.from(bytes),
      });
      return bound(result.value, [
        "Text only: images, complex tables, layout, comments and formatting are not retained.",
        ...result.messages.slice(0, 12).map((m) => m.message.slice(0, 300)),
      ]);
    } catch {
      throw new Error(
        "This DOCX could not be read. Export an unencrypted copy or paste its text.",
      );
    }
  }
  if (ext === "pdf") {
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
      throw new Error("This file is not a valid PDF.");
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: new Uint8Array(bytes),
      disableFontFace: true,
      useSystemFonts: true,
      verbosity: 0,
      stopAtErrors: true,
    });
    try {
      const doc = await task.promise;
      if (doc.numPages > 80)
        throw new Error(
          "This PDF exceeds the 80-page limit. Split it before uploading.",
        );
      let text = "";
      const warnings = [
        "PDF text order can differ from its visual layout. Review tables, columns and equations.",
      ];
      let blank = 0;
      for (let page = 1; page <= doc.numPages; page++) {
        const p = await doc.getPage(page),
          content = await p.getTextContent();
        const line = content.items
          .map((item) =>
            "str" in item
              ? item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ")
              : "",
          )
          .join("");
        if (!line.trim()) blank++;
        text += `\n[Page ${page}]\n${line}`;
        p.cleanup();
        if (text.length > SOURCE_TEXT_LIMIT) {
          warnings.push(
            `Extraction stopped after page ${page} at the text limit.`,
          );
          break;
        }
      }
      if (blank)
        warnings.push(
          `${blank} page(s) had no readable text. Scans and image-only pages need OCR or pasted text.`,
        );
      const result = bound(text, warnings, doc.numPages);
      if (text.replace(/\[Page \d+\]/g, "").trim() === "") result.text = "";
      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes("80-page"))
        throw error;
      throw new Error(
        error instanceof Error &&
          /password/i.test(error.name + " " + error.message)
          ? "This PDF is password protected. Upload an unlocked copy."
          : "This PDF could not be read. Export a new copy or paste its text.",
      );
    } finally {
      await task.destroy();
    }
  }
  throw new Error("Use a PDF, DOCX, TXT, Markdown or CSV document.");
}
