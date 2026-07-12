export type CsvRow = Record<
  string,
  string | number | boolean | null | undefined
>;

function escapeCell(
  value: string | number | boolean | null | undefined,
): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  if (/[",\n\r]/.test(raw)) return `"${raw.replaceAll('"', '""')}"`;
  return raw;
}

export function toCsv(rows: CsvRow[], columns: string[]): string {
  const header = columns.map(escapeCell).join(",");
  const body = rows.map((row) =>
    columns.map((column) => escapeCell(row[column])).join(","),
  );
  return [header, ...body].join("\n") + "\n";
}
