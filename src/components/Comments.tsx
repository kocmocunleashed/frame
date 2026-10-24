import { useEffect, useState } from "react";
import { Check, MessageSquare, RefreshCw, Trash2 } from "lucide-react";
import type { ReviewComment } from "../../shared/collaboration";
import { api, json } from "../lib/api";
import { ErrorMessage, Loading, Modal } from "./UI";
type Reviewable = {
  id: string;
  slides: {
    id: string;
    title: string;
    elements: { id: string; name: string }[];
  }[];
};
export default function Comments({
  doc,
  slideId,
  elementId,
  userId,
  onNavigate,
  onClose,
}: {
  doc: Reviewable;
  slideId: string;
  elementId?: string;
  userId: string;
  onNavigate: (slideId: string) => void;
  onClose: () => void;
}) {
  const key = `frame:comment:${userId}:${doc.id}`,
    [body, setBody] = useState(() => {
      try {
        return localStorage.getItem(key) || "";
      } catch {
        return "";
      }
    }),
    [items, setItems] = useState<ReviewComment[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(""),
    [resolved, setResolved] = useState(false),
    [currentOnly, setCurrentOnly] = useState(false),
    [anchor, setAnchor] = useState<"slide" | "object" | "deck">(
      elementId ? "object" : "slide",
    );
  useEffect(() => {
    try {
      if (body) localStorage.setItem(key, body);
      else localStorage.removeItem(key);
    } catch {}
  }, [body, key]);
  async function load() {
    try {
      setItems(await api(`/decks/${doc.id}/comments`));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    void load();
    const timer = setInterval(() => {
      if (active) void load();
    }, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [doc.id]);
  async function send() {
    setBusy("new");
    setError("");
    try {
      await api(
        `/decks/${doc.id}/comments`,
        json("POST", {
          body,
          slideId: anchor === "deck" ? null : slideId,
          elementId: anchor === "object" ? elementId || null : null,
        }),
      );
      setBody("");
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy("");
    }
  }
  const visible = items.filter(
    (item) =>
      (resolved || !item.resolvedAt) &&
      (!currentOnly || item.slideId === slideId),
  );
  return (
    <Modal title="Comments & review" wide onClose={onClose}>
      <div className="comments-layout">
        <section className="comment-compose">
          <p className="eyebrow">A FRESH PAIR OF EYES</p>
          <h3>Make the next draft stronger.</h3>
          <p className="hint">
            Comments are shared with authorized people. They stay separate from
            the presentation and its revision history.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label>
              Attach to
              <select
                aria-label="Comment location"
                value={anchor}
                onChange={(e) => setAnchor(e.target.value as typeof anchor)}
              >
                <option value="slide">Current slide</option>
                {elementId && <option value="object">Selected object</option>}
                <option value="deck">Whole presentation</option>
              </select>
            </label>
            <label>
              Your comment
              <textarea
                aria-label="Your comment"
                value={body}
                maxLength={4000}
                required
                rows={5}
                placeholder="What could make this clearer?"
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <small>
              {body.length}/4000 · Unsent text is kept on this device.
            </small>
            <button
              className="button primary"
              disabled={!!busy || !body.trim()}
            >
              <MessageSquare size={16} />
              {busy === "new" ? "Posting…" : "Post comment"}
            </button>
          </form>
          {error && (
            <ErrorMessage>
              {error}
              <button onClick={load}>
                <RefreshCw size={14} />
                Refresh comments
              </button>
            </ErrorMessage>
          )}
        </section>
        <section className="review-comments">
          <div className="comment-filters">
            <label>
              <input
                type="checkbox"
                checked={currentOnly}
                onChange={(e) => setCurrentOnly(e.target.checked)}
              />
              Current slide only
            </label>
            <label>
              <input
                type="checkbox"
                checked={resolved}
                onChange={(e) => setResolved(e.target.checked)}
              />
              Show resolved
            </label>
          </div>
          {loading ? (
            <Loading label="Loading comments…" />
          ) : visible.length ? (
            visible.map((item) => {
              const slide = doc.slides.find((s) => s.id === item.slideId),
                object = slide?.elements.find((e) => e.id === item.elementId);
              return (
                <article
                  className={`review-comment ${item.resolvedAt ? "resolved" : ""}`}
                  key={item.id}
                >
                  <header>
                    <strong>{item.author}</strong>
                    <time dateTime={item.createdAt}>
                      {new Date(item.createdAt).toLocaleDateString()}
                    </time>
                  </header>
                  <button
                    className="comment-anchor"
                    disabled={!slide}
                    onClick={() => {
                      if (slide) onNavigate(slide.id);
                    }}
                  >
                    {!item.slideId
                      ? "Whole presentation"
                      : !slide
                        ? "Slide removed"
                        : `${slide.title}${item.elementId ? ` · ${object?.name || "Object removed"}` : ""}`}
                  </button>
                  <p>{item.body}</p>
                  {item.resolvedAt && (
                    <span className="comment-resolved">
                      <Check size={13} />
                      Resolved
                    </span>
                  )}
                  <div className="comment-actions">
                    {item.canResolve && (
                      <button
                        className="text-button"
                        disabled={!!busy}
                        onClick={async () => {
                          setBusy(item.id);
                          try {
                            await api(
                              `/decks/${doc.id}/comments/${item.id}`,
                              json("PATCH", { resolved: !item.resolvedAt }),
                            );
                            await load();
                          } catch (err) {
                            setError((err as Error).message);
                          } finally {
                            setBusy("");
                          }
                        }}
                      >
                        {item.resolvedAt ? "Reopen" : "Resolve"}
                      </button>
                    )}
                    {item.canDelete && (
                      <button
                        className="text-button destructive-text"
                        aria-label={`Delete comment by ${item.author}`}
                        disabled={!!busy}
                        onClick={async () => {
                          setBusy(item.id);
                          try {
                            await api(
                              `/decks/${doc.id}/comments/${item.id}`,
                              json("DELETE", {}),
                            );
                            await load();
                          } catch (err) {
                            setError((err as Error).message);
                          } finally {
                            setBusy("");
                          }
                        }}
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="comments-empty">
              <MessageSquare size={32} />
              <h3>
                {currentOnly
                  ? "No comments on this slide."
                  : "A little perspective starts here."}
              </h3>
              <p>
                {resolved
                  ? "Add the first review note."
                  : "Open comments will appear here. Use Show resolved to revisit completed notes."}
              </p>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
