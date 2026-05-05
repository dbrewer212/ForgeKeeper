import { invoke } from "@tauri-apps/api/core";

export type LaunchToolKey = "orca" | "anycubic" | "blender" | "meshy";

function isLikelyWebUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

export async function copyToClipboard(value: string, label = "Value") {
  if (!value) {
    window.alert(`${label} is not linked yet.`);
    return false;
  }

  try {
    await navigator.clipboard.writeText(value);
    window.alert(`${label} copied to clipboard.`);
    return true;
  } catch {
    window.alert(`${label}: ${value}`);
    return false;
  }
}

export async function openPath(path: string, label = "Path") {
  if (!path) {
    window.alert(`${label} is not linked yet.`);
    return;
  }

  try {
    await invoke("open_path", { path });
  } catch (error) {
    console.error(error);
    if (isLikelyWebUrl(path)) {
      window.open(path, "_blank", "noopener,noreferrer");
      return;
    }
    window.alert(`Could not open ${label}.\n\n${String(error)}`);
  }
}

export async function openUrl(url: string) {
  if (!url) {
    window.alert("URL is not configured yet.");
    return;
  }

  try {
    await invoke("open_path", { path: url });
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export async function launchExternalTool(toolPath: string, assetPath?: string, label = "tool") {
  if (!toolPath) {
    window.alert(`${label} path is not configured yet. Set it in Settings > External Tools.`);
    return;
  }

  try {
    await invoke("launch_external_tool", {
      toolPath,
      assetPath: assetPath || null,
    });
  } catch (error) {
    console.error(error);
    window.alert(`Could not launch ${label}.\n\n${String(error)}`);
  }
}
