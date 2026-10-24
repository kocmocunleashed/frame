import { expect, test } from "bun:test";
import { zipSync, strToU8 } from "fflate";
import { extractContent, SOURCE_TEXT_LIMIT } from "../server/extract-core";
import { extractFile } from "../server/extract";
function pdf(text: string) {
  const parts = ["%PDF-1.4\n"];
  const offsets = [0];
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R >>`,
    `<< /Type /Pages /Kids [3 0 R] /Count 1 >>`,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`,
  ];
  const stream = `BT /F1 24 Tf 50 700 Td (${text}) Tj ET`;
  objects.push(
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  );
  for (const [i, obj] of objects.entries()) {
    offsets.push(Buffer.byteLength(parts.join("")));
    parts.push(`${i + 1} 0 obj\n${obj}\nendobj\n`);
  }
  const xref = Buffer.byteLength(parts.join(""));
  parts.push(
    `xref\n0 6\n0000000000 65535 f \n${offsets
      .slice(1)
      .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
      .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`,
  );
  return new Uint8Array(Buffer.from(parts.join("")));
}
function docx(text: string) {
  return zipSync({
    "[Content_Types].xml": strToU8(
      '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    ),
    "_rels/.rels": strToU8(
      '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    ),
    "word/document.xml": strToU8(
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`,
    ),
  });
}
test("UTF-8 text and Markdown are extracted with explicit truncation and encoding limits", async () => {
  expect(
    (await extractContent(strToU8("# Topic\nUseful material."), "notes.md"))
      .text,
  ).toBe("# Topic\nUseful material.");
  const large = await extractContent(
    strToU8("x".repeat(SOURCE_TEXT_LIMIT + 100)),
    "notes.txt",
  );
  expect(large.text.length).toBe(SOURCE_TEXT_LIMIT);
  expect(large.warnings.join(" ")).toContain("first 200,000");
  expect(extractContent(new Uint8Array([255, 0]), "notes.txt")).rejects.toThrow(
    "UTF-8",
  );
  expect(extractContent(strToU8("arbitrary"), "bad.exe")).rejects.toThrow(
    "PDF, DOCX",
  );
});
test("DOCX raw text retains source content while warning that layout and images are omitted", async () => {
  const result = await extractContent(
    docx("A source-supported idea."),
    "source.docx",
  );
  expect(result.text).toBe("A source-supported idea.");
  expect(result.warnings.join(" ")).toContain("Text only");
  expect(
    extractContent(zipSync({ "unrelated.txt": strToU8("hello") }), "bad.docx"),
  ).rejects.toThrow("not a Word");
});
test("DOCX expanded content is bounded before conversion", async () => {
  const bytes = zipSync({
    "word/document.xml": new Uint8Array(16 * 1024 * 1024),
  });
  expect(bytes.length).toBeLessThan(100000);
  expect(extractContent(bytes, "compressed.docx")).rejects.toThrow(
    "expanded-document limit",
  );
});
test("PDF text is extracted in an isolated worker with page warnings; source cancellation is honored", async () => {
  const result = await extractFile(
    pdf("A reliable PDF source."),
    "source.pdf",
    new AbortController().signal,
  );
  expect(result.text).toContain("A reliable PDF source.");
  expect(result.pages).toBe(1);
  expect(result.warnings.join(" ")).toContain("text order");
  const controller = new AbortController();
  controller.abort();
  expect(
    extractFile(pdf("Cancelled"), "source.pdf", controller.signal),
  ).rejects.toThrow("cancelled");
});
test("invalid PDFs fail clearly and source worker deadlines terminate expensive extraction", async () => {
  expect(extractContent(strToU8("not a pdf"), "bad.pdf")).rejects.toThrow(
    "not a valid PDF",
  );
  await expect(
    extractFile(pdf("Too slow"), "source.pdf", new AbortController().signal, 1),
  ).rejects.toThrow("exceeded");
});
