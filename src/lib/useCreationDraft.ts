import { useCallback, useEffect, useRef, useState } from "react";
import type { CreationDraft, DraftData } from "../../shared/ai";
import { api, json, navigate, RequestError } from "./api";
export function useCreationDraft(id: string, userId: string) {
  const [draft, setDraft] = useState<CreationDraft | null>(null),
    [status, setStatus] = useState("loading"),
    [error, setError] = useState(""),
    [recovery, setRecovery] = useState<{
      data: DraftData;
      baseRevision: number;
    } | null>(null),
    [conflict, setConflict] = useState(false);
  const current = useRef<CreationDraft | null>(null),
    sequence = useRef(0),
    savedSequence = useRef(0),
    inFlight = useRef<Promise<CreationDraft> | null>(null),
    blocked = useRef(false),
    mounted = useRef(true),
    key = `frame:creation:${userId}:${id}`;
  const load = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const value = await api<CreationDraft>(`/creation/${id}`);
      current.current = value;
      setDraft(value);
      blocked.current = false;
      setConflict(false);
      sequence.current = savedSequence.current = 0;
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const local = JSON.parse(raw);
          if (JSON.stringify(local.data) !== JSON.stringify(value.data))
            setRecovery(local);
          else
            try {
              localStorage.removeItem(key);
            } catch {
              /* Server persistence is independent of device recovery storage. */
            }
        }
      } catch {
        setError(
          "Device recovery storage could not be read. Saved server work is available.",
        );
      }
      setStatus("saved");
    } catch (err) {
      setError((err as Error).message);
      setStatus(navigator.onLine ? "failed" : "offline");
    }
  }, [id, key]);
  const save = useCallback(
    async function flush(): Promise<CreationDraft | null> {
      if (inFlight.current) {
        try {
          await inFlight.current;
        } catch {
          return null;
        }
        return flush();
      }
      if (!current.current || blocked.current) return null;
      if (sequence.current === savedSequence.current) return current.current;
      // Attempt persistence even when the browser's Internet hint is offline.
      // A failed request retains recovery data and sets the appropriate state.
      const value = current.current,
        at = sequence.current;
      setStatus("saving");
      setError("");
      const task = api<CreationDraft>(
        `/creation/${id}`,
        json("PUT", { revision: value.revision, data: value.data }),
      );
      inFlight.current = task;
      try {
        const saved = await task;
        savedSequence.current = at;
        current.current =
          sequence.current === at
            ? saved
            : { ...saved, data: current.current!.data };
        if (mounted.current) setDraft(current.current);
        if (sequence.current === at) {
          try {
            localStorage.removeItem(key);
          } catch {
            /* Server persistence is independent of device recovery storage. */
          }
          if (mounted.current) setStatus("saved");
        }
      } catch (err) {
        if (err instanceof RequestError && err.status === 409) {
          blocked.current = true;
          if (mounted.current) setConflict(true);
        }
        if (mounted.current) {
          setError((err as Error).message);
          setStatus(navigator.onLine ? "failed" : "offline");
        }
        return null;
      } finally {
        inFlight.current = null;
      }
      return sequence.current !== savedSequence.current
        ? flush()
        : current.current;
    },
    [id, key],
  );
  const patch = useCallback(
    (changes: Partial<DraftData>) => {
      if (!current.current) return;
      current.current = {
        ...current.current,
        data: { ...current.current.data, ...changes },
      };
      sequence.current++;
      setDraft(current.current);
      setStatus(navigator.onLine ? "saving" : "offline");
      try {
        localStorage.setItem(
          key,
          JSON.stringify({
            data: current.current.data,
            baseRevision: current.current.revision,
          }),
        );
      } catch {
        setError(
          "Device recovery storage is unavailable. Keep this window open until the draft is saved.",
        );
      }
    },
    [key],
  );
  const acceptServer = useCallback(
    (value: CreationDraft) => {
      current.current = value;
      savedSequence.current = ++sequence.current;
      setDraft(value);
      setStatus("saved");
      setError("");
      try {
        localStorage.removeItem(key);
      } catch {
        /* Server persistence is independent of device recovery storage. */
      }
    },
    [key],
  );
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);
  useEffect(() => {
    if (!draft || sequence.current === savedSequence.current || blocked.current)
      return;
    const timer = setTimeout(() => void save(), 750);
    return () => clearTimeout(timer);
  }, [draft?.data, save]);
  useEffect(() => {
    const reconnect = () => void save(),
      leave = (event: BeforeUnloadEvent) => {
        if (sequence.current !== savedSequence.current) {
          event.preventDefault();
          event.returnValue = "";
        }
      };
    window.addEventListener("online", reconnect);
    window.addEventListener("beforeunload", leave);
    return () => {
      window.removeEventListener("online", reconnect);
      window.removeEventListener("beforeunload", leave);
    };
  }, [save]);
  async function recover() {
    if (!recovery) return;
    try {
      const copy = await api<CreationDraft>("/creation", json("POST", {}));
      await api(
        `/creation/${copy.id}`,
        json("PUT", { revision: copy.revision, data: recovery.data }),
      );
      try {
        localStorage.removeItem(key);
      } catch {
        /* Server persistence is independent of device recovery storage. */
      }
      navigate(`/create/${copy.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return {
    draft,
    status,
    error,
    setError,
    recovery,
    conflict,
    patch,
    save,
    acceptServer,
    recover,
    load,
    discardRecovery: () => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* Server persistence is independent of device recovery storage. */
      }
      setRecovery(null);
    },
  };
}
