export type ForgekeeperAssetKind = "stl" | "concept" | "productImage" | "export" | "backup" | "reference";

export function sanitizeFolderName(value: string): string {
  return (
    value
      .trim()
      .replace(/[<>:"/\\|?*]+/g, "-")
      .replace(/\s+/g, " ")
      .slice(0, 80) || "Unassigned"
  );
}

export function normalizeLibraryRoot(libraryRoot?: string): string {
  return (libraryRoot || "C:\\ForgekeeperLibrary").replace(/[\\/]+$/, "");
}

export function suggestedLibraryPath(
  libraryRoot: string | undefined,
  productName: string,
  kind: ForgekeeperAssetKind,
  version = "v001",
): string {
  const product = sanitizeFolderName(productName);
  const root = normalizeLibraryRoot(libraryRoot);

  if (kind === "stl") return `${root}\\STLs\\${product}\\${version}`;
  if (kind === "concept") return `${root}\\Concepts\\${product}\\concept-art`;
  if (kind === "reference") return `${root}\\Concepts\\${product}\\reference`;
  if (kind === "productImage") return `${root}\\ProductImages\\${product}`;
  if (kind === "export") return `${root}\\Exports`;
  return `${root}\\Backups`;
}

export function filenameFromPath(path = ""): string {
  const normalized = path.replace(/\\/g, "/");
  return normalized.split("/").filter(Boolean).pop() || path;
}

export function folderFromPath(path = ""): string {
  const normalized = path.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  const drive = path.match(/^[A-Za-z]:/)?.[0];
  const body = parts.slice(0, -1).join("\\");
  return drive && !body.startsWith(drive) ? `${drive}\\${body}` : body;
}

export function ensureStlExtension(name: string): string {
  const clean = name.trim();
  if (!clean) return "untitled.stl";
  return clean.toLowerCase().endsWith(".stl") ? clean : `${clean}.stl`;
}
