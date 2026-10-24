export const HEADING_FONTS = [
  "Manrope",
  "DM Sans",
  "Georgia",
  "Courier New",
  "Barlow Condensed",
  "Space Grotesk",
  "Syne",
  "Fraunces",
  "Nunito",
] as const;
export const BODY_FONTS = ["DM Sans", "Georgia", "Courier New"] as const;
export function fontFamily(font: string): string {
  if (["Manrope", "DM Sans", "Space Grotesk", "Syne", "Nunito"].includes(font))
    return `'${font} Variable', sans-serif`;
  if (font === "Fraunces") return "'Fraunces Variable', serif";
  if (font === "Barlow Condensed") return "'Barlow Condensed', sans-serif";
  return `'${font}', ${font === "Courier New" ? "monospace" : "serif"}`;
}
