import { invoke } from "@tauri-apps/api/core";

export function toCsvValue(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvText(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [headers.map(toCsvValue).join(",")]
    .concat(rows.map((row) => headers.map((header) => toCsvValue(row[header])).join(",")))
    .join("\r\n");
}

export interface CsvDownloadResult {
  outputPath?: string;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function downloadCsvInBrowser(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadText(filename: string, contents: string, mimeType = "text/plain;charset=utf-8;"): Promise<CsvDownloadResult> {
  if (!contents || typeof window === "undefined") return {};
  if (isTauriRuntime()) return invoke<CsvDownloadResult>("save_text_file_to_downloads", { filename, contents });
  if (typeof document === "undefined") return {};
  const blob = new Blob([contents], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return {};
}

export async function downloadCsv(filename: string, rows: Array<Record<string, unknown>>): Promise<CsvDownloadResult> {
  const csv = csvText(rows);
  if (!csv || typeof window === "undefined") return {};

  if (isTauriRuntime()) return downloadText(filename, csv, "text/csv;charset=utf-8;");
  downloadCsvInBrowser(filename, csv);
  return {};
}
