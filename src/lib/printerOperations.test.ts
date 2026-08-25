import { describe, expect, it } from "vitest";
import type { PrinterRecord } from "../types/domain";
import { operationalPrinter, printerProductionSnapshot } from "./printerOperations";

function printer(overrides: Partial<PrinterRecord>): PrinterRecord {
  return {
    id: "PR-X",
    name: "Printer",
    model: "Printer",
    status: "Available",
    buildVolume: "250 x 250 x 250",
    watts: 250,
    activeJob: "",
    notes: "",
    ...overrides,
  };
}

describe("printer operational readiness", () => {
  it("treats Kobra S1 Max as the only current production-cleared canonical printer", () => {
    const snapshot = printerProductionSnapshot(printer({ id: "PR-KOBRA-S1-MAX-COMBO", name: "Kobra S1 Max Combo", model: "Anycubic Kobra S1 Max Combo" }));
    expect(snapshot.productionEligible).toBe(true);
    expect(snapshot.operationalState).toBe("AVAILABLE");
    expect(snapshot.expectedPowerState).toBe("ON");
    expect(snapshot.nativeControlPath).toBe("Anycubic Slicer Next");
  });

  it("blocks Neptune 4 Max until maintenance and calibration clearance", () => {
    const snapshot = printerProductionSnapshot(printer({ id: "PR1", name: "Neptune 4 Max", model: "Elegoo Neptune 4 Max" }));
    expect(snapshot.productionEligible).toBe(false);
    expect(snapshot.operationalState).toBe("MAINTENANCE_REQUIRED");
    expect(snapshot.expectedPowerState).toBe("OFF");
    expect(snapshot.nativeControlPath).toBe("Fluidd");
  });

  it("blocks Kobra 3 until its repair is completed", () => {
    const snapshot = printerProductionSnapshot(printer({ id: "PR2", name: "Kobra 3 Combo", model: "Anycubic Kobra 3 Combo" }));
    expect(snapshot.productionEligible).toBe(false);
    expect(snapshot.operationalState).toBe("REPAIR_REQUIRED");
    expect(snapshot.expectedPowerState).toBe("OFF");
  });

  it("does not automatically production-clear newly added unknown printers", () => {
    const snapshot = printerProductionSnapshot(printer({ name: "Future Printer", model: "Future Printer" }));
    expect(snapshot.productionEligible).toBe(false);
    expect(snapshot.productionClearance).toBe("BLOCKED");
  });

  it("preserves explicitly persisted operational fields over canonical defaults", () => {
    const legacy = printer({ id: "PR1", name: "Neptune 4 Max", model: "Elegoo Neptune 4 Max" }) as PrinterRecord & Record<string, unknown>;
    legacy.operationalState = "TESTING";
    legacy.connectivity = "ONLINE";
    legacy.productionClearance = "TESTING";
    const normalized = operationalPrinter(legacy as PrinterRecord);
    expect(normalized.operationalState).toBe("TESTING");
    expect(normalized.connectivity).toBe("ONLINE");
    expect(normalized.productionClearance).toBe("TESTING");
  });
});
