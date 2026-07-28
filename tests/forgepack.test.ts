import { describe, expect, it } from "vitest";
import { createEmptyWorkspaceData } from "../src/core/domain/workspaceData";
import {
  applyForgepackImport,
  parseForgepackManifest,
  type ForgepackManifest,
  type NativeForgepackImport,
} from "../src/core/forgepack/forgepack";

function manifest(overrides: Partial<ForgepackManifest["product"]> = {}): ForgepackManifest {
  return {
    format: "fenrir-forgepack",
    formatVersion: 1,
    packetId: "FP-MIMICWHELP-V001",
    product: {
      id: "DESIGN-MIMICWHELP",
      name: "Mimicwhelp",
      tier: "Hero",
      line: "Foundry",
      category: "Resident",
      collection: "Foundry",
      stage: "Planning",
      purpose: "A proper Mimicwhelp desk companion.",
      measurements: "Target height: 70 mm",
      conceptRevision: "v001",
      ...overrides,
    },
    canonGate: {
      status: overrides.stage === "Planning" || !overrides.stage ? "Pending" : "Approved",
      summary: "Preserves Proper Mimicwhelp.",
    },
    forgeability: {
      status: "Pending",
      summary: "Model geometry not received.",
      risks: [],
      requirements: ["Inspect the actual STL."],
      unknowns: ["Wall thickness"],
    },
    pipeline: {
      nextGate: "Canon approval",
      nextAction: "Review the concept.",
      blockedBy: [],
      physicalTestStatus: "Not Started",
      targetPrinters: ["Kobra S1 Max Combo"],
      intendedMaterials: ["PLA"],
    },
    assets: [{
      id: "ASSET-CONCEPT-1",
      kind: "concept-image",
      label: "Mimicwhelp concept",
      path: "assets/concepts/mimicwhelp.png",
      sha256: "a".repeat(64),
      version: "v001",
      primary: true,
    }],
    provenance: {
      createdAt: "2026-07-28T12:00:00.000Z",
      createdBy: "Fenrir Forgeworks",
      conversationRef: "test",
      notes: "",
    },
  };
}

function nativeImport(value: ForgepackManifest): NativeForgepackImport {
  return {
    manifestJson: JSON.stringify(value),
    packagePath: "C:\\Downloads\\mimicwhelp.forgepack",
    assetRoot: "C:\\Forgekeeper\\Intake\\DESIGN-MIMICWHELP\\FP-MIMICWHELP-V001",
    alreadyExtracted: false,
    assets: value.assets.map((asset) => ({
      archivePath: asset.path,
      importedPath: `C:\\Forgekeeper\\Intake\\${asset.path.split("/").join("\\")}`,
    })),
  };
}

describe(".forgepack intake", () => {
  it("keeps an unapproved concept in Planning", () => {
    const packet = manifest();
    const result = applyForgepackImport(createEmptyWorkspaceData(), nativeImport(packet));

    expect(result.createdPlanningRecord).toBe(true);
    expect(result.createdDesignProject).toBe(false);
    expect(result.data.prototypes[0]).toMatchObject({
      id: "DESIGN-MIMICWHELP",
      designName: "Mimicwhelp",
      status: "Active Idea",
    });
    expect(result.data.designProjects).toEqual([]);
    expect(result.data.intakePackets[0].canonGate.status).toBe("Pending");
  });

  it("promotes a canon-approved concept and links the imported image", () => {
    const packet = manifest({ stage: "Concept Approved" });
    const result = applyForgepackImport(createEmptyWorkspaceData(), nativeImport(packet));

    expect(result.createdDesignProject).toBe(true);
    expect(result.data.designProjects[0]).toMatchObject({
      id: "DESIGN-MIMICWHELP",
      name: "Mimicwhelp",
      status: "Concept",
      conceptImagePath: expect.stringContaining("mimicwhelp.png"),
    });
    expect(result.data.concepts[0]).toMatchObject({
      designProjectId: "DESIGN-MIMICWHELP",
      measurements: "Target height: 70 mm",
    });
  });

  it("rejects unsafe asset paths and premature production approval", () => {
    const unsafe = manifest();
    unsafe.assets[0].path = "../mimicwhelp.png";
    expect(() => parseForgepackManifest(unsafe)).toThrow("safe path under assets");

    const premature = manifest({ stage: "Production Approved" });
    expect(() => parseForgepackManifest(premature)).toThrow("approved forgeability gate");
  });

  it("allows production approval only after engineering and physical gates pass", () => {
    const packet = manifest({ stage: "Production Approved" });
    packet.forgeability.status = "Approved";
    packet.pipeline.physicalTestStatus = "Passed";
    packet.assets.push({
      id: "ASSET-MODEL-1",
      kind: "3mf",
      label: "Mimicwhelp production model",
      path: "assets/models/mimicwhelp-v003.3mf",
      sha256: "b".repeat(64),
      version: "v003",
      primary: true,
    });

    const parsed = parseForgepackManifest(packet);
    const result = applyForgepackImport(createEmptyWorkspaceData(), nativeImport(parsed));

    expect(result.data.designProjects[0].status).toBe("Production");
    expect(result.data.stls[0]).toMatchObject({
      fileName: "mimicwhelp-v003.3mf",
      assetStatus: "Linked",
    });
  });
});
