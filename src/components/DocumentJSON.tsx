import { useMemo, useRef, useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import type { FrameDocument, Slide } from "../../shared/schema";
import { download } from "../lib/api";
import { Modal } from "./UI";

type Scope = "deck" | "slide" | "objects";

export default function DocumentJSON({
  doc,
  slide,
  selected,
  onClose,
}: {
  doc: FrameDocument;
  slide: Slide;
  selected: string[];
  onClose: () => void;
}) {
  const [scope, setScope] = useState<Scope>("deck");
  const [status, setStatus] = useState("");
  const [copying, setCopying] = useState(false);
  const preview = useRef<HTMLTextAreaElement>(null);
  const objects = useMemo(
    () => slide.elements.filter((element) => selected.includes(element.id)),
    [slide.elements, selected],
  );
  const text = useMemo(
    () =>
      JSON.stringify(
        scope === "deck" ? doc : scope === "slide" ? slide : objects,
        null,
        2,
      ),
    [scope, doc, slide, objects],
  );

  function selectText() {
    preview.current?.focus();
    preview.current?.select();
  }

  async function copy() {
    setCopying(true);
    setStatus("");
    try {
      await navigator.clipboard.writeText(text);
      setStatus("JSON copied to clipboard.");
    } catch {
      selectText();
      setStatus(
        "Clipboard access is unavailable. Text selected — press Ctrl+C or ⌘C to copy.",
      );
    } finally {
      setCopying(false);
    }
  }

  return (
    <Modal title="Presentation JSON" wide onClose={onClose}>
      <div className="document-json">
        <p className="hint">
          Copy the structured data behind your presentation, including your
          latest local edits.
        </p>
        <label>
          What to copy
          <select
            value={scope}
            onChange={(event) => {
              setScope(event.target.value as Scope);
              setStatus("");
            }}
          >
            <option value="deck">Entire presentation</option>
            <option value="slide">Current slide</option>
            <option value="objects" disabled={!objects.length}>
              Selected objects ({objects.length})
            </option>
          </select>
        </label>
        <textarea
          ref={preview}
          className="document-json-preview"
          aria-label="JSON preview"
          value={text}
          readOnly
          spellCheck={false}
          wrap="off"
        />
        <div className="document-json-actions">
          <button
            className="button primary"
            disabled={copying}
            onClick={() => void copy()}
          >
            {status === "JSON copied to clipboard." ? (
              <Check size={16} />
            ) : (
              <Copy size={16} />
            )}
            {copying ? "Copying…" : "Copy JSON"}
          </button>
          <button className="button" onClick={selectText}>
            Select all
          </button>
          <button
            className="button"
            onClick={() =>
              download(
                new Blob([text], { type: "application/json" }),
                `${doc.title}${scope === "deck" ? ".frame" : `.${scope}`}.json`,
              )
            }
          >
            <Download size={16} /> Download
          </button>
        </div>
        <p className="document-json-status" role="status">
          {status}
        </p>
        <p className="hint">
          Read-only preview. Data can include private notes and answer keys;
          media is referenced rather than embedded.
        </p>
      </div>
    </Modal>
  );
}
