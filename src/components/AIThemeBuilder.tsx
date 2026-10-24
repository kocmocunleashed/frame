import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ImagePlus,
  LoaderCircle,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { uid, type FrameDocument, type Theme } from "../../shared/schema";
import type { AIJob } from "../../shared/ai";
import { api, json } from "../lib/api";
import { Modal, ErrorMessage, IconButton } from "./UI";
import { ThemePreview } from "./ThemeDesigner";
type ThemeResult = {
  theme: Theme;
  warnings: string[];
  description: string;
  referenceAssetId: string | null;
};
export default function AIThemeBuilder({
  initial,
  doc,
  onTheme,
  onClose,
}: {
  initial: Theme;
  doc: FrameDocument;
  onTheme: (theme: Theme) => void;
  onClose: () => void;
}) {
  const [prompt, setPrompt] = useState(""),
    [reference, setReference] = useState<{
      id: string;
      src: string;
      name: string;
    } | null>(null),
    [job, setJob] = useState<AIJob | null>(null),
    [previous, setPrevious] = useState<AIJob[]>([]),
    [configured, setConfigured] = useState<boolean | null>(null),
    [supportsImages, setSupportsImages] = useState(true),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let stopped = false;
    void Promise.all([
      api<{ configured: boolean; supportsImages?: boolean }>("/ai/status"),
      api<AIJob[]>("/theme-jobs"),
    ])
      .then(([status, attempts]) => {
        if (stopped) return;
        setConfigured(status.configured);
        setSupportsImages(status.supportsImages !== false);
        setPrevious(attempts);
        if (attempts[0]) {
          setJob(attempts[0]);
        }
      })
      .catch((err) => {
        if (!stopped) setError((err as Error).message);
      });
    return () => {
      stopped = true;
    };
  }, []);
  const active = job?.status === "queued" || job?.status === "running",
    jobId = job?.id,
    jobStatus = job?.status,
    result = job?.status === "succeeded" ? (job.result as ThemeResult) : null;
  useEffect(() => {
    if (job?.status === "succeeded") {
      const ref = (job.result as ThemeResult).referenceAssetId;
      setReference(
        ref
          ? { id: ref, src: `/api/assets/${ref}`, name: "Theme reference" }
          : null,
      );
    }
  }, [job?.id, job?.status]);
  useEffect(() => {
    if (!jobId || !["running", "queued"].includes(jobStatus || "")) return;
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
        if (["queued", "running"].includes(value.status))
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
  async function generate(refine: boolean) {
    setBusy(true);
    setError("");
    try {
      const value = await api<AIJob>(
        "/theme-jobs",
        json("POST", {
          prompt,
          baseTheme: refine && result ? result.theme : initial,
          referenceAssetId: reference?.id || null,
          key: uid(),
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
    <Modal title="Describe a theme" wide onClose={onClose}>
      <div className="ai-theme-builder">
        <div className="ai-theme-brief">
          <p className="eyebrow">YOUR VISUAL DIRECTION</p>
          <h3>Set the atmosphere.</h3>
          <p className="hint">
            Describe the feeling, typography, color and materials. Try “warm
            editorial, confident serif headlines, cream paper and deep red
            accents.”
          </p>
          <label>
            Theme description
            <textarea
              aria-label="AI theme description"
              rows={5}
              maxLength={4000}
              disabled={active || busy || uploading}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={
                result
                  ? "How should this direction change?"
                  : "What should your presentation feel like?"
              }
            />
          </label>
          <input
            ref={file}
            hidden
            type="file"
            aria-label="Upload theme reference"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              const chosen = e.target.files?.[0];
              if (!chosen) return;
              setUploading(true);
              setError("");
              try {
                const body = new FormData();
                body.set("file", chosen);
                setReference(await api("/assets", { method: "POST", body }));
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setUploading(false);
                e.target.value = "";
              }
            }}
          />
          {reference ? (
            <div className="theme-reference">
              <img src={reference.src} alt="Your theme inspiration" />
              <span>{reference.name}</span>
              <IconButton
                label="Remove theme reference"
                disabled={active || busy || uploading}
                onClick={() => setReference(null)}
              >
                <Trash2 size={16} />
              </IconButton>
            </div>
          ) : (
            <button
              className="button full"
              disabled={active || busy || uploading || !supportsImages}
              onClick={() => file.current?.click()}
            >
              <ImagePlus size={16} />
              {uploading ? "Uploading reference…" : "Add a reference image"}
            </button>
          )}
          <p className="hint">
            {supportsImages
              ? "Optional · PNG, JPEG or WebP · 8 MB after normalization. The image is sent to the provider only when you generate a theme. It guides the style; no slide content or code is created."
              : "This model supports text descriptions. Describe the reference colors, typography and mood; image inputs are unavailable."}
          </p>
          {configured === false && (
            <div className="ai-setup-state">
              <strong>AI needs a server connection.</strong>
              <p>
                Ask the server owner to connect an AI provider. The manual theme
                designer remains available.
              </p>
            </div>
          )}
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <div className="ai-theme-actions">
            <button
              className="button primary"
              disabled={
                !configured ||
                active ||
                busy ||
                uploading ||
                prompt.trim().length < 5
              }
              onClick={() => void generate(!!result)}
            >
              {result ? <RefreshCw size={16} /> : null}
              {result ? "Refine this direction" : "Generate theme"}
              <ArrowRight size={16} />
            </button>
            {result && (
              <button
                className="button"
                disabled={
                  !configured ||
                  active ||
                  busy ||
                  uploading ||
                  prompt.trim().length < 5
                }
                onClick={() => void generate(false)}
              >
                Start from the original theme
              </button>
            )}
          </div>
          {previous.length > 1 && (
            <label>
              Previous directions
              <select
                aria-label="Previous theme directions"
                value={job?.id || ""}
                onChange={(e) => {
                  const item = previous.find((j) => j.id === e.target.value);
                  if (item) setJob(item);
                }}
              >
                {previous.map((item) => (
                  <option key={item.id} value={item.id}>
                    {new Date(item.createdAt).toLocaleTimeString()} ·{" "}
                    {item.status}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        <div className="ai-theme-preview">
          {active && job ? (
            <div className="creation-job active" role="status">
              <LoaderCircle className="spin" size={26} />
              <h3>{job.progress.step}</h3>
              <progress
                value={job.progress.percent}
                max={100}
                aria-label="AI theme progress"
              />
              <p>
                You can close this builder and return to the latest attempt from
                the design library.
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
                Cancel theme generation
              </button>
            </div>
          ) : result ? (
            <>
              <ThemePreview theme={result.theme} doc={doc} />
              <h3>{result.theme.name}</h3>
              <p>{result.theme.description}</p>
              {result.warnings.map((warning, i) => (
                <p className="source-warning" key={i}>
                  {warning}
                </p>
              ))}
              <button
                className="button primary full"
                disabled={busy || uploading}
                onClick={() => {
                  onTheme(result.theme);
                  onClose();
                }}
              >
                Use in theme designer
              </button>
              <p className="hint">
                Adjust tokens directly, then save it to your workspace library.
                Applying uses the scope selected in the editor; geometry and
                explicit overrides remain intact.
              </p>
            </>
          ) : job ? (
            <div className="creation-job">
              <h3>
                {job.status === "cancelled"
                  ? "Theme generation cancelled"
                  : "This theme could not be generated"}
              </h3>
              <p>{job.error || "The existing design is unchanged."}</p>
              <p>Refine the description and start a new attempt.</p>
            </div>
          ) : (
            <>
              <ThemePreview theme={initial} doc={doc} />
              <p className="hint">
                Your current design is the starting point. Generation creates a
                separate preview.
              </p>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
