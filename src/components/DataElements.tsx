import {
  Sparkles,
  Lightbulb,
  Target,
  Heart,
  Star,
  Check,
  ArrowRight,
  Globe,
  Users,
  Rocket,
  Leaf,
  BookOpen,
  Shield,
  ChartColumn,
  MessageCircle,
  Flag,
} from "lucide-react";
import type { FrameElement, Theme } from "../../shared/schema";
import { resolveColor, resolveFontSize } from "../../shared/themes";
export const ICON_COMPONENTS = {
  sparkles: Sparkles,
  lightbulb: Lightbulb,
  target: Target,
  heart: Heart,
  star: Star,
  check: Check,
  "arrow-right": ArrowRight,
  globe: Globe,
  users: Users,
  rocket: Rocket,
  leaf: Leaf,
  book: BookOpen,
  shield: Shield,
  chart: ChartColumn,
  message: MessageCircle,
  flag: Flag,
};
export function IconElement({ el, theme }: { el: FrameElement; theme: Theme }) {
  const Icon = ICON_COMPONENTS[el.icon || "sparkles"];
  return (
    <Icon
      width="100%"
      height="100%"
      strokeWidth={el.strokeWidth || 1.5}
      color={resolveColor(el.color, theme, "accent")}
      aria-label={el.accessibility?.label || el.icon}
      role="img"
    />
  );
}
export function TableElement({
  el,
  theme,
}: {
  el: FrameElement;
  theme: Theme;
}) {
  if (!el.table) return null;
  const { rows, header } = el.table;
  return (
    <table
      className="slide-table"
      aria-label={el.accessibility?.label || el.name}
      style={{
        width: "100%",
        height: "100%",
        tableLayout: "fixed",
        borderCollapse: "collapse",
        fontSize: resolveFontSize(el, theme),
        color: resolveColor(el.color, theme),
      }}
    >
      <tbody>
        {rows.map((row, i) => (
          <tr
            key={i}
            style={{
              background:
                i === 0 && header
                  ? theme.colors.foreground
                  : i % 2
                    ? resolveColor(el.fill, theme, "surface")
                    : theme.colors.background,
              color: i === 0 && header ? theme.colors.background : undefined,
            }}
          >
            {row.map((cell, j) =>
              i === 0 && header ? (
                <th
                  scope="col"
                  key={j}
                  style={{
                    padding: `${Math.round((theme.spacing * 12) / 56)}px ${Math.round((theme.spacing * 18) / 56)}px`,
                    textAlign: "left",
                    border: `1px solid ${theme.colors.muted}`,
                  }}
                >
                  {cell}
                </th>
              ) : (
                <td
                  key={j}
                  style={{
                    padding: `${Math.round((theme.spacing * 12) / 56)}px ${Math.round((theme.spacing * 18) / 56)}px`,
                    border: `1px solid ${theme.colors.muted}`,
                    overflowWrap: "anywhere",
                  }}
                >
                  {cell}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
export function ChartElement({
  el,
  theme,
}: {
  el: FrameElement;
  theme: Theme;
}) {
  if (!el.chart) return null;
  const { data, kind, showValues } = el.chart,
    w = el.width,
    h = el.height,
    font = resolveFontSize(el, theme),
    pad = font * 2.6,
    plotW = w - pad * 1.6,
    plotH = h - pad * 2,
    min = Math.min(0, ...data.map((d) => d.value)),
    max = Math.max(1, ...data.map((d) => d.value)),
    y = (v: number) => h - pad - ((v - min) / (max - min)) * plotH,
    zero = y(0),
    colors = [
      resolveColor(el.fill, theme, "accent"),
      theme.colors.secondary,
      theme.colors.foreground,
      theme.colors.muted,
    ];
  const total = data.reduce((n, d) => n + Math.max(0, d.value), 0) || 1;
  let offset = 0;
  return (
    <div style={{ width: "100%", height: "100%" }}>
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={
          el.accessibility?.label ||
          `${kind} chart: ${data.map((d) => `${d.label} ${d.value}`).join(", ")}`
        }
        style={{
          display: "block",
          overflow: "visible",
          color: resolveColor(el.color, theme),
          fontFamily:
            theme.bodyFont === "DM Sans"
              ? "'DM Sans Variable',sans-serif"
              : theme.bodyFont,
          fontSize: font,
        }}
      >
        {kind === "donut" ? (
          <>
            {data.map((d, i) => {
              const portion = Math.max(0, d.value) / total;
              const cx = Math.min(w * 0.29, h * 0.5),
                cy = h / 2,
                r = Math.min(w * 0.21, h * 0.35),
                dash = portion * 2 * Math.PI * r;
              const circle = (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill="none"
                  stroke={colors[i % colors.length]}
                  strokeWidth={r * 0.35}
                  strokeDasharray={`${dash} ${2 * Math.PI * r - dash}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${cx} ${cy})`}
                />
              );
              offset += dash;
              return circle;
            })}
            {data.map((d, i) => (
              <g key={i}>
                <rect
                  x={w * 0.57}
                  y={h / 2 - data.length * font * 0.9 + i * font * 1.8}
                  width={font * 0.6}
                  height={font * 0.6}
                  fill={colors[i % colors.length]}
                />
                <text
                  x={w * 0.57 + font}
                  y={
                    h / 2 -
                    data.length * font * 0.9 +
                    i * font * 1.8 +
                    font * 0.6
                  }
                  fill="currentColor"
                >
                  {d.label}
                  {showValues ? ` · ${d.value}` : ""}
                </text>
              </g>
            ))}
          </>
        ) : (
          <>
            <line
              x1={pad}
              x2={w - pad * 0.3}
              y1={zero}
              y2={zero}
              stroke={theme.colors.muted}
            />
            {[min, (min + max) / 2, max].map((v, i) => (
              <g key={i}>
                <line
                  x1={pad}
                  x2={w - pad * 0.3}
                  y1={y(v)}
                  y2={y(v)}
                  stroke={theme.colors.muted}
                  strokeOpacity={0.25}
                />
                <text
                  x={pad - font * 0.5}
                  y={y(v) + font * 0.3}
                  textAnchor="end"
                  fill="currentColor"
                  fontSize={font * 0.75}
                >
                  {Intl.NumberFormat("en", { notation: "compact" }).format(v)}
                </text>
              </g>
            ))}
            {kind === "line" && (
              <polyline
                points={data
                  .map(
                    (d, i) =>
                      `${pad + ((i + 0.5) / data.length) * plotW},${y(d.value)}`,
                  )
                  .join(" ")}
                fill="none"
                stroke={colors[0]}
                strokeWidth={Math.max(3, font * 0.15)}
              />
            )}{" "}
            {data.map((d, i) => {
              const x = pad + ((i + 0.5) / data.length) * plotW,
                bw = (plotW / data.length) * 0.58;
              return (
                <g key={i}>
                  {kind === "bar" ? (
                    <rect
                      x={x - bw / 2}
                      y={Math.min(zero, y(d.value))}
                      width={bw}
                      height={Math.max(1, Math.abs(zero - y(d.value)))}
                      fill={colors[0]}
                      rx={Math.min(theme.radius, 8)}
                    />
                  ) : (
                    <circle
                      cx={x}
                      cy={y(d.value)}
                      r={font * 0.22}
                      fill={colors[0]}
                    />
                  )}
                  <text
                    x={x}
                    y={h - pad * 0.35}
                    textAnchor="middle"
                    fill="currentColor"
                    fontSize={font * 0.8}
                  >
                    {d.label}
                  </text>
                  {showValues && (
                    <text
                      x={x}
                      y={y(d.value) + (d.value >= 0 ? -font * 0.5 : font)}
                      textAnchor="middle"
                      fill="currentColor"
                      fontSize={font * 0.85}
                    >
                      {Intl.NumberFormat("en", { notation: "compact" }).format(
                        d.value,
                      )}
                    </text>
                  )}
                </g>
              );
            })}
          </>
        )}
      </svg>
    </div>
  );
}
export function DiagramElement({
  el,
  theme,
}: {
  el: FrameElement;
  theme: Theme;
}) {
  if (!el.diagram) return null;
  const { nodes, layout } = el.diagram,
    w = el.width,
    h = el.height,
    font = resolveFontSize(el, theme),
    n = nodes.length,
    bw =
      layout === "process"
        ? Math.min(220, (w - ((n - 1) * 34 * theme.spacing) / 56) / n)
        : Math.min(220, w * 0.27),
    bh = Math.min(100, h * 0.26);
  const positions = nodes.map((_, i) =>
    layout === "process"
      ? { x: bw / 2 + (i * (w - bw)) / (n - 1), y: h / 2 }
      : layout === "cycle"
        ? {
            x:
              w / 2 +
              Math.cos(-Math.PI / 2 + (i / n) * 2 * Math.PI) *
                (w / 2 - bw * 0.65),
            y:
              h / 2 +
              Math.sin(-Math.PI / 2 + (i / n) * 2 * Math.PI) *
                (h / 2 - bh * 0.65),
          }
        : i === 0
          ? { x: w / 2, y: bh * 0.7 }
          : {
              x: bw / 2 + ((i - 1) * (w - bw)) / Math.max(1, n - 2),
              y: h - bh * 0.7,
            },
  );
  const marker = `arrow-${el.id}`;
  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label={
        el.accessibility?.label ||
        `${layout}: ${nodes.map((n) => n.label).join(" to ")}`
      }
      style={{
        display: "block",
        overflow: "visible",
        fontFamily:
          theme.bodyFont === "DM Sans"
            ? "'DM Sans Variable',sans-serif"
            : theme.bodyFont,
        fontSize: font,
      }}
    >
      <defs>
        <marker
          id={marker}
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={theme.colors.muted} />
        </marker>
      </defs>
      {positions.slice(1).map((p, i) => {
        const from = layout === "hierarchy" ? positions[0] : positions[i];
        return (
          <line
            key={i}
            x1={from.x + (layout === "process" ? bw / 2 : 0)}
            y1={from.y + (layout === "hierarchy" ? bh / 2 : 0)}
            x2={p.x - (layout === "process" ? bw / 2 + 5 : 0)}
            y2={p.y - (layout === "hierarchy" ? bh / 2 + 5 : 0)}
            stroke={theme.colors.muted}
            strokeWidth={2}
            markerEnd={`url(#${marker})`}
          />
        );
      })}
      {layout === "cycle" && (
        <line
          x1={positions.at(-1)!.x}
          y1={positions.at(-1)!.y}
          x2={positions[0].x}
          y2={positions[0].y}
          stroke={theme.colors.muted}
          strokeWidth={2}
          markerEnd={`url(#${marker})`}
        />
      )}{" "}
      {nodes.map((node, i) => (
        <g key={node.id}>
          <rect
            x={positions[i].x - bw / 2}
            y={positions[i].y - bh / 2}
            width={bw}
            height={bh}
            rx={theme.radius}
            fill={resolveColor(el.fill, theme, "surface")}
            stroke={theme.colors.muted}
            strokeWidth={theme.borderWidth || 1}
          />
          <foreignObject
            x={positions[i].x - bw / 2 + 12}
            y={positions[i].y - bh / 2 + 8}
            width={bw - 24}
            height={bh - 16}
          >
            <div
              style={{
                color: resolveColor(el.color, theme),
                height: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                overflowWrap: "anywhere",
                fontSize: font,
              }}
            >
              {node.label}
            </div>
          </foreignObject>
        </g>
      ))}
    </svg>
  );
}
export function QuestionElement({
  el,
  theme,
}: {
  el: FrameElement;
  theme: Theme;
}) {
  if (!el.question) return null;
  const q = el.question;
  return (
    <div
      className="slide-question"
      style={{
        height: "100%",
        color: resolveColor(el.color, theme),
        fontSize: resolveFontSize(el, theme),
      }}
    >
      <strong
        style={{
          fontSize: "1.35em",
          fontWeight: theme.headingWeight,
          display: "block",
          marginBottom: 25,
        }}
      >
        {q.prompt}
      </strong>
      <ol
        style={{
          listStyle: "upper-alpha",
          display: "grid",
          gridTemplateColumns: q.options.length > 3 ? "1fr 1fr" : "1fr",
          gap: 14,
          paddingLeft: 34,
        }}
      >
        {q.options.map((o, i) => (
          <li
            key={i}
            style={{
              padding: "14px 18px",
              border: `1px solid ${theme.colors.muted}`,
              background: resolveColor(el.fill, theme, "surface"),
              borderRadius: theme.radius,
            }}
          >
            {o}
          </li>
        ))}
      </ol>
    </div>
  );
}
