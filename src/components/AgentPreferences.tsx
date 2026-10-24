import { useId, useState } from "react";
import { Download, Upload } from "lucide-react";
import type { AgentPreferences as Preferences } from "../../shared/agent";
import {
  AGENT_MARKDOWN_LIMIT,
  DEFAULT_AGENT_MARKDOWN,
} from "../../shared/agent";

export default function AgentPreferences({
  value,
  onChange,
}: {
  value: Preferences;
  onChange: (value: Preferences) => void;
}) {
  const id = useId();
  const [error, setError] = useState("");
  const agentMarkdown = value.agentMarkdown;

  function download() {
    const url = URL.createObjectURL(
      new Blob([agentMarkdown], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "agent.md";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="generation-preferences">
      <label className="generation-language">
        Presentation language
        <input
          list={`${id}-languages`}
          aria-label="Presentation language"
          maxLength={60}
          required
          value={value.language}
          onChange={(event) =>
            onChange({ ...value, language: event.target.value })
          }
          placeholder="Choose or type a language"
        />
        <datalist id={`${id}-languages`}>
          {[
            "English",
            "Mongolian",
            "Spanish",
            "French",
            "German",
            "Japanese",
            "Korean",
            "Chinese (Simplified)",
            "Arabic",
            "Russian",
            "Portuguese",
            "Hindi",
          ].map((language) => (
            <option key={language} value={language} />
          ))}
        </datalist>
      </label>
      <div className="agent-editor">
        <p id={`${id}-help`}>
          Set your voice, story structure and design preferences. New
          presentations use these settings for their outlines, slides and
          speaker notes. The language above takes priority.
        </p>
        <label htmlFor={`${id}-markdown`}>agent.md</label>
        <textarea
          id={`${id}-markdown`}
          aria-label="agent.md instructions"
          aria-describedby={`${id}-help ${id}-count`}
          rows={10}
          maxLength={AGENT_MARKDOWN_LIMIT}
          spellCheck={false}
          value={agentMarkdown}
          placeholder={DEFAULT_AGENT_MARKDOWN}
          onChange={(event) =>
            onChange({ ...value, agentMarkdown: event.target.value })
          }
        />
        <small id={`${id}-count`}>
          {agentMarkdown.length.toLocaleString()} /{" "}
          {AGENT_MARKDOWN_LIMIT.toLocaleString()} characters. Leave empty for
          Frame’s writing defaults.
        </small>
        <div className="agent-file-actions">
          <label className="agent-import">
            <Upload size={16} /> Import .md
            <input
              type="file"
              accept=".md,.txt,text/markdown,text/plain"
              aria-label="Import agent.md"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setError("");
                try {
                  if (file.size > AGENT_MARKDOWN_LIMIT * 4)
                    throw new Error(
                      "Choose a file with at most 12,000 characters.",
                    );
                  const text = await file.text();
                  if (text.length > AGENT_MARKDOWN_LIMIT)
                    throw new Error(
                      "Choose a file with at most 12,000 characters.",
                    );
                  onChange({ ...value, agentMarkdown: text });
                } catch (err) {
                  setError((err as Error).message);
                }
              }}
            />
          </label>
          <button type="button" onClick={download}>
            <Download size={16} /> Download agent.md
          </button>
          <button
            type="button"
            onClick={() =>
              onChange({ ...value, agentMarkdown: DEFAULT_AGENT_MARKDOWN })
            }
          >
            Use starter instructions
          </button>
        </div>
        <p className="agent-writing-note">
          Frame uses plain-language guidance to reduce filler, repetitive
          phrasing and unsupported claims.{" "}
          <a
            href="https://en.wikipedia.org/wiki/Wikipedia:Signs_of_AI_writing"
            target="_blank"
            rel="noreferrer"
          >
            About the writing guidance
          </a>
        </p>
        {error && <p role="alert">{error}</p>}
      </div>
    </div>
  );
}
