import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw, X } from "lucide-react";
import type {
  FrameDocument,
  Slide,
  FrameElement,
  Operation,
} from "../../shared/schema";
import { motionTypes } from "../../shared/creative";
import { SlideRenderer } from "./SlideRenderer";
import { IconButton } from "./UI";

export default function MotionTimeline({
  doc,
  slide,
  selected,
  onSelect,
  execute,
  onClose,
}: {
  doc: FrameDocument;
  slide: Slide;
  selected: string[];
  onSelect: (ids: string[]) => void;
  execute: (ops: Operation | Operation[]) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(1),
    [elapsed, setElapsed] = useState(0),
    [playing, setPlaying] = useState(false);
  const [drag, setDrag] = useState<{
    id: string;
    delay: number;
    duration: number;
  } | null>(null);
  const latest = useRef(drag);
  latest.current = drag;
  const duration = Math.max(
    1000,
    ...slide.elements
      .filter((e) => e.animation?.step === step)
      .map((e) => (e.animation?.delay || 0) + (e.animation?.duration || 280)),
  );
  useEffect(() => {
    setPlaying(false);
    setElapsed(0);
  }, [slide.id, step]);
  useEffect(() => {
    if (!playing) return;
    const started = performance.now() - elapsed;
    let frame = 0;
    const tick = () => {
      const time = Math.min(duration, performance.now() - started);
      setElapsed(time);
      if (time < duration) frame = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, duration]);
  function update(
    el: FrameElement,
    patch: Partial<NonNullable<FrameElement["animation"]>>,
  ) {
    execute([
      {
        type: "element.update",
        slideId: slide.id,
        ids: [el.id],
        patch: {
          animation: { type: "fade", step: 1, ...el.animation, ...patch },
        },
      },
      {
        type: "slide.update",
        slideId: slide.id,
        patch: {
          interactions: slide.interactions.filter(
            (i) => !(i.action === "animate" && i.target === el.id),
          ),
        },
      },
    ]);
  }
  const rows = slide.elements.filter((e) => !e.hidden);
  const rulerDuration = Math.min(
    15000,
    Math.max(
      2000,
      ...rows
        .filter((e) => e.animation?.type !== "none")
        .map(
          (e) =>
            Math.ceil(
              ((e.animation?.delay || 0) +
                (e.animation?.duration || 280) +
                500) /
                1000,
            ) * 1000,
        ),
    ),
  );
  return (
    <section className="motion-timeline" aria-label="Animation timeline">
      <header className="creative-row">
        <strong>Animation timeline</strong>
        <span className="hint">Advance a step. Let its objects follow.</span>
        <IconButton label="Close animation timeline" onClick={onClose}>
          <X size={17} />
        </IconButton>
      </header>
      <div className="motion-timeline-body">
        <div className="motion-preview">
          <SlideRenderer
            doc={doc}
            slide={slide}
            scale={Math.min(280 / doc.width, 160 / doc.height)}
            step={step}
            motionElapsed={elapsed}
          />
          <div className="creative-row">
            <IconButton
              label={
                playing ? "Pause animation preview" : "Play animation preview"
              }
              onClick={() => {
                if (elapsed >= duration) setElapsed(0);
                setPlaying(!playing);
              }}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </IconButton>
            <IconButton
              label="Restart animation preview"
              onClick={() => {
                setElapsed(0);
                setPlaying(false);
              }}
            >
              <RotateCcw size={16} />
            </IconButton>
            <label>
              Step
              <input
                aria-label="Preview step"
                type="number"
                min={0}
                max={100}
                value={step}
                onChange={(e) =>
                  setStep(Math.max(0, Math.min(100, Number(e.target.value))))
                }
              />
            </label>
            <output>{(elapsed / 1000).toFixed(1)}s</output>
          </div>
          <input
            aria-label="Animation playhead"
            type="range"
            min={0}
            max={duration}
            step={10}
            value={elapsed}
            onChange={(e) => {
              setPlaying(false);
              setElapsed(Number(e.target.value));
            }}
          />
        </div>
        <div className="motion-tracks">
          <div className="motion-track-head">
            <span>Object / effect</span>
            <span>Step</span>
            <span>Delay ms</span>
            <span>Duration ms</span>
            <span>Timing · 0–{rulerDuration / 1000}s · drag or resize</span>
          </div>
          {rows.map((el) => {
            const a =
              drag?.id === el.id ? { ...el.animation, ...drag } : el.animation;
            return (
              <div
                className={`motion-track ${selected.includes(el.id) ? "selected" : ""}`}
                key={el.id}
              >
                <div>
                  <button
                    className="motion-object-name"
                    onClick={() => onSelect([el.id])}
                  >
                    {el.name || el.type}
                  </button>
                  <select
                    aria-label={`Animation effect for ${el.name}`}
                    disabled={el.locked}
                    value={a?.type || "none"}
                    onChange={(e) =>
                      update(el, {
                        type: e.target.value as (typeof motionTypes)[number],
                      })
                    }
                  >
                    {motionTypes.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </div>
                {(["step", "delay", "duration"] as const).map((key) => (
                  <input
                    key={`${key}-${a?.[key]}`}
                    aria-label={`${key} for ${el.name}`}
                    disabled={el.locked}
                    type="number"
                    min={key === "duration" ? 50 : 0}
                    max={key === "step" ? 100 : key === "delay" ? 10000 : 5000}
                    defaultValue={
                      a?.[key] ??
                      (key === "duration" ? 280 : key === "step" ? 1 : 0)
                    }
                    onBlur={(e) => {
                      if (e.target.value === "") return;
                      const value = Number(e.target.value),
                        min = key === "duration" ? 50 : 0,
                        max =
                          key === "step" ? 100 : key === "delay" ? 10000 : 5000;
                      if (Number.isFinite(value) && value !== a?.[key])
                        update(el, {
                          [key]: Math.round(
                            Math.max(min, Math.min(max, value)),
                          ),
                        });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                  />
                ))}
                <div className="motion-ruler">
                  <div
                    className="motion-bar"
                    style={{
                      left: `${((a?.delay || 0) / rulerDuration) * 100}%`,
                      width: `${((a?.duration || 280) / rulerDuration) * 100}%`,
                      opacity: a?.type && a.type !== "none" ? 1 : 0.25,
                    }}
                    onPointerDown={(e) => {
                      if (el.locked) return;
                      const node = e.currentTarget,
                        parent = node.parentElement!;
                      const rect = parent.getBoundingClientRect(),
                        start = e.clientX,
                        initialDelay = a?.delay || 0,
                        initialDuration = a?.duration || 280,
                        resize =
                          (e.target as HTMLElement).dataset.resize === "true";
                      node.setPointerCapture(e.pointerId);
                      const move = (event: PointerEvent) => {
                        const delta = Math.round(
                          ((event.clientX - start) / rect.width) *
                            rulerDuration,
                        );
                        const value = {
                          id: el.id,
                          delay: resize
                            ? initialDelay
                            : Math.max(
                                0,
                                Math.min(10000, initialDelay + delta),
                              ),
                          duration: resize
                            ? Math.max(
                                50,
                                Math.min(5000, initialDuration + delta),
                              )
                            : initialDuration,
                        };
                        latest.current = value;
                        setDrag(value);
                      };
                      const finish = () => {
                        const value = latest.current;
                        if (value)
                          update(el, {
                            delay: value.delay,
                            duration: value.duration,
                          });
                        setDrag(null);
                        latest.current = null;
                        node.removeEventListener("pointermove", move);
                        node.removeEventListener("pointerup", finish);
                        node.removeEventListener("pointercancel", cancel);
                      };
                      const cancel = () => {
                        latest.current = null;
                        finish();
                      };
                      node.addEventListener("pointermove", move);
                      node.addEventListener("pointerup", finish, {
                        once: true,
                      });
                      node.addEventListener("pointercancel", cancel, {
                        once: true,
                      });
                    }}
                  >
                    <span data-resize="true" className="motion-bar-handle" />
                  </div>
                </div>
              </div>
            );
          })}
          {rows.length === 0 && <p>Add an object to choreograph its reveal.</p>}
        </div>
      </div>
    </section>
  );
}
