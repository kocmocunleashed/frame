import { useRef } from "react";
import { Rnd } from "react-rnd";
import { RotateCw } from "lucide-react";
import type { FrameElement, Operation } from "../../shared/schema";
export default function SelectionTransform({
  elements,
  scale,
  slideId,
  stage,
  execute,
  allowObjectSelection = false,
}: {
  elements: FrameElement[];
  scale: number;
  slideId: string;
  stage: () => HTMLElement | null;
  execute: (ops: Operation[]) => void;
  allowObjectSelection?: boolean;
}) {
  const latest = useRef(elements);
  latest.current = elements;
  if (!elements.length || elements.some((e) => e.locked)) return null;
  const x = Math.min(...elements.map((e) => e.x)),
    y = Math.min(...elements.map((e) => e.y)),
    width = Math.max(...elements.map((e) => e.x + e.width)) - x,
    height = Math.max(...elements.map((e) => e.y + e.height)) - y;
  const apply = (
    updates: { el: FrameElement; patch: Partial<FrameElement> }[],
  ) =>
    execute(
      updates.map(({ el, patch }) => ({
        type: "element.update",
        slideId,
        ids: [el.id],
        patch,
      })),
    );
  function preview(el: FrameElement, patch: Partial<FrameElement>) {
    const node = stage()?.querySelector<HTMLElement>(
      '[data-canvas-element="' + el.id + '"]',
    );
    if (!node) return;
    const wrapper = node.parentElement;
    if (wrapper) {
      wrapper.style.transform =
        "translate(" + (patch.x ?? el.x) + "px," + (patch.y ?? el.y) + "px)";
      wrapper.style.width = (patch.width ?? el.width) + "px";
      wrapper.style.height = (patch.height ?? el.height) + "px";
    }
    const content = node.firstElementChild as HTMLElement | null;
    if (content)
      content.style.transform =
        "rotate(" + (patch.rotation ?? el.rotation) + "deg)";
  }
  function rotate(event: React.PointerEvent) {
    event.preventDefault();
    event.stopPropagation();
    const rect = stage()?.getBoundingClientRect();
    if (!rect) return;
    const cx = x + width / 2,
      cy = y + height / 2,
      angle0 = Math.atan2(
        (event.clientY - rect.top) / scale - cy,
        (event.clientX - rect.left) / scale - cx,
      );
    let updates: { el: FrameElement; patch: Partial<FrameElement> }[] = [];
    const move = (e: PointerEvent) => {
      let delta =
        ((Math.atan2(
          (e.clientY - rect.top) / scale - cy,
          (e.clientX - rect.left) / scale - cx,
        ) -
          angle0) *
          180) /
        Math.PI;
      if (e.shiftKey) delta = Math.round(delta / 15) * 15;
      const rad = (delta * Math.PI) / 180;
      updates = elements.map((el) => {
        const ox = el.x + el.width / 2 - cx,
          oy = el.y + el.height / 2 - cy;
        const patch = {
          rotation: Math.round(((el.rotation + delta + 540) % 360) - 180),
          x:
            elements.length === 1
              ? el.x
              : cx + ox * Math.cos(rad) - oy * Math.sin(rad) - el.width / 2,
          y:
            elements.length === 1
              ? el.y
              : cy + ox * Math.sin(rad) + oy * Math.cos(rad) - el.height / 2,
        };
        preview(el, patch);
        return { el, patch };
      });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      if (updates.length) apply(updates);
    };
    const cancel = () => {
      elements.forEach((el) => preview(el, {}));
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
  }
  const rotation = (
    <button
      className="selection-rotation"
      aria-label="Rotate selection"
      title="Drag to rotate. Hold Shift for 15° steps. Arrow keys rotate by 1°."
      onPointerDown={rotate}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          e.stopPropagation();
          apply(
            elements.map((el) => ({
              el,
              patch: {
                rotation: Math.max(
                  -360,
                  Math.min(
                    360,
                    el.rotation +
                      (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 15 : 1),
                  ),
                ),
              },
            })),
          );
        }
      }}
      style={{
        width: 24 / scale,
        height: 24 / scale,
        top: Math.max(-36 / scale, -y + 4 / scale),
        left: width / 2 - 12 / scale,
        borderWidth: 1 / scale,
      }}
    >
      <RotateCw size={14 / scale} />
    </button>
  );
  if (elements.length === 1)
    return (
      <div
        className="selection-transform-single"
        style={{
          position: "absolute",
          left: x,
          top: y,
          width,
          height,
          zIndex: 1000,
          pointerEvents: "none",
        }}
      >
        {rotation}
      </div>
    );
  return (
    <Rnd
      className="selection-transform-group"
      position={{ x, y }}
      size={{ width, height }}
      scale={scale}
      minWidth={32}
      minHeight={32}
      cancel=".selection-rotation, .frame-resize-handle"
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
        zIndex: 1000,
        border: 1 / scale + "px solid #3158df",
        cursor: "move",
        pointerEvents: allowObjectSelection ? "none" : "auto",
      }}
      resizeHandleStyles={Object.fromEntries(
        [
          "top",
          "right",
          "bottom",
          "left",
          "topLeft",
          "topRight",
          "bottomLeft",
          "bottomRight",
        ].map((key) => [
          key,
          ["top", "right", "bottom", "left"].includes(key)
            ? { pointerEvents: "auto" }
            : {
                width: 24 / scale,
                height: 24 / scale,
                top: key.startsWith("top") ? -12 / scale : undefined,
                bottom: key.startsWith("bottom") ? -12 / scale : undefined,
                left: key.endsWith("Left") ? -12 / scale : undefined,
                right: key.endsWith("Right") ? -12 / scale : undefined,
                background: "transparent",
                pointerEvents: "auto",
              },
        ]),
      )}
      resizeHandleComponent={Object.fromEntries(
        ["topLeft", "topRight", "bottomLeft", "bottomRight"].map((key) => [
          key,
          <span
            key={key}
            aria-hidden
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%,-50%)",
              width: 9 / scale,
              height: 9 / scale,
              border: 1 / scale + "px solid #3158df",
              background: "#fff",
            }}
          />,
        ]),
      )}
      onDrag={(_, p) =>
        elements.forEach((el) =>
          preview(el, { x: el.x + p.x - x, y: el.y + p.y - y }),
        )
      }
      onDragStop={(_, p) =>
        apply(
          elements.map((el) => ({
            el,
            patch: { x: el.x + p.x - x, y: el.y + p.y - y },
          })),
        )
      }
      onResize={(_, __, ref, ___, p) => {
        const sx = parseFloat(ref.style.width) / width,
          sy = parseFloat(ref.style.height) / height;
        elements.forEach((el) =>
          preview(el, {
            x: p.x + (el.x - x) * sx,
            y: p.y + (el.y - y) * sy,
            width: el.width * sx,
            height: el.height * sy,
          }),
        );
      }}
      onResizeStop={(_, __, ref, ___, p) => {
        const sx = parseFloat(ref.style.width) / width,
          sy = parseFloat(ref.style.height) / height;
        apply(
          elements.map((el) => ({
            el,
            patch: {
              x: p.x + (el.x - x) * sx,
              y: p.y + (el.y - y) * sy,
              width: Math.max(5, el.width * sx),
              height: Math.max(5, el.height * sy),
              ...(el.fontSize
                ? {
                    fontSize: Math.max(
                      8,
                      Math.min(300, el.fontSize * Math.min(sx, sy)),
                    ),
                  }
                : {}),
            },
          })),
        );
      }}
    >
      {rotation}
      <span
        className={`group-selection-label ${allowObjectSelection ? "selection-move-handle" : ""}`}
        style={{
          fontSize: 11 / scale,
          bottom: -34 / scale,
          ...(allowObjectSelection
            ? {
                pointerEvents: "auto",
                padding: `${5 / scale}px ${8 / scale}px`,
                background: "#fff",
                border: `${1 / scale}px solid #3158df`,
                borderRadius: 4 / scale,
                cursor: "move",
                touchAction: "none",
                minHeight: 28 / scale,
                display: "flex",
                alignItems: "center",
              }
            : {}),
        }}
      >
        {allowObjectSelection
          ? `Move ${elements.length} objects`
          : `${elements.length} objects`}
      </span>
    </Rnd>
  );
}
