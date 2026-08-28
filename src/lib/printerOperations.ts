import type { PrinterRecord } from "../types/domain";

export type PrinterOperationalState =
  | "AVAILABLE"
  | "ACTIVE"
  | "EXPECTED_OFFLINE"
  | "MAINTENANCE_REQUIRED"
  | "REPAIR_REQUIRED"
  | "TESTING"
  | "OUT_OF_SERVICE"
  | "FAULT";

export type PrinterPowerExpectation = "ON" | "OFF" | "AS_NEEDED";
export type PrinterConnectivity = "ONLINE" | "OFFLINE" | "UNKNOWN";
export type PrinterProductionClearance = "CLEARED" | "BLOCKED" | "TESTING";

export type PrinterOperationalFields = {
  operationalState: PrinterOperationalState;
  expectedPowerState: PrinterPowerExpectation;
  connectivity: PrinterConnectivity;
  productionClearance: PrinterProductionClearance;
  nativeControlPath: string;
};

export type OperationalPrinterRecord = PrinterRecord & Partial<PrinterOperationalFields>;

export type PrinterProductionSnapshot = PrinterOperationalFields & {
  printerId: string;
  printerName: string;
  productionEligible: boolean;
  eligibilityReason: string;
};

function identity(printer: PrinterRecord): string {
  return `${printer.id} ${printer.name} ${printer.model}`.toLowerCase();
}

function canonicalDefaults(printer: PrinterRecord): PrinterOperationalFields {
  const value = identity(printer);

  if (value.includes("kobra s1 max")) {
    return {
      operationalState: "AVAILABLE",
      expectedPowerState: "ON",
      connectivity: "UNKNOWN",
      productionClearance: "CLEARED",
      nativeControlPath: "Anycubic Slicer Next",
    };
  }

  if (value.includes("neptune 4 max")) {
    return {
      operationalState: "MAINTENANCE_REQUIRED",
      expectedPowerState: "OFF",
      connectivity: "OFFLINE",
      productionClearance: "BLOCKED",
      nativeControlPath: "Fluidd",
    };
  }

  if (value.includes("kobra 3")) {
    return {
      operationalState: "REPAIR_REQUIRED",
      expectedPowerState: "OFF",
      connectivity: "OFFLINE",
      productionClearance: "BLOCKED",
      nativeControlPath: "Anycubic Slicer Next",
    };
  }

  return {
    operationalState: printer.status === "Printing" ? "ACTIVE" : printer.status === "Maintenance" ? "MAINTENANCE_REQUIRED" : printer.status === "Offline" ? "EXPECTED_OFFLINE" : "AVAILABLE",
    expectedPowerState: "AS_NEEDED",
    connectivity: printer.status === "Offline" ? "OFFLINE" : "UNKNOWN",
    productionClearance: "BLOCKED",
    nativeControlPath: "Unconfigured",
  };
}

export function operationalPrinter(printer: PrinterRecord): PrinterRecord & PrinterOperationalFields {
  const extended = printer as OperationalPrinterRecord;
  const defaults = canonicalDefaults(printer);
  return {
    ...printer,
    operationalState: extended.operationalState ?? defaults.operationalState,
    expectedPowerState: extended.expectedPowerState ?? defaults.expectedPowerState,
    connectivity: extended.connectivity ?? defaults.connectivity,
    productionClearance: extended.productionClearance ?? defaults.productionClearance,
    nativeControlPath: extended.nativeControlPath?.trim() || defaults.nativeControlPath,
  };
}

export function printerProductionSnapshot(printer: PrinterRecord): PrinterProductionSnapshot {
  const normalized = operationalPrinter(printer);
  const stateAllowsProduction = normalized.operationalState === "AVAILABLE" || normalized.operationalState === "ACTIVE";
  const connectivityAllowsProduction = normalized.connectivity !== "OFFLINE";
  const productionEligible = normalized.productionClearance === "CLEARED" && stateAllowsProduction && connectivityAllowsProduction;

  let eligibilityReason = "Production cleared and operational.";
  if (normalized.productionClearance !== "CLEARED") eligibilityReason = `Production clearance is ${normalized.productionClearance}.`;
  else if (!stateAllowsProduction) eligibilityReason = `Operational state ${normalized.operationalState} is not production-capable.`;
  else if (!connectivityAllowsProduction) eligibilityReason = "Printer is explicitly offline.";

  return {
    printerId: normalized.id,
    printerName: normalized.name,
    operationalState: normalized.operationalState,
    expectedPowerState: normalized.expectedPowerState,
    connectivity: normalized.connectivity,
    productionClearance: normalized.productionClearance,
    nativeControlPath: normalized.nativeControlPath,
    productionEligible,
    eligibilityReason,
  };
}

export function isPrinterProductionEligible(printer: PrinterRecord): boolean {
  return printerProductionSnapshot(printer).productionEligible;
}

/**
 * Printer operational fields are persisted in existing workspace JSON/SQLite records.
 * The legacy PrinterRecord type intentionally remains readable while older workspaces
 * are migrated in place; this helper keeps the compatibility cast isolated here.
 */
export function printerOperationalPatch(patch: Partial<PrinterOperationalFields>): Partial<PrinterRecord> {
  return patch as unknown as Partial<PrinterRecord>;
}
