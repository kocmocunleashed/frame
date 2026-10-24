import { useEffect, useState } from "react";
import { Download, LoaderCircle, RefreshCw } from "lucide-react";
import { uid, type FrameDocument } from "../../shared/schema";
import {
  EXPORT_FORMATS,
  type ExportFormat,
  type ExportResult,
} from "../../shared/exports";
import type { AIJob } from "../../shared/ai";
import { api, json, fetchDownload, download } from "../lib/api";
import { Modal, ErrorMessage, Loading } from "./UI";
export default function ExportPanel({
  doc,
  beforeExport,
  onClose,
}: {
  doc: FrameDocument;
  beforeExport: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [format, setFormat] = useState<ExportFormat>("pdf"),
    [scale, setScale] = useState(1),
    [jobs, setJobs] = useState<AIJob[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function load() {
    try {
      setJobs(await api(`/decks/${doc.id}/exports`));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 1500);
    return () => clearInterval(timer);
  }, [doc.id]);
  async function start() {
    setBusy(true);
    setError("");
    try {
      if (!(await beforeExport())) return;
      const saved = await api<FrameDocument>(`/decks/${doc.id}`);
      const job = await api<AIJob>(
        `/decks/${doc.id}/exports`,
        json("POST", {
          baseRevision: saved.revision,
          format,
          scale,
          key: uid(),
        }),
      );
      setJobs((old) => [job, ...old]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Export presentation" wide onClose={onClose}>
      <div className="export-panel">
        <section>
          <p className="eyebrow">TAKE YOUR STORY WITH YOU</p>
          <h3>Choose the format that fits.</h3>
          <div className="export-format-options">
            {EXPORT_FORMATS.map((item) => (
              <label
                key={item.id}
                className={format === item.id ? "active" : ""}
              >
                <input
                  type="radio"
                  name="export-format"
                  value={item.id}
                  checked={format === item.id}
                  onChange={() => setFormat(item.id)}
                />
                <span>
                  <strong>{item.name}</strong>
                  <small>{item.description}</small>
                </span>
              </label>
            ))}
          </div>
          {(format === "images" || format === "pptx") && (
            <label className="export-resolution">
              Image resolution
              <select
                aria-label="Export image resolution"
                value={scale}
                onChange={(e) => setScale(Number(e.target.value))}
              >
                <option value={0.5}>0.5× · smaller file</option>
                <option value={1}>1× · original slide dimensions</option>
                <option value={2}>2× · higher resolution</option>
              </select>
            </label>
          )}
          <p className="hint">
            Notes, answer keys and hidden layers are excluded. System fonts can
            vary on the export server; bundled fonts keep metrics consistent.
            Large media or decks may reach the documented render limits.
          </p>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <button
            className="button primary full"
            disabled={busy}
            onClick={() => void start()}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Download size={16} />
            )}
            Create {EXPORT_FORMATS.find((item) => item.id === format)!.name}
          </button>
          <button
            className="text-button export-backup"
            onClick={() =>
              download(
                new Blob([JSON.stringify(doc, null, 2)], {
                  type: "application/json",
                }),
                `${doc.title}.frame.json`,
              )
            }
          >
            Download private editable JSON backup
          </button>
          <p className="hint">
            The backup includes notes and answer keys and references your server
            media. Keep it private; it is not a portable media archive.
          </p>
        </section>
        <section className="export-history">
          <h3>Downloads & progress</h3>
          {loading ? (
            <Loading label="Loading export jobs…" />
          ) : !jobs.length ? (
            <p className="hint">
              Your exports will appear here. You can close this window and
              return while a job runs.
            </p>
          ) : (
            jobs.map((job) => {
              const result =
                  job.status === "succeeded"
                    ? (job.result as ExportResult)
                    : null,
                active = job.status === "queued" || job.status === "running";
              return (
                <article
                  className="export-job"
                  key={job.id}
                  data-export-job={job.id}
                >
                  <strong>
                    {result?.filename || "Preparing presentation export"}
                  </strong>
                  <span>
                    {job.status === "succeeded"
                      ? `${result!.format === "pptx" ? "Image-based PowerPoint" : result!.format.toUpperCase()} · ${(result!.bytes / 1024).toFixed(0)} KB`
                      : job.progress.step}
                  </span>
                  {active ? (
                    <>
                      <progress
                        value={job.progress.percent}
                        max={100}
                        aria-label="Export progress"
                      />
                      <button
                        className="text-button"
                        onClick={async () => {
                          try {
                            await api(
                              `/jobs/${job.id}/cancel`,
                              json("POST", {}),
                            );
                            await load();
                          } catch (err) {
                            setError((err as Error).message);
                          }
                        }}
                      >
                        Cancel export
                      </button>
                    </>
                  ) : result ? (
                    <>
                      <button
                        className="button"
                        aria-label={`Download ${result.filename}`}
                        onClick={async () => {
                          try {
                            setError("");
                            await fetchDownload(
                              `/api/exports/${job.id}/download`,
                            );
                          } catch (err) {
                            setError((err as Error).message);
                          }
                        }}
                      >
                        <Download size={15} />
                        Download
                      </button>
                      {result.warnings.length > 0 && (
                        <details>
                          <summary>Format notes</summary>
                          {result.warnings.map((warning, i) => (
                            <p key={i}>{warning}</p>
                          ))}
                        </details>
                      )}
                    </>
                  ) : (
                    <>
                      <p>
                        {job.error ||
                          "Export cancelled. Your presentation is unchanged."}
                      </p>
                      <button
                        className="button"
                        disabled={busy}
                        onClick={() => void start()}
                      >
                        <RefreshCw size={15} />
                        New export with selected settings
                      </button>
                    </>
                  )}
                </article>
              );
            })
          )}
        </section>
      </div>
    </Modal>
  );
}
