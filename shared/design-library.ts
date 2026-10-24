import { z } from "zod";
import { themeSchema } from "./schema";

export const brandKitSchema = z.object({
  name: z.string().trim().min(1).max(80),
  colors: themeSchema.shape.colors,
  headingFont: themeSchema.shape.headingFont,
  bodyFont: themeSchema.shape.bodyFont,
  rules: z.string().max(4000),
  logo: z
    .object({
      src: z.string().regex(/^\/api\/assets\/[a-zA-Z0-9-]+$/),
      alt: z.string().trim().min(1).max(1000),
    })
    .nullable(),
});
export type BrandKit = z.infer<typeof brandKitSchema>;
export type SavedTheme = {
  id: string;
  theme: z.infer<typeof themeSchema>;
  revision: number;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};
export type SavedBrandKit = {
  id: string;
  kit: BrandKit;
  revision: number;
  createdAt: string;
  updatedAt: string;
  canEdit: boolean;
};

export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const v = hex
      .slice(1)
      .match(/../g)!
      .map((c) => parseInt(c, 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  };
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
export function contrastIssues(colors: BrandKit["colors"]): string[] {
  return (
    [
      ["foreground", "background"],
      ["secondary", "background"],
      ["muted", "background"],
      ["accent", "background"],
      ["foreground", "surface"],
    ] as const
  )
    .filter(([a, b]) => contrast(colors[a], colors[b]) < 4.5)
    .map(([a, b]) => `${a} on ${b}`);
}
export function readablePalette(
  colors: BrandKit["colors"],
): BrandKit["colors"] {
  const result = { ...colors };
  const best = (bg: string) =>
    contrast("#ffffff", bg) >= contrast("#000000", bg) ? "#ffffff" : "#000000";
  for (const key of ["foreground", "secondary", "muted", "accent"] as const)
    if (contrast(result[key], result.background) < 4.5)
      result[key] = best(result.background);
  if (contrast(result.foreground, result.surface) < 4.5)
    result.surface = result.background;
  return result;
}
