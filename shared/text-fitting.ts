import type { FrameElement } from "./schema";
import { richTextPlain, type RichNode } from "./content";
function richSlice(root: RichNode, start: number, end: number): RichNode {
  let cursor = 0;
  function visit(node: RichNode): RichNode | null {
    if (node.type === "text") {
      const text = node.text || "",
        at = cursor;
      cursor += text.length;
      const part = text.slice(
        Math.max(0, start - at),
        Math.max(0, Math.min(text.length, end - at)),
      );
      return part ? { ...node, text: part } : null;
    }
    if (node.type === "hardBreak") {
      const at = cursor++;
      return at >= start && at < end ? node : null;
    }
    const content: RichNode[] = [];
    const separates = ["doc", "bulletList", "orderedList", "listItem"].includes(
      node.type,
    );
    (node.content || []).forEach((child, index) => {
      if (index && separates) cursor++;
      const selected = visit(child);
      if (selected) content.push(selected);
    });
    return content.length ? { ...node, content } : null;
  }
  return visit(root) || { type: "doc", content: [{ type: "paragraph" }] };
}
export function splitTextElement(
  el: FrameElement,
  capacity?: number,
): { text: string; richText?: RichNode }[] {
  const text = el.richText ? richTextPlain(el.richText) : el.text || "",
    size = el.fontSize || el.baseFontSize || 30;
  const max = Math.max(
    30,
    capacity ||
      Math.floor(el.width / (size * 0.55)) *
        Math.max(1, Math.floor(el.height / (size * (el.lineHeight || 1.2)))),
  );
  const chunks: { text: string; richText?: RichNode }[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(text.length, start + max);
    if (end < text.length) {
      const portion = text.slice(start, end),
        newline = portion.lastIndexOf("\n"),
        space = portion.lastIndexOf(" "),
        boundary = newline > max * 0.3 ? newline : space;
      if (boundary > max * 0.25) end = start + boundary + 1;
    }
    chunks.push({
      text: text.slice(start, end),
      ...(el.richText ? { richText: richSlice(el.richText, start, end) } : {}),
    });
    start = end;
  }
  return chunks.length ? chunks : [{ text: "" }];
}
