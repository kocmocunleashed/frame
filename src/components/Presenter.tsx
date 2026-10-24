import { useEffect, useRef, useState, useMemo } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  LayoutGrid,
  PanelRightOpen,
  PanelRightClose,
  Play,
  Pause,
  RotateCcw,
  X,
} from "lucide-react";
import { documentSchema, type FrameDocument } from "../../shared/schema";
import { api, navigate } from "../lib/api";
import { AutoSlide } from "./SlideRenderer";
import { IconButton, Loading, ErrorMessage, Modal } from "./UI";
import InteractiveSlide from "./InteractiveSlide";
import LiveControls from "./LiveControls";
import { useLiveSession } from "../lib/useLiveSession";
export default function Presenter({ id }: { id: string }) {
  const live = useLiveSession(id);
  const [localDoc, setDoc] = useState<FrameDocument | null>(null),
    [error, setError] = useState(""),
    [localIndex, setLocalIndex] = useState(
      Math.floor(
        Math.max(
          0,
          Number(new URLSearchParams(location.search).get("slide") || 0) || 0,
        ),
      ),
    ),
    [localStep, setLocalStep] = useState(0),
    [presenter, setPresenter] = useState(false),
    [overview, setOverview] = useState(false),
    [controls, setControls] = useState(true),
    [fullscreen, setFullscreen] = useState(false),
    [elapsed, setElapsed] = useState(0),
    [running, setRunning] = useState(false),
    [size, setSize] = useState({ width: 1000, height: 700 });
  const [localStartedAt, setLocalStartedAt] = useState(Date.now);
  const activeSession =
    live.session && !live.session.ended ? live.session : null;
  const doc = activeSession?.document || localDoc,
    index = activeSession?.state.index ?? localIndex,
    step = activeSession?.state.step ?? localStep;
  const stepStartedAt = useMemo(
    () =>
      activeSession
        ? activeSession.state.stepStartedAt
          ? activeSession.state.stepStartedAt +
            (Date.now() - (activeSession.serverTime || Date.now()))
          : activeSession.state.stepStartedAt
        : localStartedAt,
    [
      activeSession?.state.stepStartedAt,
      activeSession?.serverTime,
      localStartedAt,
    ],
  );
  function go(nextIndex: number, nextStep: number) {
    if (live.session && !live.session.ended) {
      void live.command({ type: "navigate", index: nextIndex, step: nextStep });
    } else {
      setLocalStartedAt(
        nextIndex > localIndex ||
          (nextIndex === localIndex && nextStep > localStep)
          ? Date.now()
          : 0,
      );
      setLocalIndex(nextIndex);
      setLocalStep(nextStep);
    }
  }
  const host = useRef<HTMLDivElement>(null),
    hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    let active = true;
    let local: FrameDocument | null = null;
    try {
      const parsed = documentSchema.safeParse(
        JSON.parse(sessionStorage.getItem(`frame:rehearsal:${id}`) || "null"),
      );
      local = parsed.success ? parsed.data : null;
    } catch {}
    if (local) {
      setDoc(local);
      setLocalIndex((i) => Math.min(local!.slides.length - 1, Math.max(0, i)));
    } else
      api<FrameDocument>(`/decks/${id}`)
        .then((d) => {
          if (active) {
            setDoc(d);
            setLocalIndex((i) => Math.min(d.slides.length - 1, Math.max(0, i)));
          }
        })
        .catch((e) => setError(e.message));
    return () => {
      active = false;
    };
  }, [id]);
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setSize({ width: rect.width, height: rect.height });
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [!!doc, presenter]);
  useEffect(() => {
    if (!running) return;
    const started = Date.now() - elapsed * 1000;
    const timer = setInterval(
      () => setElapsed(Math.max(0, Math.floor((Date.now() - started) / 1000))),
      250,
    );
    return () => clearInterval(timer);
  }, [running]);
  useEffect(() => {
    const change = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", change);
    return () => document.removeEventListener("fullscreenchange", change);
  }, []);
  const maxStep = doc
    ? Math.max(
        0,
        ...doc.slides[index].elements.map((el) => el.animation?.step || 0),
      )
    : 0;
  function next() {
    if (!doc || live.busy) return;
    if (step < maxStep) go(index, step + 1);
    else if (index < doc.slides.length - 1) go(index + 1, 0);
  }
  function previous() {
    if (live.busy) return;
    if (step > 0) go(index, step - 1);
    else if (index > 0) go(index - 1, 0);
  }
  async function exit() {
    if (document.fullscreenElement)
      await document.exitFullscreen().catch(() => {});
    navigate(`/deck/${id}`);
  }
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (overview) return;
      const target = e.target as HTMLElement;
      if (target.closest("input,textarea,select,[contenteditable=true]"))
        return;
      if (e.key === " " && target.closest("button,a")) return;
      if (["ArrowRight", "ArrowDown", " ", "PageDown"].includes(e.key)) {
        e.preventDefault();
        next();
      }
      if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        previous();
      }
      if (e.key === "Home") {
        go(0, 0);
      }
      if (e.key === "End" && doc) {
        go(doc.slides.length - 1, 0);
      }
      if (e.key === "Escape" && !document.fullscreenElement) void exit();
      if (e.key.toLowerCase() === "g") setOverview(true);
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [doc, index, step, overview, live.busy, live.session?.version]);
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
  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );
  if (!doc)
    return error ? (
      <ErrorMessage>{error}</ErrorMessage>
    ) : (
      <Loading label="Preparing the room…" />
    );
  const slide = doc.slides[index],
    scale = Math.min(
      (size.width - 32) / doc.width,
      (size.height - 32) / doc.height,
    );
  return (
    <main
      className={`presentation-page ${presenter ? "with-presenter" : ""}`}
      onFocusCapture={showControls}
      onPointerMove={showControls}
      onClick={showControls}
    >
      <header
        className={`presentation-header ${!controls && !presenter ? "controls-hidden" : ""}`}
      >
        <button className="button" onClick={exit}>
          <ArrowLeft size={17} />
          Back to editor
        </button>
        <span className="rehearsal-label">
          <span className="status-dot" />
          {activeSession ? (
            <>
              Live session{" "}
              <span>
                · {activeSession.code} ·{" "}
                {live.connected
                  ? `${activeSession.connected} connected`
                  : "Reconnecting…"}
              </span>
            </>
          ) : (
            <>
              Local rehearsal <span>· No audience session</span>
            </>
          )}
        </span>
        <div>
          <IconButton label="Slide overview" onClick={() => setOverview(true)}>
            <LayoutGrid size={19} />
          </IconButton>
          <IconButton
            label={presenter ? "Hide presenter view" : "Open presenter view"}
            onClick={() => setPresenter(!presenter)}
          >
            {presenter ? (
              <PanelRightClose size={20} />
            ) : (
              <PanelRightOpen size={20} />
            )}
          </IconButton>
          <IconButton
            label={fullscreen ? "Exit full screen" : "Enter full screen"}
            onClick={async () => {
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await document.documentElement.requestFullscreen();
              } catch {
                setError(
                  "Full screen is unavailable in this browser. Presentation controls still work.",
                );
              }
            }}
          >
            {fullscreen ? <Minimize2 size={19} /> : <Maximize2 size={19} />}
          </IconButton>
        </div>
      </header>
      <div className="presentation-main">
        <div className="present-stage-host" ref={host}>
          <InteractiveSlide
            key={slide.id}
            revealedIds={activeSession?.state.revealedIds}
            onReveal={
              activeSession
                ? (elementId) => {
                    void live.command({ type: "reveal", elementId });
                  }
                : undefined
            }
            onNavigate={(slideId) => {
              const target = doc.slides.findIndex((s) => s.id === slideId);
              if (target >= 0) go(target, 0);
            }}
            doc={doc}
            slide={slide}
            scale={Math.max(0.05, scale)}
            step={step}
            stepStartedAt={stepStartedAt}
          />
        </div>
        {presenter && (
          <aside className="presenter-panel">
            <div className="presenter-timer">
              <span>
                {live.session && !live.session.ended
                  ? "Session timer"
                  : "Rehearsal timer"}
                <strong>
                  {String(Math.floor(elapsed / 60)).padStart(2, "0")}:
                  {String(elapsed % 60).padStart(2, "0")}
                </strong>
              </span>
              <IconButton
                label={running ? "Pause timer" : "Start timer"}
                onClick={() => setRunning(!running)}
              >
                {running ? <Pause size={18} /> : <Play size={18} />}
              </IconButton>
              <IconButton
                label="Reset timer"
                onClick={() => {
                  setElapsed(0);
                  setRunning(false);
                }}
              >
                <RotateCcw size={17} />
              </IconButton>
            </div>
            <h3>Up next</h3>
            {doc.slides[index + 1] ? (
              <AutoSlide doc={doc} slide={doc.slides[index + 1]} />
            ) : (
              <div className="end-preview">That’s your story.</div>
            )}
            <h3>Speaker notes</h3>
            <p className="presenter-notes">
              {slide.notes ||
                "No notes for this slide. Take a breath. You’ve got this."}
            </p>
            <LiveControls live={live} doc={doc} slide={slide} />
          </aside>
        )}
      </div>
      <footer
        className={`presentation-controls ${!controls && !presenter ? "controls-hidden" : ""}`}
      >
        <span>{doc.title}</span>
        <div>
          <IconButton
            label="Previous slide or step"
            disabled={live.busy || (index === 0 && step === 0)}
            onClick={previous}
          >
            <ChevronLeft size={24} />
          </IconButton>
          <button onClick={() => setOverview(true)} className="slide-counter">
            {index + 1} <span>/ {doc.slides.length}</span>
          </button>
          <IconButton
            label="Next slide or step"
            disabled={
              live.busy || (index === doc.slides.length - 1 && step === maxStep)
            }
            onClick={next}
          >
            <ChevronRight size={24} />
          </IconButton>
        </div>
        <span className="present-key-hint">
          ← → to navigate · G for overview
        </span>
      </footer>
      <div
        className="presentation-progress"
        role="progressbar"
        aria-label="Presentation progress"
        aria-valuenow={index + 1}
        aria-valuemin={1}
        aria-valuemax={doc.slides.length}
      >
        <span
          style={{ transform: `scaleX(${(index + 1) / doc.slides.length})` }}
        />
      </div>
      {error && (
        <div className="presentation-error" role="alert">
          {error}
          <IconButton label="Dismiss error" onClick={() => setError("")}>
            <X size={16} />
          </IconButton>
        </div>
      )}
      {overview && (
        <Modal
          title="Your story at a glance."
          onClose={() => setOverview(false)}
          wide
        >
          <div className="presentation-overview">
            {doc.slides.map((s, i) => (
              <button
                key={s.id}
                className={i === index ? "active" : ""}
                onClick={() => {
                  go(i, 0);
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
        </Modal>
      )}
    </main>
  );
}
