import { useState } from "react";
import { Maximize2 } from "lucide-react";
import type { FrameElement, Theme } from "../../shared/schema";
import { Modal } from "./UI";
import ObjectProperties from "./ObjectProperties";
export default function ObjectDataEditor(props: {
  el: FrameElement;
  theme: Theme;
  update: (patch: Partial<FrameElement>) => void;
  onUpload: () => void;
}) {
  const [open, setOpen] = useState(false);
  const data = ["chart", "table", "diagram", "question", "timeline"].includes(
    props.el.type,
  );
  return (
    <>
      {data && (
        <div className="data-editor-open">
          <button className="button full" onClick={() => setOpen(true)}>
            <Maximize2 size={15} /> Open{" "}
            {props.el.type === "chart" || props.el.type === "table"
              ? "spreadsheet"
              : props.el.type}{" "}
            editor
          </button>
        </div>
      )}
      <ObjectProperties key={props.el.id} {...props} />
      {open && data && (
        <Modal
          title={`Edit ${props.el.type} data`}
          onClose={() => setOpen(false)}
          wide
        >
          <p className="modal-description">
            Changes update your slide. Use Undo to restore an earlier edit.
          </p>
          <div className="expanded-data-editor">
            <ObjectProperties key={props.el.id} {...props} />
          </div>
          <button className="button primary" onClick={() => setOpen(false)}>
            Done editing
          </button>
        </Modal>
      )}
    </>
  );
}
