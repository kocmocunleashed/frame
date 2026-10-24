import { useEffect, useState, type FormEvent } from "react";
import { Layers, Trash2, Plus } from "lucide-react";
import type {
  FrameDocument,
  FrameElement,
  Operation,
  Slide,
} from "../../shared/schema";
import { cloneSlides } from "../../shared/operations";
import { api, json } from "../lib/api";
import { Modal, Loading, ErrorMessage, IconButton } from "./UI";
import { AutoSlide } from "./SlideRenderer";
export type Composition = {
  id: string;
  name: string;
  width: number;
  height: number;
  elements: FrameElement[];
  createdAt: string;
};
export default function Compositions({
  doc,
  slide,
  selected,
  execute,
  onClose,
  onSelect,
}: {
  doc: FrameDocument;
  slide: Slide;
  selected: string[];
  execute: (ops: Operation) => void;
  onClose: () => void;
  onSelect: (ids: string[]) => void;
}) {
  const [items, setItems] = useState<Composition[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const elements = slide.elements.filter((e) => selected.includes(e.id));
  async function load() {
    try {
      setItems(await api("/compositions"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!elements.length) return;
    const name = String(
      new FormData(event.currentTarget).get("name") || "",
    ).trim();
    if (!name) return;
    setBusy(true);
    try {
      const x = Math.min(...elements.map((e) => e.x)),
        y = Math.min(...elements.map((e) => e.y)),
        width = Math.max(...elements.map((e) => e.x + e.width)) - x + 48,
        height = Math.max(...elements.map((e) => e.y + e.height)) - y + 48;
      await api(
        "/compositions",
        json("POST", {
          name,
          width,
          height,
          elements: elements.map((e) => ({
            ...e,
            x: e.x - x + 24,
            y: e.y - y + 24,
          })),
        }),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function insert(item: Composition) {
    const copy = cloneSlides([
      {
        id: "composition",
        title: item.name,
        layout: "blank",
        notes: "",
        interactions: [],
        elements: item.elements,
      },
    ])[0];
    const groupId = crypto.randomUUID();
    const offsetX = Math.max(0, (doc.width - item.width) / 2),
      offsetY = Math.max(0, (doc.height - item.height) / 2);
    const added = copy.elements.map((e) => ({
      ...e,
      x: e.x + offsetX,
      y: e.y + offsetY,
      locked: false,
      groupId,
    }));
    execute({ type: "element.insert", slideId: slide.id, elements: added });
    onSelect(added.map((e) => e.id));
    onClose();
  }
  return (
    <Modal title="Keep a good idea handy." onClose={onClose} wide>
      <p className="modal-description">
        Save a selection as a composition, then reuse it in any presentation in
        this workspace.
      </p>
      {elements.length > 0 && (
        <form className="composition-save" onSubmit={save}>
          <label>
            Composition name
            <input
              name="name"
              placeholder="e.g. Three steps, one clear story"
              required
              maxLength={80}
            />
          </label>
          <button className="button primary" disabled={busy}>
            {busy ? "Saving…" : "Save selection"}
            <Plus size={15} />
          </button>
        </form>
      )}
      {error && <ErrorMessage>{error}</ErrorMessage>}
      {loading ? (
        <Loading label="Opening saved compositions…" />
      ) : items.length ? (
        <div className="composition-library">
          {items.map((item) => (
            <article key={item.id}>
              <button
                className="composition-insert"
                aria-label={"Insert composition " + item.name}
                onClick={() => insert(item)}
              >
                <AutoSlide
                  doc={{ ...doc, width: item.width, height: item.height }}
                  slide={{
                    ...slide,
                    themeId: undefined,
                    background: undefined,
                    elements: item.elements,
                  }}
                />
                <span>{item.name}</span>
              </button>
              <IconButton
                label={"Delete composition " + item.name}
                onClick={async () => {
                  try {
                    await api("/compositions/" + item.id, { method: "DELETE" });
                    await load();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                <Trash2 size={15} />
              </IconButton>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Layers size={35} />
          <h3>A place for your best arrangements.</h3>
          <p>Select objects on a slide, then save the selection here.</p>
        </div>
      )}
    </Modal>
  );
}
