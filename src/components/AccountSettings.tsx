import { useEffect, useId, useState, type FormEvent } from "react";
import type { User } from "../../shared/schema";
import type { AgentPreferences as Preferences } from "../../shared/agent";
import { api, json } from "../lib/api";
import AccountSecurity from "./AccountSecurity";
import AgentPreferences from "./AgentPreferences";
import { ErrorMessage, Loading } from "./UI";
import "../account-settings.css";

export default function AccountSettings({
  user,
  onUser,
  externalAccountUrl,
  onBusyChange,
  initialTab = "profile",
}: {
  user: User;
  onUser: (user: User) => void;
  externalAccountUrl?: string;
  onBusyChange: (busy: boolean) => void;
  initialTab?: "profile" | "ai";
}) {
  const id = useId();
  const [tab, setTab] = useState<"profile" | "ai">(initialTab);
  const [name, setName] = useState(user.name);
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");
  const signature = JSON.stringify(tab === "ai" ? preferences : name);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    api<Preferences>("/ai/preferences")
      .then((value) => {
        if (active) setPreferences(value);
      })
      .catch((err: Error) => {
        if (active)
          setLoadError(`Could not load your AI settings. ${err.message}`);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [loadAttempt]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || (tab === "ai" && (!preferences || loading || loadError)))
      return;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      if (tab === "ai") {
        const value = await api<Preferences>(
          "/ai/preferences",
          json("PUT", {...preferences,baseRevision:preferences?.revision||0}),
        );
        setPreferences(value);
        setSaved(JSON.stringify(value));
      } else {
        const result = await api<{ user: User }>(
          "/me",
          json("PATCH", { name }),
        );
        onUser(result.user);
        setName(result.user.name);
        setSaved(JSON.stringify(result.user.name));
      }
    } catch (err) {
      setError(`Could not save your settings. ${(err as Error).message}`);
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  return (
    <div className="account-settings">
      <div
        className="account-settings-tabs"
        role="tablist"
        aria-label="Account settings sections"
      >
        {(["profile", "ai"] as const).map((key) => (
          <button
            key={key}
            id={`${id}-${key}-tab`}
            type="button"
            role="tab"
            aria-selected={tab === key}
            aria-controls={`${id}-${key}-panel`}
            tabIndex={tab === key ? 0 : -1}
            disabled={busy}
            onClick={() => {
              setTab(key);
              setError("");
            }}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              )
                return;
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "profile"
                  : event.key === "End"
                    ? "ai"
                    : key === "ai"
                      ? "profile"
                      : "ai";
              setTab(next);
              setError("");
              document.getElementById(`${id}-${next}-tab`)?.focus();
            }}
          >
            {key === "profile" ? "Profile & security" : "AI settings"}
          </button>
        ))}
      </div>
      <form className="modal-form" onSubmit={save}>
        <div
          role="tabpanel"
          id={`${id}-${tab}-panel`}
          aria-labelledby={`${id}-${tab}-tab`}
        >
          <fieldset disabled={busy} className="account-settings-fields">
            {tab === "profile" ? (
              <>
                <label>
                  Your name
                  <input
                    name="name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={80}
                  />
                </label>
                <label>
                  Email
                  <input value={user.email} disabled />
                </label>
                <p className="muted">
                  Personal workspace · Your presentations are private.
                </p>
                <AccountSecurity
                  email={user.email}
                  externalAccountUrl={externalAccountUrl}
                />
              </>
            ) : loading ? (
              <Loading label="Loading your AI settings…" />
            ) : loadError ? (
              <>
                <ErrorMessage>{loadError}</ErrorMessage>
                <button
                  type="button"
                  className="button"
                  onClick={() => setLoadAttempt((value) => value + 1)}
                >
                  Retry loading settings
                </button>
              </>
            ) : (
              preferences && (
                <AgentPreferences
                  value={preferences}
                  onChange={setPreferences}
                />
              )
            )}
          </fieldset>
        </div>
        {error && <ErrorMessage>{error}</ErrorMessage>}
        <div className="account-settings-save">
          <span role="status">
            {saved === signature
              ? "Settings saved."
              : tab === "ai"
                ? "Applies to new presentations. Existing drafts keep their settings."
                : ""}
          </span>
          <button
            className="button primary"
            disabled={
              busy ||
              (tab === "ai" &&
                (loading || !!loadError || !preferences?.language.trim()))
            }
          >
            {busy ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
