import { useEffect, useRef, useState } from "react";
import {
  FileText,
  Plus,
  Trash2,
  Upload,
  Check,
  LoaderCircle,
} from "lucide-react";
import type { SourceRecord } from "../../shared/ai";
import { api, json } from "../lib/api";
import { ErrorMessage, IconButton, Modal } from "./UI";
export default function SourcePicker({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [sources, setSources] = useState<SourceRecord[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [paste, setPaste] = useState(false),
    [inspect, setInspect] = useState<SourceRecord | null>(null);
  const file = useRef<HTMLInputElement>(null);
  async function load() {
    try {
      setSources(await api("/sources"));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      void load();
    }, 2000);
    return () => clearInterval(interval);
  }, []);
  const total = sources
    .filter((s) => selected.includes(s.id))
    .reduce((n, s) => n + s.text.length, 0);
  async function upload(chosen: File) {
    setBusy(true);
    setError("");
    try {
      const body = new FormData();
      body.set("file", chosen);
      await api("/sources", { method: "POST", body });
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }
  return (
    <section className="source-picker" aria-label="Source material">
      <div className="source-actions">
        <button
          className="button"
          disabled={busy}
          onClick={() => file.current?.click()}
        >
          <Upload size={16} />
          {busy ? "Uploading…" : "Upload document"}
        </button>
        <button className="button" onClick={() => setPaste(true)}>
          <Plus size={16} />
          Paste text
        </button>
        <input
          hidden
          ref={file}
          type="file"
          aria-label="Upload source document"
          accept=".pdf,.docx,.txt,.md,.markdown,.csv"
          onChange={(e) => {
            if (e.target.files?.[0]) void upload(e.target.files[0]);
          }}
        />
      </div>
      <p className="hint">
        PDF, DOCX, TXT, Markdown or CSV · up to 10 MB. Text extraction takes
        place on your server. Scans need OCR first. Included text is sent to the
        AI provider when you start generation.
      </p>
      {error && (
        <ErrorMessage>
          {error}{" "}
          <button
            onClick={() => {
              setError("");
              void load();
            }}
          >
            Retry
          </button>
        </ErrorMessage>
      )}
      {loading ? (
        <p role="status">Loading sources…</p>
      ) : !sources.length ? (
        <div className="source-empty">
          <FileText size={30} />
          <strong>Give your story a starting point.</strong>
          <p>
            Include course material, research or your own notes. Sources are
            optional.
          </p>
        </div>
      ) : (
        <div className="source-list">
          {sources.map((source) => (
            <article className="source-row" key={source.id}>
              <label>
                <input
                  type="checkbox"
                  aria-label={`Include ${source.name}`}
                  checked={selected.includes(source.id)}
                  disabled={source.status !== "ready" || !source.text}
                  onChange={(e) =>
                    onChange(
                      e.target.checked
                        ? [...selected, source.id]
                        : selected.filter((id) => id !== source.id),
                    )
                  }
                />
                <FileText size={21} />
                <span>
                  <strong>{source.name}</strong>
                  <small>
                    {source.status === "ready"
                      ? `${source.text.length.toLocaleString()} characters${source.warnings.length ? " · review warnings" : ""}`
                      : source.status === "failed"
                        ? source.error || "Extraction failed"
                        : source.status === "cancelled"
                          ? "Extraction cancelled"
                          : "Extracting text…"}
                  </small>
                </span>
              </label>
              {source.status === "running" || source.status === "queued" ? (
                <>
                  <LoaderCircle className="spin" size={17} />
                  <button
                    className="text-button"
                    onClick={async () => {
                      try {
                        await api(
                          `/jobs/${source.jobId}/cancel`,
                          json("POST", {}),
                        );
                        await load();
                      } catch (err) {
                        setError((err as Error).message);
                      }
                    }}
                  >
                    Cancel
                  </button>
                </>
              ) : source.status === "ready" ? (
                <button
                  className="text-button"
                  onClick={() => setInspect(source)}
                >
                  Inspect text
                </button>
              ) : null}
              <IconButton
                label={`Remove source ${source.name}`}
                onClick={async () => {
                  try {
                    await api(`/sources/${source.id}`, { method: "DELETE" });
                    onChange(selected.filter((id) => id !== source.id));
                    await load();
                  } catch (err) {
                    setError((err as Error).message);
                  }
                }}
              >
                <Trash2 size={16} />
              </IconButton>
            </article>
          ))}
        </div>
      )}
      <p
        className={`source-budget ${total > 120000 ? "over" : ""}`}
        role="status"
      >
        <Check size={15} />
        {selected.length} included · {total.toLocaleString()} / 120,000
        characters per request
      </p>
      {paste && (
        <Modal
          title="Paste source text"
          onClose={() => !busy && setPaste(false)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const values = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                const source = await api<SourceRecord>(
                  "/sources",
                  json("POST", {
                    name: values.get("name"),
                    text: values.get("text"),
                  }),
                );
                onChange([...selected, source.id]);
                await load();
                setPaste(false);
              } catch (err) {
                setError((err as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              Source name
              <input
                name="name"
                aria-label="Source name"
                required
                maxLength={200}
                placeholder="e.g. Workshop notes"
              />
            </label>
            <label>
              Source text
              <textarea
                name="text"
                aria-label="Source text"
                required
                rows={10}
                maxLength={200000}
              />
            </label>
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <div className="modal-actions">
              <button className="button primary" disabled={busy}>
                {busy ? "Saving…" : "Add source"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {inspect && (
        <Modal title={inspect.name} wide onClose={() => setInspect(null)}>
          {inspect.warnings.map((warning, i) => (
            <p className="source-warning" key={i}>
              {warning}
            </p>
          ))}
          <label className="source-inspection">
            Extracted text
            <textarea
              aria-label="Extracted source text"
              readOnly
              rows={16}
              value={inspect.text}
            />
          </label>
        </Modal>
      )}
    </section>
  );
}
