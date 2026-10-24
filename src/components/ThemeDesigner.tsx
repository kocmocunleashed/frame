import { useMemo, useState } from "react";
import type { FrameDocument, Theme } from "../../shared/schema";
import { layoutSlide } from "../../shared/templates";
import { contrastIssues, readablePalette } from "../../shared/design-library";
import { AutoSlide } from "./SlideRenderer";
import { HEADING_FONTS, BODY_FONTS } from "../../shared/fonts";
export const PREVIEW_LAYOUTS = [
  { id: "title", name: "Title" },
  { id: "process", name: "Content" },
  { id: "two-column", name: "Comparison" },
  { id: "chart", name: "Data" },
  { id: "summary", name: "Closing" },
];
export function ThemePreview({
  theme,
  doc,
}: {
  theme: Theme;
  doc: FrameDocument;
}) {
  const [layout, setLayout] = useState("title");
  const slide = useMemo(
    () => layoutSlide(layout, undefined, doc.width, doc.height, theme),
    [layout, doc.width, doc.height, theme],
  );
  return (
    <div className="design-preview">
      <AutoSlide
        doc={{ ...doc, themeId: theme.id, themes: [theme] }}
        slide={slide}
      />
      <div className="preview-compositions" aria-label="Preview compositions">
        {PREVIEW_LAYOUTS.map((l) => (
          <button
            type="button"
            key={l.id}
            aria-pressed={layout === l.id}
            onClick={() => setLayout(l.id)}
          >
            {l.name}
          </button>
        ))}
      </div>
    </div>
  );
}
export function PaletteFields({
  colors,
  onChange,
}: {
  colors: Theme["colors"];
  onChange: (c: Theme["colors"]) => void;
}) {
  const issues = contrastIssues(colors);
  return (
    <>
      <div className="design-palette">
        {Object.entries(colors).map(([key, value]) => (
          <label key={key}>
            <input
              type="color"
              aria-label={`${key} color`}
              value={value}
              onChange={(e) => onChange({ ...colors, [key]: e.target.value })}
            />
            <span>{key}</span>
            <code>{value}</code>
          </label>
        ))}
      </div>
      <div
        className={
          issues.length ? "contrast-report warning" : "contrast-report"
        }
        role="status"
      >
        {issues.length ? (
          <>
            <strong>Check text contrast</strong>
            <p>
              Below 4.5:1: {issues.join(", ")}. Check your slides after styling.
            </p>
            <button
              type="button"
              className="button"
              onClick={() => onChange(readablePalette(colors))}
            >
              Improve contrast
            </button>
          </>
        ) : (
          <span>Text palette meets 4.5:1 on base surfaces.</span>
        )}
      </div>
    </>
  );
}
export function FontFields({
  headingFont,
  bodyFont,
  onChange,
}: {
  headingFont: Theme["headingFont"];
  bodyFont: Theme["bodyFont"];
  onChange: (p: Pick<Theme, "headingFont"> | Pick<Theme, "bodyFont">) => void;
}) {
  return (
    <div className="design-fields">
      <label>
        Heading font
        <select
          value={headingFont}
          onChange={(e) =>
            onChange({ headingFont: e.target.value as Theme["headingFont"] })
          }
        >
          {HEADING_FONTS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <label>
        Body font
        <select
          value={bodyFont}
          onChange={(e) =>
            onChange({ bodyFont: e.target.value as Theme["bodyFont"] })
          }
        >
          {BODY_FONTS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
export default function ThemeDesigner({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (t: Theme) => void;
}) {
  const update = (patch: Partial<Theme>) => onChange({ ...theme, ...patch });
  return (
    <div className="design-form">
      <label>
        Theme name
        <input
          required
          maxLength={80}
          value={theme.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </label>
      <label>
        Description
        <textarea
          aria-label="Theme description"
          maxLength={300}
          rows={2}
          value={theme.description}
          onChange={(e) => update({ description: e.target.value })}
        />
      </label>
      <h3>Palette</h3>
      <PaletteFields
        colors={theme.colors}
        onChange={(colors) => update({ colors })}
      />
      <h3>Typography</h3>
      <FontFields {...theme} onChange={update} />
      <div className="design-fields">
        <label>
          Heading weight
          <select
            value={theme.headingWeight}
            onChange={(e) => update({ headingWeight: Number(e.target.value) })}
          >
            {[300, 400, 500, 600, 700, 800, 900].map((w) => (
              <option key={w}>{w}</option>
            ))}
          </select>
        </label>
        {(["heading", "body", "label"] as const).map((role) => (
          <label key={role}>
            {role[0].toUpperCase() + role.slice(1)} scale
            <input
              aria-label={`${role} type scale`}
              type="number"
              min={0.7}
              max={1.5}
              step={0.05}
              value={theme.typeScale?.[role] || 1}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= 0.7 && n <= 1.5)
                  update({
                    typeScale: {
                      heading: 1,
                      body: 1,
                      label: 1,
                      ...theme.typeScale,
                      [role]: n,
                    },
                  });
              }}
            />
          </label>
        ))}
      </div>
      <h3>Shape & atmosphere</h3>
      <div className="design-fields">
        {(
          [
            { key: "radius", label: "Corner radius", min: 0, max: 80 },
            { key: "borderWidth", label: "Border width", min: 0, max: 8 },
            { key: "spacing", label: "Content spacing", min: 8, max: 100 },
          ] as const
        ).map((f) => (
          <label key={f.key}>
            {f.label}
            <input
              type="number"
              min={f.min}
              max={f.max}
              value={theme[f.key]}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (n >= f.min && n <= f.max) update({ [f.key]: n });
              }}
            />
          </label>
        ))}
        <label>
          Material
          <select
            value={theme.material}
            onChange={(e) =>
              update({ material: e.target.value as Theme["material"] })
            }
          >
            <option value="flat">Flat</option>
            <option value="glass">Translucent glass</option>
            <option value="paper">Paper grain</option>
          </select>
        </label>
        <label>
          Background
          <select
            value={theme.background}
            onChange={(e) =>
              update({ background: e.target.value as Theme["background"] })
            }
          >
            <option value="solid">Solid</option>
            <option value="glow">Radial glow</option>
            <option value="split">Split surface</option>
          </select>
        </label>
        <label>
          Shadow
          <select
            value={theme.shadow}
            onChange={(e) =>
              update({ shadow: e.target.value as Theme["shadow"] })
            }
          >
            <option value="none">None</option>
            <option value="soft">Soft</option>
          </select>
        </label>
        <label>
          Motion default
          <select
            value={theme.motion}
            onChange={(e) =>
              update({ motion: e.target.value as Theme["motion"] })
            }
          >
            <option value="none">None</option>
            <option value="fade">Fade</option>
            <option value="rise">Rise</option>
          </select>
        </label>
      </div>
      <p className="hint">
        Type scales affect theme-linked sizes. Explicit sizes stay fixed.
        Spacing sets table padding and diagram gaps; applying a theme preserves
        object positions. Glass uses readable translucent surfaces with a solid
        fallback. Motion follows reduced-motion preferences in presentation
        mode.
      </p>
    </div>
  );
}
