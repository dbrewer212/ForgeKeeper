import { afterEach, describe, expect, it, vi } from "vitest";
import { launchExternalTool, openPath } from "./tauriLaunchpad";

function mobileEnvironment() {
  const storage = new Map<string, string>();
  const alerts: string[] = [];
  vi.stubGlobal("navigator", { userAgent: "Mozilla/5.0 Android" });
  vi.stubGlobal("crypto", { randomUUID: () => "command-1" });
  vi.stubGlobal("window", {
    location: { search: "" },
    __TAURI_INTERNALS__: {},
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    },
    alert: (message: string) => alerts.push(message),
    open: vi.fn(),
  });
  return { storage, alerts };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("mobile launchpad boundaries", () => {
  it("does not execute or transmit a raw workstation filesystem path on Android", async () => {
    const { alerts } = mobileEnvironment();

    await openPath("C:\\Foundry\\secret.stl", "Linked STL");

    expect(alerts.join(" ")).toContain("will not execute or transmit raw filesystem paths");
  });

  it("routes known workstation applications through a trusted Foundry Link launcher id", async () => {
    const { storage } = mobileEnvironment();

    await launchExternalTool("C:\\Program Files\\OrcaSlicer\\orca-slicer.exe", undefined, "OrcaSlicer");

    const persisted = [...storage.values()].join("\n");
    expect(persisted).toContain('"toolName":"workstation.launch_tool"');
    expect(persisted).toContain('"launcherId":"orca"');
    expect(persisted).not.toContain("C:\\\\Program Files");
  });
});
