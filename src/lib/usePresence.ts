import { useEffect, useState } from "react";
import type { Presence } from "../../shared/collaboration";
import { api, json, RequestError } from "./api";
export function usePresence(id: string, mode: "view" | "edit") {
  const [state, setState] = useState<Presence | null>(null),
    [connected, setConnected] = useState(true),
    [denied, setDenied] = useState(false);
  useEffect(() => {
    let active = true,
      pending = false;
    const heartbeat = async () => {
      if (pending || document.visibilityState === "hidden") return;
      pending = true;
      try {
        const value = await api<Presence>(
          `/decks/${id}/presence`,
          json("POST", { mode }),
        );
        if (active) {
          setState(value);
          setConnected(true);
          setDenied(false);
        }
      } catch (err) {
        if (active) {
          setConnected(false);
          setDenied(
            err instanceof RequestError && [401, 403, 404].includes(err.status),
          );
        }
      } finally {
        pending = false;
      }
    };
    void heartbeat();
    const timer = setInterval(() => void heartbeat(), 10000);
    window.addEventListener("online", heartbeat);
    document.addEventListener("visibilitychange", heartbeat);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("online", heartbeat);
      document.removeEventListener("visibilitychange", heartbeat);
      void fetch(`/api/decks/${id}/presence`, {
        method: "DELETE",
        credentials: "same-origin",
        keepalive: true,
      }).catch(() => {});
    };
  }, [id, mode]);
  return { state, connected, denied };
}
