import { useState } from "react";
import { authClient } from "../lib/auth-client";
import AccountConnections from "./AccountConnections";

export default function AccountSecurity({ email }: { email: string }) {
  const [open, setOpen] = useState(false),
    [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <section className="account-security" aria-label="Account security">
      <h3>Sign-in & security</h3>
      <p>{email}</p>
      <button type="button" className="button" onClick={() => setOpen(!open)}>
        Change password
      </button>
      {open && (
        <div className="modal-form">
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
          <label>
            New password
            <input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              minLength={10}
              maxLength={128}
            />
          </label>
          <button
            type="button"
            className="button"
            disabled={busy || next.length < 10 || !current}
            onClick={async () => {
              setBusy(true);
              setMessage("");
              try {
                const result = await authClient.changePassword({
                  currentPassword: current,
                  newPassword: next,
                  revokeOtherSessions: true,
                });
                if (result.error)
                  throw new Error(
                    result.error.message || "Could not change password.",
                  );
                setCurrent("");
                setNext("");
                setOpen(false);
                setMessage("Password changed. Other sessions were signed out.");
              } catch (error) {
                setMessage((error as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Save password
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      <AccountConnections />
    </section>
  );
}
