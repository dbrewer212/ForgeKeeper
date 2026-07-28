import { openPath } from "./tauriLaunchpad";

export type ExternalToolKey = "orca" | "anycubic" | "blender" | "meshy";
export type SlicerKey = "orca" | "anycubic";

export type ExternalToolSettings = {
  forgekeeperLibraryPath: string;
  orcaSlicerPath: string;
  anycubicSlicerPath: string;
  blenderPath: string;
  meshyUrl: string;
  defaultSlicer: SlicerKey;
};

export const defaultExternalTools: ExternalToolSettings = {
  forgekeeperLibraryPath: "C:\\ForgekeeperLibrary",
  orcaSlicerPath: "C:\\Program Files\\OrcaSlicer\\OrcaSlicer.exe",
  anycubicSlicerPath: "C:\\Program Files\\AnycubicSlicerNext\\AnycubicSlicerNext.exe",
  blenderPath: "C:\\Users\\dbrew\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Blender",
  meshyUrl: "https://www.meshy.ai/",
  defaultSlicer: "orca",
};

export function slicerForPrinter(printerName = ""): SlicerKey {
  const normalized = printerName.toLowerCase();
  if (normalized.includes("kobra")) return "anycubic";
  if (normalized.includes("neptune")) return "orca";
  return "orca";
}

export function toolLabel(key: ExternalToolKey | SlicerKey): string {
  if (key === "orca") return "OrcaSlicer";
  if (key === "anycubic") return "Anycubic Slicer Next";
  if (key === "blender") return "Blender";
  return "Meshy.ai";
}

export function getToolPath(settings: Partial<ExternalToolSettings>, key: ExternalToolKey): string {
  if (key === "orca") return settings.orcaSlicerPath || defaultExternalTools.orcaSlicerPath;
  if (key === "anycubic") return settings.anycubicSlicerPath || defaultExternalTools.anycubicSlicerPath;
  if (key === "blender") return settings.blenderPath || defaultExternalTools.blenderPath;
  return settings.meshyUrl || defaultExternalTools.meshyUrl;
}

export async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function openWebUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function openLocalPathBestEffort(path: string) {
  return openPath(path, "Local path");
}
