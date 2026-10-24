import { useCallback, useEffect, useRef, useState } from "react";
import type { HostSession, LiveCommand } from "../../shared/live";
import { api, json } from "./api";
export function useLiveSession(deckId: string) {
  const [session, setSession] = useState<HostSession | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [connected, setConnected] = useState(true),
    [ready, setReady] = useState(false);
  const current = useRef<HostSession | null>(null),
    inFlight = useRef(false);
  const accept = useCallback((value: HostSession | null) => {
    if (
      value &&
      current.current?.id === value.id &&
      value.version < current.current.version
    )
      return;
    if (value && current.current?.id === value.id)
      value = { ...value, document: current.current.document };
    current.current = value;
    setSession(value);
    setConnected(true);
  }, []);
  useEffect(() => {
    let active = true;
    api<HostSession | null>(`/decks/${deckId}/live`)
      .then((value) => {
        if (active) accept(value);
      })
      .catch((err) => {
        if (active) {
          setError(err.message);
          setConnected(false);
        }
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, [deckId, accept]);
  useEffect(() => {
    if (!session || session.ended) return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const update = await api<Omit<HostSession, "document">>(
          `/live/${session.id}?state=1`,
        );
        if (active && current.current?.id === update.id)
          accept({ ...update, document: current.current.document });
      } catch {
        if (active) setConnected(false);
      }
    }, 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session?.id, session?.ended, accept]);
  const command = useCallback(
    async (command: LiveCommand) => {
      if (!current.current || inFlight.current) return false;
      inFlight.current = true;
      setBusy(true);
      setError("");
      try {
        const value = await api<HostSession>(
          `/live/${current.current.id}/control`,
          json("POST", { expectedVersion: current.current.version, command }),
        );
        accept(value);
        return true;
      } catch (err) {
        setError((err as Error).message);
        try {
          accept(await api<HostSession>(`/live/${current.current.id}`));
        } catch {
          setConnected(false);
        }
        return false;
      } finally {
        inFlight.current = false;
        setBusy(false);
      }
    },
    [accept],
  );
  async function start(baseRevision: number) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      accept(
        await api<HostSession>(
          `/decks/${deckId}/live`,
          json("POST", { baseRevision }),
        ),
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  return { session, busy, error, connected, ready, command, start };
}
