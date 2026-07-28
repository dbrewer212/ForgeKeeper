import { describe, expect, it } from "vitest";
import { fallbackSettings, getProductionJobCostBreakdown } from "../src/lib/cost";
import { calculateProductionMetrics } from "../src/lib/production";
import { createCustomPrinter } from "../src/data/printerProfiles";
import type { FilamentRecord, PrinterRecord, ProductionJob, DesignProject } from "../src/types/domain";

const design: DesignProject = {
  id: "DESIGN-1",
  name: "Forge Test",
  tier: "Hero",
  line: "Foundry",
  category: "Test",
  collection: "Test",
  status: "Production",
  targetPrice: 0,
  estimatedFilamentGrams: 100,
  estimatedPrintHours: 2,
  available: 0,
  reorderPoint: 0,
  designImagePath: "",
  conceptImagePath: "",
  supportedRealmVariants: [],
  notes: "",
};

const spool: FilamentRecord = {
  id: "FIL-1",
  brand: "Test",
  material: "PLA",
  colorName: "Black",
  colorFamily: "Black",
  gramsAvailable: 150,
  reorderPointGrams: 50,
  spoolPrice: 20,
  spoolWeightGrams: 1000,
  notes: "",
};

const printer: PrinterRecord = {
  ...createCustomPrinter("PR-1", "Printer", 200),
  supportedMaterials: ["PLA"],
};

const job: ProductionJob = {
  id: "JOB-1",
  name: "Test Run",
  designProjectId: design.id,
  filamentId: spool.id,
  materialGrams: 100,
  quantity: 2,
  targetDate: "",
  status: "Queued",
  priority: "Normal",
  printerId: printer.id,
  estimatedPrintHours: 2,
  laborHours: 1,
  laborRate: 10,
  machineWatts: 200,
  electricityRate: 0.2,
  packagingCost: 1,
  otherCost: 0,
  notes: "",
};

describe("operations", () => {
  it("calculates a reproducible direct-cost snapshot", () => {
    const result = getProductionJobCostBreakdown(job, design, spool, printer, fallbackSettings);

    expect(result.gramsUsed).toBe(200);
    expect(result.printHours).toBe(4);
    expect(result.material).toBeCloseTo(4);
    expect(result.electricity).toBeCloseTo(0.16);
    expect(result.total).toBeCloseTo(15.16);
  });

  it("forecasts printer load and material shortage from active jobs", () => {
    const result = calculateProductionMetrics(
      [job],
      [design],
      [printer],
      [spool],
      { ...fallbackSettings, productionHoursPerDay: 8 },
    );

    expect(result.totalQueueHours).toBe(4);
    expect(result.unassignedJobs).toBe(0);
    expect(result.filamentNeededGrams).toBe(200);
    expect(result.filamentDemand[0].shortageGrams).toBe(50);
  });
});
