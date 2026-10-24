import { useState } from "react";
import { MousePointerClick, Plus, Trash2 } from "lucide-react";
import {
  uid,
  type FrameDocument,
  type Slide,
  type Operation,
} from "../../shared/schema";
import { Modal, ErrorMessage } from "./UI";
type Behavior = "show" | "navigate" | "feedback" | "animate";
const descriptions = {
  show: "On click → show an explanation",
  navigate: "On click → go to another slide",
  feedback: "On answer → reveal feedback",
  animate: "On presentation step → animate an object",
};
export default function InteractionBuilder({
  doc,
  slide,
  onApply,
  onClose,
}: {
  doc: FrameDocument;
  slide: Slide;
  onApply: (ops: Operation[]) => void;
  onClose: () => void;
}) {
  const [behavior, setBehavior] = useState<Behavior>("show"),
    [target, setTarget] = useState(""),
    [value, setValue] = useState(""),
    [step, setStep] = useState(1),
    [error, setError] = useState("");
  const sources = slide.elements.filter(
      (e) =>
        !e.hidden &&
        (behavior === "feedback"
          ? e.type === "question"
          : behavior === "animate"
            ? true
            : e.type !== "video" && !e.link),
    ),
    targets = slide.elements.filter((e) => !e.hidden && e.id !== target),
    source = sources.find((e) => e.id === target);
  function add() {
    setError("");
    try {
      if (!source)
        throw new Error("Choose the object that starts this interaction.");
      if (behavior === "show" && !targets.some((e) => e.id === value))
        throw new Error("Choose an object to show.");
      if (
        behavior === "navigate" &&
        !doc.slides.some((s) => s.id === value && s.id !== slide.id)
      )
        throw new Error("Choose another slide.");
      if (behavior === "feedback" && !value.trim())
        throw new Error("Write the feedback to reveal.");
      if (
        behavior === "animate" &&
        slide.interactions.some(
          (i) => i.action === "animate" && i.target === target,
        )
      )
        throw new Error(
          "Remove this object’s existing step behavior before adding another.",
        );
      const interaction = {
        id: uid(),
        trigger:
          behavior === "feedback"
            ? ("answer" as const)
            : behavior === "animate"
              ? ("step" as const)
              : ("click" as const),
        target,
        action: behavior,
        value:
          behavior === "animate" ? (value === "fade" ? "fade" : "rise") : value,
        step: behavior === "animate" ? step : undefined,
      };
      const ops: Operation[] = [
        {
          type: "slide.update",
          slideId: slide.id,
          patch: { interactions: [...slide.interactions, interaction] },
        },
      ];
      if (behavior === "animate")
        ops.push({
          type: "element.update",
          slideId: slide.id,
          ids: [target],
          patch: {
            animation: { type: interaction.value as "fade" | "rise", step },
          },
        });
      onApply(ops);
      setTarget("");
      setValue("");
    } catch (err) {
      setError((err as Error).message);
    }
  }
  return (
    <Modal title="Slide interactions" wide onClose={onClose}>
      <div className="interaction-builder">
        <section>
          <p className="eyebrow">MAKE THE STORY RESPOND</p>
          <h3>A trigger. An action.</h3>
          <p className="hint">
            Start with a simple behavior, then test it in Present. Question
            feedback stays private until the presenter reveals it.
          </p>
          <label>
            Behavior
            <select
              aria-label="Interaction behavior"
              value={behavior}
              onChange={(e) => {
                setBehavior(e.target.value as Behavior);
                setTarget("");
                setValue("");
                setError("");
              }}
            >
              {Object.entries(descriptions).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {behavior === "feedback"
              ? "When this question is answered"
              : behavior === "animate"
                ? "Animate this object"
                : "When this object is clicked"}
            <select
              aria-label="Interaction source object"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Choose an object</option>
              {sources.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name} · {e.type}
                </option>
              ))}
            </select>
          </label>
          {behavior === "show" && (
            <label>
              Show this explanation object
              <select
                aria-label="Interaction explanation object"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              >
                <option value="">Choose an object to show</option>
                {targets.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} · {e.type}
                  </option>
                ))}
              </select>
              <small>
                It stays out of view until the trigger is activated. Keep the
                object visible in the editor’s layer list.
              </small>
            </label>
          )}
          {behavior === "navigate" && (
            <label>
              Go to this slide
              <select
                aria-label="Interaction destination slide"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              >
                <option value="">Choose a slide</option>
                {doc.slides
                  .filter((s) => s.id !== slide.id)
                  .map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
              </select>
            </label>
          )}
          {behavior === "feedback" && (
            <label>
              Feedback
              <textarea
                aria-label="Interaction feedback"
                value={value}
                maxLength={2000}
                rows={4}
                onChange={(e) => setValue(e.target.value)}
              />
              <small>
                Shown after an answer is recorded and the presenter reveals
                feedback. Rehearsal lets you test this locally.
              </small>
            </label>
          )}
          {behavior === "animate" && (
            <>
              <label>
                Presentation step
                <input
                  aria-label="Interaction presentation step"
                  type="number"
                  min={1}
                  max={100}
                  value={step}
                  onChange={(e) =>
                    setStep(
                      Math.min(
                        100,
                        Math.max(1, Math.round(Number(e.target.value)) || 1),
                      ),
                    )
                  }
                />
              </label>
              <label>
                Motion
                <select
                  aria-label="Interaction animation"
                  value={value || "rise"}
                  onChange={(e) => setValue(e.target.value)}
                >
                  <option value="rise">Rise</option>
                  <option value="fade">Fade</option>
                </select>
              </label>
              <p className="hint">
                The object appears when this step is reached. Reduced-motion
                viewers see the reveal without animation.
              </p>
            </>
          )}
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <button className="button primary" onClick={add}>
            <Plus size={16} />
            Add behavior
          </button>
        </section>
        <section className="interaction-list">
          <h3>This slide’s behaviors</h3>
          {!slide.interactions.length ? (
            <div className="interaction-empty">
              <MousePointerClick size={32} />
              <p>A little interaction goes a long way.</p>
              <small>
                Add a behavior, then rehearse it before inviting an audience.
              </small>
            </div>
          ) : (
            slide.interactions.map((i) => (
              <article key={i.id}>
                <span>{descriptions[i.action]}</span>
                <strong>
                  {slide.elements.find((e) => e.id === i.target)?.name ||
                    "Object removed"}
                </strong>
                <p>
                  {i.action === "navigate"
                    ? doc.slides.find((s) => s.id === i.value)?.title ||
                      "Slide removed"
                    : i.action === "show"
                      ? slide.elements.find((e) => e.id === i.value)?.name ||
                        "Explanation removed"
                      : i.action === "animate"
                        ? `Step ${i.step} · ${i.value}`
                        : i.value}
                </p>
                <button
                  className="text-button destructive-text"
                  aria-label={`Remove interaction from ${slide.elements.find((e) => e.id === i.target)?.name || "object"}`}
                  onClick={() => {
                    const ops: Operation[] = [
                      {
                        type: "slide.update",
                        slideId: slide.id,
                        patch: {
                          interactions: slide.interactions.filter(
                            (a) => a.id !== i.id,
                          ),
                        },
                      },
                    ];
                    if (
                      i.action === "animate" &&
                      slide.elements.some((e) => e.id === i.target)
                    )
                      ops.push({
                        type: "element.update",
                        slideId: slide.id,
                        ids: [i.target],
                        patch: { animation: { type: "none", step: 0 } },
                      });
                    onApply(ops);
                  }}
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              </article>
            ))
          )}
        </section>
      </div>
    </Modal>
  );
}
