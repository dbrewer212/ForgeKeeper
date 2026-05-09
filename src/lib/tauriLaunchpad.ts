export type LaunchToolKey = "orca" | "anycubic" | "blender" | "meshy";

type InvokeFn = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

function isLikelyWebUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function getTauriInvoke(): Promise<InvokeFn | null> {
  if (!isTauriRuntime()) return null;

  try {
    const api = await import("@tauri-apps/api/core");
    return api.invoke as InvokeFn;
  } catch (error) {
    console.error("Tauri API could not be loaded.", error);
    return null;
  }
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

  if (isLikelyWebUrl(path)) {
    window.open(path, "_blank", "noopener,noreferrer");
    return;
  }

  const invoke = await getTauriInvoke();

  if (!invoke) {
    window.alert(`${label} is linked, but local file launching only works in the Forgekeeper desktop app.\n\n${path}`);
    return;
  }

  try {
    await invoke("open_path", { path });
  } catch (error) {
    console.error(error);
    window.alert(`Could not open ${label}.\n\n${String(error)}`);
  }
}

export async function openUrl(url: string) {
  if (!url) {
    window.alert("URL is not configured yet.");
    return;
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export async function launchExternalTool(toolPath: string, assetPath?: string, label = "tool") {
  if (!toolPath) {
    window.alert(`${label} path is not configured yet. Set it in Settings > External Tools.`);
    return;
  }

  const invoke = await getTauriInvoke();

  if (!invoke) {
    window.alert(`${label} is configured, but launching local tools only works in the Forgekeeper desktop app.\n\n${toolPath}`);
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
