import { describe, expect, it } from "vitest";
import { hydrateDataFrom } from "../state/useForgekeeperState";
import type { FilamentRecord } from "../types/domain";

describe("ForgeKeeper 0.1.4 to 0.2.0 material migration", () => {
  it("preserves FF-SP-000001 and creates its opening ledger exactly once", () => {
    const spool: FilamentRecord = {
      id: "FIL-REAL-1", profileId: "FP-REAL-1", foundrySpoolCode: "FF-SP-000001", brand: "Elegoo", material: "PLA+",
      colorName: "Black", colorFamily: "Black", gramsAvailable: 620, quantityConfidence: "Exact", condition: "Used", status: "In Stock",
      grossWeightGrams: 850, reorderPointGrams: 250, spoolPrice: 20, spoolWeightGrams: 1000, emptySpoolWeightGrams: 230,
      storageLocation: "Rack A", purchaseDate: "2026-08-10", lotNumber: "LOT-1", dryingStatus: "Unknown", dryingHistory: "", notes: "Physical spool",
      createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z",
    };
    const legacyProfile = {
      id: "FP-REAL-1", brand: "Elegoo", productLine: "Rapid PLA+", material: "PLA+", colorName: "Black", colorFamily: "Black",
      diameterMm: 1.75, nominalWeightGrams: 1000, emptySpoolWeightGrams: 230, reorderPointGrams: 250, defaultSpoolPrice: 20,
      notes: "", createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z",
    };
    const first = hydrateDataFrom({ filament: [spool], filamentProfiles: [legacyProfile] } as never);
    expect(first.filament).toHaveLength(1);
    expect(first.filament[0]).toMatchObject({ foundrySpoolCode: "FF-SP-000001", gramsAvailable: 620 });
    expect(first.filamentProfiles[0]).toMatchObject({ supplier: "", supplierSku: "" });
    expect(first.materialTransactions.filter((entry) => entry.spoolId === spool.id && entry.type === "Opening Balance")).toHaveLength(1);

    const second = hydrateDataFrom(first);
    expect(second.materialTransactions.filter((entry) => entry.spoolId === spool.id && entry.type === "Opening Balance")).toHaveLength(1);
  });
});
