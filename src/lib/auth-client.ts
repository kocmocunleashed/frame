export function authReturnPath() {
  const next = new URLSearchParams(location.search).get("next");
  return next && /^\/(view|review)\/[^/?#]+$/.test(next) ? next : "/";
}
import { createAuthClient } from "better-auth/react";
import { useEffect, useState } from "react";
import { SOCIAL_PROVIDERS, type AuthCapabilities } from "../../shared/auth";
export const authClient = createAuthClient();

export function useAuthCapabilities() {
  const [config, setConfig] = useState<AuthCapabilities | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    fetch("/api/auth/config", { credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const value = await response.json();
        if (!Array.isArray(value.providers) || typeof value.email !== "boolean")
          throw new Error();
        if (active) {
          setConfig({
            email: value.email,
            providers: SOCIAL_PROVIDERS.filter((provider) =>
              value.providers.includes(provider),
            ),
          });
          setError("");
        }
      })
      .catch(() => {
        if (active) setError("Could not load sign-in options.");
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return { config, error, retry: () => setAttempt((value) => value + 1) };
}
