import { useRef, useState } from "react";
import { Plus, Trash2, ArrowUp, ArrowDown, Spline } from "lucide-react";
import { uid, type FrameElement } from "../../shared/schema";
import { vectorPath, type PathCommand } from "../../shared/creative";
import { IconButton, Modal } from "./UI";

export default function CreativeProperties({
  el,
  update,
}: {
  el: FrameElement;
  update: (patch: Partial<FrameElement>) => void;
}) {
  const [open, setOpen] = useState(false),
    [draft, setDraft] = useState<PathCommand[] | null>(null);
  const drag = useRef<{ index: number; x: string; y: string } | null>(null),
    latest = useRef<PathCommand[] | null>(null);
  const path = draft || el.path || [];
  function field(label: string, value: string, apply: (value: string) => void) {
    return (
      <label>
        {label}
        <input
          key={label + value}
          aria-label={label}
          defaultValue={value}
          maxLength={160}
          onBlur={(e) => {
            if (e.target.value !== value) apply(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
      </label>
    );
  }
  if (el.type === "timeline" && el.timeline) {
    const timeline = el.timeline;
    const change = (
      i: number,
      key: "date" | "label" | "description",
      value: string,
    ) =>
      update({
        timeline: {
          ...timeline,
          items: timeline.items.map((item, j) =>
            i === j
              ? {
                  ...item,
                  [key]:
                    value.slice(
                      0,
                      key === "date" ? 60 : key === "label" ? 80 : 160,
                    ) || (key === "label" ? "Milestone" : ""),
                }
              : item,
          ),
        },
      });
    const move = (i: number, offset: number) => {
      const items = [...timeline.items];
      [items[i], items[i + offset]] = [items[i + offset], items[i]];
      update({ timeline: { ...timeline, items } });
    };
    return (
      <div className="panel-section object-data">
        <h3>Timeline milestones</h3>
        <label>
          Arrangement
          <select
            aria-label="Timeline arrangement"
            value={timeline.arrangement}
            onChange={(e) =>
              update({
                timeline: {
                  ...timeline,
                  arrangement: e.target.value as typeof timeline.arrangement,
                },
              })
            }
          >
            {["horizontal", "vertical", "alternating"].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        {timeline.items.map((item, i) => (
          <div className="milestone-editor" key={item.id}>
            <div className="creative-row">
              <strong>Milestone {i + 1}</strong>
              <IconButton
                label={`Move milestone ${i + 1} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp size={15} />
              </IconButton>
              <IconButton
                label={`Move milestone ${i + 1} down`}
                disabled={i === timeline.items.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown size={15} />
              </IconButton>
              <IconButton
                label={`Delete milestone ${i + 1}`}
                disabled={timeline.items.length <= 2}
                onClick={() =>
                  update({
                    timeline: {
                      ...timeline,
                      items: timeline.items.filter((_, j) => j !== i),
                    },
                  })
                }
              >
                <Trash2 size={15} />
              </IconButton>
            </div>
            {field(`Milestone ${i + 1} date`, item.date, (v) =>
              change(i, "date", v),
            )}
            {field(`Milestone ${i + 1} label`, item.label, (v) =>
              change(i, "label", v),
            )}
            {field(`Milestone ${i + 1} description`, item.description, (v) =>
              change(i, "description", v),
            )}
          </div>
        ))}
        <button
          className="button full"
          disabled={timeline.items.length >= 8}
          onClick={() =>
            update({
              timeline: {
                ...timeline,
                items: [
                  ...timeline.items,
                  {
                    id: uid(),
                    date: "",
                    label: "New milestone",
                    description: "",
                  },
                ],
              },
            })
          }
        >
          <Plus size={16} />
          Add milestone
        </button>
      </div>
    );
  }
  if (el.shape !== "path" || !el.path) return null;
  function setCoordinate(index: number, key: string, value: number) {
    if (!Number.isFinite(value)) return;
    update({
      path: el.path!.map((c, i) =>
        i === index ? { ...c, [key]: Math.max(-100, Math.min(200, value)) } : c,
      ),
    });
  }
  return (
    <div className="panel-section">
      <h3>Vector illustration</h3>
      <p className="hint">
        Editable points and curves. Use Objects mode to select each part of an
        illustration.
      </p>
      <button className="button full" onClick={() => setOpen(true)}>
        <Spline size={16} />
        Edit vector points
      </button>
      {open && (
        <Modal
          title="Edit vector points"
          wide
          onClose={() => {
            setDraft(null);
            setOpen(false);
          }}
        >
          <div className="vector-editor">
            <svg
              viewBox="0 0 100 100"
              className="vector-pad"
              aria-label="Vector point canvas"
              onPointerMove={(e) => {
                if (!drag.current) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const { index, x, y } = drag.current;
                const next = path.map((c, i) =>
                  i === index
                    ? {
                        ...c,
                        [x]: Math.max(
                          -100,
                          Math.min(
                            200,
                            ((e.clientX - rect.left) / rect.width) * 100,
                          ),
                        ),
                        [y]: Math.max(
                          -100,
                          Math.min(
                            200,
                            ((e.clientY - rect.top) / rect.height) * 100,
                          ),
                        ),
                      }
                    : c,
                );
                latest.current = next;
                setDraft(next);
              }}
              onPointerUp={() => {
                if (latest.current) update({ path: latest.current });
                drag.current = null;
                latest.current = null;
                setDraft(null);
              }}
              onPointerCancel={() => {
                drag.current = null;
                latest.current = null;
                setDraft(null);
              }}
            >
              <path
                d={vectorPath(path)}
                fill="#dfff65"
                stroke="#171717"
                strokeWidth="1"
              />
              {path.flatMap((c, i) =>
                c.op === "Z"
                  ? []
                  : [
                      ...[{ x: "x", y: "y" }],
                      ...(c.op === "Q" || c.op === "C"
                        ? [{ x: "x1", y: "y1" }]
                        : []),
                      ...(c.op === "C" ? [{ x: "x2", y: "y2" }] : []),
                    ].map(({ x, y }) => (
                      <circle
                        key={`${i}-${x}`}
                        cx={(c as unknown as Record<string, number>)[x]}
                        cy={(c as unknown as Record<string, number>)[y]}
                        r="2.3"
                        fill={x === "x" ? "#171717" : "#6337ff"}
                        stroke="white"
                        strokeWidth=".6"
                        onPointerDown={(e) => {
                          e.currentTarget.setPointerCapture(e.pointerId);
                          drag.current = { index: i, x, y };
                          latest.current = path;
                        }}
                      />
                    )),
              )}
            </svg>
            <div className="vector-command-list">
              {el.path.map((command, i) => (
                <fieldset key={i}>
                  <legend>
                    Point {i + 1} · {command.op}
                  </legend>
                  <div className="creative-row">
                    {Object.entries(command)
                      .filter(([key]) => key !== "op")
                      .map(([key, value]) => (
                        <label key={key}>
                          {key}
                          <input
                            aria-label={`Point ${i + 1} ${key}`}
                            type="number"
                            min={-100}
                            max={200}
                            key={String(value)}
                            defaultValue={value}
                            onBlur={(e) =>
                              setCoordinate(i, key, Number(e.target.value))
                            }
                          />
                        </label>
                      ))}
                    <IconButton
                      label={`Delete point ${i + 1}`}
                      disabled={i === 0 || el.path!.length <= 2}
                      onClick={() =>
                        update({ path: el.path!.filter((_, j) => j !== i) })
                      }
                    >
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                </fieldset>
              ))}
              <div className="creative-row">
                <button
                  className="button"
                  onClick={() =>
                    update({ path: [...el.path!, { op: "L", x: 50, y: 50 }] })
                  }
                  disabled={el.path.length >= 256}
                >
                  Add point
                </button>
                <button
                  className="button"
                  onClick={() =>
                    update({
                      path: [
                        ...el.path!,
                        { op: "Q", x1: 75, y1: 25, x: 50, y: 75 },
                      ],
                    })
                  }
                  disabled={el.path.length >= 256}
                >
                  Add curve
                </button>
              </div>
            </div>
          </div>
          <button className="button primary" onClick={() => setOpen(false)}>
            Done editing
          </button>
        </Modal>
      )}
    </div>
  );
}
