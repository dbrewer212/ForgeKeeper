import { invoke } from "@tauri-apps/api/core";

export type ExternalToolKey = "orca" | "anycubic" | "blender" | "meshy";
export type SlicerKey = "orca" | "anycubic";

export type ExternalToolSettings = {
  forgekeeperLibraryPath: string;
  apiCredentialFilePath: string;
  orcaSlicerPath: string;
  anycubicSlicerPath: string;
  blenderPath: string;
  meshyUrl: string;
  defaultSlicer: SlicerKey;
};

export const defaultExternalTools: ExternalToolSettings = {
  forgekeeperLibraryPath: "C:\\ForgekeeperLibrary",
  apiCredentialFilePath: "",
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

function isNativeDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function openWebUrl(url: string): Promise<void> {
  const target = url.trim();
  if (!target) throw new Error("No web address has been configured.");

  if (isNativeDesktop()) {
    await invoke("launch_external_tool", { toolPath: target, assetPath: null });
    return;
  }

  window.open(target, "_blank", "noopener,noreferrer");
}

export async function openLocalPathBestEffort(path: string): Promise<void> {
  const target = path.trim();
  if (!target) {
    window.alert("No local path has been linked yet.");
    return;
  }

  if (isNativeDesktop()) {
    await invoke("open_path", { path: target });
    return;
  }

  const fileUrl = target.startsWith("file://") ? target : `file:///${target.replace(/\\/g, "/")}`;
  window.open(fileUrl, "_blank");
}

export async function launchExternalTool(toolPath: string, assetPath?: string): Promise<void> {
  const target = toolPath.trim();
  if (!target) throw new Error("Tool path is not configured.");

  if (isNativeDesktop()) {
    await invoke("launch_external_tool", { toolPath: target, assetPath: assetPath?.trim() || null });
    return;
  }

  if (/^https?:\/\//i.test(target)) {
    window.open(target, "_blank", "noopener,noreferrer");
    return;
  }

  const fileUrl = target.startsWith("file://") ? target : `file:///${target.replace(/\\/g, "/")}`;
  window.open(fileUrl, "_blank");
}

export function describeLaunchTarget(tool: ExternalToolKey | SlicerKey, filePath?: string): string {
  const label = toolLabel(tool);
  return filePath ? `${label} -> ${filePath}` : label;
}
