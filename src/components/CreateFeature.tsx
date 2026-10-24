import { ArrowRight, ArrowUpRight, Plus } from "lucide-react";

export default function CreateFeature({
  busy,
  onCreate,
  onBlank,
  onTemplates,
}: {
  busy: boolean;
  onCreate: () => void;
  onBlank: () => void;
  onTemplates: () => void;
}) {
  return (
    <section
      className="workspace-welcome create-feature"
      aria-label="Create a presentation"
    >
      <div className="create-feature-copy">
        <span className="create-feature-kicker">
          A LITTLE IDEA. A BIG BEGINNING.
        </span>
        <h1>
          What’s your next
          <br />
          big idea?
        </h1>
        <p>Give it a stage.</p>
        <button
          className="create-feature-cta"
          disabled={busy}
          onClick={onCreate}
        >
          {busy ? "Opening…" : "Create"} <ArrowUpRight aria-hidden="true" />
        </button>
        <div className="create-feature-alternatives">
          <button onClick={onBlank} disabled={busy}>
            <Plus size={15} /> Start blank
          </button>
          <button onClick={onTemplates} disabled={busy}>
            Browse templates <ArrowRight size={15} />
          </button>
        </div>
      </div>
      <div className="create-feature-art" aria-hidden="true">
        <div className="create-poster poster-back">
          <span>
            YOUR
            <br />
            POINT
            <br />
            OF VIEW.
          </span>
          <i />
        </div>
        <div className="create-poster poster-middle">
          <span>
            Something
            <br />
            worth
            <br />
            sharing.
          </span>
          <div className="poster-orbit" />
        </div>
        <div className="create-poster poster-front">
          <small>IDEAS TAKE SHAPE.</small>
          <span>
            Make
            <br />a point.
          </span>
          <div className="poster-asterisk">✳</div>
          <div className="poster-rule" />
          <small>
            THEN MAKE IT YOURS. <ArrowUpRight size={14} />
          </small>
        </div>
        <span className="create-art-caption">FROM A THOUGHT TO THE ROOM.</span>
      </div>
    </section>
  );
}
