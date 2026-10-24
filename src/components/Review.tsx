import { lazy, Suspense, useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  RefreshCw,
  Users,
  PenLine,
} from "lucide-react";
import type { User } from "../../shared/schema";
import type { ReviewDocument } from "../../shared/collaboration";
import { api } from "../lib/api";
import { usePresence } from "../lib/usePresence";
import PresenceBadge from "./PresenceBadge";
import { AutoSlide } from "./SlideRenderer";
import { Brand, Loading, ErrorMessage, IconButton } from "./UI";
const Comments = lazy(() => import("./Comments")),
  Sharing = lazy(() => import("./Sharing"));
export default function Review({ id, user }: { id: string; user: User }) {
  const [review, setReview] = useState<ReviewDocument | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [index, setIndex] = useState(0),
    [step, setStep] = useState(0),
    [panel, setPanel] = useState<"comments" | "sharing" | null>(null),
    presence = usePresence(id, "view");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const value = await api<ReviewDocument>(`/decks/${id}/review`);
      setReview(value);
      setIndex((i) => Math.min(i, value.document.slides.length - 1));
      setStep(0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [id]);
  const slide = review?.document.slides[index],
    maxStep = Math.max(
      0,
      ...(slide?.elements
        .filter((e) => !e.hidden)
        .map((e) => e.animation?.step || 0) || []),
    );
  function next() {
    if (step < maxStep) setStep((s) => s + 1);
    else if (review && index < review.document.slides.length - 1) {
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
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        panel ||
        (event.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      if (
        event.key === " " &&
        (event.target as HTMLElement).closest("button,a")
      )
        return;
      if (["ArrowRight", "PageDown", " "].includes(event.key)) {
        event.preventDefault();
        next();
      }
      if (["ArrowLeft", "PageUp"].includes(event.key)) {
        event.preventDefault();
        previous();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [review, index, step, panel]);
  if (!review || presence.denied)
    return (
      <main className="page-error">
        <Brand />
        {error || presence.denied ? (
          <>
            <h1>This presentation isn’t available.</h1>
            <ErrorMessage>
              {error ||
                "Your access changed. Ask the owner to share this presentation with your account."}
            </ErrorMessage>
            <button className="button" onClick={load}>
              Try again
            </button>
            <a className="button" href="/">
              Back to workspace
            </a>
          </>
        ) : (
          <Loading label="Opening shared presentation…" />
        )}
      </main>
    );
  const doc = review.document,
    newRevision = (presence.state?.revision || 0) > review.revision;
  return (
    <main className="review-page">
      <header className="review-header">
        <a className="button" href="/">
          <ArrowLeft size={16} />
          Workspace
        </a>
        <div>
          <h1>{doc.title}</h1>
          <span>
            {review.owner} · Read-only review · Revision {review.revision}
          </span>
        </div>
        <div className="review-header-actions">
          <button className="button" onClick={() => setPanel("sharing")}>
            <Users size={16} />
            <span>People</span>
          </button>
          <button
            className="button primary"
            onClick={() => setPanel("comments")}
          >
            <MessageSquare size={16} />
            <span>Comments & review</span>
          </button>
          {review.role !== "viewer" && (
            <a className="button" href={`/deck/${id}`}>
              <PenLine size={16} />
              <span>Open editor</span>
            </a>
          )}
        </div>
      </header>
      <div className="review-meta">
        <PresenceBadge presence={presence} />
        <span>
          Viewing permission does not include private notes or answer keys.
        </span>
      </div>
      {(newRevision || error) && (
        <div className="review-update" role="status">
          <p>{error || "A newer saved revision is available."}</p>
          <button className="button" disabled={loading} onClick={load}>
            <RefreshCw size={15} />
            Refresh presentation
          </button>
        </div>
      )}
      <div className="review-stage">
        <AutoSlide doc={doc} slide={slide!} step={step} />
      </div>
      <footer className="review-controls">
        <IconButton
          label="Previous slide or step"
          disabled={index === 0 && step === 0}
          onClick={previous}
        >
          <ChevronLeft size={23} />
        </IconButton>
        <span>
          Slide {index + 1} / {doc.slides.length}
          {maxStep ? ` · step ${step + 1}/${maxStep + 1}` : ""}
        </span>
        <IconButton
          label="Next slide or step"
          disabled={index === doc.slides.length - 1 && step === maxStep}
          onClick={next}
        >
          <ChevronRight size={23} />
        </IconButton>
      </footer>
      <p className="review-caption">{slide!.title}</p>
      {panel === "comments" && (
        <Suspense fallback={<Loading label="Opening comments…" />}>
          <Comments
            doc={doc}
            slideId={slide!.id}
            userId={user.id}
            onNavigate={(slideId) => {
              const i = doc.slides.findIndex((s) => s.id === slideId);
              if (i >= 0) {
                setIndex(i);
                setStep(0);
                setPanel(null);
              }
            }}
            onClose={() => setPanel(null)}
          />
        </Suspense>
      )}
      {panel === "sharing" && (
        <Suspense fallback={<Loading label="Opening sharing…" />}>
          <Sharing id={id} onClose={() => setPanel(null)} />
        </Suspense>
      )}
    </main>
  );
}
