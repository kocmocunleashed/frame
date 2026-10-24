import { useState } from "react";
import type { FrameElement } from "../../shared/schema";
import { pastedChart, pastedTable } from "../lib/spreadsheet-data";
export default function SpreadsheetPaste({
  el,
  update,
}: {
  el: FrameElement;
  update: (patch: Partial<FrameElement>) => void;
}) {
  const [value, setValue] = useState(""),
    [error, setError] = useState("");
  return (
    <details className="spreadsheet-paste">
      <summary>Paste from a spreadsheet</summary>
      <p className="hint">
        Copy cells from Excel, Sheets, or a tab-separated file. Applying
        replaces this object’s data in one undoable change.
      </p>
      <textarea
        aria-label="Spreadsheet cells"
        value={value}
        rows={5}
        placeholder={
          el.chart
            ? "Category\tValue\nExplore\t30\nBuild\t65"
            : "Name\tDescription\nExplore\tStart with a question"
        }
        onChange={(event) => {
          setValue(event.target.value);
          setError("");
        }}
      />
      {error && (
        <p role="alert" className="error-message">
          {error}
        </p>
      )}
      <button
        className="button full"
        disabled={!value.trim()}
        onClick={() => {
          try {
            update(
              el.chart
                ? {
                    chart: pastedChart(
                      value,
                      el.chart.kind,
                      el.chart.showValues,
                    ),
                  }
                : { table: pastedTable(value, el.table?.header ?? true) },
            );
            setError("");
            setValue("");
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        Apply pasted data
      </button>
    </details>
  );
}
