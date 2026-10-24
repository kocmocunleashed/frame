import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Trash2,
  LockKeyhole,
  UnlockKeyhole,
  RotateCcw,
  Group,
  Ungroup,
  AlignHorizontalJustifyCenter,
  AlignVerticalJustifyCenter,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
} from "lucide-react";
import type {
  FrameDocument,
  FrameElement,
  Operation,
  Slide,
  Theme,
} from "../../shared/schema";
import { LAYOUTS } from "../../shared/templates";
import { resolveColor, resolveFontSize } from "../../shared/themes";
import ObjectDataEditor from "./ObjectDataEditor";
import { IconButton } from "./UI";
import { HEADING_FONTS } from "../../shared/fonts";
type Props = {
  doc: FrameDocument;
  slide: Slide;
  theme: Theme;
  selected: string[];
  execute: (op: Operation | Operation[]) => void;
  onLayout: (layout: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onImage: () => void;
  onResize: () => void;
  onFolder: () => void;
  onSplitText: () => void;
  onSelectGroup?: (ids: string[]) => void;
};
function NumberField({
  label,
  value,
  onChange,
  min = -4000,
  max = 8000,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        key={value}
        type="number"
        aria-label={label}
        defaultValue={Math.round(value * 100) / 100}
        min={min}
        max={max}
        step={step}
        onBlur={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) {
            const next = Math.max(min, Math.min(max, n));
            if (next !== value) onChange(next);
          } else e.target.value = String(value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
    </label>
  );
}
function ColorField({
  label,
  value,
  theme,
  onChange,
  fallback = "foreground",
}: {
  label: string;
  value: string | undefined;
  theme: Theme;
  onChange: (v: string) => void;
  fallback?: keyof Theme["colors"];
}) {
  const resolved = resolveColor(value, theme, fallback);
  return (
    <div className="color-control">
      <span>{label}</span>
      <div>
        <input
          type="color"
          aria-label={`Custom ${label.toLowerCase()} color`}
          value={resolved === "transparent" ? "#ffffff" : resolved}
          onChange={(e) => onChange(e.target.value)}
        />
        <select
          aria-label={`${label} color role`}
          value={
            value && value in theme.colors
              ? value
              : !value
                ? fallback
                : "custom"
          }
          onChange={(e) => {
            if (e.target.value !== "custom") onChange(e.target.value);
          }}
        >
          {Object.keys(theme.colors).map((role) => (
            <option key={role} value={role}>
              {role[0].toUpperCase() + role.slice(1)}
            </option>
          ))}
          <option value="transparent">Transparent</option>
          <option value="custom">Custom color</option>
        </select>
      </div>
    </div>
  );
}
export default function Properties({
  doc,
  slide,
  theme,
  selected,
  execute,
  onLayout,
  onDuplicate,
  onDelete,
  onImage,
  onResize,
  onFolder,
  onSplitText,
  onSelectGroup,
}: Props) {
  const elements = slide.elements.filter((e) => selected.includes(e.id)),
    el = elements.length === 1 ? elements[0] : null;
  const update = (patch: Partial<FrameElement>) =>
    execute({
      type: "element.update",
      slideId: slide.id,
      ids: selected,
      patch,
    });
  const align = (axis: "x" | "y", kind: "start" | "center" | "end") => {
    const wh = axis === "x" ? "width" : "height";
    const start =
        elements.length > 1 ? Math.min(...elements.map((e) => e[axis])) : 0,
      end =
        elements.length > 1
          ? Math.max(...elements.map((e) => e[axis] + e[wh]))
          : axis === "x"
            ? doc.width
            : doc.height;
    execute(
      elements.map((e) => ({
        type: "element.update" as const,
        slideId: slide.id,
        ids: [e.id],
        patch: {
          [axis]:
            kind === "start"
              ? start
              : kind === "end"
                ? end - e[wh]
                : (start + end - e[wh]) / 2,
        },
      })),
    );
  };
  const distribute = (axis: "x" | "y") => {
    if (elements.length < 3) return;
    const wh = axis === "x" ? "width" : "height",
      ordered = [...elements].sort((a, b) => a[axis] - b[axis]),
      start = ordered[0][axis],
      end = ordered.at(-1)![axis] + ordered.at(-1)![wh],
      gap =
        (end - start - ordered.reduce((n, e) => n + e[wh], 0)) /
        (ordered.length - 1);
    let p = start;
    execute(
      ordered.map((e) => {
        const op = {
          type: "element.update" as const,
          slideId: slide.id,
          ids: [e.id],
          patch: { [axis]: p },
        };
        p += e[wh] + gap;
        return op;
      }),
    );
  };
  const layer = (front: boolean) => {
    const ids = slide.elements.map((e) => e.id);
    execute({
      type: "element.order",
      slideId: slide.id,
      ids: front
        ? [
            ...ids.filter((id) => !selected.includes(id)),
            ...ids.filter((id) => selected.includes(id)),
          ]
        : [
            ...ids.filter((id) => selected.includes(id)),
            ...ids.filter((id) => !selected.includes(id)),
          ],
    });
  };
  if (elements.length && elements.every((e) => e.locked))
    return (
      <div className="panel-section">
        <h3>Selection locked</h3>
        <p className="hint">
          Unlock these objects to change their content, position or appearance.
        </p>
        <button
          className="button full"
          onClick={() =>
            execute({
              type: "element.update",
              slideId: slide.id,
              ids: selected,
              patch: { locked: false },
            })
          }
        >
          Unlock selection
        </button>
      </div>
    );
  if (!elements.length)
    return (
      <div className="properties">
        <div className="panel-section">
          <h3>Slide settings</h3>
          <label>
            Slide name
            <input
              key={slide.id + slide.title}
              defaultValue={slide.title}
              maxLength={200}
              onBlur={(e) => {
                if (e.target.value !== slide.title)
                  execute({
                    type: "slide.update",
                    slideId: slide.id,
                    patch: { title: e.target.value },
                  });
              }}
            />
          </label>
          <label>
            Layout
            <select
              value={slide.layout}
              onChange={(e) => onLayout(e.target.value)}
            >
              {slide.layout === "free" && (
                <option value="free" disabled>
                  Free composition
                </option>
              )}
              {LAYOUTS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <p className="hint">
            Layout changes arrange compatible text. Undo is always available.
          </p>
          <ColorField
            label="Background"
            value={slide.background}
            theme={theme}
            fallback="background"
            onChange={(background) =>
              execute({
                type: "slide.update",
                slideId: slide.id,
                patch: { background },
              })
            }
          />
        </div>
        <div className="panel-section">
          <h3>Presentation</h3>
          <button className="property-action" onClick={onResize}>
            Slide dimensions{" "}
            <span>
              {doc.width} × {doc.height}
            </span>
          </button>
          <button className="property-action" onClick={onFolder}>
            Move to a folder <span>→</span>
          </button>
        </div>
        <div className="inspector-tip">
          <span className="tip-key">↖</span>
          <h4>A little hands-on.</h4>
          <p>
            Click an object to shape it. Double-click text to edit. Hold Shift
            to select more.
          </p>
        </div>
      </div>
    );
  return (
    <div className="properties">
      {el?.groupId && (
        <div className="object-edit-scope">
          <strong>Editing one object</strong>
          <p>
            This object belongs to a group. Changes here affect only this part.
          </p>
          <div>
            {onSelectGroup && (
              <button
                className="small-action"
                onClick={() =>
                  onSelectGroup(
                    slide.elements
                      .filter(
                        (member) =>
                          member.groupId === el.groupId &&
                          !member.hidden &&
                          !member.locked,
                      )
                      .map((member) => member.id),
                  )
                }
              >
                <Group size={15} aria-hidden="true" /> Select group
              </button>
            )}
            <button
              className="small-action"
              onClick={() => update({ groupId: undefined })}
            >
              <Ungroup size={15} aria-hidden="true" /> Detach object
            </button>
          </div>
        </div>
      )}
      {el && (
        <ObjectDataEditor
          el={el}
          theme={theme}
          update={update}
          onUpload={onImage}
        />
      )}
      <div className="panel-section">
        <div className="panel-section-heading">
          <h3>
            {el
              ? el.type === "text"
                ? "Text"
                : el.type === "image"
                  ? "Image"
                  : el.type[0].toUpperCase() + el.type.slice(1)
              : `${elements.length} objects`}
          </h3>
          <div className="compact-actions">
            <IconButton
              label="Duplicate selected objects"
              onClick={onDuplicate}
            >
              <Copy size={15} />
            </IconButton>
            <IconButton label="Delete selected objects" onClick={onDelete}>
              <Trash2 size={15} />
            </IconButton>
          </div>
        </div>
        {el && (
          <label className="object-name">
            Object name
            <input
              key={el.id + el.name}
              defaultValue={el.name}
              maxLength={100}
              onBlur={(e) => {
                if (e.target.value !== el.name)
                  update({ name: e.target.value });
              }}
            />
          </label>
        )}
        {el && (
          <div className="geometry-grid">
            <NumberField
              label="X"
              value={el.x}
              onChange={(x) => update({ x })}
            />
            <NumberField
              label="Y"
              value={el.y}
              onChange={(y) => update({ y })}
            />
            <NumberField
              label="Width"
              value={el.width}
              min={5}
              onChange={(width) => update({ width })}
            />
            <NumberField
              label="Height"
              value={el.height}
              min={5}
              onChange={(height) => update({ height })}
            />
            <NumberField
              label="Rotation"
              value={el.rotation}
              min={-360}
              max={360}
              onChange={(rotation) => update({ rotation })}
            />
            <NumberField
              label="Opacity %"
              value={el.opacity * 100}
              min={0}
              max={100}
              onChange={(opacity) => update({ opacity: opacity / 100 })}
            />
          </div>
        )}
        <div className="alignment-actions">
          <IconButton label="Align left" onClick={() => align("x", "start")}>
            <AlignLeft size={17} />
          </IconButton>
          <IconButton
            label="Align horizontal centers"
            onClick={() => align("x", "center")}
          >
            <AlignHorizontalJustifyCenter size={17} />
          </IconButton>
          <IconButton label="Align right" onClick={() => align("x", "end")}>
            <AlignRight size={17} />
          </IconButton>
          <IconButton label="Align top" onClick={() => align("y", "start")}>
            <ArrowUpToLine size={17} />
          </IconButton>
          <IconButton
            label="Align vertical centers"
            onClick={() => align("y", "center")}
          >
            <AlignVerticalJustifyCenter size={17} />
          </IconButton>
          <IconButton label="Align bottom" onClick={() => align("y", "end")}>
            <ArrowDownToLine size={17} />
          </IconButton>
        </div>
        {elements.length > 1 && (
          <>
            <div className="alignment-actions">
              <IconButton
                label="Distribute horizontally"
                disabled={elements.length < 3}
                onClick={() => distribute("x")}
              >
                <AlignHorizontalDistributeCenter size={18} />
              </IconButton>
              <IconButton
                label="Distribute vertically"
                disabled={elements.length < 3}
                onClick={() => distribute("y")}
              >
                <AlignVerticalDistributeCenter size={18} />
              </IconButton>
              <button
                className="small-action"
                onClick={() => {
                  const groupId = crypto.randomUUID();
                  update({ groupId });
                }}
              >
                <Group size={16} />
                Group
              </button>
              <button
                className="small-action"
                onClick={() => update({ groupId: undefined })}
              >
                <Ungroup size={16} />
                Ungroup
              </button>
            </div>
            <button
              className="property-action"
              onClick={() => {
                const width = elements[0].width,
                  height = elements[0].height;
                update({ width, height });
              }}
            >
              Match sizes to first object
            </button>
          </>
        )}
      </div>
      {el?.type === "text" && (
        <div className="panel-section">
          <h3>Typography</h3>
          <label>
            Content
            <textarea
              aria-label="Content"
              key={el.id + el.text}
              defaultValue={el.text}
              rows={4}
              maxLength={30000}
              onBlur={(e) => {
                if (e.target.value !== el.text)
                  update({ text: e.target.value, richText: undefined });
              }}
            />
          </label>
          <label>
            Font
            <select
              value={el.fontFamily || "theme"}
              onChange={(e) =>
                update({
                  fontFamily: e.target.value as FrameElement["fontFamily"],
                })
              }
            >
              <option value="theme">Theme font</option>
              {HEADING_FONTS.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <div className="geometry-grid">
            <NumberField
              label="Font size"
              value={resolveFontSize(el, theme)}
              min={8}
              max={300}
              onChange={(fontSize) => update({ fontSize })}
            />
            <label>
              Weight
              <select
                value={
                  el.fontWeight ||
                  (el.role === "heading" ? theme.headingWeight : 400)
                }
                onChange={(e) => update({ fontWeight: Number(e.target.value) })}
              >
                {[300, 400, 500, 600, 700, 800, 900].map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>
            <NumberField
              label="Line height"
              value={el.lineHeight || 1.2}
              min={0.7}
              max={3}
              step={0.1}
              onChange={(lineHeight) => update({ lineHeight })}
            />
            <NumberField
              label="Letter spacing"
              value={el.letterSpacing || 0}
              min={-10}
              max={30}
              step={0.1}
              onChange={(letterSpacing) => update({ letterSpacing })}
            />
          </div>
          <div className="formatting-row">
            <button
              className={el.italic ? "active" : ""}
              onClick={() => update({ italic: !el.italic })}
              aria-pressed={!!el.italic}
            >
              <i>I</i>
              <span className="sr-only">Italic</span>
            </button>
            <button
              className={el.underline ? "active" : ""}
              onClick={() => update({ underline: !el.underline })}
              aria-pressed={!!el.underline}
            >
              <u>U</u>
              <span className="sr-only">Underline</span>
            </button>
            <span />
            {(["left", "center", "right"] as const).map((a, i) => {
              const Icon = [AlignLeft, AlignCenter, AlignRight][i];
              return (
                <IconButton
                  key={a}
                  label={`Text align ${a}`}
                  aria-pressed={(el.textAlign || "left") === a}
                  onClick={() => update({ textAlign: a })}
                >
                  <Icon size={17} />
                </IconButton>
              );
            })}
          </div>
          <button className="property-action" onClick={onSplitText}>
            Split text across slides <span>→</span>
          </button>
          <button
            className="property-action"
            disabled={(el.fontSize || 30) <= 18}
            onClick={() =>
              update({ fontSize: Math.max(18, (el.fontSize || 30) - 2) })
            }
          >
            Reduce text size by 2 <span>Aa</span>
          </button>
          <ColorField
            label="Text"
            value={el.color}
            theme={theme}
            onChange={(color) => update({ color })}
          />
          <label>
            Link for the whole text
            <input
              aria-label="Text link"
              key={el.link}
              defaultValue={el.link || ""}
              placeholder="https://example.com"
              onBlur={(e) => {
                if (e.target.value !== el.link)
                  update({ link: e.target.value || undefined });
              }}
            />
          </label>
          <button
            className="property-action"
            onClick={() => {
              const fontSize = el.fontSize || 30;
              const lines = (el.text || "")
                .split("\n")
                .reduce(
                  (count, line) =>
                    count +
                    Math.max(
                      1,
                      Math.ceil(line.length / (el.width / (fontSize * 0.55))),
                    ),
                  0,
                );
              update({
                height: Math.min(
                  8000,
                  Math.ceil(lines * fontSize * (el.lineHeight || 1.2) + 8),
                ),
              });
            }}
          >
            Expand box to fit text <span>↕</span>
          </button>
        </div>
      )}
      {el?.type === "shape" && (
        <div className="panel-section">
          <h3>Appearance</h3>
          <label>
            Shape
            <select
              value={el.shape || "rectangle"}
              onChange={(e) =>
                update({ shape: e.target.value as FrameElement["shape"] })
              }
            >
              {el.shape === "path" && (
                <option value="path" disabled>
                  Custom vector path
                </option>
              )}
              {[
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
              ].map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </label>
          <ColorField
            label="Fill"
            value={el.fill}
            theme={theme}
            fallback="accent"
            onChange={(fill) => update({ fill })}
          />
          <ColorField
            label="Stroke"
            value={el.stroke}
            theme={theme}
            onChange={(stroke) => update({ stroke })}
          />
          <label>
            Material
            <select
              aria-label="Shape material"
              value={el.material || "theme"}
              onChange={(e) =>
                update({
                  material:
                    e.target.value === "theme"
                      ? undefined
                      : (e.target.value as FrameElement["material"]),
                })
              }
            >
              <option value="theme">Theme material</option>
              <option value="flat">Flat</option>
              <option value="glass">Translucent glass</option>
              <option value="paper">Paper / flat fallback</option>
            </select>
          </label>
          <div className="geometry-grid">
            <NumberField
              label="Stroke width"
              value={el.strokeWidth ?? theme.borderWidth}
              min={0}
              max={20}
              onChange={(strokeWidth) => update({ strokeWidth })}
            />
            <NumberField
              label="Corner radius"
              value={el.radius ?? theme.radius}
              min={0}
              max={400}
              onChange={(radius) => update({ radius })}
            />
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={!!el.gradient}
              onChange={(e) => update({ gradient: e.target.checked })}
            />
            Gradient fill
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={!!el.shadow}
              onChange={(e) => update({ shadow: e.target.checked })}
            />
            Soft shadow
          </label>
        </div>
      )}
      {el?.type === "image" && (
        <div className="panel-section">
          <h3>Image</h3>
          <button className="button full" onClick={onImage}>
            Replace image
          </button>
          <label>
            Image fit
            <select
              value={el.fit || "cover"}
              onChange={(e) =>
                update({ fit: e.target.value as "cover" | "contain" })
              }
            >
              <option value="cover">Fill frame</option>
              <option value="contain">Fit inside frame</option>
            </select>
          </label>
          <div className="crop-controls">
            <h4>Crop &amp; focus</h4>
            {(["x", "y", "zoom"] as const).map((key) => (
              <label key={key}>
                {key === "x"
                  ? "Horizontal focus"
                  : key === "y"
                    ? "Vertical focus"
                    : "Crop zoom"}
                <input
                  type="range"
                  aria-label={
                    key === "x"
                      ? "Horizontal image focus"
                      : key === "y"
                        ? "Vertical image focus"
                        : "Image crop zoom"
                  }
                  min={key === "zoom" ? 1 : 0}
                  max={key === "zoom" ? 4 : 100}
                  step={key === "zoom" ? 0.05 : 1}
                  value={el.crop?.[key] ?? (key === "zoom" ? 1 : 50)}
                  onChange={(e) =>
                    update({
                      crop: {
                        x: 50,
                        y: 50,
                        zoom: 1,
                        ...el.crop,
                        [key]: Number(e.target.value),
                      },
                    })
                  }
                />
              </label>
            ))}
            <button
              className="property-action"
              onClick={() => update({ crop: undefined })}
            >
              Reset crop
            </button>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={!!el.aspectLocked}
              onChange={(e) => update({ aspectLocked: e.target.checked })}
            />
            Lock aspect ratio
          </label>
          <label>
            Alternative text
            <textarea
              key={el.id + el.alt}
              defaultValue={el.alt}
              rows={2}
              maxLength={1000}
              placeholder="Describe what the image communicates"
              onBlur={(e) => update({ alt: e.target.value })}
            />
          </label>
          <NumberField
            label="Corner radius"
            value={el.radius ?? theme.radius}
            min={0}
            max={400}
            onChange={(radius) => update({ radius })}
          />
          <ColorField
            label="Stroke"
            value={el.stroke}
            theme={theme}
            onChange={(stroke) => update({ stroke })}
          />
          <NumberField
            label="Stroke width"
            value={el.strokeWidth || 0}
            min={0}
            max={20}
            onChange={(strokeWidth) => update({ strokeWidth })}
          />
        </div>
      )}
      {el && ["chart", "diagram", "table", "question"].includes(el.type) && (
        <div className="panel-section">
          <h3>Visual style</h3>
          <NumberField
            label="Label size"
            value={el.fontSize || 24}
            min={8}
            max={100}
            onChange={(fontSize) => update({ fontSize })}
          />
          <ColorField
            label="Text"
            value={el.color}
            theme={theme}
            onChange={(color) => update({ color })}
          />
          <ColorField
            label="Accent"
            value={el.fill}
            theme={theme}
            fallback={el.type === "chart" ? "accent" : "surface"}
            onChange={(fill) => update({ fill })}
          />
        </div>
      )}
      <div className="panel-section">
        <h3>Arrange</h3>
        <div className="action-grid">
          <button onClick={() => layer(true)}>
            <ArrowUpToLine size={16} />
            Bring to front
          </button>
          <button onClick={() => layer(false)}>
            <ArrowDownToLine size={16} />
            Send to back
          </button>
          <button
            onClick={() => update({ locked: !elements.every((e) => e.locked) })}
          >
            {elements.every((e) => e.locked) ? (
              <UnlockKeyhole size={16} />
            ) : (
              <LockKeyhole size={16} />
            )}{" "}
            {elements.every((e) => e.locked) ? "Unlock" : "Lock"}
          </button>
          <button
            onClick={() =>
              execute({
                type: "element.reset",
                slideId: slide.id,
                ids: elements.map((e) => e.id),
              })
            }
          >
            <RotateCcw size={16} />
            Reset to theme
          </button>
        </div>
      </div>
    </div>
  );
}
