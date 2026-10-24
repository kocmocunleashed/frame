import { ArrowRight, ChevronDown } from "lucide-react";
import type { CreationBrief } from "../../../shared/ai";
import type { CSSProperties } from "react";

type Props = { brief: CreationBrief; onChange: (brief: CreationBrief) => void };
export function BriefDetails({ brief, onChange }: Props) {
  const field = (key: keyof CreationBrief, value: string) =>
    onChange({ ...brief, [key]: value });
  return (
    <details className="brief-details">
      <summary>
        More details <ChevronDown size={18} />
      </summary>
      <div className="brief-detail-fields">
        <label>
          Who’s it for?
          <input
            aria-label="Presentation audience"
            maxLength={300}
            value={brief.audience}
            onChange={(e) => field("audience", e.target.value)}
          />
        </label>
        <label>
          What should they take away?
          <input
            aria-label="Presentation outcome"
            maxLength={1000}
            value={brief.outcome}
            onChange={(e) => field("outcome", e.target.value)}
          />
        </label>
        <label>
          Tone
          <input
            aria-label="Presentation tone"
            maxLength={100}
            value={brief.tone}
            onChange={(e) => field("tone", e.target.value)}
          />
        </label>
        <label className="brief-requirements">
          Anything else?
          <textarea
            aria-label="Presentation requirements"
            rows={3}
            maxLength={2000}
            value={brief.requirements}
            onChange={(e) => field("requirements", e.target.value)}
          />
        </label>
        <label className="brief-web-search">
          <input
            type="checkbox"
            checked={brief.webSearch !== false}
            onChange={(e) =>
              onChange({ ...brief, webSearch: e.target.checked })
            }
          />
          <span>
            <strong>Research the web first</strong>
            <small>
              Find public sources for your topic before writing. Uses Muse
              search; up to two searches at $0.007 each, plus AI usage. Turn off
              for private topics.
            </small>
          </span>
        </label>
      </div>
    </details>
  );
}
export default function Brief({
  brief,
  onChange,
  onNext,
}: Props & { onNext: () => void }) {
  return (
    <div className="brief-stage">
      <h1 aria-label="About what?">
        About what
        <span className="brief-question-mark" aria-hidden="true">
          ?
        </span>
      </h1>
      <label className="brief-topic">
        <span className="sr-only">Your idea</span>
        <textarea
          aria-label="Presentation idea"
          rows={2}
          maxLength={4000}
          placeholder="An idea that won’t leave you alone…"
          value={brief.topic}
          onChange={(e) => onChange({ ...brief, topic: e.target.value })}
        />
      </label>
      <BriefDetails brief={brief} onChange={onChange} />
      <div className="brief-bottom">
        <div className="brief-length">
          <div>
            <label htmlFor="creation-length">Length</label>
            <output htmlFor="creation-length">
              <strong>{brief.slideCount}</strong> slides
            </output>
          </div>
          <input
            id="creation-length"
            aria-label="Slide count"
            type="range"
            min={3}
            max={30}
            step={1}
            value={brief.slideCount}
            aria-valuetext={`${brief.slideCount} slides`}
            onChange={(e) =>
              onChange({ ...brief, slideCount: Number(e.target.value) })
            }
            style={
              {
                "--range-progress": `${((brief.slideCount - 3) / 27) * 100}%`,
              } as CSSProperties
            }
          />
          <div className="brief-length-scale">
            <span>Short & sweet</span>
            <span>Room to explore</span>
          </div>
        </div>
        <button
          className="creation-button main"
          disabled={brief.topic.trim().length < 3 || !brief.language.trim()}
          onClick={onNext}
        >
          Choose a look <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}
