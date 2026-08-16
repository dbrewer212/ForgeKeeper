import { describe, expect, it } from "vitest";
import type { FilamentProfile, FilamentRecord, MaterialReservation } from "../types/domain";
import { calculateRemainingFromGross, materialTransaction, openingBalanceTransactions, purchaseList, summarizeMaterialProfiles, validateMaterialIntegrity } from "./materialOperations";

const profile: FilamentProfile = {
  id: "FP-1", brand: "Elegoo", productLine: "Rapid", material: "PLA+", colorName: "Black", colorFamily: "Black",
  diameterMm: 1.75, nominalWeightGrams: 1000, emptySpoolWeightGrams: 230, reorderPointGrams: 500,
  defaultSpoolPrice: 20, supplier: "Supplier", supplierSku: "SKU-1", notes: "", createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z",
};
const spool: FilamentRecord = {
  id: "SP-1", profileId: profile.id, foundrySpoolCode: "FF-SP-000001", brand: profile.brand, material: profile.material,
  colorName: profile.colorName, colorFamily: profile.colorFamily, gramsAvailable: 700, quantityConfidence: "Exact", condition: "Used",
  status: "In Stock", grossWeightGrams: 930, reorderPointGrams: 500, spoolPrice: 20, spoolWeightGrams: 1000,
  emptySpoolWeightGrams: 230, storageLocation: "Rack A", purchaseDate: "", lotNumber: "", dryingStatus: "Unknown", dryingHistory: "", notes: "",
  createdAt: "2026-08-10T00:00:00.000Z", updatedAt: "2026-08-10T00:00:00.000Z",
};

describe("material operations", () => {
  it("calculates exact remaining material from gross weight and tare", () => {
    expect(calculateRemainingFromGross(930, 230)).toBe(700);
    expect(calculateRemainingFromGross(200, 230)).toBe(0);
    expect(calculateRemainingFromGross(930)).toBeNull();
  });

  it("creates one deterministic opening balance per migrated spool", () => {
    const opening = openingBalanceTransactions([spool], []);
    expect(opening).toHaveLength(1);
    expect(opening[0]).toMatchObject({ id: "MTX-OPEN-SP-1", deltaGrams: 700, balanceAfterGrams: 700 });
    expect(openingBalanceTransactions([spool], opening)).toHaveLength(0);
  });

  it("records a correction without allowing a negative balance", () => {
    const result = materialTransaction(spool, "Correction", -5, "Scale correction");
    expect(result.spool).toMatchObject({ gramsAvailable: 0, status: "Empty", condition: "Empty" });
    expect(result.transaction).toMatchObject({ deltaGrams: -700, balanceAfterGrams: 0, reason: "Scale correction" });
  });

  it("aggregates reservations and reorder shortages by profile", () => {
    const reservations: MaterialReservation[] = [{ id: "RES-1", profileId: profile.id, spoolId: spool.id, grams: 300, status: "Active", purpose: "Order", createdAt: "" }];
    const summary = summarizeMaterialProfiles([profile], [spool], reservations)[0];
    expect(summary).toMatchObject({ physicalGrams: 700, reservedGrams: 300, availableGrams: 400, shortageGrams: 100 });
    expect(purchaseList([summary])[0].suggestedSpools).toBe(1);
  });

  it("detects tare mismatches and orphaned records", () => {
    const findings = validateMaterialIntegrity({ profiles: [], spools: [spool], transactions: [], reservations: [], dryingRecords: [] });
    expect(findings.map((finding) => finding.code)).toContain("ORPHANED_SPOOL");
  });
});
