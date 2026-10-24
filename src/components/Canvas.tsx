import {
  useEffect,
  useRef,
  useState,
  lazy,
  Suspense,
  type CSSProperties,
} from "react";
import { Rnd } from "react-rnd";
import SelectionTransform from "./SelectionTransform";
import { snapPosition } from "../../shared/geometry";
import type {
  FrameDocument,
  FrameElement,
  Operation,
  Slide,
} from "../../shared/schema";
import { resolveTheme } from "../../shared/themes";
import { ElementContent, slideBackground } from "./SlideRenderer";
const RichTextEditor = lazy(() => import("./RichTextEditor"));
export default function Canvas({
  doc,
  slide,
  selected,
  onSelect,
  execute,
  zoom,
  onScale,
  selectionMode = "objects",
  onEditObject,
}: {
  doc: FrameDocument;
  slide: Slide;
  selected: string[];
  onSelect: (ids: string[]) => void;
  execute: (op: Operation | Operation[]) => void;
  zoom: number;
  onScale: (scale: number) => void;
  selectionMode?: "objects" | "groups";
  onEditObject?: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null),
    [available, setAvailable] = useState({ width: 800, height: 600 }),
    [editing, setEditing] = useState<string | null>(null),
    [directSelection, setDirectSelection] = useState(false),
    [marquee, setMarquee] = useState<{
      x: number;
      y: number;
      w: number;
      h: number;
    } | null>(null),
    [guides, setGuides] = useState<{ x?: number; y?: number }>({}),
    [overflow, setOverflow] = useState<string[]>([]);
  const theme = resolveTheme(doc, slide);
  const selectionRef = useRef(selected),
    dragSelection = useRef<string[]>([]),
    dragMoved = useRef(false);
  selectionRef.current = selected;
  const fit = Math.max(
    0.08,
    Math.min(
      (available.width - 72) / doc.width,
      (available.height - 64) / doc.height,
    ),
  );
  const scale = fit * zoom;
  useEffect(() => {
    if (!host.current) return;
    const observer = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setAvailable({ width: r.width, height: r.height });
    });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    onScale(scale);
  }, [scale, onScale]);
  useEffect(() => {
    setEditing(null);
  }, [slide.id, selectionMode]);
  useEffect(() => {
    const modifier = (event: KeyboardEvent) =>
      setDirectSelection(event.ctrlKey || event.metaKey);
    const reset = () => setDirectSelection(false);
    window.addEventListener("keydown", modifier);
    window.addEventListener("keyup", modifier);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("keydown", modifier);
      window.removeEventListener("keyup", modifier);
      window.removeEventListener("blur", reset);
    };
  }, []);
  useEffect(() => {
    if (editing && !selected.includes(editing)) setEditing(null);
  }, [selected, editing]);
  useEffect(() => {
    let active = true;
    const check = () => {
      if (!active) return;
      const nodes = host.current?.querySelectorAll<HTMLElement>(
        "[data-text-id],[data-fit-id]",
      );
      setOverflow(
        Array.from(nodes || [])
          .filter(
            (n) =>
              n.scrollHeight > n.clientHeight + 3 ||
              n.scrollWidth > n.clientWidth + 3 ||
              Array.from(
                n.querySelectorAll<HTMLElement>("foreignObject div"),
              ).some((child) => child.scrollHeight > child.clientHeight + 3),
          )
          .map((n) => (n.dataset.textId || n.dataset.fitId)!),
      );
    };
    check();
    void document.fonts.ready.then(check);
    return () => {
      active = false;
    };
  }, [slide.elements, scale, theme]);
  const select = (el: FrameElement, shift: boolean, individual = false) => {
    const targets =
      selectionMode === "groups" && el.groupId && !individual && !el.locked
        ? slide.elements
            .filter(
              (member) =>
                member.groupId === el.groupId &&
                !member.hidden &&
                !member.locked,
            )
            .map((member) => member.id)
        : [el.id];
    const current = selectionRef.current;
    const next = shift
      ? targets.every((id) => current.includes(id))
        ? current.filter((id) => !targets.includes(id))
        : [...new Set([...current, ...targets])]
      : targets;
    selectionRef.current = next;
    onSelect(next);
    return next;
  };
  function startMarquee(e: React.PointerEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return;
    e.preventDefault();
    setEditing(null);
    const rect = e.currentTarget.getBoundingClientRect(),
      x = (e.clientX - rect.left) / scale,
      y = (e.clientY - rect.top) / scale;
    const initial = e.shiftKey ? selected : [];
    onSelect(initial);
    const move = (m: PointerEvent) => {
      const dx = (m.clientX - rect.left) / scale,
        dy = (m.clientY - rect.top) / scale;
      const box = {
        x: Math.min(x, dx),
        y: Math.min(y, dy),
        w: Math.abs(dx - x),
        h: Math.abs(dy - y),
      };
      setMarquee(box);
      onSelect([
        ...new Set([
          ...initial,
          ...slide.elements
            .filter(
              (el) =>
                !el.locked &&
                !el.hidden &&
                el.x < box.x + box.w &&
                el.x + el.width > box.x &&
                el.y < box.y + box.h &&
                el.y + el.height > box.y,
            )
            .map((el) => el.id),
        ]),
      ]);
    };
    const end = () => {
      setMarquee(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end, { once: true });
  }
  const handleStyles: Record<string, CSSProperties> = Object.fromEntries(
    ["topLeft", "topRight", "bottomLeft", "bottomRight"].map((p) => [
      p,
      {
        width: 24 / scale,
        height: 24 / scale,
        top: p.startsWith("top") ? -12 / scale : undefined,
        bottom: p.startsWith("bottom") ? -12 / scale : undefined,
        left: p.endsWith("Left") ? -12 / scale : undefined,
        right: p.endsWith("Right") ? -12 / scale : undefined,
        background: "transparent",
        borderRadius: 2 / scale,
        zIndex: 100,
      },
    ]),
  );
  return (
    <div
      className="canvas-host"
      ref={host}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onSelect([]);
      }}
    >
      <div
        className="canvas-wrap"
        style={{ width: doc.width * scale, height: doc.height * scale }}
      >
        <div
          className="editable-stage"
          role="region"
          aria-label="Slide canvas"
          style={{
            width: doc.width,
            height: doc.height,
            transform: `scale(${scale})`,
            ...slideBackground(theme, slide.background),
          }}
          onPointerDown={startMarquee}
        >
          {slide.elements
            .filter((el) => !el.hidden)
            .map((el, index) => {
              const active = selected.includes(el.id),
                isEditing = editing === el.id;
              return (
                <Rnd
                  key={el.id}
                  size={{ width: el.width, height: el.height }}
                  position={{ x: el.x, y: el.y }}
                  scale={scale}
                  minWidth={16}
                  minHeight={16}
                  disableDragging={el.locked || isEditing}
                  enableResizing={
                    active && selected.length === 1 && !el.locked && !isEditing
                  }
                  dragGrid={[1, 1]}
                  resizeHandleStyles={handleStyles}
                  resizeHandleComponent={Object.fromEntries(
                    ["topLeft", "topRight", "bottomLeft", "bottomRight"].map(
                      (key) => [
                        key,
                        <span
                          key={key}
                          aria-hidden
                          style={{
                            position: "absolute",
                            left: "50%",
                            top: "50%",
                            transform: "translate(-50%,-50%)",
                            width: 8 / scale,
                            height: 8 / scale,
                            border: 1 / scale + "px solid #3158df",
                            background: "#fff",
                            borderRadius: 1 / scale,
                          }}
                        />,
                      ],
                    ),
                  )}
                  lockAspectRatio={el.aspectLocked || el.shape === "circle"}
                  cancel="[contenteditable='true'], .frame-resize-handle"
                  resizeHandleClasses={Object.fromEntries(
                    [
                      "top",
                      "right",
                      "bottom",
                      "left",
                      "topLeft",
                      "topRight",
                      "bottomLeft",
                      "bottomRight",
                    ].map((key) => [key, "frame-resize-handle"]),
                  )}
                  style={{
                    zIndex: index + 1,
                    outline: active
                      ? `${1.5 / scale}px solid #3158df`
                      : undefined,
                    outlineOffset: 1 / scale,
                    cursor: el.locked ? "default" : isEditing ? "text" : "move",
                    touchAction: "none",
                  }}
                  onMouseDown={(e) => {
                    // react-draggable invokes this callback for native touchstart too.
                    // Let it reach React's delegated resize-handle listener.
                    if (e.type !== "touchstart") e.stopPropagation();
                    if (e.button === 0 && !isEditing)
                      select(el, e.shiftKey, e.ctrlKey || e.metaKey);
                  }}
                  onTouchStart={() => {
                    if (!isEditing) select(el, false);
                  }}
                  onDragStart={(event) => {
                    if (event.shiftKey && !selectionRef.current.includes(el.id))
                      return false;
                    const ids = selectionRef.current.includes(el.id)
                      ? selectionRef.current
                      : select(el, false);
                    dragSelection.current = ids.filter(
                      (id) =>
                        !slide.elements.find((member) => member.id === id)
                          ?.locked,
                    );
                    dragMoved.current = false;
                  }}
                  onDrag={(_, data) => {
                    dragMoved.current = true;
                    const snap = snapPosition(
                      el,
                      data.x,
                      data.y,
                      slide.elements.filter(
                        (e) =>
                          e.id !== el.id &&
                          !dragSelection.current.includes(e.id) &&
                          !e.hidden,
                      ),
                      doc.width,
                      doc.height,
                      6 / scale,
                    );
                    setGuides(snap.guides);
                  }}
                  onDragStop={(_, data) => {
                    if (!dragMoved.current) {
                      setGuides({});
                      dragSelection.current = [];
                      return;
                    }
                    const snap = snapPosition(
                      el,
                      data.x,
                      data.y,
                      slide.elements.filter(
                        (e) =>
                          e.id !== el.id &&
                          !dragSelection.current.includes(e.id) &&
                          !e.hidden,
                      ),
                      doc.width,
                      doc.height,
                      6 / scale,
                    );
                    const dx = snap.x - el.x,
                      dy = snap.y - el.y;
                    const ids = dragSelection.current.filter(
                      (id) => !slide.elements.find((e) => e.id === id)?.locked,
                    );
                    if (dx || dy)
                      execute(
                        ids.map((id) => {
                          const target = slide.elements.find(
                            (e) => e.id === id,
                          )!;
                          return {
                            type: "element.update" as const,
                            slideId: slide.id,
                            ids: [id],
                            patch: { x: target.x + dx, y: target.y + dy },
                          };
                        }),
                      );
                    setGuides({});
                    dragSelection.current = [];
                  }}
                  onResizeStop={(_, __, ref, ___, position) =>
                    execute({
                      type: "element.update",
                      slideId: slide.id,
                      ids: [el.id],
                      patch: {
                        width: Math.round(parseFloat(ref.style.width)),
                        height: Math.round(parseFloat(ref.style.height)),
                        x: position.x,
                        y: position.y,
                      },
                    })
                  }
                >
                  <div
                    className={`canvas-element ${active ? "selected" : ""}`}
                    data-canvas-element={el.id}
                    onClickCapture={(e) => {
                      if ((e.target as HTMLElement).closest("a"))
                        e.preventDefault();
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      if (el.locked) return;
                      selectionRef.current = [el.id];
                      onSelect([el.id]);
                      if (el.type !== "text") onEditObject?.(el.id);
                      if (el.type === "text" && !el.locked) {
                        setEditing(el.id);
                      }
                    }}
                    style={{ width: "100%", height: "100%" }}
                  >
                    <ElementContent el={el} theme={theme}>
                      {isEditing ? (
                        <Suspense fallback={<div>{el.text}</div>}>
                          <RichTextEditor
                            el={el}
                            scale={scale}
                            onDone={() => setEditing(null)}
                            onCommit={(text, richText) =>
                              execute({
                                type: "element.update",
                                slideId: slide.id,
                                ids: [el.id],
                                patch: { text, richText },
                              })
                            }
                          />
                        </Suspense>
                      ) : undefined}
                    </ElementContent>
                  </div>
                  {active && overflow.includes(el.id) && !isEditing && (
                    <div
                      className="overflow-label"
                      style={{
                        fontSize: 12 / scale,
                        padding: 4 / scale,
                        transform: `translateY(${-28 / scale}px)`,
                      }}
                    >
                      Content overflows — resize or shorten
                    </div>
                  )}
                </Rnd>
              );
            })}
          {!editing && (
            <SelectionTransform
              elements={slide.elements.filter(
                (e) => selected.includes(e.id) && !e.hidden,
              )}
              scale={scale}
              slideId={slide.id}
              stage={() =>
                host.current?.querySelector<HTMLElement>(".editable-stage") ||
                null
              }
              execute={execute}
              allowObjectSelection={
                selectionMode === "objects" || directSelection
              }
            />
          )}
          {guides.x !== undefined && (
            <div
              className="alignment-guide vertical"
              style={{ left: guides.x, borderWidth: 1 / scale }}
            />
          )}
          {guides.y !== undefined && (
            <div
              className="alignment-guide horizontal"
              style={{ top: guides.y, borderWidth: 1 / scale }}
            />
          )}
          {marquee && (
            <div
              className="marquee"
              style={{
                left: marquee.x,
                top: marquee.y,
                width: marquee.w,
                height: marquee.h,
                borderWidth: 1 / scale,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
