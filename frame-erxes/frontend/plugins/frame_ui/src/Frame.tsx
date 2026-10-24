import { gql, useApolloClient } from "@apollo/client";
import { Button, Spinner } from "erxes-ui";
import { useCallback, useEffect, useRef, useState } from "react";

const FRAME_LAUNCH = gql`
  mutation FrameStudioLaunch {
    frameLaunch {
      url
      origin
      ticket
      expiresAt
    }
  }
`;
type Launch = {
  url: string;
  origin: string;
  ticket: string;
  expiresAt: number;
};
type Status = "idle" | "connecting" | "ready" | "blocked";

export function Frame() {
  const client = useApolloClient();
  const iframe = useRef<HTMLIFrameElement>(null);
  const frameName = useRef(`frame-erxes-${crypto.randomUUID()}`);
  const expectedOrigin = useRef("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = useRef(true);
  const autoStarted = useRef(false);
  const [status, setStatus] = useState<Status>("connecting");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    mounted.current = true;
    const receive = (event: MessageEvent) => {
      if (
        event.origin !== expectedOrigin.current ||
        event.source !== iframe.current?.contentWindow ||
        !event.data ||
        event.data.type !== "frame-erxes:ready"
      )
        return;
      clearTimeout(timer.current);
      setStatus("ready");
    };
    window.addEventListener("message", receive);
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
      window.removeEventListener("message", receive);
    };
  }, []);

  const launch = useCallback(
    async (inNewTab = false) => {
      // Reserve the window during the click, before awaiting GraphQL.
      const tabName = `frame-erxes-tab-${crypto.randomUUID()}`;
      const tab = inNewTab ? window.open("about:blank", tabName) : null;
      if (inNewTab && !tab) {
        setError("Allow pop-ups for erxes, then try opening Frame again.");
        return;
      }
      if (tab) tab.opener = null;
      setError("");
      setBusy(true);
      if (!inNewTab) {
        clearTimeout(timer.current);
        setStatus("connecting");
      }
      try {
        const result = await client.mutate<{ frameLaunch: Launch }>({
          mutation: FRAME_LAUNCH,
          fetchPolicy: "no-cache",
        });
        if (!mounted.current) {
          tab?.close();
          return;
        }
        const data = result.data?.frameLaunch;
        if (!data || data.expiresAt <= Date.now())
          throw new Error("The sign-in ticket expired. Try again.");
        const url = new URL(data.url);
        if (
          url.origin !== data.origin ||
          url.pathname !== "/integrations/erxes/launch" ||
          url.search ||
          url.hash ||
          url.username ||
          url.password ||
          (url.protocol !== "https:" &&
            !(
              url.protocol === "http:" &&
              ["localhost", "127.0.0.1"].includes(url.hostname)
            ))
        )
          throw new Error(
            "The Frame service returned an invalid launch address.",
          );
        expectedOrigin.current = data.origin;
        const form = document.createElement("form");
        form.method = "POST";
        form.action = data.url;
        form.target = inNewTab ? tabName : frameName.current;
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = "ticket";
        input.value = data.ticket;
        form.append(input);
        document.body.append(form);
        form.submit();
        form.remove();
        if (!inNewTab) {
          clearTimeout(timer.current);
          timer.current = setTimeout(() => setStatus("blocked"), 20_000);
        }
      } catch (cause) {
        tab?.close();
        if (!mounted.current) return;
        setError(
          cause instanceof Error ? cause.message : "Frame could not be opened.",
        );
        if (!inNewTab) setStatus("idle");
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [client],
  );

  useEffect(() => {
    // StrictMode can replay effects. Each visit needs only one single-use ticket.
    if (autoStarted.current) return;
    autoStarted.current = true;
    void launch();
  }, [launch]);

  return (
    <section
      aria-label="Frame presentation studio"
      className="flex h-full min-h-0 flex-col"
    >
      <header className="flex flex-wrap items-center gap-3 border-b p-3">
        <strong className="mr-auto text-lg">Frame</strong>
        <Button
          disabled={busy || status === "connecting"}
          onClick={() => void launch()}
        >
          {status === "connecting"
            ? "Connecting…"
            : status === "ready"
              ? "Reconnect"
              : "Retry"}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void launch(true)}
        >
          Open in new tab
        </Button>
      </header>
      {error && (
        <p role="alert" className="p-4 text-destructive">
          {error}
        </p>
      )}
      {status === "idle" && (
        <div className="p-6">
          <h1 className="text-2xl font-semibold">Frame could not connect.</h1>
          <p className="mt-2 text-muted-foreground">
            Retry the connection, or open your studio in a new tab.
          </p>
        </div>
      )}
      {status === "connecting" && (
        <div role="status" className="flex items-center gap-2 p-3">
          <Spinner /> Connecting to your Frame workspace…
        </div>
      )}
      {status === "blocked" && (
        <p role="status" className="p-3">
          Frame has not connected yet. Your browser may block embedded sign-in.
          Try Open in new tab, or ask your administrator to check the Frame
          service.
        </p>
      )}
      <iframe
        ref={iframe}
        name={frameName.current}
        title="Frame studio"
        className="min-h-0 w-full flex-1 border-0"
        style={{
          display: status === "idle" ? "none" : "block",
          minHeight: status === "idle" ? 0 : "70vh",
        }}
        allow="fullscreen; clipboard-read; clipboard-write"
        allowFullScreen
        referrerPolicy="no-referrer"
      />
    </section>
  );
}
