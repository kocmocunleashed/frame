import { chartSchema, tableSchema } from "../../shared/content";
export function spreadsheetRows(value: string) {
  if (value.length > 100000)
    throw new Error("Paste up to 100,000 characters at a time.");
  const text = value.replaceAll("\r", "").replace(/\n+$/, "");
  if (!text.trim())
    throw new Error("Paste rows copied from a spreadsheet first.");
  const rows = text.split("\n").map((row) => row.split("\t"));
  if (rows.some((row) => row.some((cell) => cell.length > 1000)))
    throw new Error("Keep each cell under 1,000 characters.");
  return rows;
}
export function pastedTable(value: string, header: boolean) {
  const result = tableSchema.safeParse({
    rows: spreadsheetRows(value),
    header,
  });
  if (!result.success)
    throw new Error(
      "Use a rectangular table with up to 30 rows and 12 columns. Every row needs the same number of cells.",
    );
  return result.data;
}
export function pastedChart(
  value: string,
  kind: "bar" | "line" | "donut",
  showValues: boolean,
) {
  let rows = spreadsheetRows(value);
  if (rows[0].length === 2 && /^(value|amount|count)$/i.test(rows[0][1].trim()))
    rows = rows.slice(1);
  if (!rows.length || rows.length > 12 || rows.some((row) => row.length !== 2))
    throw new Error(
      "Use two columns: label and numeric value, with up to 12 data points.",
    );
  const data = rows.map((row, i) => {
    const label = row[0].trim(),
      raw = row[1].trim();
    if (!label || !raw || !Number.isFinite(Number(raw)))
      throw new Error(`Row ${i + 1} needs a label and a numeric value.`);
    return { label, value: Number(raw) };
  });
  const result = chartSchema.safeParse({ kind, showValues, data });
  if (!result.success)
    throw new Error(
      kind === "donut"
        ? "Use labels up to 80 characters and non-negative values up to one billion for a donut chart."
        : "Use labels up to 80 characters and values between minus one billion and one billion.",
    );
  return result.data;
}
