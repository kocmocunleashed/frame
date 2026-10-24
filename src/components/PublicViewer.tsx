import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Maximize2,
  Minimize2,
  RefreshCw,
} from "lucide-react";
import type { PublishedView } from "../../shared/publications";
import { api, RequestError, fetchDownload } from "../lib/api";
import { AutoSlide } from "./SlideRenderer";
import { Brand, ErrorMessage, IconButton, Loading, Modal } from "./UI";
import InteractiveSlide from "./InteractiveSlide";
export default function PublicViewer({ id }: { id: string }) {
  const [view, setView] = useState<PublishedView | null>(null),
    [error, setError] = useState(""),
    [errorStatus, setErrorStatus] = useState(0),
    [index, setIndex] = useState(0),
    [step, setStep] = useState(0),
    [downloadsOpen, setDownloadsOpen] = useState(false),
    [overview, setOverview] = useState(false),
    [shown, setShown] = useState(30),
    [controls, setControls] = useState(true),
    [fullscreen, setFullscreen] = useState(false),
    [size, setSize] = useState({ width: 1000, height: 700 });
  const host = useRef<HTMLDivElement>(null),
    hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  async function load() {
    setError("");
    setErrorStatus(0);
    try {
      const result = await api<PublishedView>(`/publications/${id}`);
      setView(result);
      setIndex((i) =>
        Math.min(result.document.slides.length - 1, Math.max(0, i)),
      );
    } catch (err) {
      setError((err as Error).message);
      setErrorStatus(err instanceof RequestError ? err.status : 0);
    }
  }
  useEffect(() => {
    void load();
  }, [id]);
  useEffect(() => {
    if (!view || view.downloadsState !== "preparing") return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const result = await api<PublishedView>(`/publications/${id}`);
        if (!stopped)
          setView((current) =>
            current &&
            current.publication.revision === result.publication.revision
              ? {
                  ...current,
                  downloads: result.downloads,
                  downloadsState: result.downloadsState,
                }
              : current,
          );
      } catch (err) {
        if (!stopped) {
          setError((err as Error).message);
          clearInterval(timer);
        }
      }
    }, 2000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [id, view?.downloadsState, view?.publication.revision]);
  useEffect(() => {
    if (!view || !host.current) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [!!view]);
  useEffect(() => {
    const changed = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", changed);
    return () => document.removeEventListener("fullscreenchange", changed);
  }, []);
  useEffect(() => {
    if (!view) return;
    const previousTitle = document.title;
    document.title = `${view.document.title} — Frame`;
    let robots = document.querySelector<HTMLMetaElement>("meta[name=robots]");
    const created = !robots;
    if (!robots) {
      robots = document.createElement("meta");
      robots.name = "robots";
      document.head.append(robots);
    }
    const old = robots.content;
    robots.content =
      view.publication.visibility === "public"
        ? "index,follow"
        : "noindex,nofollow";
    return () => {
      document.title = previousTitle;
      if (created) robots?.remove();
      else if (robots) robots.content = old;
    };
  }, [view]);
  const slide = view?.document.slides[index],
    maxStep = Math.max(
      0,
      ...(slide?.elements.map((el) => el.animation?.step || 0) || []),
    );
  function next() {
    if (!view) return;
    if (step < maxStep) setStep((s) => s + 1);
    else if (index < view.document.slides.length - 1) {
      setIndex((i) => i + 1);
      setStep(0);
    }
  }
  function previous() {
    if (step > 0) setStep((s) => s - 1);
    else if (index > 0) {
      setIndex((i) => i - 1);
      setStep(0);
    }
  }
  function showControls() {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (
        !document.activeElement?.closest(
          ".presentation-header,.presentation-controls",
        )
      )
        setControls(false);
    }, 3500);
  }
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if (overview || downloadsOpen) return;
      const target = event.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable=true]"))
        return;
      if (event.key === " " && target.closest("button,a")) return;
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        next();
      }
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(event.key)) {
        event.preventDefault();
        previous();
      }
      if (event.key === "Home") {
        setIndex(0);
        setStep(0);
      }
      if (event.key === "End" && view) {
        setIndex(view.document.slides.length - 1);
        setStep(0);
      }
      if (event.key.toLowerCase() === "g") setOverview(true);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [view, index, step, overview, downloadsOpen]);
  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );
  if (!view)
    return error ? (
      <main className="public-view-error">
        <Brand />
        <h1>
          {errorStatus === 410
            ? "This link has been revoked."
            : errorStatus === 401
              ? "This presentation is private."
              : "We couldn’t open this presentation."}
        </h1>
        <ErrorMessage>{error}</ErrorMessage>
        {errorStatus === 401 ? (
          <a
            className="button primary"
            href={`/signin?next=${encodeURIComponent(`/view/${id}`)}`}
          >
            Sign in
          </a>
        ) : errorStatus !== 410 ? (
          <button className="button" onClick={load}>
            <RefreshCw size={16} />
            Try again
          </button>
        ) : null}
        <a className="button" href="/explore">
          Browse public presentations
        </a>
      </main>
    ) : (
      <Loading label="Opening published presentation…" />
    );
  const doc = view.document,
    scale = Math.max(
      0.05,
      Math.min((size.width - 32) / doc.width, (size.height - 32) / doc.height),
    );
  return (
    <main
      className="presentation-page public-viewer"
      onPointerMove={showControls}
      onClick={showControls}
      onFocusCapture={showControls}
    >
      <header
        className={`presentation-header ${!controls ? "controls-hidden" : ""}`}
      >
        <a className="button" href="/explore">
          <ArrowLeft size={16} />
          Frame
        </a>
        <div className="public-view-title">
          <h1>{doc.title}</h1>
          <span>
            Published version {view.publication.revision} · {view.author}
          </span>
        </div>
        <div>
          {view.publication.allowDownload && (
            <IconButton
              label="Download presentation"
              onClick={() => setDownloadsOpen(true)}
            >
              <Download size={19} />
            </IconButton>
          )}
          <IconButton label="Slide overview" onClick={() => setOverview(true)}>
            <LayoutGrid size={19} />
          </IconButton>
          <IconButton
            label={fullscreen ? "Exit full screen" : "Enter full screen"}
            onClick={async () => {
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await document.documentElement.requestFullscreen();
              } catch {
                setError(
                  "Full screen is unavailable. Slide navigation still works.",
                );
              }
            }}
          >
            {fullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
          </IconButton>
        </div>
      </header>
      {error && (
        <div className="public-view-alert">
          <ErrorMessage>{error}</ErrorMessage>
        </div>
      )}
      <div className="presentation-main">
        <div
          className="present-stage-host"
          ref={host}
          aria-label="Read-only slide"
          role="region"
        >
          <InteractiveSlide
            key={slide!.id}
            onNavigate={(slideId) => {
              const target = doc.slides.findIndex((s) => s.id === slideId);
              if (target >= 0) {
                setIndex(target);
                setStep(0);
              }
            }}
            doc={doc}
            slide={slide!}
            scale={scale}
            step={step}
          />
        </div>
      </div>
      <footer
        className={`presentation-controls ${!controls ? "controls-hidden" : ""}`}
      >
        <span>Read-only presentation</span>
        <div>
          <IconButton
            label="Previous slide or step"
            disabled={index === 0 && step === 0}
            onClick={previous}
          >
            <ChevronLeft size={24} />
          </IconButton>
          <button className="slide-counter" onClick={() => setOverview(true)}>
            {index + 1} / {doc.slides.length}
            {maxStep > 0 && (
              <small>
                {" "}
                · step {step + 1}/{maxStep + 1}
              </small>
            )}
          </button>
          <IconButton
            label="Next slide or step"
            disabled={index === doc.slides.length - 1 && step === maxStep}
            onClick={next}
          >
            <ChevronRight size={24} />
          </IconButton>
        </div>
        <span>Arrow keys to navigate · G for overview</span>
      </footer>
      <div
        className="presentation-progress"
        style={{
          width: `${((index + (maxStep ? (step + 1) / (maxStep + 1) : 1)) / doc.slides.length) * 100}%`,
        }}
      />
      <span className="visually-hidden" aria-live="polite">
        Slide {index + 1} of {doc.slides.length}: {slide!.title}
      </span>
      {downloadsOpen && (
        <Modal
          title="Download presentation"
          onClose={() => setDownloadsOpen(false)}
        >
          <p className="modal-description">
            Downloads contain published version {view.publication.revision}. PDF
            is static; standalone HTML preserves local steps and navigation.
            Live audience sessions require Frame.
          </p>
          <div className="public-downloads">
            {view.downloads.map((item) => (
              <button
                className="button"
                key={item.format}
                onClick={async () => {
                  try {
                    await fetchDownload(item.href);
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                <Download size={16} />
                Download {item.format.toUpperCase()} ·{" "}
                {(item.bytes / 1024).toFixed(0)} KB
              </button>
            ))}
            {view.downloadsState === "preparing" && (
              <p role="status">
                Preparing downloads. You can keep viewing while they finish.
              </p>
            )}
            {view.downloadsState === "failed" && (
              <p>
                Some downloads are unavailable. Ask the owner to prepare them
                again.
              </p>
            )}
          </div>
        </Modal>
      )}
      {overview && (
        <Modal title="Slide overview" wide onClose={() => setOverview(false)}>
          <div className="presentation-overview">
            {doc.slides.slice(0, shown).map((s, i) => (
              <button
                key={s.id}
                aria-label={`Go to slide ${i + 1}: ${s.title}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => {
                  setIndex(i);
                  setStep(0);
                  setOverview(false);
                }}
              >
                <AutoSlide doc={doc} slide={s} />
                <span>
                  {i + 1}. {s.title}
                </span>
              </button>
            ))}
          </div>
          {shown < doc.slides.length && (
            <button className="button" onClick={() => setShown((n) => n + 30)}>
              Show more slides
            </button>
          )}
        </Modal>
      )}
    </main>
  );
}
