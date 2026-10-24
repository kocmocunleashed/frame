import type { FrameElement, Theme } from "../../shared/schema";
import { resolveColor } from "../../shared/themes";
export default function TimelineElement({
  el,
  theme,
}: {
  el: FrameElement;
  theme: Theme;
}) {
  if (!el.timeline) return null;
  const { items, arrangement } = el.timeline;
  const vertical = arrangement === "vertical";
  const ink = resolveColor(el.color, theme),
    accent = resolveColor(el.fill, theme, "accent");
  return (
    <div
      className="milestone-timeline"
      data-fit-id={el.id}
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        color: ink,
      }}
    >
      <div
        style={{
          position: "absolute",
          background: accent,
          ...(vertical
            ? { left: 11, top: 10, bottom: 10, width: 3 }
            : {
                left: "3%",
                right: "3%",
                top: arrangement === "alternating" ? "50%" : 56,
                height: 3,
              }),
        }}
      />
      {items.map((item, i) => (
        <div
          key={item.id}
          style={{
            position: "absolute",
            ...(vertical
              ? {
                  left: 0,
                  top: `${(i * 100) / items.length}%`,
                  height: `${100 / items.length}%`,
                  width: "100%",
                  paddingLeft: 38,
                }
              : {
                  left: `${(i * 100) / items.length}%`,
                  width: `${100 / items.length}%`,
                  top: arrangement === "alternating" ? (i % 2 ? "50%" : 0) : 0,
                  height: arrangement === "alternating" ? "50%" : "100%",
                  paddingRight: 20,
                }),
            boxSizing: "border-box",
          }}
        >
          <span
            style={{
              position: "absolute",
              width: 18,
              height: 18,
              borderRadius: "50%",
              background: accent,
              ...(vertical
                ? { left: 3, top: 6 }
                : {
                    left: 0,
                    top:
                      arrangement === "alternating"
                        ? i % 2
                          ? 0
                          : "calc(100% - 9px)"
                        : 48,
                  }),
            }}
          />
          <div
            style={{
              paddingTop: vertical
                ? 0
                : arrangement === "alternating" && i % 2
                  ? 24
                  : 0,
              fontSize: Math.max(12, (el.baseFontSize || 24) * 0.65),
              opacity: 1,
            }}
          >
            {item.date}
          </div>
          <div
            style={{
              fontWeight: 700,
              fontSize: el.baseFontSize || 24,
              lineHeight: 1.15,
              marginTop: !vertical && arrangement === "horizontal" ? 58 : 6,
            }}
          >
            {item.label}
          </div>
          <div
            style={{
              fontSize: Math.max(14, (el.baseFontSize || 24) * 0.75),
              lineHeight: 1.3,
              marginTop: 6,
            }}
          >
            {item.description}
          </div>
        </div>
      ))}
    </div>
  );
}
