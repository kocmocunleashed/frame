import type { LiveQuestion } from "../../shared/live";
export default function QuestionResults({
  question: q,
}: {
  question: LiveQuestion;
}) {
  return (
    <div className="question-results">
      {q.counts && (
        <>
          <p className="results-total" role="status">
            {q.total} {q.total === 1 ? "response" : "responses"}
          </p>
          <ul aria-label="Audience results">
            {q.options.map((option, i) => (
              <li key={i}>
                <div>
                  <span>{option}</span>
                  <strong>
                    {q.counts![i]} ·{" "}
                    {q.total ? Math.round((q.counts![i] / q.total) * 100) : 0}%
                  </strong>
                </div>
                <div className="result-track" aria-hidden="true">
                  <span
                    style={{
                      width: `${q.total ? (q.counts![i] / q.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
      {q.answerVisible && (
        <div className="answer-feedback" role="status">
          {q.correctIndex !== undefined && (
            <strong>Correct answer: {q.options[q.correctIndex]}</strong>
          )}
          {q.explanation && <p>{q.explanation}</p>}
          {q.feedback && <p>{q.feedback}</p>}
          {q.correctIndex === undefined && !q.explanation && !q.feedback && (
            <p>This question has no correct answer or explanation.</p>
          )}
        </div>
      )}
    </div>
  );
}
