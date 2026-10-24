import { readRecovery, writeRecovery, removeRecovery } from "./recovery-store";
import { recoveryIdentity } from "./api";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  documentSchema,
  type FrameDocument,
  type Operation,
} from "../../shared/schema";
import { applyOperations } from "../../shared/operations";
import { api, json, RequestError, navigate } from "./api";
type Recovery = {
  document: FrameDocument;
  baseRevision: number;
  savedAt: string;
};
export function useDocument(id: string) {
  const [doc, setDoc] = useState<FrameDocument | null>(null),
    [error, setError] = useState(""),
    [status, setStatus] = useState("loading"),
    [recovery, setRecovery] = useState<Recovery | null>(null),
    [conflict, setConflict] = useState(false),
    [historyTick, tick] = useState(0);
  const current = useRef<FrameDocument | null>(null),
    serverRevision = useRef(0),
    sequence = useRef(0),
    savedSequence = useRef(0),
    inFlight = useRef<Promise<boolean> | null>(null),
    blocked = useRef(false),
    past = useRef<FrameDocument[]>([]),
    future = useRef<FrameDocument[]>([]),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    key = useRef(""),
    mounted = useRef(true),
    retries = useRef(0),
    lastTransaction = useRef<{ key: string; at: number } | null>(null);
  const remember = useCallback(async () => {
    if (!current.current || !key.current) return;
    try {
      await writeRecovery(
        key.current,
        JSON.stringify({
          version: 1,
          document: current.current,
          baseRevision: serverRevision.current,
          savedAt: new Date().toISOString(),
        }),
      );
    } catch {
      setError(
        "Browser recovery storage is full or unavailable. Keep this tab open until your work is saved to the server.",
      );
    }
  }, []);
  const save = useCallback(
    async function flush(): Promise<void> {
      if (inFlight.current) {
        const succeeded = await inFlight.current;
        if (succeeded) await flush();
        return;
      }
      if (
        !current.current ||
        blocked.current ||
        savedSequence.current === sequence.current
      )
        return;
      // Browser connectivity is only a hint: a local or private API can remain
      // reachable while the operating system reports no Internet connection.
      const snapshot = current.current,
        seq = sequence.current;
      setStatus("saving");
      const task = (async (): Promise<boolean> => {
        try {
          const result = await api<FrameDocument>(
            `/decks/${id}`,
            json("PUT", {
              baseRevision: serverRevision.current,
              document: snapshot,
            }),
          );
          serverRevision.current = result.revision;
          savedSequence.current = seq;
          retries.current = 0;
          if (sequence.current === seq) {
            current.current = {
              ...snapshot,
              revision: result.revision,
              updatedAt: result.updatedAt,
            };
            setDoc(current.current);
            try {
              await removeRecovery(key.current);
            } catch {}
            setStatus("saved");
            setError("");
          } else {
            current.current = {
              ...current.current!,
              revision: result.revision,
              updatedAt: result.updatedAt,
            };
            setDoc(current.current);
            remember();
          }
          return true;
        } catch (e) {
          remember();
          setError((e as Error).message);
          if (e instanceof RequestError && e.status === 409) {
            blocked.current = true;
            setConflict(true);
            setStatus("conflict");
          } else setStatus(navigator.onLine ? "failed" : "offline");
          if (mounted.current && !blocked.current && retries.current++ < 2)
            timer.current = setTimeout(() => {
              void flush();
            }, 1500 * retries.current);
          return false;
        }
      })();
      inFlight.current = task;
      const succeeded = await task;
      if (inFlight.current === task) inFlight.current = null;
      if (succeeded && savedSequence.current !== sequence.current)
        await flush();
    },
    [id, remember],
  );
  useEffect(() => {
    mounted.current = true;
    let active = true;
    api<FrameDocument>(`/decks/${id}`)
      .then(async (remote) => {
        if (!active) return;
        key.current = recoveryIdentity()
          ? `frame:recovery:${recoveryIdentity()!.id}:${remote.workspaceId}:${id}`
          : `frame:recovery:${remote.ownerId}:${id}`;
        current.current = remote;
        serverRevision.current = remote.revision;
        setDoc(remote);
        setStatus("saved");
        try {
          const value = await readRecovery(key.current);
          if (value) {
            const parsed = JSON.parse(value);
            const validated = documentSchema.parse(parsed.document);
            if (validated.id === id) {
              setRecovery({ ...parsed, document: validated });
              blocked.current = true;
            }
          }
        } catch {
          setError(
            "An unreadable recovery copy was found. Your server version has been opened safely.",
          );
        }
      })
      .catch((e) => setError(e.message));
    return () => {
      active = false;
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      void save();
    };
  }, [id]);
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (sequence.current !== savedSequence.current) {
        remember();
        e.preventDefault();
      }
    };
    const online = () => {
      retries.current = 0;
      if (sequence.current === savedSequence.current) setStatus("saved");
      else void save();
    };
    const offline = () => setStatus("offline");
    window.addEventListener("beforeunload", before);
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    return () => {
      window.removeEventListener("beforeunload", before);
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
    };
  }, [save, remember]);
  const install = useCallback(
    (next: FrameDocument, history = true) => {
      if (!current.current) return;
      if (history) {
        past.current.push(current.current);
        past.current = past.current.slice(-80);
        future.current = [];
      }
      current.current = next;
      sequence.current++;
      retries.current = 0;
      setDoc(next);
      tick((t) => t + 1);
      setStatus(navigator.onLine ? "saving" : "offline");
      remember();
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void save();
      }, 600);
    },
    [remember, save],
  );
  const execute = useCallback(
    (ops: Operation | Operation[]) => {
      if (!current.current || blocked.current) return;
      try {
        setError("");
        const list = Array.isArray(ops) ? ops : [ops],
          op = list[0],
          now = Date.now();
        const key =
          list.length === 1 &&
          op.type === "element.update" &&
          ![
            "timeline",
            "path",
            "chart",
            "table",
            "diagram",
            "question",
            "animation",
          ].some((field) => field in op.patch)
            ? op.slideId +
              op.ids.join(",") +
              Object.keys(op.patch).sort().join(",")
            : "";
        const coalesce =
          !!key &&
          lastTransaction.current?.key === key &&
          now - lastTransaction.current.at < 1000;
        install(applyOperations(current.current, list), !coalesce);
        future.current = [];
        lastTransaction.current = { key, at: now };
      } catch (e) {
        setError((e as Error).message);
      }
    },
    [install],
  );
  const undo = () => {
    lastTransaction.current = null;
    if (blocked.current) return;
    const next = past.current.pop();
    if (!next || !current.current || blocked.current) return;
    future.current.push(current.current);
    install(next, false);
  };
  const redo = () => {
    lastTransaction.current = null;
    if (blocked.current) return;
    const next = future.current.pop();
    if (!next || !current.current || blocked.current) return;
    past.current.push(current.current);
    install(next, false);
  };
  async function reload() {
    try {
      const remote = await api<FrameDocument>(`/decks/${id}`);
      current.current = remote;
      serverRevision.current = remote.revision;
      savedSequence.current = sequence.current;
      past.current = [];
      future.current = [];
      blocked.current = false;
      setConflict(false);
      setRecovery(null);
      setDoc(remote);
      setStatus("saved");
      setError("");
      try {
        await removeRecovery(key.current);
      } catch {}
    } catch (e) {
      setError(
        `The server version could not be opened. Your current work is preserved. ${(e as Error).message}`,
      );
    }
  }
  function recover() {
    if (!recovery) return;
    if (recovery.baseRevision !== serverRevision.current) {
      current.current = recovery.document;
      setDoc(recovery.document);
      setRecovery(null);
      setConflict(true);
      setStatus("conflict");
      setError(
        "A newer server version exists. Save this recovered version as a separate presentation.",
      );
      return;
    }
    blocked.current = false;
    setRecovery(null);
    install(recovery.document);
  }
  async function copyRecovery() {
    if (!current.current) return;
    try {
      const fresh = await api<FrameDocument>(
        `/decks/${id}/recovery`,
        json("POST", { document: current.current }),
      );
      try {
        await removeRecovery(key.current);
      } catch {}
      blocked.current = true;
      savedSequence.current = sequence.current;
      navigate(`/deck/${fresh.id}`);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return {
    doc,
    error,
    status,
    recovery,
    conflict,
    execute,
    undo,
    redo,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    save,
    saveAndConfirm: async () => {
      await save();
      return !blocked.current && savedSequence.current === sequence.current;
    },
    reload,
    recover,
    copyRecovery,
    historyTick,
    setError,
  };
}
