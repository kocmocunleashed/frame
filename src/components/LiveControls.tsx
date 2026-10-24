import { useState } from "react";
import { Copy, Radio, Users } from "lucide-react";
import type { FrameDocument, Slide } from "../../shared/schema";
import type { LiveQuestion } from "../../shared/live";
import type { useLiveSession } from "../lib/useLiveSession";
import { ErrorMessage } from "./UI";
import QuestionResults from "./QuestionResults";
export default function LiveControls({
  live,
  doc,
  slide,
}: {
  live: ReturnType<typeof useLiveSession>;
  doc: FrameDocument;
  slide: Slide;
}) {
  const [copied, setCopied] = useState(false),
    [confirmEnd, setConfirmEnd] = useState(false);
  const session = live.session;
  return (
    <section className="live-controls" aria-label="Audience controls">
      <h3>
        <Radio size={14} />
        Audience participation
      </h3>
      {live.error && <ErrorMessage>{live.error}</ErrorMessage>}
      {!session || session.ended ? (
        <>
          <p>
            {session?.ended
              ? "Session ended. Guests can no longer answer."
              : "Rehearsing locally. No public audience session is open."}
          </p>
          <button
            className="button live-primary"
            disabled={live.busy || !live.ready}
            onClick={() => void live.start(doc.revision)}
          >
            Start live session
          </button>
          <p className="live-hint">
            A session freezes the saved deck for up to 24 hours. Maximum 200
            guests. AI is not required.
          </p>
          <RehearsalQuestions key={slide.id} slide={slide} />
        </>
      ) : (
        <>
          <p
            className={`live-connection ${!live.connected ? "offline" : ""}`}
            role="status"
          >
            {live.connected
              ? "Connected to session"
              : "Reconnecting to session…"}{" "}
            · <Users size={12} />
            {session.connected} connected / {session.participants} joined
          </p>
          <a
            className="live-code"
            href={`/join/${session.code}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Audience join code ${session.code}`}
          >
            {session.code}
          </a>
          <img
            className="live-qr"
            src={`/api/live/${session.id}/qr`}
            alt={`QR code to join audience session ${session.code}`}
            width="160"
            height="160"
          />
          <button
            className="button"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `${location.origin}/join/${session.code}`,
                );
                setCopied(true);
              } catch {
                setCopied(false);
              }
            }}
          >
            <Copy size={14} />
            {copied ? "Join link copied" : "Copy audience link"}
          </button>
          <a
            className="live-join-link"
            href={`/join/${session.code}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            {location.origin}/join/{session.code}
          </a>
          <label>
            Question on this slide
            <select
              aria-label="Live question"
              value={session.state.questionId || ""}
              disabled={live.busy}
              onChange={(e) => {
                if (e.target.value)
                  void live.command({
                    type: "open",
                    questionId: e.target.value,
                  });
              }}
            >
              <option value="">Choose a question to open</option>
              {slide.elements
                .filter((e) => e.type === "question" && !e.hidden)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.question!.prompt}
                  </option>
                ))}
            </select>
          </label>
          {session.question && (
            <div className="live-question-controls">
              <strong>{session.question.prompt}</strong>
              <p role="status">
                {session.state.open ? "Accepting answers" : "Answers closed"} ·
                Round {session.state.round}
              </p>
              <div className="live-actions">
                <button
                  className="button"
                  disabled={live.busy}
                  onClick={() =>
                    void live.command(
                      session.state.open
                        ? { type: "close" }
                        : { type: "open", questionId: session.question!.id },
                    )
                  }
                >
                  {session.state.open
                    ? "Close question"
                    : "Reopen as new round"}
                </button>
                <button
                  className="button"
                  disabled={live.busy}
                  onClick={() =>
                    void live.command({
                      type: "results",
                      visible: !session.state.resultsVisible,
                    })
                  }
                >
                  {session.state.resultsVisible
                    ? "Hide audience results"
                    : "Reveal audience results"}
                </button>
                <button
                  className="button"
                  disabled={live.busy || session.state.open}
                  onClick={() =>
                    void live.command({
                      type: "answer",
                      visible: !session.state.answerVisible,
                    })
                  }
                >
                  {session.state.answerVisible
                    ? "Hide answer feedback"
                    : "Reveal answer & feedback"}
                </button>
              </div>
              <p className="live-hint">
                Close the question before revealing the answer. Reopening clears
                the audience display and starts a fresh round; earlier responses
                are retained separately.
              </p>
              <QuestionResults
                question={{
                  ...session.question,
                  answerVisible: session.state.answerVisible,
                }}
              />
            </div>
          )}
          {confirmEnd ? (
            <div className="live-actions">
              <p>End the session for everyone?</p>
              <button
                className="button destructive-text"
                disabled={live.busy}
                onClick={() => {
                  void live.command({ type: "end" });
                  setConfirmEnd(false);
                }}
              >
                End for everyone
              </button>
              <button className="button" onClick={() => setConfirmEnd(false)}>
                Keep presenting
              </button>
            </div>
          ) : (
            <button className="text-button" onClick={() => setConfirmEnd(true)}>
              End live session
            </button>
          )}
        </>
      )}
    </section>
  );
}
function RehearsalQuestions({ slide }: { slide: Slide }) {
  const questions = slide.elements.filter(
      (e) => e.type === "question" && !e.hidden,
    ),
    [selected, setSelected] = useState(questions[0]?.id || ""),
    [open, setOpen] = useState(false),
    [answerVisible, setAnswerVisible] = useState(false),
    [results, setResults] = useState(false),
    [counts, setCounts] = useState<number[]>([]),
    q = questions.find((e) => e.id === selected)?.question;
  if (!q) return null;
  const result: LiveQuestion = {
    ...q,
    id: selected,
    round: 1,
    open,
    answerVisible,
    counts: results ? q.options.map((_, i) => counts[i] || 0) : undefined,
    total: counts.reduce((a, b) => a + b, 0),
    feedback: answerVisible
      ? slide.interactions
          .filter(
            (i) =>
              i.trigger === "answer" &&
              i.action === "feedback" &&
              i.target === selected,
          )
          .map((i) => i.value)
          .join("\n")
      : undefined,
  };
  return (
    <div className="rehearsal-question">
      <h4>Test a question locally</h4>
      <label>
        Rehearsal question
        <select
          aria-label="Rehearsal question"
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setCounts([]);
            setAnswerVisible(false);
            setOpen(false);
            setResults(false);
          }}
        >
          {questions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.question!.prompt}
            </option>
          ))}
        </select>
      </label>
      <button
        className="button"
        onClick={() => {
          setOpen(!open);
          if (!open) {
            setCounts([]);
            setAnswerVisible(false);
            setResults(false);
          }
        }}
      >
        {open ? "Close rehearsal question" : "Open rehearsal question"}
      </button>
      {open && (
        <fieldset>
          <legend>Simulate an audience response</legend>
          {q.options.map((option, i) => (
            <button
              className="button"
              key={i}
              onClick={() =>
                setCounts((old) =>
                  q.options.map((_, j) => (old[j] || 0) + (i === j ? 1 : 0)),
                )
              }
            >
              {option}
            </button>
          ))}
        </fieldset>
      )}
      <div className="live-actions">
        <button className="button" onClick={() => setResults(!results)}>
          {results ? "Hide rehearsal results" : "Show rehearsal results"}
        </button>
        <button
          className="button"
          disabled={open}
          onClick={() => setAnswerVisible(!answerVisible)}
        >
          {answerVisible
            ? "Hide rehearsal feedback"
            : "Reveal rehearsal feedback"}
        </button>
      </div>
      <QuestionResults question={result} />
    </div>
  );
}
