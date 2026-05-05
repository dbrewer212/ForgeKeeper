export type ExternalToolKey = "orca" | "anycubic" | "blender" | "meshy";

export type ExternalToolSettings = {
  forgekeeperLibraryPath: string;
  orcaSlicerPath: string;
  anycubicSlicerPath: string;
  blenderPath: string;
  meshyUrl: string;
  defaultSlicer: "orca" | "anycubic";
};

export const defaultExternalTools: ExternalToolSettings = {
  forgekeeperLibraryPath: "C:\\Dev\\Forgekeeper Library",
  orcaSlicerPath: "C:\\Program Files\\OrcaSlicer\\OrcaSlicer.exe",
  anycubicSlicerPath: "C:\\Program Files\\AnycubicSlicerNext\\AnycubicSlicerNext.exe",
  blenderPath: "C:\\Users\\dbrew\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Blender",
  meshyUrl: "https://www.meshy.ai/",
  defaultSlicer: "orca",
};

export function slicerForPrinter(printerName = ""): "orca" | "anycubic" {
  const normalized = printerName.toLowerCase();
  if (normalized.includes("kobra")) return "anycubic";
  if (normalized.includes("neptune")) return "orca";
  return "orca";
}

export function toolLabel(key: ExternalToolKey): string {
  if (key === "orca") return "OrcaSlicer";
  if (key === "anycubic") return "Anycubic Slicer Next";
  if (key === "blender") return "Blender";
  return "Meshy.ai";
}
