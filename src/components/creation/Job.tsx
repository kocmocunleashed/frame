import { useEffect, useState } from "react";
import {
  Check,
  Clock3,
  LoaderCircle,
  RefreshCw,
  WifiOff,
  X,
} from "lucide-react";
import type { AIJob } from "../../../shared/ai";
import {
  creationProgress,
  elapsedLabel,
  elapsedSeconds,
} from "../../lib/creation-progress";

export default function CreationJob({
  job,
  onCancel,
  onRetry,
  hasSources = false,
  connectionLost = false,
}: {
  job: AIJob;
  onCancel: () => void;
  onRetry: () => void;
  hasSources?: boolean;
  connectionLost?: boolean;
}) {
  const active = job.status === "queued" || job.status === "running";
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [job.id, active]);
  const { stages, current, waitingForAI } = creationProgress(job, hasSources);
  const elapsed = elapsedSeconds(job.createdAt, now);
  const stale =
    job.status === "running" && elapsedSeconds(job.updatedAt, now) >= 45;
  const title =
    job.status === "failed"
      ? "This attempt couldn’t finish."
      : job.status === "cancelled"
        ? "Generation stopped."
        : job.status === "succeeded"
          ? "Ready to review."
          : connectionLost
            ? "Reconnecting to your generation…"
            : job.status === "queued"
              ? job.attempts > 0
                ? "A retry is scheduled."
                : "Waiting to get started."
              : job.progress.step;
  const explanation = connectionLost
    ? "We can’t reach the server right now. We’re retrying automatically; this doesn’t confirm whether generation has stopped."
    : job.status === "queued"
      ? job.attempts > 0
        ? "A temporary error interrupted the attempt. The server will retry automatically. You don’t need to submit it again."
        : "Your request is saved in the queue. This page will update when generation starts."
      : job.progress.step.includes("retry")
        ? "A temporary provider failure interrupted this batch. A bounded retry is scheduled; completed slides remain saved."
        : active
          ? stages[current]?.detail
          : job.status === "succeeded"
            ? "Your result is saved and ready for your review."
            : "Your saved draft is safe. You can start a new attempt when you’re ready.";
  const notice = connectionLost
    ? "Waiting for a connection"
    : stale
      ? "Waiting for a fresh server update"
      : elapsed >= 60 && waitingForAI
        ? "Still waiting for the AI’s full response"
        : null;
  return (
    <section
      className={`story-job ${active ? "is-running" : ""} ${connectionLost || stale ? "is-disconnected" : ""}`}
      aria-label="Generation progress"
    >
      {active && (
        <div className="story-job-live">
          <span className="story-job-connection">
            {connectionLost ? (
              <WifiOff size={14} />
            ) : (
              <LoaderCircle size={14} />
            )}{" "}
            {connectionLost
              ? "Reconnecting"
              : stale
                ? "Checking for updates"
                : job.status === "queued"
                  ? "Request queued"
                  : "Generation in progress"}
          </span>
          <span
            className="story-job-timer"
            role="timer"
            aria-label={`${elapsed} seconds elapsed`}
          >
            <Clock3 size={14} />
            <span>{elapsedLabel(elapsed)}</span> elapsed
          </span>
        </div>
      )}
      <div className="story-job-workspace" aria-hidden="true">
        <div className="story-job-sheet back" />
        <div className="story-job-sheet front">
          <span className="story-job-sheet-number">
            {job.kind === "outline" ? "STORY / OUTLINE" : "SLIDES / PREVIEW"}
          </span>
          <b />
          <b />
          <i />
          <i />
          <i />
          <div className="story-job-scan" />
        </div>
        <span className="story-job-mark">
          {active ? (
            <LoaderCircle size={22} />
          ) : job.status === "succeeded" ? (
            <Check size={22} />
          ) : (
            <X size={22} />
          )}
        </span>
      </div>
      <div role="status" aria-live="polite" aria-atomic="true">
        <h2>{title}</h2>
      </div>
      <p className="story-job-explanation">{explanation}</p>
      {active && (
        <>
          <div className="story-job-activity" aria-hidden="true">
            <span />
          </div>
          <div className="story-job-step-label">
            {current < 0
              ? "Your work starts here"
              : `Step ${current + 1} of ${stages.length}`}
          </div>
          <ol className="story-job-stages">
            {stages.map((stage, i) => (
              <li
                key={stage.title}
                className={
                  i < current ? "done" : i === current ? "current" : ""
                }
                aria-current={i === current ? "step" : undefined}
              >
                <span>
                  {i < current ? (
                    <Check size={13} />
                  ) : i === current ? (
                    <LoaderCircle size={13} />
                  ) : (
                    String(i + 1).padStart(2, "0")
                  )}
                </span>
                <div>
                  {stage.title}
                  <small>
                    {i < current
                      ? "Complete"
                      : i === current
                        ? connectionLost || stale
                          ? "Last known step"
                          : "In progress"
                        : "Up next"}
                  </small>
                </div>
              </li>
            ))}
          </ol>
          {notice && (
            <div className="story-job-notice" role="status">
              <strong>{notice}</strong>
              <p>
                {connectionLost
                  ? "Keep this page open to reconnect, or return to your saved draft later."
                  : stale
                    ? "We haven’t received a recent update from the server. We’re checking again; you can cancel or come back later."
                    : "The current step stays here until its response arrives. You can return to Workspace and come back while this runs."}
              </p>
            </div>
          )}
          <div className="story-job-footer">
            <p>
              Your draft is saved. You can leave this page and return to check
              the result.
            </p>
            <button className="creation-button quiet" onClick={onCancel}>
              Cancel generation
            </button>
          </div>
        </>
      )}
      {job.error && <p className="story-job-error">{job.error}</p>}
      {!active && job.status !== "succeeded" && (
        <button className="creation-button main" onClick={onRetry}>
          <RefreshCw size={16} />{" "}
          {job.totalSlides !== undefined
            ? "Resume generation"
            : "Start a new attempt"}
        </button>
      )}
    </section>
  );
}
