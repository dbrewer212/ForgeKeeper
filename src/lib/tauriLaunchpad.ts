import { isFoundryMobileRuntime } from "../platform/runtime";

export type LaunchToolKey = "orca" | "anycubic" | "blender" | "meshy";

type InvokeFn = (command: string, args?: Record<string, unknown>) => Promise<unknown>;
type TrustedLauncherId = "orca" | "anycubic" | "blender";

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

function trustedLauncherId(toolPath: string, label: string): TrustedLauncherId | null {
  const candidate = `${label} ${toolPath}`.toLowerCase();
  if (candidate.includes("orca")) return "orca";
  if (candidate.includes("anycubic")) return "anycubic";
  if (candidate.includes("blender")) return "blender";
  return null;
}

async function queueMobileWorkstationLaunch(toolPath: string, label: string): Promise<boolean> {
  const launcherId = trustedLauncherId(toolPath, label);
  if (!launcherId) return false;
  try {
    const { queueRemoteTool } = await import("../foundry-link/remoteCommands");
    queueRemoteTool(
      "workstation.launch_tool",
      { launcherId },
      `${label} requested from a shared Mobile Foundry station.`,
    );
    window.alert(`${label} queued for the paired Foundry workstation.`);
    return true;
  } catch (cause) {
    window.alert(`Could not queue ${label} for the workstation.\n\n${cause instanceof Error ? cause.message : String(cause)}`);
    return true;
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

  if (isFoundryMobileRuntime()) {
    window.alert(`${label} is a workstation-local path. Mobile Foundry will not execute or transmit raw filesystem paths. Opening individual linked assets from mobile requires the managed Foundry Asset Service.`);
    return;
  }

  const invoke = await getTauriInvoke();

  if (invoke) {
    try {
      await invoke("open_path", { path });
      return;
    } catch (error) {
      console.error(error);
      window.alert(`Could not open ${label}.\n\n${String(error)}`);
      return;
    }
  }

  window.alert(`${label} is linked, but local file launching only works in the Forgekeeper desktop app.\n\n${path}`);
}

export async function openUrl(url: string, label = "URL") {
  if (!url) {
    window.alert(`${label} is not configured yet.`);
    return;
  }

  if (!isLikelyWebUrl(url)) {
    window.alert(`${label} is not a valid web address.\n\n${url}`);
    return;
  }

  if (isFoundryMobileRuntime()) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  const invoke = await getTauriInvoke();

  if (invoke) {
    try {
      await invoke("open_path", { path: url });
      return;
    } catch (error) {
      console.error(error);
      window.alert(`Could not open ${label}.\n\n${String(error)}`);
      return;
    }
  }

  window.open(url, "_blank", "noopener,noreferrer");
}

export async function launchExternalTool(toolPath: string, assetPath?: string, label = "tool") {
  if (!toolPath) {
    window.alert(`${label} path is not configured yet. Set it in Settings > External Tools.`);
    return;
  }

  if (isFoundryMobileRuntime()) {
    const queued = await queueMobileWorkstationLaunch(toolPath, label);
    if (queued) {
      if (assetPath) {
        window.alert(`${label} was queued on the workstation. The linked asset path was not transmitted; opening the specific asset from mobile requires the managed Foundry Asset Service.`);
      }
      return;
    }
    window.alert(`${label} is not registered as a trusted Mobile Foundry workstation launcher.`);
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
