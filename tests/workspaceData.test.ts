import { describe, expect, it } from "vitest";
import {
  createEmptyWorkspaceData,
  inspectWorkspaceIntegrity,
  isForgekeeperBackup,
} from "../src/core/domain/workspaceData";
import { migrateWorkspaceData } from "../src/core/persistence/legacyMigration";

describe("workspace data", () => {
  it("creates a private workspace without demonstration records", () => {
    const data = createEmptyWorkspaceData();

    expect(data.designProjects).toEqual([]);
    expect(data.productionJobs).toEqual([]);
    expect(data.productionBatches).toEqual([]);
    expect(data.filament).toEqual([]);
    expect(data.printers).toEqual([]);
    expect(data.settings.setupCompleted).toBe(false);
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
