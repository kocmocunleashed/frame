import { useEffect, useState } from "react";
import { Copy, Users, UserPlus, RefreshCw } from "lucide-react";
import type { Sharing as SharingState } from "../../shared/collaboration";
import { api, json } from "../lib/api";
import { Modal, Loading, ErrorMessage } from "./UI";
export default function Sharing({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<SharingState | null>(null),
    [email, setEmail] = useState(""),
    [role, setRole] = useState<"viewer" | "editor">("viewer"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  async function load() {
    try {
      setState(await api(`/decks/${id}/access`));
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, [id]);
  async function change(
    email: string,
    role: "viewer" | "editor",
    expectedRole: "viewer" | "editor" | null,
  ) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      setState(
        await api(
          `/decks/${id}/access`,
          json("POST", { email, role, expectedRole }),
        ),
      );
      setEmail("");
      setStatus(
        `${role === "editor" ? "Editing" : "Viewing"} access updated. Share the link with them.`,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const url = `${location.origin}/review/${id}`;
  return (
    <Modal title="Share with people" onClose={onClose}>
      <div className="people-sharing">
        {!state && !error ? (
          <Loading label="Loading access…" />
        ) : (
          state && (
            <>
              <div className="people-intro">
                <Users size={25} />
                <p>
                  Bring someone into the story. Account access is separate from
                  publishing a public or unlisted snapshot.
                </p>
              </div>
              <p className="sharing-owner">
                <strong>{state.owner.name}</strong>
                <span>Owner</span>
              </p>
              {state.role === "owner" ? (
                <>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void change(email, role, null);
                    }}
                  >
                    <label>
                      Person’s Frame account email
                      <input
                        type="email"
                        aria-label="Sharing email"
                        value={email}
                        required
                        maxLength={254}
                        placeholder="name@example.com"
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </label>
                    <label>
                      Permission
                      <select
                        aria-label="Sharing permission"
                        value={role}
                        onChange={(e) => setRole(e.target.value as typeof role)}
                      >
                        <option value="viewer">
                          Viewer · view and comment
                        </option>
                        <option value="editor">
                          Editor · edit, present and export
                        </option>
                      </select>
                    </label>
                    <button className="button primary" disabled={busy}>
                      <UserPlus size={16} />
                      {busy ? "Updating access…" : "Add person"}
                    </button>
                  </form>
                  <p className="hint">
                    They need an existing Frame account. No email is sent; copy
                    and share the link yourself.
                  </p>
                  <div className="sharing-grants">
                    {state.grants.length ? (
                      state.grants.map((grant) => (
                        <article key={grant.userId}>
                          <div>
                            <strong>{grant.name}</strong>
                            <span>{grant.email}</span>
                            {grant.inheritedRole && (
                              <small>
                                Also has workspace {grant.inheritedRole} access
                              </small>
                            )}
                          </div>
                          <select
                            aria-label={`Permission for ${grant.email}`}
                            value={grant.role}
                            disabled={busy}
                            onChange={(e) =>
                              void change(
                                grant.email,
                                e.target.value as "editor" | "viewer",
                                grant.role,
                              )
                            }
                          >
                            <option value="viewer">Viewer</option>
                            <option value="editor">Editor</option>
                          </select>
                          <button
                            className="text-button destructive-text"
                            aria-label={`Remove access for ${grant.email}`}
                            disabled={busy}
                            onClick={async () => {
                              setBusy(true);
                              setError("");
                              try {
                                setState(
                                  await api(
                                    `/decks/${id}/access/${grant.userId}`,
                                    json("DELETE", {
                                      expectedRole: grant.role,
                                    }),
                                  ),
                                );
                                setStatus(
                                  "Direct access removed. Any inherited workspace access still applies.",
                                );
                              } catch (err) {
                                setError((err as Error).message);
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            Remove
                          </button>
                        </article>
                      ))
                    ) : (
                      <p className="hint">No direct access has been granted.</p>
                    )}
                  </div>
                </>
              ) : (
                <p className="hint">
                  You have {state.role} access. Ask {state.owner.name} to change
                  who can access this presentation.
                </p>
              )}
              <label>
                Account-only review link
                <input
                  aria-label="Private review link"
                  readOnly
                  value={url}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <button
                className="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    setStatus(
                      "Review link copied. Only authorized signed-in people can open it.",
                    );
                  } catch {
                    setStatus(
                      "Select the review link and copy it with your keyboard.",
                    );
                  }
                }}
              >
                <Copy size={15} />
                Copy review link
              </button>
              <p className="hint">
                Editors can read private notes and export content. Viewers see
                the presentation and comments; notes and unrevealed answers stay
                private. Saves use revision checks; typing and selections are
                not synchronized live.
              </p>
            </>
          )
        )}
        {error && (
          <ErrorMessage>
            {error}
            <button onClick={load}>
              <RefreshCw size={14} />
              Reload people
            </button>
          </ErrorMessage>
        )}
        {status && (
          <p role="status" className="sharing-status">
            {status}
          </p>
        )}
      </div>
    </Modal>
  );
}
