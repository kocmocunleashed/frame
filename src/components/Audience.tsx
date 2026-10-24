import { useEffect, useRef, useState } from "react";
import { ArrowRight, RefreshCw, WifiOff } from "lucide-react";
import type { AudienceSession } from "../../shared/live";
import { api, json, navigate, RequestError } from "../lib/api";
import { Brand, ErrorMessage, Loading } from "./UI";
import { AutoSlide } from "./SlideRenderer";
import QuestionResults from "./QuestionResults";
export default function Audience({ code: initialCode }: { code?: string }) {
  const [code, setCode] = useState(initialCode?.toUpperCase() || ""),
    [session, setSession] = useState<AudienceSession | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [connected, setConnected] = useState(true),
    [choice, setChoice] = useState<number | null>(null),
    [joining, setJoining] = useState(!!initialCode);
  const current = useRef<AudienceSession | null>(null),
    pending = useRef(false),
    mounted = useRef(true);
  const clockOffset = useRef(0);
  function accept(value: AudienceSession) {
    if (
      current.current?.id === value.id &&
      current.current.version > value.version
    )
      return;
    if (
      current.current?.version === value.version &&
      current.current.question &&
      value.question &&
      current.current.question.round === value.question.round &&
      current.current.question.response !== undefined &&
      value.question.response === undefined
    ) {
      value = {
        ...value,
        question: {
          ...value.question,
          response: current.current.question.response,
        },
      };
    }
    const changed = current.current?.question?.round !== value.question?.round;
    clockOffset.current = value.serverTime ? Date.now() - value.serverTime : 0;
    current.current = value;
    setSession(value);
    setConnected(true);
    if (changed) setChoice(null);
  }
  async function join(value: string) {
    setBusy(true);
    setError("");
    try {
      const result = await api<AudienceSession>(
        `/audience/${value}/join`,
        json("POST", {}),
      );
      if (mounted.current) {
        accept(result);
        navigate(`/join/${value}`);
      }
    } catch (err) {
      if (mounted.current) setError((err as Error).message);
    } finally {
      if (mounted.current) {
        setBusy(false);
        setJoining(false);
      }
    }
  }
  useEffect(() => {
    mounted.current = true;
    if (initialCode) void join(initialCode.toUpperCase());
    return () => {
      mounted.current = false;
    };
  }, [initialCode]);
  useEffect(() => {
    if (!session || session.ended) return;
    let active = true;
    let failures=0;
    const refresh = async () => {
      if(document.hidden)return;
      if (pending.current) return;
      pending.current = true;
      try {
        const value = await api<AudienceSession>(`/audience/${code}`);
        if (active) {
          failures=0;
          accept(value);
          setError("");
        }
      } catch (err) {
        if (active) {
          failures++;
          setConnected(false);
          if (err instanceof RequestError && err.status === 401)
            setError("Your guest session expired. Join again to reconnect.");
        }
      } finally {
        pending.current = false;
      }
    };
    let timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{await refresh();if(active)timer=setTimeout(poll,Math.min(15000,1500*2**Math.min(failures,4)));};
    timer=setTimeout(poll,1500);
    const online = () => void refresh();
    window.addEventListener("online", online);
    document.addEventListener("visibilitychange",online);
    return () => {
      active = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange",online);
      window.removeEventListener("online", online);
    };
  }, [session?.id, session?.ended, code]);
  async function submit() {
    const q = session?.question;
    if (!q || choice === null) return;
    setBusy(true);
    setError("");
    try {
      accept(
        await api<AudienceSession>(
          `/audience/${code}/answer`,
          json("POST", { round: q.round, questionId: q.id, optionIndex: choice }),
        ),
      );
    } catch (err) {
      setError((err as Error).message);
      try {
        accept(await api<AudienceSession>(`/audience/${code}`));
      } catch {
        setConnected(false);
      }
    } finally {
      setBusy(false);
    }
  }
  if (joining) return <Loading label="Joining audience session…" />;
  return (
    <main className="audience-page">
      <header>
        <a href="/join" aria-label="Frame audience home">
          <Brand />
        </a>
        <span>IN THE ROOM</span>
      </header>
      {!session ? (
        <section className="audience-join">
          <p className="eyebrow">YOUR VOICE BELONGS HERE</p>
          <h1>Join the conversation.</h1>
          <p>
            Enter the six-character code from your presenter. No account needed.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void join(code);
            }}
          >
            <label>
              Session code
              <input
                aria-label="Session code"
                value={code}
                maxLength={6}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder="ABC234"
                onChange={(e) =>
                  setCode(
                    e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""),
                  )
                }
              />
            </label>
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <button
              className="button primary"
              disabled={busy || code.length !== 6}
            >
              {busy ? "Joining…" : "Join session"}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="hint">
            Your browser keeps an anonymous session cookie so reconnecting
            restores your accepted answer.
          </p>
        </section>
      ) : session.ended ? (
        <section className="audience-ended">
          <span className="audience-finish">✓</span>
          <p className="eyebrow">THANKS FOR TAKING PART</p>
          <h1>That’s a wrap.</h1>
          <p>{session.title}</p>
          <p>This session has ended. Your responses have been recorded.</p>
          <a className="button" href="/join">
            Join another session
          </a>
        </section>
      ) : (
        <div className="audience-room">
          <div className="audience-room-meta">
            <span className="audience-code">{code}</span>
            <span className={!connected ? "offline" : ""} role="status">
              {connected ? "Connected" : "Reconnecting…"}
            </span>
          </div>
          <h1>{session.title}</h1>
          {!connected && (
            <div className="audience-connection">
              <WifiOff size={18} />
              <p>
                Connection interrupted. Your last view is kept here. We’ll
                reconnect automatically.
              </p>
            </div>
          )}
          {error && (
            <ErrorMessage>
              {error}
              <button onClick={() => void join(code)}>
                <RefreshCw size={14} />
                Reconnect
              </button>
            </ErrorMessage>
          )}
          {session.document && (
            <div className="audience-slide">
              <AutoSlide
                doc={session.document}
                slide={session.document.slides[0]}
                step={session.state.step}
                playing
                stepStartedAt={
                  session.state.stepStartedAt
                    ? session.state.stepStartedAt + clockOffset.current
                    : session.state.stepStartedAt
                }
                hiddenIds={
                  new Set(
                    session.document.slides[0].interactions
                      .filter(
                        (i) =>
                          i.trigger === "click" &&
                          i.action === "show" &&
                          !session.state.revealedIds.includes(i.value),
                      )
                      .map((i) => i.value),
                  )
                }
              />
            </div>
          )}
          {session.question ? (
            <section
              className="audience-question"
              aria-label="Audience question"
            >
              <p className="eyebrow">
                {session.question.kind === "poll" ? "POLL" : "YOUR TURN"} ·
                ROUND {session.question.round}
              </p>
              <h2>{session.question.prompt}</h2>
              <p className="question-state" role="status">
                {session.question.response !== undefined
                  ? "Your answer is recorded."
                  : session.question.open
                    ? "Answers are open. Choose one option."
                    : "Answers are closed."}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void submit();
                }}
              >
                <fieldset
                  disabled={
                    busy ||
                    !connected ||
                    !session.question.open ||
                    session.question.response !== undefined
                  }
                >
                  <legend className="sr-only">Choose your answer</legend>
                  {session.question.options.map((option, i) => (
                    <label
                      className={
                        (session.question!.response ?? choice) === i
                          ? "chosen"
                          : ""
                      }
                      key={i}
                    >
                      <input
                        type="radio"
                        name="audience-answer"
                        checked={(session.question!.response ?? choice) === i}
                        onChange={() => setChoice(i)}
                      />
                      <span className="answer-letter">
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span>{option}</span>
                    </label>
                  ))}
                </fieldset>
                {session.question.response === undefined && (
                  <button
                    className="button primary full"
                    disabled={
                      busy ||
                      !connected ||
                      choice === null ||
                      !session.question.open
                    }
                  >
                    {busy ? "Sending…" : "Submit answer"}
                  </button>
                )}
              </form>
              <QuestionResults question={session.question} />
              {!session.question.counts && (
                <p className="hint">
                  Results appear when your presenter reveals them.
                </p>
              )}
            </section>
          ) : (
            <section className="audience-waiting">
              <div className="waiting-orbit" aria-hidden="true">
                ✳
              </div>
              <h2>You’re in.</h2>
              <p>
                Follow along. A question will appear here when your presenter
                opens one.
              </p>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
