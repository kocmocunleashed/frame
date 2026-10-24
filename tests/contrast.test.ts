import { test, expect } from "bun:test";
import { THEMES } from "../shared/themes";
import { themeSchema } from "../shared/schema";
function luminance(hex: string) {
  const [r, g, b] = hex
    .slice(1)
    .match(/../g)!
    .map((s) => parseInt(s, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
test("curated theme text roles meet AA contrast on their base backgrounds", () => {
  for (const t of THEMES) {
    expect(
      contrast(t.colors.foreground, t.colors.background),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(t.colors.muted, t.colors.background),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(t.colors.accent, t.colors.background),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrast(t.colors.foreground, t.colors.surface),
    ).toBeGreaterThanOrEqual(4.5);
  }
});
test("theme palette must contain concrete colors rather than recursive semantic references", () => {
  expect(
    themeSchema.safeParse({
      ...THEMES[0],
      colors: { ...THEMES[0].colors, accent: "accent" },
    }).success,
  ).toBe(false);
});
