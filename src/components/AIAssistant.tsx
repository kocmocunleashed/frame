import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  LoaderCircle,
  RefreshCw,
  Check,
  Sparkles,
} from "lucide-react";
import { uid, type FrameDocument } from "../../shared/schema";
import type { AIEditResult, AIJob, EditScope } from "../../shared/ai";
import { api, json } from "../lib/api";
import { Modal, ErrorMessage } from "./UI";
import SourcePicker from "./SourcePicker";
import ProgressivePreviews from "./ProgressivePreviews";
import { AutoSlide } from "./SlideRenderer";
export default function AIAssistant({
  doc,
  slideId,
  selected,
  selectedSlideIds,
  beforeStart,
  onApply,
  onClose,
  initialIntent = "edit",
}: {
  doc: FrameDocument;
  slideId: string;
  selected: string[];
  selectedSlideIds: string[];
  beforeStart: () => Promise<boolean>;
  onApply: (jobId: string) => Promise<boolean>;
  onClose: () => void;
  initialIntent?: "edit" | "design" | "illustrate" | "animate";
}) {
  const [scope, setScope] = useState<EditScope["kind"]>(
      initialIntent !== "edit"
        ? "slide"
        : selected.length
          ? "objects"
          : "slide",
    ),
    [instruction, setInstruction] = useState(
      initialIntent === "illustrate"
        ? "Draw an editable vector illustration that explains this slide. Use its existing colors and available space."
        : "",
    ),
    [sourceIds, setSourceIds] = useState<string[]>([]),
    [job, setJob] = useState<AIJob | null>(null),
    [configured, setConfigured] = useState<boolean | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [previous, setPrevious] = useState<AIJob[]>([]);
  const [intent, setIntent] = useState(initialIntent);
  useEffect(() => {
    let mounted = true;
    void Promise.all([
      api<{ configured: boolean }>("/ai/status"),
      api<AIJob[]>(`/decks/${doc.id}/ai-jobs`),
    ])
      .then(([status, jobs]) => {
        if (mounted) {
          setConfigured(status.configured);
          setPrevious(jobs);
          if (jobs[0] && initialIntent === "edit") setJob(jobs[0]);
        }
      })
      .catch((err) => {
        if (mounted) setError((err as Error).message);
      });
    return () => {
      mounted = false;
    };
  }, [doc.id]);
  const jobId = job?.id,
    jobStatus = job?.status;
  useEffect(() => {
    if (!jobId || !["queued", "running"].includes(jobStatus || "")) return;
    let stopped = false,
      timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const value = await api<AIJob>(`/jobs/${jobId}`);
        if (stopped) return;
        setJob(value);
        setPrevious((old) =>
          old.map((item) => (item.id === value.id ? value : item)),
        );
        if (value.status === "running" || value.status === "queued")
          timer = setTimeout(() => void poll(), 1000);
      } catch (err) {
        if (!stopped) {
          setError((err as Error).message);
          timer = setTimeout(() => void poll(), 3000);
        }
      }
    }
    timer = setTimeout(() => void poll(), 500);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [jobId, jobStatus]);
  const result =
      job?.status === "succeeded" ? (job.result as AIEditResult) : null,
    active = job?.status === "running" || job?.status === "queued";
  const changedSlides = useMemo(() => {
    if (!result) return [];
    const ids = new Set(
      result.operations.flatMap((op) =>
        "slideId" in op
          ? [op.slideId]
          : op.type === "slide.insert"
            ? [op.slide.id]
            : [],
      ),
    );
    return result.preview.slides.filter((s) => ids.has(s.id));
  }, [result]);
  async function start(
    mode: "edit" | "regenerate" | "design" | "illustrate" | "animate",
    preset?: string,
    forceSlide = false,
    resumeJobId?: string,
  ) {
    setBusy(true);
    setError("");
    setJob(null);
    if (mode === "regenerate" || forceSlide) setScope("slide");
    if (preset) setInstruction(preset);
    try {
      if (!(await beforeStart())) return;
      const saved = await api<FrameDocument>(`/decks/${doc.id}`);
      const requested: EditScope = {
        kind: mode === "regenerate" || forceSlide ? "slide" : scope,
        slideIds:
          mode === "regenerate" ||
          forceSlide ||
          scope === "objects" ||
          scope === "slide"
            ? [slideId]
            : scope === "slides"
              ? selectedSlideIds
              : saved.slides.map((s) => s.id),
        elementIds:
          scope === "objects" &&
          (mode === "edit" || mode === "animate") &&
          !forceSlide
            ? selected
            : [],
      };
      const value = await api<AIJob>(
        `/decks/${doc.id}/ai`,
        json("POST", {
          baseRevision: saved.revision,
          scope: requested,
          instruction:
            mode === "regenerate"
              ? preset ||
                instruction.trim() ||
                "Regenerate this slide as a visual explanation using shapes, meaningful icons, diagrams or a comparison. Preserve its core message and put long explanations in notes."
              : preset || instruction,
          sourceIds,
          key: uid(),
          mode,
          resumeJobId,
        }),
      );
      setJob(value);
      setPrevious((old) => [value, ...old].slice(0, 10));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Edit with AI" wide onClose={onClose}>
      <div className="ai-assistant">
        <div className="ai-edit-controls">
          <p className="hint">
            Choose exactly what can change. Review the proposed result, then
            apply it with undo available.
          </p>
          <label>
            Editing scope
            <select
              aria-label="AI editing scope"
              value={scope}
              disabled={busy || active}
              onChange={(e) => setScope(e.target.value as EditScope["kind"])}
            >
              <option
                value="objects"
                disabled={
                  !selected.length ||
                  intent === "design" ||
                  intent === "illustrate"
                }
              >
                Selected objects ({selected.length})
              </option>
              <option value="slide">Current slide</option>
              <option value="slides" disabled={!selectedSlideIds.length}>
                Selected slides ({selectedSlideIds.length})
              </option>
              <option value="deck">Entire presentation</option>
            </select>
          </label>
          <label>
            AI action
            <select
              aria-label="AI action"
              value={intent}
              disabled={busy || active}
              onChange={(e) => {
                const next = e.target.value as typeof intent;
                setIntent(next);
                if (next === "design" || next === "illustrate")
                  setScope("slide");
              }}
            >
              <option value="edit">Edit content</option>
              <option value="design">Design independent slides</option>
              <option value="illustrate">Draw editable illustration</option>
              <option value="animate">Choreograph reveals</option>
            </select>
          </label>
          <label>
            Your instruction
            <textarea
              aria-label="AI edit instruction"
              rows={5}
              maxLength={4000}
              value={instruction}
              disabled={busy || active}
              placeholder="Rewrite this for beginners, keep the layout…"
              onChange={(e) => setInstruction(e.target.value)}
            />
          </label>
          <button
            className="button visual-ai-action"
            disabled={!configured || busy || active}
            onClick={() =>
              void start(
                "regenerate",
                "Make this slide visual: replace paragraphs with editable shapes, meaningful icons, a connected diagram, timeline, or comparison. Use the visual specification. Keep every factual point and put longer explanations in speaker notes. Do not invent numbers.",
              )
            }
          >
            <Sparkles size={16} /> Make this slide visual
          </button>
          <div className="creative-ai-actions">
            <button
              className="button"
              disabled={!configured || busy || active}
              onClick={() => {
                setIntent("design");
                void start(
                  "design",
                  instruction.trim() ||
                    "Redesign this slide freely with a custom palette, typography, composition and editable illustration. Preserve its substance.",
                  true,
                );
              }}
            >
              Redesign current slide
            </button>
            <button
              className="button"
              disabled={!configured || busy || active}
              onClick={() => {
                setIntent("animate");
                void start(
                  "animate",
                  instruction.trim() ||
                    "Reveal the argument step by step, grouping related objects with restrained timing.",
                );
              }}
            >
              Animate reveals
            </button>
          </div>
          <details>
            <summary>Source material</summary>
            <SourcePicker selected={sourceIds} onChange={setSourceIds} />
          </details>
          {configured === false && (
            <div className="ai-setup-state">
              <strong>AI needs a server connection.</strong>
              <p>
                Ask the server owner to connect an AI provider. Manual edits and
                presentation remain available.
              </p>
            </div>
          )}
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <div className="ai-edit-actions">
            <button
              className="button primary"
              disabled={
                !configured || busy || active || instruction.trim().length < 3
              }
              onClick={() => void start(intent)}
            >
              {busy
                ? "Preparing…"
                : intent === "illustrate"
                  ? "Preview illustration"
                  : intent === "design"
                    ? "Preview design"
                    : intent === "animate"
                      ? "Preview reveals"
                      : "Preview edit"}
              <ArrowRight size={16} />
            </button>
            <button
              className="button"
              disabled={!configured || busy || active}
              onClick={() => void start("regenerate")}
            >
              <RefreshCw size={16} />
              Regenerate current slide
            </button>
          </div>
          {previous.length > 1 && (
            <label>
              Previous attempts
              <select
                aria-label="Previous AI attempts"
                value={job?.id || ""}
                onChange={(e) => {
                  const value = previous.find((j) => j.id === e.target.value);
                  if (value) setJob(value);
                }}
              >
                {previous.map((j) => (
                  <option key={j.id} value={j.id}>
                    {new Date(j.createdAt).toLocaleTimeString()} · {j.status}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="ai-edit-preview">
          {job && job.status !== "succeeded" && (
            <ProgressivePreviews key={job.id} job={job} base={doc} />
          )}
          {job &&
            ["failed", "cancelled"].includes(job.status) &&
            job.totalSlides !== undefined && (
              <button
                className="button primary"
                onClick={() => void start(intent, undefined, false, job.id)}
              >
                Resume unfinished design
              </button>
            )}
          {active && job ? (
            <div className="creation-job active" role="status">
              <LoaderCircle className="spin" size={25} />
              <h3>{job.progress.step}</h3>
              <progress
                value={job.progress.percent}
                max={100}
                aria-label="AI edit progress"
              />
              <p>
                You can close this panel and return. The job continues on the
                server.
              </p>
              <button
                className="button"
                onClick={async () => {
                  try {
                    setJob(
                      await api(`/jobs/${job.id}/cancel`, json("POST", {})),
                    );
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                Cancel edit
              </button>
            </div>
          ) : result ? (
            <>
              <div className="ai-proposal-head">
                <Check size={19} />
                <strong>Proposed changes</strong>
              </div>
              <p>{result.summary}</p>
              <p className="hint">
                Scope:{" "}
                {result.scope.kind === "objects"
                  ? "Selected objects"
                  : result.scope.kind === "deck"
                    ? "Entire presentation"
                    : `${result.scope.slideIds.length} slide(s)`}
                . {changedSlides.length} slide(s) affected. Existing speaker
                notes remain private.
              </p>
              {changedSlides.map((s) => (
                <article className="ai-proposal-slide" key={s.id}>
                  <AutoSlide doc={result.preview} slide={s} />
                  <strong>{s.title}</strong>
                </article>
              ))}
              <button
                className="button primary full"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    if (await onApply(job!.id)) onClose();
                  } catch (err) {
                    setError((err as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Apply proposed changes
              </button>
              <p className="hint">
                Applying uses the normal editor history. Undo returns to the
                previous version. If the document changed during generation,
                start a new request.
              </p>
            </>
          ) : job ? (
            <div className="creation-job">
              <h3>
                {job.status === "cancelled"
                  ? "Edit cancelled"
                  : "Edit could not finish"}
              </h3>
              <p>{job.error || "Your presentation is unchanged."}</p>
            </div>
          ) : (
            <div className="ai-proposal-empty">
              <p className="eyebrow">YOUR CONTENT, YOUR CALL</p>
              <h3>A second pair of eyes.</h3>
              <p>
                Ask for clearer copy, a different layout, a comparison or a new
                question. A preview keeps you in control.
              </p>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
