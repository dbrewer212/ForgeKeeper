import { describe, expect, it } from "vitest";
import { legacySeedFilament, legacySeedOrders } from "../data/seed";
import {
  cleanLegacyOrderAndVariantLinks,
  createPhysicalSpools,
  migrateFilamentInventory,
  parseFilamentCsv,
} from "./filamentInventory";
import type { FilamentProfile, FilamentRecord, OrderRecord } from "../types/domain";

describe("filament census migration", () => {
  it("removes only exact fictional seed spools", () => {
    const result = migrateFilamentInventory(legacySeedFilament, []);
    expect(result.spools).toEqual([]);
    expect(result.profiles).toEqual([]);
    expect(result.removedPlaceholderSpoolIds).toEqual(["F1", "F2", "F3"]);
  });

  it("preserves and upgrades an edited legacy spool", () => {
    const edited = { ...legacySeedFilament[0], gramsAvailable: 700 };
    const result = migrateFilamentInventory([edited], []);
    expect(result.removedPlaceholderSpoolIds).toEqual([]);
    expect(result.profiles).toHaveLength(1);
    expect(result.spools).toHaveLength(1);
    expect(result.spools[0]).toMatchObject({ id: "F1", gramsAvailable: 700, quantityConfidence: "Estimated", condition: "Used" });
    expect(result.spools[0].foundrySpoolCode).toMatch(/^FF-SP-\d{6}$/);
  });

  it("does not let old backups restore fictional orders or dangling spool links", () => {
    const customOrder = { ...legacySeedOrders[0], id: "ORD-REAL", customer: "Real customer" } as OrderRecord;
    const result = cleanLegacyOrderAndVariantLinks([...legacySeedOrders, customOrder], [], ["F1", "F2", "F3"]);
    expect(result.orders).toHaveLength(1);
    expect(result.orders[0].id).toBe("ORD-REAL");
    expect(result.orders[0].filamentId).toBeUndefined();
  });
});

describe("physical spool creation", () => {
  const profile: FilamentProfile = {
    id: "FP-1", brand: "Elegoo", productLine: "Rapid PLA+", material: "PLA+", colorName: "Black", colorFamily: "Black",
    diameterMm: 1.75, nominalWeightGrams: 1000, emptySpoolWeightGrams: 230, reorderPointGrams: 250, defaultSpoolPrice: 20,
    notes: "", createdAt: "2026-08-09T00:00:00.000Z", updatedAt: "2026-08-09T00:00:00.000Z",
  };

  it("assigns unique sequential Foundry spool IDs", () => {
    const existing = [{ foundrySpoolCode: "FF-SP-000008" }] as FilamentRecord[];
    const created = createPhysicalSpools(profile, [
      { condition: "Sealed", quantityConfidence: "Nominal", gramsAvailable: 1000 },
      { condition: "Used", quantityConfidence: "Exact", gramsAvailable: 512, grossWeightGrams: 742 },
    ], existing);
    expect(created.map((spool) => spool.foundrySpoolCode)).toEqual(["FF-SP-000009", "FF-SP-000010"]);
    expect(created[1]).toMatchObject({ profileId: "FP-1", gramsAvailable: 512, grossWeightGrams: 742 });
  });
});

describe("CSV census parser", () => {
  it("preserves quoted commas and multiple rows", () => {
    const rows = parseFilamentCsv('brand,colorName,notes\nElegoo,Black,"Shelf A, top"\nOverture,Gray,Open');
    expect(rows).toEqual([
      { brand: "Elegoo", colorName: "Black", notes: "Shelf A, top" },
      { brand: "Overture", colorName: "Gray", notes: "Open" },
    ]);
  });
});
