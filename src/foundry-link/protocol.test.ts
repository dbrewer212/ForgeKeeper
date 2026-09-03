import { describe, expect, it } from "vitest";
import { canonicalFoundryLinkPayload, FOUNDRY_LINK_FORMAT } from "./protocol";

function bundle(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    format: FOUNDRY_LINK_FORMAT,
    schemaVersion: 4,
    appData: { products: [], stls: [], concepts: [], orders: [], filament: [], printers: [] },
    meshDomain: { projects: [] },
    workbench: { assets: [] },
    ...overrides,
  });
}

describe("Foundry Link protocol identity", () => {
  it("ignores transient remote commands when comparing durable workspace identity", () => {
    const left = bundle({ remoteCommands: [] });
    const right = bundle({
      remoteCommands: [{
        id: "cmd-1",
        requestedAt: "2026-09-03T14:00:00.000Z",
        expiresAt: "2026-09-03T14:05:00.000Z",
        action: "mesh.tool",
        toolName: "bastion.mobile_snapshot",
      }],
    });

    expect(canonicalFoundryLinkPayload(left)).toBe(canonicalFoundryLinkPayload(right));
  });

  it("ignores transient command results when comparing durable workspace identity", () => {
    const left = bundle({ remoteCommandResults: [] });
    const right = bundle({
      remoteCommandResults: [{
        commandId: "cmd-1",
        completedAt: "2026-09-03T14:00:01.000Z",
        state: "completed",
      }],
    });

    expect(canonicalFoundryLinkPayload(left)).toBe(canonicalFoundryLinkPayload(right));
  });

  it("detects a real durable workspace change", () => {
    const left = bundle();
    const right = bundle({
      appData: {
        products: [{ id: "P-1", name: "Changed" }],
        stls: [],
        concepts: [],
        orders: [],
        filament: [],
        printers: [],
      },
    });

    expect(canonicalFoundryLinkPayload(left)).not.toBe(canonicalFoundryLinkPayload(right));
  });

  it("preserves legacy raw AppData payloads rather than stripping unrelated fields", () => {
    const legacy = JSON.stringify({
      products: [],
      stls: [],
      concepts: [],
      orders: [],
      filament: [],
      printers: [],
      remoteCommands: [{ id: "legacy-data-field" }],
    });

    expect(canonicalFoundryLinkPayload(legacy)).toBe(legacy);
  });
});
