import { ArrowUp, ArrowDown, Plus, Trash2 } from "lucide-react";
import { uid } from "../../shared/schema";
import type { Outline } from "../../shared/ai";
import { LAYOUTS } from "../../shared/templates";
import { IconButton } from "./UI";
export default function OutlineEditor({
  outline,
  onChange,
}: {
  outline: Outline;
  onChange: (o: Outline) => void;
}) {
  const move = (i: number, by: number) => {
    const sections = [...outline.sections];
    [sections[i], sections[i + by]] = [sections[i + by], sections[i]];
    onChange({ ...outline, sections });
  };
  return (
    <div className="outline-editor">
      <label>
        Presentation title
        <input
          aria-label="Outline presentation title"
          required
          maxLength={200}
          value={outline.title}
          onChange={(e) => onChange({ ...outline, title: e.target.value })}
        />
      </label>
      <p className="hint">
        Shape the narrative before making slides. You can edit, reorder, add or
        remove sections.
      </p>
      {outline.sections.map((section, i) => (
        <article className="outline-section" key={section.id}>
          <span className="outline-number">
            {String(i + 1).padStart(2, "0")}
          </span>
          <div>
            <input
              aria-label={`Section ${i + 1} title`}
              value={section.title}
              maxLength={160}
              onChange={(e) =>
                onChange({
                  ...outline,
                  sections: outline.sections.map((s) =>
                    s.id === section.id ? { ...s, title: e.target.value } : s,
                  ),
                })
              }
            />
            <textarea
              aria-label={`Section ${i + 1} summary`}
              rows={2}
              maxLength={800}
              value={section.summary}
              onChange={(e) =>
                onChange({
                  ...outline,
                  sections: outline.sections.map((s) =>
                    s.id === section.id ? { ...s, summary: e.target.value } : s,
                  ),
                })
              }
            />
            <select
              aria-label={`Section ${i + 1} layout`}
              value={section.layout}
              onChange={(e) =>
                onChange({
                  ...outline,
                  sections: outline.sections.map((s) =>
                    s.id === section.id
                      ? { ...s, layout: e.target.value as typeof s.layout }
                      : s,
                  ),
                })
              }
            >
              {LAYOUTS.filter((l) => l.id !== "blank").map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="outline-controls">
            <IconButton
              label={`Move section ${i + 1} up`}
              disabled={i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp size={16} />
            </IconButton>
            <IconButton
              label={`Move section ${i + 1} down`}
              disabled={i === outline.sections.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown size={16} />
            </IconButton>
            <IconButton
              label={`Remove section ${i + 1}`}
              disabled={outline.sections.length === 1}
              onClick={() =>
                onChange({
                  ...outline,
                  sections: outline.sections.filter((s) => s.id !== section.id),
                })
              }
            >
              <Trash2 size={16} />
            </IconButton>
          </div>
        </article>
      ))}
      <button
        className="button"
        disabled={outline.sections.length >= 30}
        onClick={() =>
          onChange({
            ...outline,
            sections: [
              ...outline.sections,
              {
                id: uid(),
                title: "A new idea",
                summary: "",
                layout: "two-column",
              },
            ],
          })
        }
      >
        <Plus size={16} />
        Add section
      </button>
    </div>
  );
}
