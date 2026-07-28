import { afterEach, describe, expect, it, vi } from "vitest";
import { createEmptyWorkspaceData } from "../src/core/domain/workspaceData";
import { BrowserWorkspaceRepository } from "../src/infrastructure/persistence/browserWorkspaceRepository";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("browser preview repository", () => {
  it("round-trips schema-six operational and intake records", async () => {
    vi.stubGlobal("window", { localStorage: new MemoryStorage() });
    const repository = new BrowserWorkspaceRepository();
    const data = createEmptyWorkspaceData();
    data.productionBatches.push({
      id: "BATCH-1",
      name: "First Batch",
      status: "Planned",
      scheduledStart: "",
      notes: "",
    });
    data.activityLog.push({
      id: "ACT-1",
      occurredAt: "2026-07-27T00:00:00.000Z",
      kind: "system",
      station: "administration",
      summary: "Workspace established.",
    });
    data.intakePackets.push({
      packetId: "FP-TEST-V001",
      formatVersion: 1,
      productId: "DESIGN-TEST",
      productName: "Test Product",
      stage: "Planning",
      sourcePackagePath: "test.forgepack",
      assetRoot: "Intake/DESIGN-TEST/FP-TEST-V001",
      importedAt: "2026-07-27T00:00:00.000Z",
      conceptRevision: "v001",
      canonGate: { status: "Pending", summary: "" },
      forgeability: {
        status: "Pending",
        summary: "",
        risks: [],
        requirements: [],
        unknowns: ["Geometry"],
      },
      pipeline: {
        nextGate: "Canon review",
        nextAction: "Review the concept.",
        blockedBy: [],
        physicalTestStatus: "Not Started",
        targetPrinters: [],
        intendedMaterials: [],
      },
      assets: [],
      provenance: {
        createdAt: "2026-07-27T00:00:00.000Z",
        createdBy: "Test",
        conversationRef: "",
        notes: "",
      },
    });

    await repository.save(data);
    const restored = await repository.load();

    expect(restored.data?.productionBatches[0].name).toBe("First Batch");
    expect(restored.data?.activityLog[0].summary).toBe("Workspace established.");
    expect(restored.data?.intakePackets[0].packetId).toBe("FP-TEST-V001");
    expect(restored.backend).toBe("browser-preview");
  });

  it("rejects broken cross-station references before saving", async () => {
    vi.stubGlobal("window", { localStorage: new MemoryStorage() });
    const repository = new BrowserWorkspaceRepository();
    const data = createEmptyWorkspaceData();
    data.materialMovements.push({
      id: "MOVE-1",
      filamentId: "MISSING",
      type: "Adjustment",
      grams: 100,
      occurredAt: "2026-07-27T00:00:00.000Z",
      notes: "",
    });

    await expect(repository.save(data)).rejects.toThrow("Workspace integrity check failed");
  });
});
