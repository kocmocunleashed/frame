import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  Play,
  RotateCcw,
  Rows3,
} from "lucide-react";
import type { FrameDocument } from "../../../shared/schema";
import { AutoSlide } from "../SlideRenderer";
import SlideThumbnail from "../SlideThumbnail";
import InteractiveSlide from "../InteractiveSlide";
import ResearchSummary from "./ResearchSummary";
import type { WebResearch } from "../../../shared/ai-research";

export default function SlideReview({
  doc,
  warnings,
  research,
  busy,
  canGenerate,
  canOutline,
  onOutline,
  onRegenerate,
  onFinish,
}: {
  doc: FrameDocument;
  warnings: string[];
  research?: WebResearch;
  busy: boolean;
  canGenerate: boolean;
  canOutline: boolean;
  onOutline: () => void;
  onRegenerate: () => void;
  onFinish: () => void;
}) {
  const [index, setIndex] = useState(0),
    [overview, setOverview] = useState(false),
    [rehearsing, setRehearsing] = useState(false),
    [step, setStep] = useState(0),
    [attempt, setAttempt] = useState(0),
    [answer, setAnswer] = useState<number | null>(null),
    [width, setWidth] = useState(800);
  const stage = useRef<HTMLDivElement>(null),
    activeThumb = useRef<HTMLButtonElement>(null);
  const slide = doc.slides[Math.min(index, doc.slides.length - 1)];
  const maxStep = Math.max(
    0,
    ...slide.elements.map((el) => el.animation?.step || 0),
  );
  const question = slide.elements.find(
    (el) => el.type === "question",
  )?.question;
  function choose(next: number) {
    setIndex(Math.max(0, Math.min(doc.slides.length - 1, next)));
    setStep(0);
    setAnswer(null);
    setOverview(false);
    setAttempt((n) => n + 1);
  }
  function next() {
    if (rehearsing && step < maxStep) setStep(step + 1);
    else choose(index + 1);
  }
  function previous() {
    if (rehearsing && step > 0) setStep(step - 1);
    else choose(index - 1);
  }
  useEffect(() => {
    if (!stage.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(stage.current);
    return () => observer.disconnect();
  }, [overview]);
  useEffect(() => {
    const thumb = activeThumb.current,
      strip = thumb?.parentElement;
    if (thumb && strip)
      strip.scrollTo({
        left:
          thumb.offsetLeft -
          strip.offsetLeft -
          (strip.clientWidth - thumb.clientWidth) / 2,
        behavior: "instant",
      });
  }, [index]);
  return (
    <section
      className="slide-review"
      aria-label="Slide preview"
      tabIndex={0}
      onKeyDown={(e) => {
        if (
          (e.target as HTMLElement).closest("input,textarea,select,details") ||
          e.metaKey ||
          e.ctrlKey ||
          e.altKey
        )
          return;
        if (e.key === "ArrowRight") {
          e.preventDefault();
          next();
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          previous();
        }
        if (e.key === "Home") {
          e.preventDefault();
          choose(0);
        }
        if (e.key === "End") {
          e.preventDefault();
          choose(doc.slides.length - 1);
        }
      }}
    >
      <div className="review-heading">
        <div>
          <div className="creation-stage-label">YOUR IDEA, WITH PRESENCE.</div>
          <h1>Meet your presentation.</h1>
        </div>
        <button
          className="creation-button quiet"
          aria-pressed={overview}
          onClick={() => setOverview(!overview)}
        >
          {overview ? <Rows3 size={18} /> : <LayoutGrid size={18} />}
          {overview ? "Slide view" : "Overview"}
        </button>
      </div>
      <ResearchSummary research={research} />
      {warnings.length > 0 && (
        <div className="review-warnings" role="status">
          {warnings.map((warning, i) => (
            <p key={i}>{warning}</p>
          ))}
        </div>
      )}
      {overview ? (
        <div className="generated-slide-grid review-overview">
          {doc.slides.map((item, i) => (
            <button
              key={item.id}
              className="generated-slide-card"
              onClick={() => choose(i)}
            >
              <AutoSlide doc={doc} slide={item} />
              <strong>
                {String(i + 1).padStart(2, "0")} / {item.title}
              </strong>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="review-stage" ref={stage}>
            {rehearsing ? (
              <InteractiveSlide
                key={`${slide.id}:${attempt}`}
                doc={doc}
                slide={slide}
                step={step}
                scale={width / doc.width}
                onNavigate={(slideId) => {
                  const nextIndex = doc.slides.findIndex(
                    (s) => s.id === slideId,
                  );
                  if (nextIndex >= 0) choose(nextIndex);
                }}
              />
            ) : (
              <AutoSlide doc={doc} slide={slide} />
            )}
          </div>
          <div className="review-navigation">
            <div>
              <button
                className="theme-arrow"
                aria-label="Previous preview slide or step"
                disabled={index === 0 && step === 0}
                onClick={previous}
              >
                <ChevronLeft />
              </button>
              <span aria-live="polite">
                {String(index + 1).padStart(2, "0")}{" "}
                <span>/ {String(doc.slides.length).padStart(2, "0")}</span>
              </span>
              <button
                className="theme-arrow"
                aria-label="Next preview slide or step"
                disabled={
                  index === doc.slides.length - 1 &&
                  (!rehearsing || step >= maxStep)
                }
                onClick={next}
              >
                <ChevronRight />
              </button>
            </div>
            <button
              className="creation-button quiet"
              aria-pressed={rehearsing}
              onClick={() => {
                setRehearsing(!rehearsing);
                setStep(0);
                setAnswer(null);
                setAttempt((n) => n + 1);
              }}
            >
              <Play size={16} />
              {rehearsing ? "Finish rehearsal" : "Try interactions"}
            </button>
          </div>
          {rehearsing && (
            <div className="review-rehearsal">
              <div>
                <strong>Local rehearsal</strong>
                <p>
                  {maxStep
                    ? `Reveal ${step} of ${maxStep}. Use the arrows to move through the presentation.`
                    : "Try the slide’s interactions. Your answers stay here."}
                </p>
              </div>
              <button
                className="creation-button quiet"
                onClick={() => {
                  setStep(0);
                  setAnswer(null);
                  setAttempt((n) => n + 1);
                }}
              >
                <RotateCcw size={16} /> Restart slide
              </button>
              {question && (
                <fieldset className="review-question">
                  <legend>Try an answer</legend>
                  <div>
                    {question.options.map((option, i) => (
                      <button
                        key={i}
                        aria-pressed={answer === i}
                        className="creation-button"
                        onClick={() => setAnswer(i)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  {answer !== null && (
                    <p role="status">
                      <strong>
                        {question.correctIndex !== undefined
                          ? answer === question.correctIndex
                            ? "Correct. "
                            : "Try another answer. "
                          : "Answer selected. "}
                      </strong>
                      {question.explanation}
                    </p>
                  )}
                </fieldset>
              )}
            </div>
          )}
          <div
            className="review-filmstrip"
            aria-label="Preview slide navigation"
          >
            {doc.slides.map((item, i) => (
              <button
                key={item.id}
                ref={i === index ? activeThumb : undefined}
                className="generated-slide-card"
                aria-label={`Preview slide ${i + 1}: ${item.title}`}
                aria-current={i === index ? "true" : undefined}
                onClick={() => choose(i)}
              >
                <div className="review-thumbnail">
                  <SlideThumbnail
                    doc={doc}
                    slide={item}
                    active={i === index}
                    eager={Math.abs(i - index) <= 4}
                  />
                </div>
                <strong>
                  {String(i + 1).padStart(2, "0")} · {item.title}
                </strong>
              </button>
            ))}
          </div>
          <details className="review-details">
            <summary>
              Notes, sources & things to check{" "}
              <span>
                {slide.sourceSupport?.evidence.length || 0} references
              </span>
            </summary>
            <div className="review-details-body">
              <section>
                <h2>Speaker notes</h2>
                <p>{slide.notes || "No speaker notes."}</p>
              </section>
              <section>
                <h2>Source references to check</h2>
                {!slide.sourceSupport?.evidence.length && (
                  <p>No source references for this slide.</p>
                )}
                {slide.sourceSupport?.evidence.map((evidence, i) => (
                  <div className="review-reference" key={i}>
                    <strong>
                      {evidence.url ? (
                        <a
                          href={evidence.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {evidence.sourceName}
                        </a>
                      ) : (
                        evidence.sourceName
                      )}
                    </strong>
                    <p>{evidence.claim}</p>
                  </div>
                ))}
                {!!slide.sourceSupport?.suggestions.length && (
                  <>
                    <h3>AI suggestions to verify</h3>
                    {slide.sourceSupport.suggestions.map((suggestion, i) => (
                      <p key={i}>{suggestion}</p>
                    ))}
                  </>
                )}
              </section>
            </div>
          </details>
        </>
      )}
      <div className="creation-actions">
        <button
          className="creation-button quiet"
          disabled={!canOutline}
          onClick={onOutline}
        >
          <ArrowLeft size={16} /> Review outline
        </button>
        <button
          className="creation-button quiet"
          disabled={!canGenerate || busy}
          onClick={onRegenerate}
        >
          Regenerate preview
        </button>
        <button
          className="creation-button main"
          disabled={busy}
          onClick={onFinish}
        >
          Create editable presentation <ArrowRight size={18} />
        </button>
      </div>
    </section>
  );
}
