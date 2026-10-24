import type { CSSProperties } from "react";
import type { Theme } from "../../shared/schema";
import { fontFamily } from "../../shared/fonts";
import { contrast } from "../../shared/design-library";

export function themeSurface(theme: Theme): CSSProperties {
  return {
    "--create-bg": theme.colors.background,
    "--create-fg": theme.colors.foreground,
    "--create-soft": theme.colors.surface,
    "--create-muted": theme.colors.secondary,
    "--create-accent": theme.colors.accent,
    "--create-accent-ink":
      contrast(theme.colors.accent, "#ffffff") >= 4.5 ? "#ffffff" : "#101010",
    "--create-display": fontFamily(theme.headingFont),
    "--create-body": fontFamily(theme.bodyFont),
    "--create-radius": `${Math.min(theme.radius, 28)}px`,
  } as CSSProperties;
}
