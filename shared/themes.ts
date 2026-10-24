import {
  uid,
  themeSchema,
  type Theme,
  type FrameElement,
  type FrameDocument,
} from "./schema";
import { FEATURED_THEMES } from "./featured-themes";
const theme = (
  id: string,
  name: string,
  family: string,
  description: string,
  bg: string,
  fg: string,
  accent: string,
  secondary: string,
  surface: string,
  extra: Partial<Theme> = {},
): Theme => ({
  id,
  name,
  family,
  description,
  colors: {
    background: bg,
    foreground: fg,
    accent,
    secondary,
    surface,
    muted: secondary,
  },
  headingFont: "Manrope",
  bodyFont: "DM Sans",
  headingWeight: 800,
  radius: 12,
  borderWidth: 0,
  spacing: 56,
  material: "flat",
  background: "solid",
  shadow: "none",
  motion: "fade",
  ...extra,
});
export const THEMES: Theme[] = [
  theme(
    "studio",
    "Electric blue",
    "Swiss",
    "Confident type, clean grids, an electric blue stage.",
    "#2347dd",
    "#ffffff",
    "#e6ff74",
    "#c6d2ff",
    "#3659e5",
    { radius: 0, headingWeight: 800 },
  ),
  theme(
    "mono",
    "In black & white",
    "Monochrome",
    "Restrained geometry. Let the words do the work.",
    "#f4f3ef",
    "#20211e",
    "#20211e",
    "#5e6258",
    "#e6e6df",
    { radius: 0, headingWeight: 700 },
  ),
  theme(
    "neon",
    "After hours",
    "Neon",
    "Midnight, electric lime, and a controlled glow.",
    "#14182a",
    "#f5f8ed",
    "#c9ff65",
    "#b3bed4",
    "#252d43",
    { background: "glow", shadow: "soft" },
  ),
  theme(
    "glass",
    "Deep water",
    "Liquid glass",
    "Cyan light and translucent instrument panels.",
    "#102d43",
    "#f0fcff",
    "#83f1dd",
    "#a4ccdf",
    "#254c61",
    { material: "glass", background: "glow", radius: 22, shadow: "soft" },
  ),
  theme(
    "editorial",
    "Sunday paper",
    "Editorial",
    "Paper tones, serif headlines, and decisive red.",
    "#f5eee1",
    "#302d29",
    "#b63724",
    "#716452",
    "#e7dcc9",
    {
      headingFont: "Georgia",
      bodyFont: "Georgia",
      headingWeight: 400,
      radius: 0,
      material: "paper",
    },
  ),
  theme(
    "brutalist",
    "Loud & clear",
    "Brutalist",
    "Heavy borders, acid yellow, unapologetic scale.",
    "#f1f654",
    "#1c211a",
    "#1c211a",
    "#4c5428",
    "#e2e6a4",
    { radius: 0, borderWidth: 4, headingWeight: 900 },
  ),
  theme(
    "playful",
    "Good company",
    "Playful",
    "Expressive pink, rounded shapes, a playful rhythm.",
    "#ffcada",
    "#4a1745",
    "#6e2488",
    "#8b4567",
    "#ffe7ef",
    { radius: 44, headingWeight: 800 },
  ),
  theme(
    "corporate",
    "Clear direction",
    "Corporate",
    "Practical information and a composed blue palette.",
    "#f5f8fc",
    "#17304f",
    "#1d53b8",
    "#526d88",
    "#e2eaf4",
    { radius: 8, headingWeight: 700 },
  ),
  theme(
    "organic",
    "Common ground",
    "Warm organic",
    "Soft earth colors and a natural, generous pace.",
    "#e5e9d9",
    "#293f32",
    "#8c432b",
    "#56694f",
    "#d5dcc6",
    { headingFont: "Georgia", headingWeight: 400, radius: 40 },
  ),
  theme(
    "retro",
    "Future archive",
    "Retro digital",
    "Limited colors, pixel accents, vintage precision.",
    "#192c35",
    "#c9f5db",
    "#e8ff9b",
    "#85bcab",
    "#28434c",
    {
      headingFont: "Courier New",
      bodyFont: "Courier New",
      radius: 0,
      borderWidth: 2,
      motion: "none",
    },
  ),
  ...FEATURED_THEMES,
];
export function resolveTheme(
  doc: { themes: Theme[]; themeId: string },
  slide?: { themeId?: string },
): Theme {
  return (
    doc.themes.find((t) => t.id === (slide?.themeId || doc.themeId)) ||
    THEMES[0]
  );
}
export function resolveColor(
  value: string | undefined,
  theme: Theme,
  fallback: keyof Theme["colors"] = "foreground",
): string {
  return value && value in theme.colors
    ? theme.colors[value as keyof Theme["colors"]]
    : value || theme.colors[fallback];
}
export function resolveFontSize(el: FrameElement, theme: Theme): number {
  if (el.fontSize !== undefined) return el.fontSize;
  const role =
    el.role ||
    (el.type === "chart" || el.type === "diagram" ? "label" : "body");
  const fallback =
    el.type === "chart"
      ? 22
      : el.type === "table"
        ? 26
        : el.type === "diagram"
          ? 24
          : role === "heading"
            ? 64
            : role === "label"
              ? 18
              : 30;
  return Math.max(
    8,
    Math.min(
      300,
      (el.baseFontSize || fallback) * (theme.typeScale?.[role] || 1),
    ),
  );
}

/** Updating a preset never overwrites a document's embedded older snapshot. */
export function themeSnapshotForDocument(
  doc: Pick<FrameDocument, "themes">,
  theme: Theme,
): Theme {
  const existing = doc.themes.find((value) => value.id === theme.id);
  if (!existing) return theme;
  const same =
    JSON.stringify(themeSchema.parse(existing)) ===
    JSON.stringify(themeSchema.parse(theme));
  return same ? existing : { ...theme, id: uid() };
}
