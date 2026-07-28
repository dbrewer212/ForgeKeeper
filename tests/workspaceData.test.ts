import { describe, expect, it } from "vitest";
import {
  createEmptyWorkspaceData,
  inspectWorkspaceIntegrity,
  isForgekeeperBackup,
} from "../src/core/domain/workspaceData";
import { migrateWorkspaceData } from "../src/core/persistence/legacyMigration";
import {
  installWorkshopPrinterProfiles,
  normalizePrinterRecord,
  workshopPrinterProfiles,
  WORKSHOP_PRINTER_PROFILE_REVISION,
} from "../src/data/printerProfiles";
import { hydrateData } from "../src/state/useForgekeeperState";

describe("workspace data", () => {
  it("creates a private workspace without demonstration production records and with the workshop fleet", () => {
    const data = createEmptyWorkspaceData();

    expect(data.designProjects).toEqual([]);
    expect(data.productionJobs).toEqual([]);
    expect(data.productionBatches).toEqual([]);
    expect(data.intakePackets).toEqual([]);
    expect(data.filament).toEqual([]);
    expect(data.printers.map((printer) => printer.name)).toEqual([
      "Kobra S1 Max Combo",
      "Neptune 4 Max",
      "Kobra 3 Combo",
    ]);
    expect(data.settings.setupCompleted).toBe(false);
  });

  it("installs the researched printer profiles once into an existing workspace", () => {
    const oldWorkspace = createEmptyWorkspaceData();
    oldWorkspace.printers = [{
      ...normalizePrinterRecord({
        id: "DEREKS-NEPTUNE",
        name: "Neptune 4 Max",
        model: "Neptune 4 Max",
        watts: 333,
        notes: "Keep my tuning note.",
      }),
    }];
    oldWorkspace.settings.workshopPrinterProfileRevision = 0;

    const upgraded = hydrateData(oldWorkspace);
    expect(upgraded.printers).toHaveLength(3);
    expect(upgraded.printers.find((printer) => printer.profileId === "elegoo-neptune-4-max")).toMatchObject({
      id: "DEREKS-NEPTUNE",
      watts: 333,
      buildVolumeX: 420,
      maxNozzleTemperatureC: 300,
      preferredSlicer: "orca",
      connectionType: "Moonraker / Fluidd",
      notes: "Keep my tuning note.",
    });
    expect(upgraded.settings.workshopPrinterProfileRevision).toBe(WORKSHOP_PRINTER_PROFILE_REVISION);

    const afterRemoval = {
      ...upgraded,
      printers: upgraded.printers.filter((printer) => printer.profileId !== "anycubic-kobra-3-combo"),
    };
    expect(hydrateData(afterRemoval).printers).toHaveLength(2);
  });

  it("defines the researched machine limits and multicolor systems", () => {
    const installed = installWorkshopPrinterProfiles([]);
    expect(installed).toHaveLength(workshopPrinterProfiles.length);
    expect(installed.find((printer) => printer.profileId === "anycubic-kobra-s1-max-combo")).toMatchObject({
      buildVolume: "350 × 350 × 350 mm",
      maxNozzleTemperatureC: 350,
      maxChamberTemperatureC: 65,
      multicolorSystem: "ACE 2 Pro",
      maxColorCount: 16,
      preferredSlicer: "anycubic",
    });
    expect(installed.find((printer) => printer.profileId === "anycubic-kobra-3-combo")).toMatchObject({
      buildVolume: "250 × 250 × 260 mm",
      multicolorSystem: "ACE Pro",
      maxColorCount: 8,
    });
  });

  it("imports production information without customer or sales fields", () => {
    const migrated = migrateWorkspaceData({
      products: [{
        id: "DESIGN-1",
        name: "Mimicwhelp",
        status: "Prototype",
        customerPrice: 99,
      }],
      orders: [{
        id: "JOB-1",
        productId: "DESIGN-1",
        quantity: 2,
        status: "Printing",
        customerName: "Discard Me",
        email: "discard@example.com",
        paymentStatus: "Paid",
        trackingNumber: "TRACK",
        quotedPrice: 500,
        batchId: "BATCH-1",
        actualPrintHours: 7.5,
        actualMaterialGrams: 190,
        outcome: "Partial",
        failureReason: "One unit failed",
        costSnapshotId: "COST-1",
      }],
      productionBatches: [{ id: "BATCH-1", name: "Test Batch", status: "Complete", scheduledStart: "", notes: "" }],
      settings: {},
    });

    expect(migrated.designProjects[0].name).toBe("Mimicwhelp");
    expect(migrated.productionJobs[0]).toMatchObject({
      id: "JOB-1",
      designProjectId: "DESIGN-1",
      quantity: 2,
      status: "Printing",
      batchId: "BATCH-1",
      actualPrintHours: 7.5,
      actualMaterialGrams: 190,
      outcome: "Partial",
      costSnapshotId: "COST-1",
    });
    expect(JSON.stringify(migrated)).not.toContain("Discard Me");
    expect(JSON.stringify(migrated)).not.toContain("discard@example.com");
    expect(JSON.stringify(migrated)).not.toContain("TRACK");
  });

  it("detects broken station relationships before restore or backup", () => {
    const data = createEmptyWorkspaceData();
    data.productionJobs.push({
      id: "JOB-ORPHAN",
      name: "Orphan",
      designProjectId: "MISSING-DESIGN",
      filamentId: "MISSING-SPOOL",
      quantity: 1,
      targetDate: "",
      status: "Queued",
      priority: "Normal",
      estimatedPrintHours: 1,
      laborHours: 0,
      laborRate: 0,
      machineWatts: 0,
      electricityRate: 0,
      packagingCost: 0,
      otherCost: 0,
      notes: "",
    });

    expect(inspectWorkspaceIntegrity(data).map((issue) => issue.code)).toEqual([
      "job-design-missing",
      "job-filament-missing",
    ]);
  });

  it("recognizes current and legacy ForgeKeeper backup envelopes", () => {
    expect(isForgekeeperBackup({ designProjects: [], productionJobs: [] })).toBe(true);
    expect(isForgekeeperBackup({ data: { products: [], orders: [] } })).toBe(true);
    expect(isForgekeeperBackup({ random: [] })).toBe(false);
  });
});
