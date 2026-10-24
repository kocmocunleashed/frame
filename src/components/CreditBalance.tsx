import { useCallback, useEffect, useState } from "react";
import type { AccountCredits } from "../../shared/credits";
import { api } from "../lib/api";
import "../credits.css";

export function useCredits() {
  const [credits, setCredits] = useState<AccountCredits | null>(null);
  const [error, setError] = useState(false);
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((n) => n + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    api<AccountCredits>("/credits", { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setCredits(value);
          setError(false);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [version]);
  useEffect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);
  return { credits, error, refresh };
}

export default function CreditBalance({
  credits,
  error,
  refresh,
  compact = false,
}: ReturnType<typeof useCredits> & { compact?: boolean }) {
  return (
    <div
      className={`credit-balance ${compact ? "credit-compact" : ""} ${credits?.remaining === 0 ? "credit-empty" : ""}`}
      title={
        credits?.remaining === 0
          ? "Ask an administrator to add credits."
          : undefined
      }
    >
      {error ? (
        <button onClick={refresh}>Reload credit balance</button>
      ) : credits ? (
        <>
          <span>
            <strong>
              {credits.remaining === null
                ? "Unlimited"
                : credits.remaining.toLocaleString()}
            </strong>{" "}
            <span className="credit-kind">presentation </span>credits
          </span>
          {credits.remaining === 0 ? (
            <small>Ask an administrator to add credits.</small>
          ) : null}
        </>
      ) : (
        <span>Loading credits…</span>
      )}
    </div>
  );
}
