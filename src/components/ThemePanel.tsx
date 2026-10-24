import { lazy, Suspense, useState } from "react";
import { Check } from "lucide-react";
import { THEMES } from "../../shared/themes";
import { layoutSlide } from "../../shared/templates";
import type { FrameDocument, Operation, Theme } from "../../shared/schema";
import { SlideRenderer } from "./SlideRenderer";
import { resolveTheme, themeSnapshotForDocument } from "../../shared/themes";
import { newElement } from "../../shared/operations";
const ThemeLibrary = lazy(() => import("./ThemeLibrary"));
export default function ThemePanel({
  doc,
  slideId,
  execute,
  selectedSlideIds,
  onCreative,
}: {
  doc: FrameDocument;
  slideId: string;
  execute: (op: Operation) => void;
  selectedSlideIds: string[];
  onCreative?: () => void;
}) {
  const [preview, setPreview] = useState<Theme>(
      resolveTheme(
        doc,
        doc.slides.find((s) => s.id === slideId),
      ),
    ),
    [scope, setScope] = useState("deck"),
    [layout, setLayout] = useState("title"),
    [library, setLibrary] = useState(false),
    [applied, setApplied] = useState("");
  const previewDoc = { ...doc, themeId: preview.id, themes: [preview] },
    previewSlide = layoutSlide(
      layout,
      undefined,
      doc.width,
      doc.height,
      preview,
    );
  return (
    <div className="theme-panel">
      <div className="panel-section">
        <h3>Find your visual voice.</h3>
        {onCreative && (
          <button className="button full" onClick={onCreative}>
            Design a custom slide with AI
          </button>
        )}
        <p className="hint">
          Preview a direction, then choose where to apply it. Your content and
          object positions stay put.
        </p>
        <div className="theme-preview-window">
          <SlideRenderer doc={previewDoc} slide={previewSlide} scale={0.175} />
        </div>
        <select
          aria-label="Theme preview composition"
          value={layout}
          onChange={(e) => setLayout(e.target.value)}
        >
          <option value="title">Title slide</option>
          <option value="process">Content slide</option>
          <option value="two-column">Comparison slide</option>
          <option value="chart">Data slide</option>
          <option value="summary">Closing slide</option>
        </select>
        <div className="theme-preview-description">
          <strong>{preview.name}</strong>
          <p>{preview.description}</p>
        </div>
        <label>
          Apply to
          <select
            aria-label="Apply to"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
          >
            <option value="deck">Entire presentation</option>
            <option value="slide">Current slide</option>
            <option value="selected" disabled={!selectedSlideIds.length}>
              Selected slides ({selectedSlideIds.length})
            </option>
          </select>
        </label>
        <button
          className="button primary full"
          onClick={() => {
            execute({
              type: "theme.apply",
              theme: themeSnapshotForDocument(doc, preview),
              ...(scope === "slide"
                ? { slideIds: [slideId] }
                : scope === "selected"
                  ? { slideIds: selectedSlideIds }
                  : {}),
            });
            setApplied(
              `${preview.name} applied to ${scope === "deck" ? "the presentation" : scope === "slide" ? "this slide" : `${selectedSlideIds.length} selected slides`}.`,
            );
          }}
        >
          Apply {preview.name}
        </button>
        {applied && (
          <p className="hint" role="status">
            {applied}
          </p>
        )}
        <button
          className="button full design-library-open"
          onClick={() => setLibrary(true)}
        >
          Design library & brand kits
        </button>
        <p className="hint">
          A theme sets visual styling. A layout arranges objects. Templates
          combine slides; brand kits store your identity.
        </p>
      </div>
      {library && (
        <Suspense fallback={<p role="status">Opening design library…</p>}>
          <ThemeLibrary
            doc={doc}
            initial={preview}
            onChoose={(t) => {
              setPreview(t);
              setApplied("");
            }}
            onInsertLogo={(kit) => {
              if (kit.logo)
                execute({
                  type: "element.insert",
                  slideId,
                  elements: [
                    newElement("image", {
                      name: `${kit.name} logo`,
                      src: kit.logo.src,
                      alt: kit.logo.alt,
                      fit: "contain",
                      x: doc.width - 230,
                      y: 40,
                      width: 180,
                      height: 100,
                    }),
                  ],
                });
            }}
            onClose={() => setLibrary(false)}
          />
        </Suspense>
      )}
      <div className="theme-options">
        {THEMES.map((t) => (
          <button
            key={t.id}
            className={preview.id === t.id ? "active" : ""}
            onClick={() => setPreview(t)}
            style={{
              background: t.colors.background,
              color: t.colors.foreground,
            }}
          >
            <span
              style={{
                fontFamily: t.headingFont === "Georgia" ? "Georgia" : undefined,
              }}
            >
              Aa<span style={{ color: t.colors.accent }}>.</span>
            </span>
            <strong>{t.name}</strong>
            <small>{t.family}</small>
            {preview.id === t.id && <Check size={16} />}
          </button>
        ))}
      </div>
    </div>
  );
}
