import type { WebResearch } from "../../../shared/ai-research";

export default function ResearchSummary({
  research,
}: {
  research?: WebResearch;
}) {
  if (!research || research.status === "skipped") return null;
  return (
    <details className="research-summary">
      <summary>
        {research.sources.length
          ? `${research.sources.length} web sources gathered`
          : "Web research unavailable · check factual claims"}
      </summary>
      <p>
        Search excerpts provide context, not a guarantee of accuracy. Slide
        references identify the excerpts used for individual claims.
      </p>
      {research.warnings.map((warning, i) => (
        <p key={i}>{warning}</p>
      ))}
      {!!research.sources.length && (
        <ul>
          {research.sources.map((source) => (
            <li key={source.id}>
              <a href={source.url} target="_blank" rel="noopener noreferrer">
                {source.name}
              </a>
              <small>{new URL(source.url).hostname}</small>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
