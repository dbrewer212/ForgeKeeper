import { describe, expect, it } from "vitest";
import type { ForgekeeperState } from "../state/useForgekeeperState";
import { snapshotForgekeeperState } from "./workspaceSync";

function stateWithSettings(): ForgekeeperState {
  return {
    products: [], stls: [], concepts: [], productionReferences: [], modelVerifications: [], printTrials: [],
    variants: [], collections: [], releases: [], orders: [], filamentProfiles: [], filament: [],
    materialTransactions: [], materialReservations: [], filamentDryingRecords: [], materialImportHistory: [],
    printers: [], maintenance: [], generationJobs: [], controlCenter: {} as never, canonRecords: [], libraryAssets: [],
    recovery: {} as never, prototypes: [], plannedFilament: [], productPlanning: [], realmMaterials: [],
    settings: {
      laborRate: 18,
      electricityRate: 0.2,
      machineWatts: 250,
      packagingCost: 1,
      otherCost: 0,
      materialMarkupPercent: 10,
      targetMarginPercent: 50,
      assetRootPath: "C:\\Foundry\\Assets",
      productionHoursPerDay: 8,
      forgekeeperLibraryPath: "C:\\Foundry\\Library",
      apiCredentialFilePath: "C:\\Secrets\\providers.json",
      orcaSlicerPath: "C:\\Apps\\Orca.exe",
      anycubicSlicerPath: "C:\\Apps\\Anycubic.exe",
      blenderPath: "C:\\Apps\\Blender.exe",
      meshyUrl: "https://www.meshy.ai/",
    },
  } as unknown as ForgekeeperState;
}

describe("Foundry Link workspace settings", () => {
  it("synchronizes shared settings without leaking workstation-local paths", () => {
    const snapshot = snapshotForgekeeperState(stateWithSettings());

    expect(snapshot.settings.laborRate).toBe(18);
    expect(snapshot.settings.meshyUrl).toBe("https://www.meshy.ai/");
    expect(snapshot.settings.assetRootPath).toBeUndefined();
    expect(snapshot.settings.forgekeeperLibraryPath).toBeUndefined();
    expect(snapshot.settings.apiCredentialFilePath).toBeUndefined();
    expect(snapshot.settings.orcaSlicerPath).toBeUndefined();
    expect(snapshot.settings.anycubicSlicerPath).toBeUndefined();
    expect(snapshot.settings.blenderPath).toBeUndefined();
  });
});
