import { useState } from "react";
import { authClient, useAuthCapabilities } from "../lib/auth-client";
import { providerName } from "../../shared/auth";
type Account = { id: string; providerId: string; accountId: string };
type Session = {
  id: string;
  token: string;
  userAgent?: string | null;
  createdAt: string | Date;
};

export default function AccountConnections() {
  const { config, error: configError, retry } = useAuthCapabilities();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]),
    [sessions, setSessions] = useState<Session[]>([]),
    [current, setCurrent] = useState("");
  async function load() {
    const [identity, linked, active] = await Promise.all([
      authClient.getSession(),
      authClient.listAccounts(),
      authClient.listSessions(),
    ]);
    if (identity.error || linked.error || active.error || !identity.data)
      throw new Error(
        "Could not load account security. Sign in again or retry.",
      );
    setAccounts(linked.data as Account[]);
    setSessions(active.data as Session[]);
    setCurrent(identity.data.session.id);
  }
  async function act(operation: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await operation();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="account-security"
      aria-label="Sign-in methods and sessions"
    >
      <button
        type="button"
        className="button"
        aria-expanded={open}
        disabled={busy}
        onClick={() => {
          if (open) setOpen(false);
          else {
            setOpen(true);
            void act(load);
          }
        }}
      >
        Manage sign-in methods & sessions
      </button>
      {open && (
        <>
          <h3>Connected sign-in methods</h3>
          {accounts.map((account) => (
            <div className="account-security-actions" key={account.id}>
              <span>
                {account.providerId === "credential"
                  ? "Email and password"
                  : providerName(account.providerId)}
              </span>
              {account.providerId !== "credential" && accounts.length > 1 && (
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const result = await authClient.unlinkAccount({
                        accountId: account.id,
                      });
                      if (result.error)
                        throw new Error(
                          result.error.message ||
                            "Could not disconnect sign-in method.",
                        );
                      await load();
                    })
                  }
                >
                  Disconnect {providerName(account.providerId)}
                </button>
              )}
            </div>
          ))}
          {config?.providers
            .filter(
              (provider) =>
                !accounts.some((account) => account.providerId === provider),
            )
            .map((provider) => (
              <button
                key={provider}
                type="button"
                className="button"
                disabled={busy}
                onClick={() =>
                  void act(async () => {
                    const result = await authClient.linkSocial({
                      provider,
                      callbackURL: location.origin + "/",
                    });
                    if (result.error)
                      throw new Error(
                        result.error.message ||
                          "Could not connect sign-in method.",
                      );
                  })
                }
              >
                Connect {providerName(provider)}
              </button>
            ))}
          {accounts.length > 0 &&
            !accounts.some(
              (account) => account.providerId === "credential",
            ) && (
              <p>
                {config?.email ? (
                  <a href="/forgot-password">
                    Set a password through email recovery
                  </a>
                ) : (
                  "Use your connected provider to sign in. Email recovery is not configured."
                )}
              </p>
            )}
          {configError && (
            <p role="alert">
              {configError}{" "}
              <button type="button" className="button" onClick={retry}>
                Retry sign-in options
              </button>
            </p>
          )}
          <h3>Active sessions</h3>
          {busy && !sessions.length && (
            <p role="status">Loading account security…</p>
          )}
          {sessions.map((session) => (
            <div className="account-security-actions" key={session.id}>
              <span>
                {session.id === current ? "Current session" : "Other session"} ·{" "}
                {(session.userAgent || "Unknown browser").slice(0, 100)} ·{" "}
                {new Date(session.createdAt).toLocaleString()}
              </span>
              {session.id !== current && (
                <button
                  type="button"
                  className="button"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      const result = await authClient.revokeSession({
                        token: session.token,
                      });
                      if (result.error)
                        throw new Error(
                          result.error.message || "Could not end session.",
                        );
                      await load();
                    })
                  }
                >
                  Sign out session
                </button>
              )}
            </div>
          ))}
          {sessions.some((session) => session.id !== current) && (
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const result = await authClient.revokeOtherSessions();
                  if (result.error)
                    throw new Error(
                      result.error.message || "Could not end other sessions.",
                    );
                  await load();
                })
              }
            >
              Sign out other sessions
            </button>
          )}
          {error && (
            <p role="alert">
              {error}{" "}
              <button
                type="button"
                className="button"
                disabled={busy}
                onClick={() => void act(load)}
              >
                Retry account security
              </button>
            </p>
          )}
        </>
      )}
    </section>
  );
}
