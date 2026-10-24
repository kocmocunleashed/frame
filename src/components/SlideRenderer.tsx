import {
  memo,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  FrameDocument,
  FrameElement,
  Slide,
  Theme,
} from "../../shared/schema";
import { RichContent } from "./RichContent";
import {
  IconElement,
  TableElement,
  ChartElement,
  DiagramElement,
  QuestionElement,
} from "./DataElements";
import VideoElement from "./VideoElement";
import TimelineElement from "./TimelineElement";
import MotionContent from "./MotionContent";
import { vectorPath } from "../../shared/creative";
import { fontFamily } from "../../shared/fonts";
import {
  resolveColor,
  resolveTheme,
  resolveFontSize,
} from "../../shared/themes";

export function elementStyle(el: FrameElement, theme: Theme): CSSProperties {
  const font =
    el.fontFamily && el.fontFamily !== "theme"
      ? el.fontFamily
      : el.role === "heading"
        ? theme.headingFont
        : theme.bodyFont;
  return {
    width: "100%",
    height: "100%",
    opacity: el.opacity,
    transform: `rotate(${el.rotation}deg)`,
    color: resolveColor(el.color, theme),
    fontFamily: fontFamily(font),
    fontSize: resolveFontSize(el, theme),
    fontWeight:
      el.fontWeight ||
      (el.role === "heading"
        ? theme.headingWeight
        : el.role === "label"
          ? 500
          : 400),
    fontStyle: el.italic ? "italic" : undefined,
    textDecoration: el.underline ? "underline" : undefined,
    textAlign: el.textAlign || "left",
    lineHeight: el.lineHeight || 1.2,
    letterSpacing: el.letterSpacing || 0,
    textTransform:
      theme.artVersion === 2 &&
      theme.artDirection === "rage" &&
      el.role === "heading"
        ? "uppercase"
        : undefined,
    textShadow:
      theme.artVersion === 2 &&
      theme.artDirection === "y2k" &&
      el.role === "heading"
        ? "0 3px 0 #637ec5, 0 6px 0 #182b75, 0 10px 18px #08154b88"
        : undefined,
    whiteSpace: "pre-wrap",
    overflowWrap: "break-word",
    borderRadius:
      theme.artDirection &&
      el.type === "shape" &&
      (el.shape === "circle" || el.shape === "ellipse")
        ? "50%"
        : (el.radius ?? (el.type === "image" ? theme.radius : 0)),
    boxShadow:
      (el.shadow ?? (el.type === "shape" && theme.shadow === "soft"))
        ? theme.artDirection === "clay"
          ? "inset 0 3px 4px rgba(255,255,255,.6), inset 0 -8px 16px rgba(85,35,0,.12), 0 12px 22px rgba(85,35,0,.18)"
          : theme.artDirection === "liquid"
            ? "inset 0 1px 0 rgba(255,255,255,.45), inset 0 -1px 0 rgba(255,255,255,.1), 0 16px 32px rgba(0,10,35,.18)"
            : "0 12px 30px rgba(0,0,0,.18)"
        : undefined,
    backdropFilter:
      el.type === "shape" && (el.material || theme.material) === "glass"
        ? "blur(14px)"
        : undefined,
  };
}
function shapePath(shape: string | undefined) {
  switch (shape) {
    case "triangle":
      return "M50 2 L98 98 L2 98 Z";
    case "polygon":
      return "M25 2 L75 2 L98 50 L75 98 L25 98 L2 50 Z";
    case "spark":
      return "M50 0 Q55 43 100 50 Q55 57 50 100 Q45 57 0 50 Q45 43 50 0 Z";
    case "star":
      return "M50 1 L62 35 L98 35 L69 57 L80 94 L50 72 L20 94 L31 57 L2 35 L38 35 Z";
    case "arrow":
      return "M2 30 H60 V3 L98 50 L60 97 V70 H2 Z";
    case "bubble":
      return "M15 3 H85 Q97 3 97 17 V65 Q97 80 82 80 H45 L20 98 V80 H15 Q3 80 3 65 V17 Q3 3 15 3 Z";
    case "blob":
      return "M49 3 C73 -4 103 22 96 49 C109 76 77 102 50 94 C25 110 -4 80 5 52 C-8 24 22 -5 49 3 Z";
    default:
      return null;
  }
}
export const ElementContent = memo(function ElementContent({
  el,
  theme,
  children,
  playing = false,
  staticMedia = false,
}: {
  el: FrameElement;
  playing?: boolean;
  staticMedia?: boolean;
  theme: Theme;
  children?: ReactNode;
}) {
  const style = elementStyle(el, theme);
  if (el.type === "timeline")
    return (
      <div style={style}>
        <TimelineElement el={el} theme={theme} />
      </div>
    );
  if (el.type === "text")
    return (
      <div style={style} className="element-text" data-text-id={el.id}>
        {children ??
          (el.richText ? (
            <div className="rich-content">
              <RichContent node={el.richText} />
            </div>
          ) : el.link ? (
            <a href={el.link} target="_blank" rel="noreferrer noopener">
              {el.text}
            </a>
          ) : (
            el.text
          ))}
      </div>
    );
  if (el.type === "icon")
    return (
      <div style={style}>
        <IconElement el={el} theme={theme} />
      </div>
    );
  if (el.type === "table")
    return (
      <div style={style}>
        <div data-fit-id={el.id} style={{ height: "100%", width: "100%" }}>
          <TableElement el={el} theme={theme} />
        </div>
      </div>
    );
  if (el.type === "chart")
    return (
      <div style={style}>
        <div data-fit-id={el.id} style={{ height: "100%", width: "100%" }}>
          <ChartElement el={el} theme={theme} />
        </div>
      </div>
    );
  if (el.type === "diagram")
    return (
      <div style={style}>
        <div data-fit-id={el.id} style={{ height: "100%", width: "100%" }}>
          <DiagramElement el={el} theme={theme} />
        </div>
      </div>
    );
  if (el.type === "question")
    return (
      <div style={style}>
        <div data-fit-id={el.id} style={{ height: "100%", width: "100%" }}>
          <QuestionElement el={el} theme={theme} />
        </div>
      </div>
    );
  if (el.type === "video")
    return (
      <div style={style}>
        <VideoElement el={el} playing={playing} staticPreview={staticMedia} />
      </div>
    );
  if (el.type === "image")
    return (
      <div
        style={{
          ...style,
          overflow: "hidden",
          border: el.strokeWidth
            ? `${el.strokeWidth}px solid ${resolveColor(el.stroke, theme)}`
            : undefined,
        }}
      >
        {el.src ? (
          <img
            src={el.src}
            alt={el.alt || ""}
            draggable={false}
            style={{
              width: "100%",
              height: "100%",
              objectFit: el.fit || "cover",
              objectPosition: `${el.crop?.x ?? 50}% ${el.crop?.y ?? 50}%`,
              transform: `scale(${el.crop?.zoom ?? 1})`,
              transformOrigin: `${el.crop?.x ?? 50}% ${el.crop?.y ?? 50}%`,
              display: "block",
            }}
          />
        ) : (
          <div className="image-placeholder">Choose an image</div>
        )}
      </div>
    );
  const fill = resolveColor(el.fill, theme, "accent"),
    stroke = resolveColor(el.stroke, theme, "foreground"),
    sw =
      el.strokeWidth ??
      (theme.artDirection === "liquid" ? 1 : theme.borderWidth);
  const path =
      el.shape === "path" && el.path
        ? vectorPath(el.path)
        : shapePath(el.shape),
    round = el.shape === "circle" || el.shape === "ellipse";
  const radius =
    el.radius ??
    (el.shape === "rounded" ? Math.max(theme.radius, 16) : theme.radius);
  return (
    <div style={style}>
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
        fillOpacity={(el.material || theme.material) === "glass" ? 0.84 : 1}
        style={{ overflow: "visible" }}
      >
        {el.gradient && (
          <defs>
            <linearGradient id={`g${el.id}`} x1="0" y1="0" x2="1" y2="1">
              {theme.artVersion === 2 && theme.artDirection === "y2k" ? (
                <>
                  <stop offset="0%" stopColor="#ffffff" />
                  <stop offset="27%" stopColor="#9bace0" />
                  <stop offset="48%" stopColor="#faffff" />
                  <stop offset="53%" stopColor="#637bb1" />
                  <stop offset="75%" stopColor="#dce6ff" />
                  <stop offset="100%" stopColor="#ffffff" />
                </>
              ) : theme.artVersion === 2 && theme.artDirection === "clay" ? (
                <>
                  <stop offset="0%" stopColor="#fff0d5" />
                  <stop offset="55%" stopColor={fill} />
                  <stop offset="100%" stopColor="#db864d" />
                </>
              ) : (
                <>
                  <stop offset="0%" stopColor={fill} />
                  <stop offset="100%" stopColor={theme.colors.secondary} />
                </>
              )}
            </linearGradient>
          </defs>
        )}
        {el.shape === "line" ? (
          <line
            x1="0"
            y1="50"
            x2="100"
            y2="50"
            stroke={fill}
            strokeWidth={sw || 3}
            vectorEffect="non-scaling-stroke"
          />
        ) : path ? (
          <path
            d={path}
            fill={el.gradient ? `url(#g${el.id})` : fill}
            stroke={stroke}
            strokeWidth={sw}
            vectorEffect="non-scaling-stroke"
          />
        ) : round ? (
          <ellipse
            cx="50"
            cy="50"
            rx="49"
            ry="49"
            fill={el.gradient ? `url(#g${el.id})` : fill}
            stroke={stroke}
            strokeWidth={sw}
            vectorEffect="non-scaling-stroke"
          />
        ) : (
          <rect
            x="0"
            y="0"
            width="100"
            height="100"
            rx={Math.min(49, (radius / el.width) * 100)}
            ry={Math.min(49, (radius / el.height) * 100)}
            fill={el.gradient ? `url(#g${el.id})` : fill}
            stroke={stroke}
            strokeWidth={sw}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
    </div>
  );
});
export function slideBackground(
  theme: Theme,
  background?: string,
): CSSProperties {
  const base = resolveColor(background, theme, "background");
  return {
    background:
      theme.background === "glow"
        ? `radial-gradient(ellipse at 85% 15%, ${theme.colors.surface} 0%, ${base} 70%)`
        : theme.background === "split"
          ? `linear-gradient(115deg, ${base} 0%, ${base} 60%, ${theme.colors.surface} 60%)`
          : theme.material === "paper"
            ? `repeating-linear-gradient(0deg, transparent 0px, transparent 3px, rgba(0,0,0,.025) 4px), ${base}`
            : base,
    color: theme.colors.foreground,
  };
}
export const SlideRenderer = memo(
  function SlideRenderer({
    doc,
    slide,
    scale = 1,
    step = Infinity,
    playing = false,
    staticMedia = false,
    className = "",
    hiddenIds,
    onActivate,
    activeIds,
    motionElapsed,
    stepStartedAt,
    children,
  }: {
    doc: Pick<FrameDocument, "width" | "height" | "themes" | "themeId">;
    slide: Pick<Slide, "id" | "elements" | "background" | "themeId">;
    scale?: number;
    step?: number;
    playing?: boolean;
    staticMedia?: boolean;
    className?: string;
    hiddenIds?: ReadonlySet<string>;
    onActivate?: (id: string) => void;
    activeIds?: ReadonlySet<string>;
    motionElapsed?: number;
    stepStartedAt?: number;
    children?: ReactNode;
  }) {
    const theme = resolveTheme(doc, slide);
    return (
      <div
        className={`slide-frame ${className}`}
        style={{ width: doc.width * scale, height: doc.height * scale }}
      >
        <div
          className="slide-stage"
          style={{
            width: doc.width,
            height: doc.height,
            transform: `scale(${scale})`,
            ...slideBackground(theme, slide.background),
          }}
        >
          {slide.elements
            .filter((e) => !e.hidden)
            .map((el) => (
              <div
                key={el.id}
                data-element-id={el.id}
                className={`slide-object-motion ${onActivate && activeIds?.has(el.id) ? "interactive-slide-object" : ""}`}
                role={
                  onActivate && activeIds?.has(el.id)
                    ? "button"
                    : el.accessibility?.label
                      ? ["shape", "icon"].includes(el.type)
                        ? "img"
                        : "group"
                      : undefined
                }
                tabIndex={onActivate && activeIds?.has(el.id) ? 0 : undefined}
                onClick={
                  onActivate && activeIds?.has(el.id)
                    ? (event) => {
                        event.stopPropagation();
                        onActivate(el.id);
                      }
                    : undefined
                }
                onKeyDown={
                  onActivate && activeIds?.has(el.id)
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.stopPropagation();
                          onActivate(el.id);
                        }
                      }
                    : undefined
                }
                aria-label={
                  el.accessibility?.label ||
                  (activeIds?.has(el.id) ? el.name : undefined)
                }
                aria-hidden={
                  onActivate && activeIds?.has(el.id)
                    ? undefined
                    : el.accessibility?.decorative
                }
                style={{
                  position: "absolute",
                  left: el.x,
                  top: el.y,
                  width: el.width,
                  height: el.height,
                  visibility:
                    hiddenIds?.has(el.id) ||
                    (el.animation && el.animation.step > step)
                      ? "hidden"
                      : undefined,
                  animation:
                    playing && !el.animation && theme.motion !== "none"
                      ? `${theme.motion === "rise" ? "frame-rise" : "frame-fade"} 280ms ease-out both`
                      : undefined,
                }}
              >
                <MotionContent
                  el={el}
                  step={step}
                  playing={playing}
                  elapsed={motionElapsed}
                  startedAt={stepStartedAt}
                >
                  <ElementContent
                    el={el}
                    theme={theme}
                    playing={playing}
                    staticMedia={staticMedia}
                  />
                </MotionContent>
              </div>
            ))}
          {children}
        </div>
      </div>
    );
  },
  (prev, next) =>
    prev.slide === next.slide &&
    prev.doc.width === next.doc.width &&
    prev.doc.height === next.doc.height &&
    prev.doc.themes === next.doc.themes &&
    prev.doc.themeId === next.doc.themeId &&
    prev.scale === next.scale &&
    prev.step === next.step &&
    prev.playing === next.playing &&
    prev.staticMedia === next.staticMedia &&
    prev.className === next.className &&
    prev.hiddenIds === next.hiddenIds &&
    prev.activeIds === next.activeIds &&
    prev.motionElapsed === next.motionElapsed &&
    prev.stepStartedAt === next.stepStartedAt &&
    prev.onActivate === next.onActivate &&
    prev.children === next.children,
);

export function AutoSlide({
  doc,
  slide,
  step,
  hiddenIds,
  playing = false,
  stepStartedAt,
}: {
  doc: Pick<FrameDocument, "width" | "height" | "themes" | "themeId">;
  slide: Pick<Slide, "id" | "elements" | "background" | "themeId">;
  step?: number;
  hiddenIds?: ReadonlySet<string>;
  playing?: boolean;
  stepStartedAt?: number;
}) {
  const [width, setWidth] = useState(320);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver((entries) =>
      setWidth(entries[0].contentRect.width),
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className="auto-slide"
      style={{
        aspectRatio: `${doc.width}/${doc.height}`,
        width: "100%",
        overflow: "hidden",
      }}
    >
      <SlideRenderer
        doc={doc}
        slide={slide}
        scale={width / doc.width}
        step={step}
        hiddenIds={hiddenIds}
        playing={playing}
        stepStartedAt={stepStartedAt}
      />
    </div>
  );
}
