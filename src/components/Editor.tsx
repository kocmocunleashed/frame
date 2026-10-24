import SlideThumbnail from "./SlideThumbnail";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Plus,
  Sparkles,
  Share2,
  Type,
  Table2,
  ChartColumn,
  Workflow,
  Video,
  MessageCircleQuestion,
  Star,
  LayoutGrid,
  Shapes,
  ImagePlus,
  Undo2,
  Redo2,
  Play,
  Check,
  CloudOff,
  LoaderCircle,
  AlertCircle,
  Minus,
  Maximize2,
  SlidersHorizontal,
  Layers,
  Palette,
  Trash2,
  Copy,
  GripVertical,
  LockKeyhole,
  UnlockKeyhole,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  Download,
  Keyboard,
  Users,
  MessageSquare,
  MousePointerClick,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  Milestone,
  Spline,
  Clapperboard,
  MousePointer2,
  Group,
  Braces,
} from "lucide-react";
import type {
  User,
  Folder,
  FrameDocument,
  FrameElement,
  Operation,
} from "../../shared/schema";
import { resolveTheme, resolveFontSize } from "../../shared/themes";
import { layoutSlide, LAYOUTS } from "../../shared/templates";
import { cloneSlide, newElement } from "../../shared/operations";
import type { Sharing as SharingState } from "../../shared/collaboration";
import { usePresence } from "../lib/usePresence";
import PresenceBadge from "./PresenceBadge";
import { useDocument } from "../lib/useDocument";
import { api, json, navigate } from "../lib/api";
import { Brand, ErrorMessage, IconButton, Loading, Modal } from "./UI";
import Canvas from "./Canvas";
import Compositions from "./Compositions";
import { splitTextElement } from "../../shared/text-fitting";
import Properties from "./Properties";
import MotionTimeline from "./MotionTimeline";
import { uid } from "../../shared/schema";
import ThemePanel from "./ThemePanel";
import { SlideRenderer } from "./SlideRenderer";
const Sharing = lazy(() => import("./Sharing"));
const Comments = lazy(() => import("./Comments"));
const AIAssistant = lazy(() => import("./AIAssistant"));
const Publishing = lazy(() => import("./Publishing"));
const InteractionBuilder = lazy(() => import("./InteractionBuilder"));
const ExportPanel = lazy(() => import("./ExportPanel"));
const DocumentJSON = lazy(() => import("./DocumentJSON"));
export default function Editor({ id, user }: { id: string; user: User }) {
  const presence = usePresence(id, "edit");
  useEffect(() => {
    let active = true;
    api<SharingState>(`/decks/${id}/access`)
      .then((access) => {
        if (active && access.role === "viewer") navigate(`/review/${id}`);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [id, presence.denied]);
  const state = useDocument(id),
    { doc, execute } = state;
  const [slideId, setSlideId] = useState(""),
    [slideSelection, setSlideSelection] = useState<string[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [selectionMode, setSelectionMode] = useState<"objects" | "groups">(
      "objects",
    ),
    [panel, setPanel] = useState<"design" | "themes" | "layers">("design"),
    [zoom, setZoom] = useState(1),
    [scale, setScale] = useState(1),
    [notes, setNotes] = useState(() => window.innerHeight >= 700),
    [modal, setModal] = useState<
      | null
      | "slides"
      | "shapes"
      | "shortcuts"
      | "resize"
      | "folder"
      | "history"
      | "compositions"
      | "ai"
      | "publishing"
      | "people"
      | "comments"
      | "interactions"
      | "export"
      | "json"
    >(null),
    [rightOpen, setRightOpen] = useState(() => window.innerWidth >= 960),
    [leftOpen, setLeftOpen] = useState(() => window.innerWidth >= 420),
    [uploading, setUploading] = useState(false),
    [folders, setFolders] = useState<Folder[]>([]),
    [revisions, setRevisions] = useState<
      { revision: number; createdAt: string }[]
    >([]),
    [replaceImage, setReplaceImage] = useState(false);
  const [motionOpen, setMotionOpen] = useState(false),
    [aiIntent, setAIIntent] = useState<
      "edit" | "design" | "illustrate" | "animate"
    >("edit");
  const imageRef = useRef<HTMLInputElement>(null),
    clipboard = useRef<FrameElement[]>([]),
    dragSlide = useRef<string | null>(null),
    dragLayer = useRef<string | null>(null);
  const slide = doc?.slides.find((s) => s.id === slideId) || doc?.slides[0];
  const slideIndex =
    doc && slide ? doc.slides.findIndex((s) => s.id === slide.id) : 0;
  const select = useCallback(
      (ids: string[]) => {
        setSelected(ids);
        if (
          ids.length === 1 &&
          slide?.elements.some(
            (el) =>
              el.id === ids[0] &&
              (["chart", "table", "diagram", "question", "timeline"].includes(
                el.type,
              ) ||
                el.shape === "path"),
          )
        ) {
          setPanel("design");
          setRightOpen(true);
        }
      },
      [slide?.elements],
    ),
    updateScale = useCallback((s: number) => setScale(s), []);
  useEffect(() => {
    setSelected([]);
  }, [slide?.id]);
  useEffect(() => {
    if (!slide) return;
    setSelected((ids) =>
      ids.filter((id) => slide.elements.some((e) => e.id === id)),
    );
  }, [slide?.elements]);
  function duplicate() {
    if (!slide || !selected.length) return;
    const groupMap = new Map<string, string>();
    const elements = slide.elements
      .filter((e) => selected.includes(e.id))
      .map((el) => {
        if (el.groupId && !groupMap.has(el.groupId))
          groupMap.set(el.groupId, crypto.randomUUID());
        return {
          ...el,
          id: crypto.randomUUID(),
          name: `${el.name} copy`,
          x: el.x + 24,
          y: el.y + 24,
          groupId: el.groupId ? groupMap.get(el.groupId) : undefined,
          locked: false,
        };
      });
    execute({ type: "element.insert", slideId: slide.id, elements });
    setSelected(elements.map((e) => e.id));
  }
  function remove() {
    if (!slide) return;
    execute({
      type: "element.delete",
      slideId: slide.id,
      ids: selected.filter(
        (id) => !slide.elements.find((e) => e.id === id)?.locked,
      ),
    });
    setSelected([]);
  }
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest('input,textarea,select,[contenteditable="true"],dialog')
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? state.redo() : state.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        state.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void state.save();
        return;
      }
      if (!slide) return;
      if (mod && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(
          slide.elements
            .filter((el) => !el.locked && !el.hidden)
            .map((el) => el.id),
        );
        return;
      }
      if (mod && e.key.toLowerCase() === "g" && selected.length) {
        e.preventDefault();
        execute({
          type: "element.update",
          slideId: slide.id,
          ids: selected,
          patch: { groupId: e.shiftKey ? undefined : crypto.randomUUID() },
        });
        return;
      }
      if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
        return;
      }
      if (mod && e.key.toLowerCase() === "c") {
        e.preventDefault();
        clipboard.current = structuredClone(
          slide.elements.filter((el) => selected.includes(el.id)),
        );
        return;
      }
      if (mod && e.key.toLowerCase() === "v" && clipboard.current.length) {
        e.preventDefault();
        const elements = clipboard.current.map((el) => ({
          ...el,
          id: crypto.randomUUID(),
          x: el.x + 24,
          y: el.y + 24,
          groupId: undefined,
          locked: false,
        }));
        execute({ type: "element.insert", slideId: slide.id, elements });
        setSelected(elements.map((el) => el.id));
        return;
      }
      if (e.key === "Escape") {
        setSelected([]);
        setModal(null);
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        if (selected.length) remove();
      }
      if (e.key.startsWith("Arrow")) {
        if (selected.length) {
          e.preventDefault();
          const delta = e.shiftKey ? 10 : 1;
          execute(
            slide.elements
              .filter((el) => selected.includes(el.id) && !el.locked)
              .map((el) => ({
                type: "element.update" as const,
                slideId: slide.id,
                ids: [el.id],
                patch: {
                  x:
                    el.x +
                    (e.key === "ArrowRight"
                      ? delta
                      : e.key === "ArrowLeft"
                        ? -delta
                        : 0),
                  y:
                    el.y +
                    (e.key === "ArrowDown"
                      ? delta
                      : e.key === "ArrowUp"
                        ? -delta
                        : 0),
                },
              })),
          );
        } else if (doc) {
          e.preventDefault();
          const i =
            slideIndex +
            (e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1);
          setSlideId(
            doc.slides[Math.max(0, Math.min(doc.slides.length - 1, i))].id,
          );
        }
      }
      if (e.key === "?") setModal("shortcuts");
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [doc, slide, selected, state.canUndo, state.canRedo]);
  async function leave(path: string) {
    await state.save();
    navigate(path);
  }
  async function present() {
    if (!doc) return;
    let rehearsal = doc;
    if (await state.saveAndConfirm()) {
      try {
        rehearsal = await api<FrameDocument>(`/decks/${id}`);
      } catch {
        /* A local rehearsal remains available offline. */
      }
    }
    sessionStorage.setItem(`frame:rehearsal:${id}`, JSON.stringify(rehearsal));
    navigate(`/present/${id}?slide=${slideIndex}`);
  }
  function add(layout: string) {
    if (!doc) return;
    const next = layoutSlide(
      layout,
      undefined,
      doc.width,
      doc.height,
      resolveTheme(doc, slide),
    );
    execute({ type: "slide.insert", slide: next, index: slideIndex + 1 });
    setSlideId(next.id);
    setModal(null);
  }
  function insert(
    type: FrameElement["type"],
    patch: Partial<FrameElement> = {},
  ) {
    if (!slide) return;
    const el = newElement(type, patch);
    execute({ type: "element.insert", slideId: slide.id, elements: [el] });
    setSelected([el.id]);
    setPanel("design");
    setRightOpen(true);
    setModal(null);
  }
  async function upload(file: File) {
    if (!slide) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("presentationId", id);
      form.set("file", file);
      const asset = await api<{
        src: string;
        name: string;
        mime: string;
        width?: number;
        height?: number;
      }>("/assets", {
        method: "POST",
        body: form,
      });
      if (replaceImage && selected.length === 1) {
        const existing = slide.elements.find((e) => e.id === selected[0]);
        if (
          (existing?.type === "image" && asset.mime.startsWith("video/")) ||
          (existing?.type === "video" && !asset.mime.startsWith("video/"))
        )
          throw new Error(
            "Choose media that matches the selected object type.",
          );
      }
      if (replaceImage && selected.length === 1)
        execute({
          type: "element.update",
          slideId: slide.id,
          ids: selected,
          patch: { src: asset.src, name: asset.name },
        });
      else
        insert(asset.mime.startsWith("video/") ? "video" : "image", {
          src: asset.src,
          name: asset.name,
          width: 480,
          height:
            asset.width && asset.height
              ? Math.round((480 * asset.height) / asset.width)
              : 320,
        });
      setReplaceImage(false);
    } catch (e) {
      state.setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  function switchLayout(layout: string) {
    if (!slide) return;
    if (layout === slide.layout) return;
    const fresh = layoutSlide(
      layout,
      undefined,
      doc!.width,
      doc!.height,
      resolveTheme(doc!, slide),
    );
    const used = new Set<string>();
    const elements = fresh.elements.map((slot) => {
      if (
        ![
          "text",
          "image",
          "chart",
          "table",
          "diagram",
          "question",
          "video",
        ].includes(slot.type)
      )
        return slot;
      const match = slide.elements.find(
        (old) =>
          !used.has(old.id) &&
          old.type === slot.type &&
          (slot.type !== "text" || old.role === slot.role),
      );
      if (!match) return slot;
      used.add(match.id);
      return {
        ...match,
        x: slot.x,
        y: slot.y,
        width: slot.width,
        height: slot.height,
        ...(slot.baseFontSize ? { baseFontSize: slot.baseFontSize } : {}),
      };
    });
    elements.push(...slide.elements.filter((el) => !used.has(el.id)));
    execute([
      {
        type: "element.delete",
        slideId: slide.id,
        ids: slide.elements.map((el) => el.id),
      },
      { type: "element.insert", slideId: slide.id, elements },
      { type: "slide.update", slideId: slide.id, patch: { layout } },
    ]);
  }

  function splitSelectedText() {
    if (!doc || !slide || selected.length !== 1) return;
    const el = slide.elements.find((e) => e.id === selected[0]);
    if (!el || el.type !== "text") return;
    const chunks = splitTextElement({
      ...el,
      fontSize: resolveFontSize(el, resolveTheme(doc, slide)),
    });
    if (chunks.length < 2) {
      state.setError(
        "This text fits in one slide. Resize its box or add more content before splitting.",
      );
      return;
    }
    if (chunks.length + doc.slides.length - 1 > 200) {
      state.setError(
        "This text would exceed the 200-slide limit. Try a larger text box first.",
      );
      return;
    }
    const index = slide.elements.findIndex((e) => e.id === el.id),
      ops: Operation[] = [
        {
          type: "element.update",
          slideId: slide.id,
          ids: [el.id],
          patch: { ...chunks[0] },
        },
      ];
    chunks.slice(1).forEach((chunk, i) => {
      const copy = cloneSlide(slide);
      copy.title = slide.title + " (" + (i + 2) + ")";
      copy.elements[index] = { ...copy.elements[index], ...chunk };
      ops.push({
        type: "slide.insert",
        slide: copy,
        index: slideIndex + i + 1,
      });
    });
    execute(ops);
  }
  async function openFolders() {
    try {
      setFolders(await api<Folder[]>("/folders"));
      setModal("folder");
    } catch (e) {
      state.setError((e as Error).message);
    }
  }
  async function openHistory() {
    if (!(await state.saveAndConfirm())) return;
    try {
      setRevisions(await api(`/decks/${id}/revisions`));
      setModal("history");
    } catch (e) {
      state.setError((e as Error).message);
    }
  }
  if (!doc || !slide)
    return (
      <main>
        {state.error ? (
          <div className="page-error">
            <ErrorMessage>{state.error}</ErrorMessage>
            <button className="button" onClick={() => navigate("/")}>
              Back to workspace
            </button>
          </div>
        ) : (
          <Loading label="Opening your presentation…" />
        )}
      </main>
    );
  const theme = resolveTheme(doc, slide),
    statusLabel =
      state.status === "saved"
        ? "All changes saved"
        : state.status === "saving"
          ? "Saving…"
          : state.status === "offline"
            ? "Offline · saved on this device"
            : state.status === "conflict"
              ? "Version conflict"
              : state.status === "failed"
                ? "Save failed · retry"
                : "Opening…";
  return (
    <div
      className={`editor ${rightOpen ? "" : "inspector-closed"} ${leftOpen ? "" : "rail-closed"}`}
    >
      <header className="editor-header">
        <IconButton label="Back to workspace" onClick={() => leave("/")}>
          <ArrowLeft size={20} />
        </IconButton>
        <div className="editor-brand">
          <Brand small />
        </div>
        <div className="document-title">
          <input
            aria-label="Presentation title"
            key={doc.id + doc.title}
            defaultValue={doc.title}
            maxLength={200}
            onBlur={(e) => {
              const title = e.target.value.trim();
              if (title && title !== doc.title)
                execute({ type: "document.update", patch: { title } });
              else e.target.value = doc.title;
            }}
          />
          <button
            className={`save-status ${state.status}`}
            onClick={() => state.save()}
            title="Save presentation"
            aria-live="polite"
          >
            {state.status === "saved" ? (
              <Check size={13} />
            ) : state.status === "saving" ? (
              <LoaderCircle className="spin" size={13} />
            ) : state.status === "offline" ? (
              <CloudOff size={13} />
            ) : (
              <AlertCircle size={13} />
            )}
            <span>{statusLabel}</span>
          </button>
        </div>
        <div className="editor-header-actions">
          <IconButton
            label="Undo"
            disabled={!state.canUndo}
            onClick={state.undo}
          >
            <Undo2 size={18} />
          </IconButton>
          <IconButton
            label="Redo"
            disabled={!state.canRedo}
            onClick={state.redo}
          >
            <Redo2 size={18} />
          </IconButton>
          <span className="tool-divider" />
          <button
            className="button editor-json-button"
            aria-label="View and copy presentation JSON"
            onClick={() => setModal("json")}
          >
            <Braces size={16} /> JSON
          </button>
          <button
            className="ai-editor-button"
            aria-label="Edit with AI"
            title="Edit with AI"
            onClick={() => {
              setAIIntent("edit");
              setModal("ai");
            }}
          >
            <Sparkles size={18} />
            <span>Edit with AI</span>
          </button>
          <IconButton
            label="Share with people"
            onClick={() => setModal("people")}
          >
            <Users size={18} />
          </IconButton>
          <IconButton
            label="Comments & review"
            onClick={() => setModal("comments")}
          >
            <MessageSquare size={18} />
          </IconButton>
          <IconButton
            label="Slide interactions"
            onClick={() => setModal("interactions")}
          >
            <MousePointerClick size={18} />
          </IconButton>
          <IconButton
            label="Publish & share"
            disabled={doc.ownerId !== user.id}
            onClick={() => setModal("publishing")}
          >
            <Share2 size={18} />
          </IconButton>
          <button
            aria-label="Export"
            className="button backup-button"
            onClick={() => setModal("export")}
          >
            <Download size={16} />
            <span>Export</span>
          </button>
          <button className="button dark" onClick={present}>
            <Play size={15} fill="currentColor" />
            Present
          </button>
        </div>
      </header>
      <div className="editor-toolbar">
        <div className="toolbar-group">
          <IconButton
            label={leftOpen ? "Hide slide navigation" : "Show slide navigation"}
            onClick={() => setLeftOpen(!leftOpen)}
          >
            {leftOpen ? (
              <PanelLeftClose size={18} />
            ) : (
              <PanelLeftOpen size={18} />
            )}
          </IconButton>
          <span className="tool-divider" />
          <button onClick={() => setModal("slides")}>
            <Plus size={18} />
            Slide
            <ChevronDown size={13} />
          </button>
        </div>
        <div className="insert-tools" role="toolbar" aria-label="Slide tools">
          <button aria-label="Text" onClick={() => insert("text")}>
            <Type size={19} />
            <span>Text</span>
          </button>
          <button aria-label="Shape" onClick={() => setModal("shapes")}>
            <Shapes size={19} />
            <span>Shape</span>
          </button>
          <button
            aria-label="Image"
            disabled={uploading}
            onClick={() => {
              setReplaceImage(false);
              imageRef.current?.click();
            }}
          >
            {uploading ? (
              <LoaderCircle className="spin" size={18} />
            ) : (
              <ImagePlus size={19} />
            )}
            <span>Image</span>
          </button>
          {(
            [
              ["chart", "Chart", ChartColumn],
              ["table", "Table", Table2],
              ["diagram", "Diagram", Workflow],
              ["timeline", "Timeline", Milestone],
              ["icon", "Icon", Star],
              ["question", "Question", MessageCircleQuestion],
              ["video", "Video", Video],
            ] as const
          ).map(([type, label, Icon]) => (
            <button
              key={type}
              aria-label={`Add ${label.toLowerCase()}`}
              onClick={() => insert(type)}
            >
              <Icon size={18} />
              <span>{label}</span>
            </button>
          ))}
          <button
            aria-label="Add illustration"
            onClick={() => {
              setAIIntent("illustrate");
              setModal("ai");
            }}
          >
            <Spline size={18} />
            <span>Illustration</span>
          </button>
          <button
            aria-label="Animation timeline"
            aria-pressed={motionOpen}
            onClick={() => setMotionOpen(!motionOpen)}
          >
            <Clapperboard size={18} />
            <span>Animate</span>
          </button>
          <button
            aria-label="Add editable vector"
            onClick={() =>
              insert("shape", {
                name: "Vector leaf",
                shape: "path",
                fill: "accent",
                path: [
                  { op: "M", x: 10, y: 90 },
                  { op: "C", x1: 0, y1: 30, x2: 70, y2: 0, x: 90, y: 10 },
                  { op: "C", x1: 100, y1: 70, x2: 30, y2: 100, x: 10, y: 90 },
                  { op: "Z" },
                ],
              })
            }
          >
            <Spline size={18} />
            <span>Vector</span>
          </button>
          <button
            aria-label="Saved compositions"
            onClick={() => setModal("compositions")}
          >
            <LayoutGrid size={18} />
            <span>Compositions</span>
          </button>
          <button
            aria-label="Delete selection"
            className="delete-selection-tool"
            disabled={
              !slide.elements.some(
                (el) => selected.includes(el.id) && !el.locked,
              )
            }
            onClick={remove}
          >
            <Trash2 size={18} />
            <span>Delete</span>
          </button>
          <span className="tool-divider" />
          <button
            aria-label="Theme"
            className={panel === "themes" && rightOpen ? "active" : ""}
            onClick={() => {
              setPanel("themes");
              setRightOpen(true);
            }}
          >
            <Palette size={18} />
            <span>Theme</span>
          </button>
          <button
            aria-label="Layers"
            className={panel === "layers" && rightOpen ? "active" : ""}
            onClick={() => {
              setPanel("layers");
              setRightOpen(true);
            }}
          >
            <Layers size={18} />
            <span>Layers</span>
          </button>
        </div>
        <IconButton
          label={rightOpen ? "Hide properties" : "Show properties"}
          onClick={() => setRightOpen(!rightOpen)}
        >
          <SlidersHorizontal size={18} />
        </IconButton>
      </div>
      {(state.error || state.recovery || state.conflict) && (
        <div className="editor-alert">
          {state.recovery ? (
            <>
              <span>An unsaved version from this device is available.</span>
              <button onClick={state.recover}>Recover changes</button>
              <button onClick={() => state.reload()}>Use server version</button>
            </>
          ) : state.conflict ? (
            <>
              <span>
                {state.error ||
                  "This presentation changed elsewhere. Both versions are preserved."}
              </span>
              <button onClick={state.copyRecovery}>
                Save my version as a copy
              </button>
              <button onClick={() => state.reload()}>
                Open server version
              </button>
            </>
          ) : (
            <>
              <span role="alert">{state.error}</span>
              <button onClick={() => state.save()}>Retry saving</button>
              <IconButton
                label="Dismiss message"
                onClick={() => state.setError("")}
              >
                <X size={16} />
              </IconButton>
            </>
          )}
        </div>
      )}
      <div className="editor-body">
        {leftOpen && (
          <aside className="slide-rail" aria-label="Slides">
            <div className="slide-rail-head">
              <span>
                Slides <small>{doc.slides.length}</small>
              </span>
              <IconButton
                label="Add a slide"
                onClick={() => setModal("slides")}
              >
                <Plus size={17} />
              </IconButton>
            </div>
            <div className="slide-rail-list">
              {doc.slides.map((s, i) => (
                <div
                  key={s.id}
                  className={`slide-thumb-row ${s.id === slide.id ? "active" : ""}`}
                  draggable
                  onDragStart={() => (dragSlide.current = s.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (!dragSlide.current || dragSlide.current === s.id)
                      return;
                    const ids = doc.slides
                      .map((s) => s.id)
                      .filter((id) => id !== dragSlide.current);
                    ids.splice(i, 0, dragSlide.current);
                    execute({ type: "slide.order", ids });
                    dragSlide.current = null;
                  }}
                >
                  <label
                    className="slide-pick"
                    title={`Select slide ${i + 1} for theme application`}
                  >
                    <input
                      type="checkbox"
                      aria-label={`Select slide ${i + 1}`}
                      checked={slideSelection.includes(s.id)}
                      onChange={(e) =>
                        setSlideSelection((ids) =>
                          e.target.checked
                            ? [...ids, s.id]
                            : ids.filter((id) => id !== s.id),
                        )
                      }
                    />
                    <span className="slide-number">{i + 1}</span>
                  </label>
                  <button
                    aria-label={`Slide ${i + 1}: ${s.title}`}
                    aria-current={s.id === slide.id ? "true" : undefined}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        const start = Math.min(slideIndex, i),
                          end = Math.max(slideIndex, i);
                        setSlideSelection(
                          doc.slides.slice(start, end + 1).map((s) => s.id),
                        );
                      }
                      setSlideId(s.id);
                    }}
                  >
                    <SlideThumbnail
                      doc={doc}
                      slide={s}
                      active={s.id === slide.id}
                      eager={i < 4}
                    />
                    <span className="slide-thumb-title">{s.title}</span>
                  </button>
                </div>
              ))}
            </div>
            <div className="slide-rail-bottom">
              <button
                className="button full"
                onClick={() => setModal("slides")}
              >
                <Plus size={17} />
                Add slide
              </button>
              <div>
                <IconButton
                  label="Move slide up"
                  disabled={slideIndex === 0}
                  onClick={() => {
                    const ids = doc.slides.map((s) => s.id);
                    [ids[slideIndex - 1], ids[slideIndex]] = [
                      ids[slideIndex],
                      ids[slideIndex - 1],
                    ];
                    execute({ type: "slide.order", ids });
                  }}
                >
                  <ArrowUp size={15} />
                </IconButton>
                <IconButton
                  label="Move slide down"
                  disabled={slideIndex === doc.slides.length - 1}
                  onClick={() => {
                    const ids = doc.slides.map((s) => s.id);
                    [ids[slideIndex + 1], ids[slideIndex]] = [
                      ids[slideIndex],
                      ids[slideIndex + 1],
                    ];
                    execute({ type: "slide.order", ids });
                  }}
                >
                  <ArrowDown size={15} />
                </IconButton>
                <IconButton
                  label="Duplicate slide"
                  onClick={() => {
                    const next = cloneSlide(slide);
                    execute({
                      type: "slide.insert",
                      slide: next,
                      index: slideIndex + 1,
                    });
                    setSlideId(next.id);
                  }}
                >
                  <Copy size={15} />
                </IconButton>
                <IconButton
                  label="Delete slide"
                  disabled={doc.slides.length === 1}
                  onClick={() => {
                    const next = doc.slides[Math.max(0, slideIndex - 1)].id;
                    execute({ type: "slide.delete", slideId: slide.id });
                    setSlideId(next);
                  }}
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            </div>
          </aside>
        )}
        <main className="editor-center">
          <div className="canvas-heading">
            <span>{slide.title}</span>
            <div className="canvas-selection-tools">
              <div
                className="selection-mode"
                role="group"
                aria-label="Selection mode"
              >
                <button
                  aria-pressed={selectionMode === "objects"}
                  title="Select and edit one object at a time, including objects in groups"
                  onClick={() => {
                    setSelectionMode("objects");
                    setSelected([]);
                  }}
                >
                  <MousePointer2 size={14} aria-hidden="true" /> Objects
                </button>
                <button
                  aria-pressed={selectionMode === "groups"}
                  title="Select grouped objects together. Ctrl or Command-click selects one part."
                  onClick={() => {
                    setSelectionMode("groups");
                    setSelected([]);
                  }}
                >
                  <Group size={14} aria-hidden="true" /> Groups
                </button>
              </div>
              <span className="canvas-selection-hint">
                {selected.length
                  ? `${selected.length} selected`
                  : selectionMode === "objects"
                    ? "Click one object · double-click to edit"
                    : "Click to select a group"}
              </span>
            </div>
          </div>
          <Canvas
            doc={doc}
            slide={slide}
            selected={selected}
            onSelect={select}
            execute={execute}
            zoom={zoom}
            onScale={updateScale}
            selectionMode={selectionMode}
            onEditObject={(elementId) => {
              select([elementId]);
              setPanel("design");
              setRightOpen(true);
            }}
          />
          {motionOpen && (
            <MotionTimeline
              key={slide.id}
              doc={doc}
              slide={slide}
              selected={selected}
              onSelect={setSelected}
              execute={execute}
              onClose={() => setMotionOpen(false)}
            />
          )}
          <div className="canvas-bottom">
            <button
              className={notes ? "active" : ""}
              onClick={() => setNotes(!notes)}
            >
              {notes ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
              Speaker notes
            </button>
            <div className="zoom-controls">
              <IconButton
                label="Zoom out"
                disabled={zoom <= 0.3}
                onClick={() => setZoom((z) => Math.max(0.25, z - 0.15))}
              >
                <Minus size={15} />
              </IconButton>
              <span>{Math.round(scale * 100)}%</span>
              <IconButton
                label="Zoom in"
                disabled={zoom >= 3}
                onClick={() => setZoom((z) => Math.min(3, z + 0.15))}
              >
                <Plus size={15} />
              </IconButton>
              <IconButton label="Fit to screen" onClick={() => setZoom(1)}>
                <Maximize2 size={15} />
              </IconButton>
            </div>
          </div>
          {notes && (
            <div className="speaker-notes">
              <textarea
                key={slide.id + slide.notes}
                aria-label="Speaker notes"
                placeholder="A little reminder for when you’re in the room. These notes stay private."
                defaultValue={slide.notes}
                maxLength={30000}
                onBlur={(e) => {
                  if (e.target.value !== slide.notes)
                    execute({
                      type: "slide.update",
                      slideId: slide.id,
                      patch: { notes: e.target.value },
                    });
                }}
              />
            </div>
          )}
          <footer className="editor-statusbar">
            <span>
              Slide {slideIndex + 1} of {doc.slides.length}
            </span>
            <span>
              {doc.width} × {doc.height} <span>·</span> {theme.name}
            </span>
            <button onClick={() => setModal("shortcuts")}>
              <Keyboard size={14} />
              Shortcuts
            </button>
            <PresenceBadge presence={presence} />
            {presence.denied && <a href={`/review/${id}`}>Review access</a>}
          </footer>
        </main>
        {rightOpen && (
          <aside className="inspector">
            <div className="inspector-tabs">
              <button
                className={panel === "design" ? "active" : ""}
                onClick={() => setPanel("design")}
              >
                Design
              </button>
              <button
                className={panel === "themes" ? "active" : ""}
                onClick={() => setPanel("themes")}
              >
                Themes
              </button>
              <button
                className={panel === "layers" ? "active" : ""}
                onClick={() => setPanel("layers")}
              >
                Layers
              </button>
            </div>
            <div className="inspector-content">
              {panel === "design" ? (
                <Properties
                  doc={doc}
                  slide={slide}
                  theme={theme}
                  selected={selected}
                  execute={execute}
                  onLayout={switchLayout}
                  onDuplicate={duplicate}
                  onDelete={remove}
                  onImage={() => {
                    setReplaceImage(true);
                    imageRef.current?.click();
                  }}
                  onResize={() => setModal("resize")}
                  onFolder={() => {
                    if (doc.ownerId === user.id) void openFolders();
                    else
                      state.setError(
                        "Only the owner can move this presentation to a folder.",
                      );
                  }}
                  onSplitText={splitSelectedText}
                  onSelectGroup={(ids) => {
                    setSelectionMode("groups");
                    select(ids);
                  }}
                />
              ) : panel === "themes" ? (
                <ThemePanel
                  onCreative={() => {
                    setAIIntent("design");
                    setModal("ai");
                  }}
                  doc={doc}
                  slideId={slide.id}
                  selectedSlideIds={slideSelection.filter((id) =>
                    doc.slides.some((s) => s.id === id),
                  )}
                  execute={execute}
                />
              ) : (
                <div className="layers-panel">
                  <div className="panel-section">
                    <h3>Objects on this slide</h3>
                    <p className="hint">
                      Top objects appear in front. Select a layer to find
                      objects behind others.
                    </p>
                  </div>
                  {[...slide.elements].reverse().map((el) => (
                    <div
                      className={`layer-row ${selected.includes(el.id) ? "active" : ""}`}
                      key={el.id}
                      draggable
                      onDragStart={() => (dragLayer.current = el.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const dragged = dragLayer.current;
                        if (!dragged || dragged === el.id) return;
                        const visual = [...slide.elements]
                          .reverse()
                          .map((e) => e.id)
                          .filter((id) => id !== dragged);
                        visual.splice(visual.indexOf(el.id), 0, dragged);
                        execute({
                          type: "element.order",
                          slideId: slide.id,
                          ids: visual.reverse(),
                        });
                        dragLayer.current = null;
                      }}
                    >
                      <GripVertical size={13} />
                      <button
                        className="layer-name"
                        onDoubleClick={() => {
                          select([el.id]);
                          setPanel("design");
                          setRightOpen(true);
                        }}
                        onClick={(e) =>
                          setSelected(
                            e.shiftKey
                              ? [...new Set([...selected, el.id])]
                              : [el.id],
                          )
                        }
                      >
                        {el.type === "text" ? (
                          <Type size={16} />
                        ) : el.type === "shape" ? (
                          <Shapes size={16} />
                        ) : (
                          <ImagePlus size={16} />
                        )}
                        <span>{el.name}</span>
                      </button>
                      <IconButton
                        label={
                          el.hidden ? `Show ${el.name}` : `Hide ${el.name}`
                        }
                        onClick={() =>
                          execute({
                            type: "element.update",
                            slideId: slide.id,
                            ids: [el.id],
                            patch: { hidden: !el.hidden },
                          })
                        }
                      >
                        {el.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                      </IconButton>
                      <IconButton
                        label={
                          el.locked ? `Unlock ${el.name}` : `Lock ${el.name}`
                        }
                        onClick={() =>
                          execute({
                            type: "element.update",
                            slideId: slide.id,
                            ids: [el.id],
                            patch: { locked: !el.locked },
                          })
                        }
                      >
                        {el.locked ? (
                          <LockKeyhole size={14} />
                        ) : (
                          <UnlockKeyhole size={14} />
                        )}
                      </IconButton>
                    </div>
                  ))}
                  {slide.elements.length === 0 && (
                    <p className="panel-section muted">
                      Nothing here yet. Add text, a shape, or an image.
                    </p>
                  )}
                </div>
              )}
            </div>
            <button className="version-button" onClick={openHistory}>
              Version history <span>Revision {doc.revision}</span>
            </button>
          </aside>
        )}
      </div>
      <input
        hidden
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
        ref={imageRef}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
          e.target.value = "";
        }}
      />
      {modal === "people" && (
        <Suspense fallback={<Loading label="Opening sharing…" />}>
          <Sharing id={id} onClose={() => setModal(null)} />
        </Suspense>
      )}
      {modal === "comments" && (
        <Suspense fallback={<Loading label="Opening comments…" />}>
          <Comments
            doc={doc}
            slideId={slide.id}
            elementId={selected.length === 1 ? selected[0] : undefined}
            userId={user.id}
            onNavigate={(slideId) => {
              setSlideId(slideId);
              setSelected([]);
              setModal(null);
            }}
            onClose={() => setModal(null)}
          />
        </Suspense>
      )}
      {modal === "interactions" && (
        <Suspense fallback={<Loading label="Opening interactions…" />}>
          <InteractionBuilder
            doc={doc}
            slide={slide}
            onApply={execute}
            onClose={() => setModal(null)}
          />
        </Suspense>
      )}
      {modal === "export" && (
        <Suspense fallback={<Loading label="Opening exports…" />}>
          <ExportPanel
            doc={doc}
            beforeExport={state.saveAndConfirm}
            onClose={() => setModal(null)}
          />
        </Suspense>
      )}
      {modal === "json" && (
        <Suspense fallback={<Loading label="Opening JSON…" />}>
          <DocumentJSON
            doc={doc}
            slide={slide}
            selected={selected}
            onClose={() => setModal(null)}
          />
        </Suspense>
      )}
      {modal === "publishing" && (
        <Suspense fallback={<Loading label="Opening publishing…" />}>
          <Publishing
            doc={doc}
            beforePublish={state.saveAndConfirm}
            onClose={() => setModal(null)}
          />
        </Suspense>
      )}
      {modal === "ai" && (
        <Suspense fallback={<Loading label="Opening AI assistant…" />}>
          <AIAssistant
            initialIntent={aiIntent}
            doc={doc}
            slideId={slide.id}
            selected={selected}
            selectedSlideIds={slideSelection.filter((id) =>
              doc.slides.some((s) => s.id === id),
            )}
            beforeStart={state.saveAndConfirm}
            onApply={async (jobId) => {
              if (!(await state.saveAndConfirm())) return false;
              const result = await api<{ operations: Operation[] }>(
                `/decks/${doc.id}/ai/${jobId}/operations`,
                json("POST", { baseRevision: doc.revision }),
              );
              execute(result.operations);
              return true;
            }}
            onClose={() => setModal(null)}
          />
        </Suspense>
      )}
      {modal === "compositions" && (
        <Compositions
          doc={doc}
          slide={slide}
          selected={selected}
          execute={execute}
          onSelect={setSelected}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "slides" && (
        <Modal
          title="A little structure goes a long way."
          onClose={() => setModal(null)}
          wide
        >
          <p className="modal-description">
            Choose a layout. Every piece can be edited.
          </p>
          <div className="layout-picker">
            {LAYOUTS.map((l) => (
              <button
                key={l.id}
                aria-label={"Add " + l.name + " slide"}
                onClick={() => add(l.id)}
              >
                <SlideRenderer
                  doc={doc}
                  slide={layoutSlide(
                    l.id,
                    undefined,
                    doc.width,
                    doc.height,
                    theme,
                  )}
                  scale={0.18}
                />
                <span>{l.name}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {modal === "shapes" && (
        <Modal title="Make room for a shape." onClose={() => setModal(null)}>
          <div className="shape-picker">
            {(
              [
                "rectangle",
                "rounded",
                "circle",
                "ellipse",
                "triangle",
                "polygon",
                "star",
                "spark",
                "bubble",
                "arrow",
                "blob",
                "line",
              ] as const
            ).map((shape) => (
              <button
                key={shape}
                onClick={() =>
                  insert("shape", {
                    shape,
                    name: shape[0].toUpperCase() + shape.slice(1),
                    height: shape === "line" ? 8 : 260,
                  })
                }
              >
                <SlideRenderer
                  doc={{ ...doc, width: 300, height: 220 }}
                  slide={{
                    ...slide,
                    background: "surface",
                    elements: [
                      newElement("shape", {
                        x: 80,
                        y: 40,
                        width: 140,
                        height: 140,
                        shape,
                        fill: "foreground",
                      }),
                    ],
                  }}
                  scale={0.3}
                />
                <span>{shape[0].toUpperCase() + shape.slice(1)}</span>
              </button>
            ))}
          </div>
        </Modal>
      )}
      {modal === "shortcuts" && (
        <Modal title="A few useful shortcuts." onClose={() => setModal(null)}>
          <div className="shortcut-list">
            {[
              ["Undo", "Ctrl / ⌘ Z"],
              ["Redo", "Ctrl / ⌘ Shift Z"],
              ["Save now", "Ctrl / ⌘ S"],
              ["Select all objects", "Ctrl / ⌘ A"],
              ["Duplicate", "Ctrl / ⌘ D"],
              ["Copy / paste objects", "Ctrl / ⌘ C / V"],
              ["Nudge an object", "Arrow keys"],
              ["Nudge by 10", "Shift + arrows"],
              ["Delete selected", "Delete / Backspace"],
              ["Select multiple", "Shift + click"],
              ["Edit text", "Double-click"],
              ["Select one part in Groups mode", "Ctrl / ⌘ + click"],
              ["Group / ungroup", "Ctrl / ⌘ G / Shift G"],
              ["Clear selection", "Escape"],
            ].map(([label, key]) => (
              <div key={label}>
                <span>{label}</span>
                <kbd>{key}</kbd>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {modal === "resize" && (
        <Modal title="Change the slide size." onClose={() => setModal(null)}>
          <form
            className="modal-form"
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget),
                width = Number(f.get("width")),
                height = Number(f.get("height"));
              const resizeObjects = f.get("scale") === "on";
              const ops: Operation[] = [
                { type: "document.update", patch: { width, height } },
              ];
              if (resizeObjects)
                for (const s of doc.slides)
                  for (const el of s.elements)
                    ops.push({
                      type: "element.update",
                      slideId: s.id,
                      ids: [el.id],
                      patch: {
                        x: (el.x * width) / doc.width,
                        y: (el.y * height) / doc.height,
                        width: (el.width * width) / doc.width,
                        height: (el.height * height) / doc.height,
                        ...(el.baseFontSize
                          ? {
                              baseFontSize: Math.max(
                                8,
                                Math.min(
                                  300,
                                  el.baseFontSize *
                                    Math.min(
                                      width / doc.width,
                                      height / doc.height,
                                    ),
                                ),
                              ),
                            }
                          : {}),
                        ...(el.fontSize
                          ? {
                              fontSize: Math.min(
                                300,
                                Math.max(
                                  8,
                                  el.fontSize *
                                    Math.min(
                                      width / doc.width,
                                      height / doc.height,
                                    ),
                                ),
                              ),
                            }
                          : {}),
                      },
                    });
              execute(ops);
              setModal(null);
            }}
          >
            <p>Resizing affects the entire presentation.</p>
            <label>
              Width
              <input
                type="number"
                name="width"
                defaultValue={doc.width}
                min={300}
                max={4000}
                required
              />
            </label>
            <label>
              Height
              <input
                type="number"
                name="height"
                defaultValue={doc.height}
                min={300}
                max={4000}
                required
              />
            </label>
            <label className="checkbox-label">
              <input type="checkbox" name="scale" defaultChecked />
              Scale object positions and sizes
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="button"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button className="button primary">Resize presentation</button>
            </div>
          </form>
        </Modal>
      )}
      {modal === "folder" && (
        <Modal title="Move to a folder" onClose={() => setModal(null)}>
          <div className="folder-picker">
            {[{ id: "", name: "All presentations" }, ...folders].map((f) => (
              <button
                key={f.id}
                className="button full"
                onClick={async () => {
                  if (!(await state.saveAndConfirm())) return;
                  try {
                    const latest = await api<FrameDocument>(`/decks/${id}`);
                    await api(
                      `/decks/${id}`,
                      json("PATCH", {
                        baseRevision: latest.revision,
                        operations: [
                          {
                            type: "document.update",
                            patch: { folderId: f.id || null },
                          },
                        ],
                      }),
                    );
                    await state.reload();
                    setModal(null);
                  } catch (e) {
                    state.setError((e as Error).message);
                  }
                }}
              >
                {f.name}
                {doc.folderId === (f.id || null) && <Check size={17} />}
              </button>
            ))}
          </div>
          {!folders.length && (
            <p className="muted">
              Create folders from your workspace to organize presentations.
            </p>
          )}
        </Modal>
      )}
      {modal === "history" && (
        <Modal
          title="Your presentation, over time."
          onClose={() => setModal(null)}
        >
          <p className="modal-description">
            The latest 80 saved revisions are kept. Restoring adds a new
            revision.
          </p>
          <div className="revision-list">
            {revisions.map((r) => (
              <div key={r.revision}>
                <span>
                  Revision {r.revision}
                  <small>{new Date(r.createdAt).toLocaleString()}</small>
                </span>
                <button
                  className="button"
                  disabled={r.revision === doc.revision}
                  onClick={async () => {
                    try {
                      if (!(await state.saveAndConfirm())) return;
                      const latest = await api<FrameDocument>(`/decks/${id}`);
                      await api(
                        `/decks/${id}/restore/${r.revision}`,
                        json("POST", { baseRevision: latest.revision }),
                      );
                      await state.reload();
                      setModal(null);
                    } catch (e) {
                      state.setError((e as Error).message);
                    }
                  }}
                >
                  {r.revision === doc.revision ? "Current" : "Restore"}
                </button>
              </div>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
