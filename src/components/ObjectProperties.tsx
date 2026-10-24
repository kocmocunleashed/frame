import { useEffect, useState } from "react";
import SpreadsheetPaste from "./SpreadsheetPaste";
import CreativeProperties from "./CreativeProperties";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import type { FrameElement, Theme } from "../../shared/schema";
import { resolveFontSize } from "../../shared/themes";
import { ICON_NAMES } from "../../shared/content";
import { IconButton } from "./UI";
export default function ObjectProperties({
  el,
  theme,
  update,
  onUpload,
}: {
  el: FrameElement;
  theme: Theme;
  update: (p: Partial<FrameElement>) => void;
  onUpload: () => void;
}) {
  const [error, setError] = useState("");
  const chartVersion = JSON.stringify(el.chart);
  useEffect(() => setError(""), [chartVersion]);
  const valueInput = (
    label: string,
    value: string,
    apply: (v: string) => void,
  ) => (
    <input
      key={label + value}
      aria-label={label}
      defaultValue={value}
      maxLength={
        el.type === "chart"
          ? 80
          : el.type === "diagram"
            ? 200
            : el.type === "question"
              ? 500
              : 1000
      }
      onBlur={(e) => {
        if (e.target.value !== value) apply(e.target.value);
      }}
    />
  );
  if (el.type === "timeline" || el.shape === "path")
    return <CreativeProperties el={el} update={update} />;
  if (el.type === "table" && el.table) {
    const t = el.table;
    const cell = (row: number, col: number, value: string) =>
      update({
        table: {
          ...t,
          rows: t.rows.map((r, i) =>
            i === row ? r.map((c, j) => (j === col ? value : c)) : r,
          ),
        },
      });
    return (
      <div className="panel-section object-data">
        <h3>Table content</h3>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={t.header}
            onChange={(e) =>
              update({ table: { ...t, header: e.target.checked } })
            }
          />
          First row is a header
        </label>
        <div
          className="table-data-grid"
          style={{
            gridTemplateColumns: `28px repeat(${t.rows[0].length}, minmax(90px,1fr)) 34px`,
          }}
        >
          <span />
          {t.rows[0].map((_, j) => (
            <div className="table-column-head" key={j}>
              <span>{String.fromCharCode(65 + j)}</span>
              <IconButton
                label={`Remove column ${j + 1}`}
                disabled={t.rows[0].length <= 1}
                onClick={() =>
                  update({
                    table: {
                      ...t,
                      rows: t.rows.map((row) =>
                        row.filter((_, index) => index !== j),
                      ),
                    },
                  })
                }
              >
                <Trash2 size={12} />
              </IconButton>
            </div>
          ))}
          <span />
          {t.rows.map((row, i) => (
            <div className="table-grid-row" key={i}>
              <span className="table-row-number">{i + 1}</span>
              {row.map((value, j) =>
                valueInput(`Row ${i + 1}, column ${j + 1}`, value, (v) =>
                  cell(i, j, v),
                ),
              )}
              <IconButton
                label={`Remove row ${i + 1}`}
                disabled={t.rows.length <= 1}
                onClick={() =>
                  update({
                    table: {
                      ...t,
                      rows: t.rows.filter((_, index) => index !== i),
                    },
                  })
                }
              >
                <Trash2 size={14} />
              </IconButton>
            </div>
          ))}
        </div>
        <div className="data-actions">
          <button
            disabled={t.rows.length >= 30}
            onClick={() =>
              update({
                table: { ...t, rows: [...t.rows, t.rows[0].map(() => "")] },
              })
            }
          >
            <Plus size={14} />
            Row
          </button>
          <button
            disabled={t.rows[0].length >= 12}
            onClick={() =>
              update({ table: { ...t, rows: t.rows.map((r) => [...r, ""]) } })
            }
          >
            <Plus size={14} />
            Column
          </button>
          <button
            disabled={t.rows.length <= 1}
            onClick={() =>
              update({ table: { ...t, rows: t.rows.slice(0, -1) } })
            }
          >
            Remove last row
          </button>
          <button
            disabled={t.rows[0].length <= 1}
            onClick={() =>
              update({
                table: { ...t, rows: t.rows.map((r) => r.slice(0, -1)) },
              })
            }
          >
            Remove last column
          </button>
        </div>
        <SpreadsheetPaste el={el} update={update} />
        <label>
          Text size
          <input
            type="number"
            aria-label="Table text size"
            key={el.fontSize}
            defaultValue={resolveFontSize(el, theme)}
            min={8}
            max={100}
            onBlur={(e) =>
              update({
                fontSize: Math.max(
                  8,
                  Math.min(100, Number(e.target.value) || 26),
                ),
              })
            }
          />
        </label>
      </div>
    );
  }
  if (el.type === "chart" && el.chart) {
    const chart = el.chart;
    return (
      <div className="panel-section object-data">
        <h3>Chart data</h3>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
        <label>
          Chart type
          <select
            aria-label="Chart type"
            value={chart.kind}
            onChange={(e) => {
              if (
                e.target.value === "donut" &&
                chart.data.some((point) => point.value < 0)
              ) {
                setError(
                  "Donut charts need non-negative values. Change the negative values before switching.",
                );
                return;
              }
              setError("");
              update({
                chart: { ...chart, kind: e.target.value as typeof chart.kind },
              });
            }}
          >
            <option value="bar">Bar chart</option>
            <option value="line">Line chart</option>
            <option value="donut">Donut chart</option>
          </select>
        </label>
        {chart.data.some(
          (d) =>
            d.label.length * resolveFontSize(el, theme) * 0.55 >
            (el.width - 100) / chart.data.length,
        ) && (
          <p className="error-message" role="alert">
            Some labels may overlap. Shorten the labels, reduce label size, or
            enlarge the chart.
          </p>
        )}
        <p className="hint">
          Edit labels and values below. Check your data before presenting.
        </p>
        <div className="chart-data-head">
          <span>Label</span>
          <span>Value</span>
          <span />
        </div>
        {chart.data.map((d, i) => (
          <div className="chart-data-row" key={i}>
            {valueInput("Data label " + (i + 1), d.label, (label) => {
              if (!label.trim()) {
                setError("Each data point needs a label.");
                return;
              }
              setError("");
              update({
                chart: {
                  ...chart,
                  data: chart.data.map((x, j) =>
                    i === j ? { ...x, label } : x,
                  ),
                },
              });
            })}
            <input
              type="number"
              aria-label={"Data value " + (i + 1)}
              key={d.value}
              defaultValue={d.value}
              min={chart.kind === "donut" ? 0 : -1e9}
              max={1e9}
              onBlur={(e) => {
                const raw = e.target.value,
                  value = Number(raw);
                if (
                  !raw.trim() ||
                  !Number.isFinite(value) ||
                  Math.abs(value) > 1e9 ||
                  (chart.kind === "donut" && value < 0)
                ) {
                  setError(
                    chart.kind === "donut"
                      ? "Enter a value between zero and one billion."
                      : "Enter a numeric value between minus one billion and one billion.",
                  );
                  return;
                }
                setError("");
                if (value !== d.value)
                  update({
                    chart: {
                      ...chart,
                      data: chart.data.map((x, j) =>
                        i === j ? { ...x, value } : x,
                      ),
                    },
                  });
              }}
            />
            <IconButton
              label={"Remove data point " + (i + 1)}
              disabled={chart.data.length <= 1}
              onClick={() =>
                update({
                  chart: {
                    ...chart,
                    data: chart.data.filter((_, j) => j !== i),
                  },
                })
              }
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        ))}
        <button
          className="button full"
          disabled={chart.data.length >= 12}
          onClick={() =>
            update({
              chart: {
                ...chart,
                data: [...chart.data, { label: "New category", value: 50 }],
              },
            })
          }
        >
          <Plus size={15} />
          Add data point
        </button>
        <SpreadsheetPaste el={el} update={update} />
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={chart.showValues}
            onChange={(e) =>
              update({ chart: { ...chart, showValues: e.target.checked } })
            }
          />
          Show values
        </label>
      </div>
    );
  }
  if (el.type === "diagram" && el.diagram) {
    const diagram = el.diagram;
    return (
      <div className="panel-section object-data">
        <h3>Diagram</h3>
        <label>
          Arrangement
          <select
            aria-label="Diagram arrangement"
            value={diagram.layout}
            onChange={(e) =>
              update({
                diagram: {
                  ...diagram,
                  layout: e.target.value as typeof diagram.layout,
                },
              })
            }
          >
            <option value="process">Process</option>
            <option value="cycle">Cycle</option>
            <option value="hierarchy">Hierarchy</option>
          </select>
        </label>
        {diagram.nodes.map((n, i) => (
          <div className="diagram-data-row" key={n.id}>
            <span className="diagram-node-number">{i + 1}</span>
            {valueInput("Node " + (i + 1), n.label, (label) =>
              update({
                diagram: {
                  ...diagram,
                  nodes: diagram.nodes.map((x, j) =>
                    i === j ? { ...x, label } : x,
                  ),
                },
              }),
            )}
            <IconButton
              label={`Move node ${i + 1} up`}
              disabled={i === 0}
              onClick={() => {
                const nodes = [...diagram.nodes];
                [nodes[i - 1], nodes[i]] = [nodes[i], nodes[i - 1]];
                update({ diagram: { ...diagram, nodes } });
              }}
            >
              <ArrowUp size={14} />
            </IconButton>
            <IconButton
              label={`Move node ${i + 1} down`}
              disabled={i === diagram.nodes.length - 1}
              onClick={() => {
                const nodes = [...diagram.nodes];
                [nodes[i + 1], nodes[i]] = [nodes[i], nodes[i + 1]];
                update({ diagram: { ...diagram, nodes } });
              }}
            >
              <ArrowDown size={14} />
            </IconButton>
            <IconButton
              label={"Remove node " + (i + 1)}
              disabled={diagram.nodes.length <= 2}
              onClick={() =>
                update({
                  diagram: {
                    ...diagram,
                    nodes: diagram.nodes.filter((_, j) => j !== i),
                  },
                })
              }
            >
              <Trash2 size={14} />
            </IconButton>
          </div>
        ))}
        <button
          className="button full"
          disabled={diagram.nodes.length >= 8}
          onClick={() =>
            update({
              diagram: {
                ...diagram,
                nodes: [
                  ...diagram.nodes,
                  { id: crypto.randomUUID(), label: "New step" },
                ],
              },
            })
          }
        >
          <Plus size={15} />
          Add a node
        </button>
        <p className="hint">
          Hierarchy uses the first node as the parent. Process and cycle follow
          the order above.
        </p>
      </div>
    );
  }
  if (el.type === "icon")
    return (
      <div className="panel-section object-data">
        <h3>Icon</h3>
        <label>
          Symbol
          <select
            aria-label="Icon symbol"
            value={el.icon || "sparkles"}
            onChange={(e) =>
              update({ icon: e.target.value as FrameElement["icon"] })
            }
          >
            {ICON_NAMES.map((name) => (
              <option key={name} value={name}>
                {name.replaceAll("-", " ")}
              </option>
            ))}
          </select>
        </label>
        <label>
          Accessible description
          <input
            aria-label="Icon description"
            key={el.accessibility?.label}
            defaultValue={el.accessibility?.label || ""}
            onBlur={(e) =>
              update({
                accessibility: { ...el.accessibility, label: e.target.value },
              })
            }
          />
        </label>
        <label>
          Color
          <input
            type="color"
            aria-label="Icon color"
            value={el.color?.startsWith("#") ? el.color : theme.colors.accent}
            onChange={(e) => update({ color: e.target.value })}
          />
        </label>
      </div>
    );
  if (el.type === "video")
    return (
      <div className="panel-section object-data">
        <h3>Video</h3>
        <button className="button full" onClick={onUpload}>
          Upload or replace video
        </button>
        <label>
          Direct video URL
          <input
            type="url"
            aria-label="Video URL"
            key={el.src}
            defaultValue={el.src || ""}
            placeholder="https://example.com/video.mp4"
            onBlur={(e) => {
              if (e.target.value !== el.src)
                update({ src: e.target.value || undefined });
            }}
          />
        </label>
        <p className="hint">
          Use a direct MP4 or WebM file, up to 50 MB. Playback support depends
          on the video codec. Video controls appear during presentation.
        </p>
        {(["autoplay", "loop", "muted"] as const).map((key) => (
          <label className="checkbox-label" key={key}>
            <input
              type="checkbox"
              checked={el.media?.[key] ?? key === "muted"}
              onChange={(e) =>
                update({
                  media: {
                    autoplay: false,
                    loop: false,
                    muted: true,
                    ...el.media,
                    [key]: e.target.checked,
                  },
                })
              }
            />
            {key === "autoplay"
              ? "Play automatically"
              : key === "loop"
                ? "Loop video"
                : "Mute audio"}
          </label>
        ))}
      </div>
    );
  if (el.type === "question" && el.question) {
    const q = el.question;
    return (
      <div className="panel-section object-data">
        <h3>Audience question</h3>
        <label>
          Question type
          <select
            aria-label="Question type"
            value={q.kind}
            onChange={(e) => {
              const kind = e.target.value as typeof q.kind;
              update({
                question: {
                  ...q,
                  kind,
                  options:
                    kind === "true-false" ? ["True", "False"] : q.options,
                  correctIndex:
                    kind === "poll" ||
                    (kind === "true-false" && (q.correctIndex ?? 0) > 1)
                      ? undefined
                      : q.correctIndex,
                },
              });
            }}
          >
            <option value="multiple-choice">Multiple choice</option>
            <option value="poll">Poll</option>
            <option value="true-false">True or false</option>
          </select>
        </label>
        <label>
          Prompt
          <textarea
            aria-label="Question prompt"
            key={q.prompt}
            defaultValue={q.prompt}
            maxLength={2000}
            onBlur={(e) => {
              if (e.target.value !== q.prompt)
                update({ question: { ...q, prompt: e.target.value } });
            }}
          />
        </label>
        {q.options.map((o, i) => (
          <label key={i}>
            Option {i + 1}
            {valueInput("Answer option " + (i + 1), o, (value) =>
              update({
                question: {
                  ...q,
                  options: q.options.map((s, j) => (i === j ? value : s)),
                },
              }),
            )}
          </label>
        ))}
        {q.kind !== "true-false" && (
          <div className="data-actions">
            <button
              disabled={q.options.length >= 8}
              onClick={() =>
                update({
                  question: { ...q, options: [...q.options, "Another answer"] },
                })
              }
            >
              <Plus size={14} />
              Option
            </button>
            <button
              disabled={q.options.length <= 2}
              onClick={() =>
                update({
                  question: {
                    ...q,
                    options: q.options.slice(0, -1),
                    correctIndex:
                      q.correctIndex === q.options.length - 1
                        ? undefined
                        : q.correctIndex,
                  },
                })
              }
            >
              Remove last option
            </button>
          </div>
        )}
        {q.kind !== "poll" && (
          <label>
            Correct answer
            <select
              aria-label="Correct answer"
              value={q.correctIndex ?? ""}
              onChange={(e) =>
                update({
                  question: {
                    ...q,
                    correctIndex:
                      e.target.value === ""
                        ? undefined
                        : Number(e.target.value),
                  },
                })
              }
            >
              <option value="">No correct answer</option>
              {q.options.map((o, i) => (
                <option key={i} value={i}>
                  {o}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Explanation
          <textarea
            aria-label="Answer explanation"
            key={q.explanation}
            defaultValue={q.explanation || ""}
            maxLength={3000}
            onBlur={(e) =>
              update({ question: { ...q, explanation: e.target.value } })
            }
          />
        </label>
        <p className="hint">
          Correct answers and explanations stay private until revealed during
          rehearsal or a live session.
        </p>
      </div>
    );
  }
  return null;
}
