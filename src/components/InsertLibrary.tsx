import {
  Table2,
  ChartColumn,
  Workflow,
  Video,
  MessageCircleQuestion,
  Sparkles,
} from "lucide-react";
import type { FrameElement } from "../../shared/schema";
import { Modal } from "./UI";
const choices = [
  {
    type: "icon",
    name: "Icon",
    description: "A clear visual cue.",
    Icon: Sparkles,
  },
  {
    type: "table",
    name: "Table",
    description: "Keep the details in order.",
    Icon: Table2,
  },
  {
    type: "chart",
    name: "Chart",
    description: "Give your data a point of view.",
    Icon: ChartColumn,
  },
  {
    type: "diagram",
    name: "Diagram",
    description: "Connect the steps or ideas.",
    Icon: Workflow,
  },
  {
    type: "video",
    name: "Video",
    description: "A moment that moves.",
    Icon: Video,
  },
  {
    type: "question",
    name: "Question",
    description: "Bring the room into your story.",
    Icon: MessageCircleQuestion,
  },
] as const;
export default function InsertLibrary({
  onInsert,
  onClose,
  onCompositions,
}: {
  onInsert: (type: FrameElement["type"]) => void;
  onClose: () => void;
  onCompositions: () => void;
}) {
  return (
    <Modal title="More ways to make your point." onClose={onClose} wide>
      <button className="button full composition-open" onClick={onCompositions}>
        Saved compositions · save or reuse a selection
      </button>
      <div className="insert-library">
        {choices.map(({ type, name, description, Icon }) => (
          <button
            key={type}
            aria-label={"Insert " + type}
            onClick={() => onInsert(type)}
          >
            <Icon size={28} strokeWidth={1.5} />
            <strong>{name}</strong>
            <span>{description}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
