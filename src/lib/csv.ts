export function toCsvValue(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export function downloadCsv(filename: string, rows: Array<Record<string, unknown>>): void {
  if (!rows.length || typeof window === "undefined") return;
  const headers = Object.keys(rows[0]);
  const csv = [headers.map(toCsvValue).join(",")]
    .concat(rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(",")))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
