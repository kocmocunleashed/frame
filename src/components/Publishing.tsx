import { useEffect, useState } from "react";
import { Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { uid, type FrameDocument } from "../../shared/schema";
import type { Publication, PublishedView } from "../../shared/publications";
import { api, json } from "../lib/api";
import { Modal, ErrorMessage, Loading } from "./UI";
export default function Publishing({
  doc,
  beforePublish,
  onClose,
}: {
  doc: FrameDocument;
  beforePublish: () => Promise<boolean>;
  onClose: () => void;
}) {
  const [publication, setPublication] = useState<Publication | null>(null),
    [visibility, setVisibility] =
      useState<Publication["visibility"]>("unlisted"),
    [allowDownload, setAllowDownload] = useState(false),
    [downloadState, setDownloadState] =
      useState<PublishedView["downloadsState"]>("disabled"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const value = await api<Publication | null>(
        `/decks/${doc.id}/publication`,
      );
      setPublication(value);
      if (value) {
        setVisibility(value.visibility);
        setAllowDownload(value.allowDownload);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [doc.id]);
  useEffect(() => {
    if (!publication?.allowDownload) {
      setDownloadState("disabled");
      return;
    }
    let stopped = false;
    const check = async () => {
      try {
        const view = await api<PublishedView>(
          `/publications/${publication.id}`,
        );
        if (!stopped && view.publication.revision === publication.revision)
          setDownloadState(view.downloadsState);
      } catch (err) {
        if (!stopped) setError((err as Error).message);
      }
    };
    void check();
    const timer = setInterval(() => void check(), 2500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [publication?.id, publication?.revision, publication?.allowDownload]);
  const url = publication ? `${location.origin}/view/${publication.id}` : "";
  async function publish() {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      if (!(await beforePublish())) return;
      const saved = await api<FrameDocument>(`/decks/${doc.id}`);
      const value = await api<Publication>(
        `/decks/${doc.id}/publication`,
        json("POST", {
          baseRevision: saved.revision,
          expectedEdition: publication?.revision || null,
          visibility,
          allowDownload,
        }),
      );
      setPublication(value);
      setStatus(
        `Published version ${value.revision}. Draft edits will not change this version until you publish an update.`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Publish & share" onClose={() => !busy && onClose()}>
      <div className="publishing-panel">
        {loading ? (
          <Loading label="Loading publishing settings…" />
        ) : (
          <>
            <div className="publishing-intro">
              <ShieldCheck size={25} />
              <p>
                Publish a read-only snapshot. Keep editing the original; your
                shared version stays stable.
              </p>
            </div>
            <label>
              Who can view?
              <select
                aria-label="Published visibility"
                value={visibility}
                disabled={busy}
                onChange={(e) =>
                  setVisibility(e.target.value as Publication["visibility"])
                }
              >
                <option value="private">Private · signed-in access only</option>
                <option value="unlisted">
                  Unlisted · anyone with the link
                </option>
                <option value="public">Public · listed in the gallery</option>
              </select>
            </label>
            <p className="hint">
              {visibility === "private"
                ? "Only signed-in users with access to this workspace can view the private snapshot."
                : visibility === "unlisted"
                  ? "Anyone who has this link can view. It is kept out of the public gallery and marked for no indexing."
                  : "This presentation can be viewed by anyone and appears in the public gallery."}
            </p>
            <label className="publishing-download-toggle">
              <input
                type="checkbox"
                checked={allowDownload}
                disabled={busy}
                onChange={(e) => setAllowDownload(e.target.checked)}
              />
              <span>
                Allow PDF and standalone HTML downloads
                <small>
                  Prepared from this published snapshot. PDF flattens
                  interactions; HTML runs local steps without a live audience
                  session.
                </small>
              </span>
            </label>
            {publication && (
              <div className="publication-current">
                <strong>Published version {publication.revision}</strong>
                <span>
                  {publication.documentRevision === doc.revision
                    ? "The saved draft matches this snapshot."
                    : "The working document has unpublished changes."}
                </span>
                {publication.allowDownload && (
                  <div className="publication-download-status" role="status">
                    <span>
                      {downloadState === "ready"
                        ? "PDF and HTML downloads are ready."
                        : downloadState === "failed"
                          ? "Some downloads could not be prepared."
                          : "Preparing PDF and HTML downloads…"}
                    </span>
                    {downloadState === "failed" && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            await api(
                              `/decks/${doc.id}/publication/downloads`,
                              json("POST", {
                                expectedEdition: publication.revision,
                                key: uid(),
                              }),
                            );
                            setDownloadState("preparing");
                          } catch (err) {
                            setError((err as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Retry snapshot downloads
                      </button>
                    )}
                  </div>
                )}
                <label>
                  Read-only link
                  <input
                    aria-label="Published presentation link"
                    readOnly
                    value={url}
                    onFocus={(e) => e.target.select()}
                  />
                </label>
                <div className="publication-link-actions">
                  <button
                    className="button"
                    onClick={async () => {
                      try {
                        if (!navigator.clipboard) throw new Error();
                        await navigator.clipboard.writeText(url);
                        setStatus("Link copied.");
                      } catch {
                        setStatus(
                          "Select the read-only link and copy it with your keyboard.",
                        );
                      }
                    }}
                  >
                    <Copy size={15} />
                    Copy link
                  </button>
                  <a
                    className="button"
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink size={15} />
                    Open published view
                  </a>
                </div>
              </div>
            )}
            {error && (
              <ErrorMessage>
                {error}
                <button onClick={load}>Reload settings</button>
              </ErrorMessage>
            )}
            {status && (
              <p className="publishing-status" role="status">
                {status}
              </p>
            )}
            <p className="hint">
              Speaker notes, hidden answer keys, explanations and source records
              stay private. Revoking stops future access; downloaded copies
              cannot be revoked.
            </p>
            <div className="publishing-actions">
              {publication && (
                <button
                  className="button destructive-text"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      await api(
                        `/decks/${doc.id}/publication/revoke`,
                        json("POST", {
                          id: publication.id,
                          expectedEdition: publication.revision,
                        }),
                      );
                      setPublication(null);
                      setStatus(
                        "Link revoked. Publishing again creates a new link.",
                      );
                    } catch (err) {
                      setError((err as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Revoke link
                </button>
              )}
              <button
                className="button primary"
                disabled={busy || !!error}
                onClick={() => void publish()}
              >
                {busy
                  ? "Publishing…"
                  : publication
                    ? "Publish update"
                    : "Publish version"}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
