export type ForgekeeperAssetKind = "stl" | "concept" | "productImage" | "export" | "backup";

export function sanitizeFolderName(value: string): string {
  return value
    .trim()
    .replace(/[<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80) || "Unassigned";
}

export function suggestedLibraryPath(libraryRoot: string, productName: string, kind: ForgekeeperAssetKind, version = "v001"): string {
  const product = sanitizeFolderName(productName);
  const root = libraryRoot.replace(/[\\/]+$/, "");

  if (kind === "stl") return `${root}\\STLs\\${product}\\${version}`;
  if (kind === "concept") return `${root}\\Concepts\\${product}\\concept-art`;
  if (kind === "productImage") return `${root}\\ProductImages\\${product}`;
  if (kind === "export") return `${root}\\Exports`;
  return `${root}\\Backups`;
}
