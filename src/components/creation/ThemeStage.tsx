import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Palette,
} from "lucide-react";
import type { FrameDocument, Theme } from "../../../shared/schema";
import { FEATURED_THEMES } from "../../../shared/featured-themes";
import { layoutSlide } from "../../../shared/templates";
import { AutoSlide } from "../SlideRenderer";
import { themeSurface } from "../../lib/theme-surface";

// Fit only disposable carousel previews. Authored document text sizes stay explicit.
function ThemeSample({
  doc,
  slide,
}: {
  doc: FrameDocument;
  slide: FrameDocument["slides"][number];
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      for (const node of host.current?.querySelectorAll<HTMLElement>(
        "[data-text-id]",
      ) || []) {
        if (!node.textContent?.trim()) continue;
        const original = parseFloat(getComputedStyle(node).fontSize);
        const fits = () =>
          node.scrollHeight <= node.clientHeight + 2 &&
          node.scrollWidth <= node.clientWidth + 2;
        if (fits()) continue;
        let low = Math.min(original, (18 * doc.width) / 1280),
          high = original;
        for (let i = 0; i < 12; i++) {
          const middle = (low + high) / 2;
          node.style.fontSize = `${middle}px`;
          if (fits()) low = middle;
          else high = middle;
        }
        node.style.fontSize = `${Math.floor(low * 10) / 10}px`;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [doc, slide]);
  return (
    <div ref={host}>
      <AutoSlide doc={doc} slide={slide} />
    </div>
  );
}

export default function ThemeStage({
  doc,
  themes,
  theme,
  topic,
  onChange,
  onBrowse,
  onLibrary,
  onNext,
}: {
  doc: FrameDocument;
  themes: Theme[];
  theme: Theme;
  topic: string;
  onChange: (theme: Theme) => void;
  onBrowse: (theme: Theme) => void;
  onLibrary: () => void;
  onNext: () => void;
}) {
  const [all, setAll] = useState(false),
    [composition, setComposition] = useState("title");
  const featuredIds = useMemo(
    () => new Set(FEATURED_THEMES.map((t) => t.id)),
    [],
  );
  const initialExtra = useRef(featuredIds.has(theme.id) ? null : theme);
  const choices = useMemo(() => {
    const values = all
      ? [...FEATURED_THEMES, ...themes]
      : [
          ...FEATURED_THEMES,
          ...(initialExtra.current ? [initialExtra.current] : []),
          ...(!featuredIds.has(theme.id) ? [theme] : []),
        ];
    return [...new Map(values.map((t) => [t.id, t])).values()];
  }, [all, themes, featuredIds, theme.id]);
  const initialIndex = useRef(
    Math.max(
      0,
      choices.findIndex((t) => t.id === theme.id),
    ),
  );
  const [index, setIndex] = useState(initialIndex.current);
  const [viewport, carousel] = useEmblaCarousel({
    loop: true,
    align: "center",
    startIndex: initialIndex.current,
    breakpoints: { "(prefers-reduced-motion: reduce)": { duration: 0 } },
  });
  const latest = useRef({
    choices,
    onChange,
    onBrowse,
    themeId: theme.id,
    artVersion: theme.artVersion,
  });
  latest.current = {
    choices,
    onChange,
    onBrowse,
    themeId: theme.id,
    artVersion: theme.artVersion,
  };
  const selected = choices[Math.min(index, choices.length - 1)];
  useEffect(() => {
    if (!carousel) return;
    const select = () => {
      const next = carousel.selectedScrollSnap();
      setIndex(next);
      const value = latest.current.choices[next];
      if (value) latest.current.onBrowse(value);
    };
    const settle = () => {
      const value = latest.current.choices[carousel.selectedScrollSnap()];
      if (
        value &&
        (value.id !== latest.current.themeId ||
          value.artVersion !== latest.current.artVersion)
      )
        latest.current.onChange(value);
    };
    select();
    carousel.on("select", select).on("settle", settle).on("reInit", select);
    return () => {
      carousel
        .off("select", select)
        .off("settle", settle)
        .off("reInit", select);
    };
  }, [carousel]);
  // A saved or AI-designed theme may be selected from outside the carousel.
  useEffect(() => {
    if (!carousel) return;
    const target = choices.findIndex((t) => t.id === theme.id);
    if (target >= 0 && choices[carousel.selectedScrollSnap()]?.id !== theme.id)
      carousel.scrollTo(target, true);
  }, [theme.id, carousel, choices]);
  const choose = useCallback(
    (next: number) => {
      carousel?.scrollTo(next);
    },
    [carousel],
  );
  // The heading receives focus on entry, so theme browsing is a page shortcut.
  useEffect(() => {
    if (!carousel) return;
    const navigate = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.isComposing ||
        !["ArrowLeft", "ArrowRight"].includes(event.key) ||
        document.querySelector(
          'dialog[open], [role="dialog"], [aria-modal="true"]',
        )
      )
        return;
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"], [role="slider"], [role="spinbutton"], [role="tablist"], [role="listbox"], [role="menu"], [role="tree"], [role="grid"]',
        )
      )
        return;
      event.preventDefault();
      if (event.key === "ArrowLeft") carousel.scrollPrev();
      else carousel.scrollNext();
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [carousel]);
  const samples = useMemo(
    () =>
      choices.map((look) => {
        const headline =
          topic.trim().length > 85
            ? "An idea worth sharing."
            : topic.trim() || "An idea worth sharing.";
        const slide = layoutSlide(
          composition,
          composition === "title" ? headline : undefined,
          doc.width,
          doc.height,
          look,
        );
        return { doc: { ...doc, themeId: look.id, themes: [look] }, slide };
      }),
    [choices, composition, topic, doc],
  );
  return (
    <section className="theme-stage" aria-label="Choose a presentation theme">
      <div className="theme-stage-heading">
        <div>
          <div className="creation-stage-label">FIND YOUR VISUAL VOICE.</div>
          <h1>Choose a look.</h1>
        </div>
        <p>
          Same idea.
          <br />A whole different feeling.
        </p>
      </div>
      <div className="theme-composition-tabs" aria-label="Preview compositions">
        {[
          ["title", "Cover"],
          ["process", "Content"],
          ["chart", "Data"],
        ].map(([value, label]) => (
          <button
            key={value}
            aria-pressed={composition === value}
            onClick={() => setComposition(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <div
        className="theme-carousel"
        role="region"
        aria-roledescription="carousel"
        aria-label="Presentation themes"
        aria-keyshortcuts="ArrowLeft ArrowRight Home End"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Home") {
            e.preventDefault();
            choose(0);
          }
          if (e.key === "End") {
            e.preventDefault();
            choose(choices.length - 1);
          }
        }}
      >
        <div className="theme-carousel-viewport" ref={viewport}>
          <div className="theme-carousel-track">
            {choices.map((look, i) => (
              <div
                key={look.id}
                role="group"
                aria-roledescription="slide"
                aria-label={`${look.name}, ${i + 1} of ${choices.length}`}
                aria-hidden={i !== index}
                className={`theme-carousel-item ${i === index ? "is-selected" : ""}`}
                style={themeSurface(look)}
              >
                <div className="theme-carousel-slide" aria-hidden="true">
                  {Math.abs(i - index) <= 1 ||
                  (index === 0 && i === choices.length - 1) ||
                  (i === 0 && index === choices.length - 1) ? (
                    <ThemeSample
                      doc={samples[i].doc}
                      slide={samples[i].slide}
                    />
                  ) : (
                    <div className="theme-carousel-placeholder" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="theme-selection-bar">
        <button
          className="theme-arrow"
          aria-label="Previous theme"
          onClick={() => carousel?.scrollPrev()}
        >
          <ArrowLeft />
        </button>
        <div
          className="theme-selection-name"
          aria-live="polite"
          aria-atomic="true"
        >
          <span className="theme-selection-count">
            {index + 1} / {choices.length} looks
          </span>
          <h2>{selected.name}</h2>
          <p>{selected.description}</p>
        </div>
        <button
          className="theme-arrow"
          aria-label="Next theme"
          onClick={() => carousel?.scrollNext()}
        >
          <ArrowRight />
        </button>
      </div>
      <p className="theme-browse-hint">
        Swipe to explore · or use the left and right arrow keys
      </p>
      <div className="theme-index" aria-label="Featured themes">
        {choices.map((look, i) => (
          <button
            key={look.id}
            aria-label={`Choose ${look.name} theme`}
            aria-pressed={i === index}
            title={look.name}
            onClick={() => choose(i)}
            style={{
              background: look.colors.background,
              color: look.colors.foreground,
              borderColor: look.colors.foreground,
            }}
          >
            {i === index ? (
              <Check size={12} />
            ) : (
              <span style={{ background: look.colors.accent }} />
            )}
          </button>
        ))}
      </div>
      <div className="theme-stage-actions">
        <div>
          <button
            className="creation-button quiet"
            onClick={() =>
              choose(
                choices.findIndex((look) => look.family === "Game & music"),
              )
            }
          >
            Game & music <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button
            className="creation-button quiet"
            aria-expanded={all}
            onClick={() => setAll(!all)}
          >
            All themes <ChevronDown size={16} />
          </button>
          <button className="creation-button quiet" onClick={onLibrary}>
            <Palette size={16} /> Your themes & brand
          </button>
        </div>
        <button
          className="creation-button main"
          onClick={() => {
            onChange(selected);
            onNext();
          }}
        >
          Use this look <ArrowRight size={19} />
        </button>
      </div>
      {all && (
        <div className="theme-name-index">
          {choices.map((look, i) => (
            <button
              key={look.id}
              aria-pressed={i === index}
              onClick={() => choose(i)}
            >
              {look.name}
              {i === index && <Check size={14} />}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
