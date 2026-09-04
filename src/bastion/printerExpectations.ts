import type { PrinterRecord } from "../types/domain";

export type PrinterExpectedPower = "always-on" | "on-demand";
export type PrinterOperationalDisposition = "production-ready" | "out-of-service";

export type PrinterExpectedStateProfile = {
  printerId: string;
  controlPath: "Anycubic Next" | "Fluidd";
  expectedPower: PrinterExpectedPower;
  operationalDisposition: PrinterOperationalDisposition;
  reason?: string;
};

export type PrinterExpectationSignal = {
  printerId: string;
  severity: "info" | "attention" | "critical";
  title: string;
  summary: string;
  evidence: string[];
  recommendedAction: string;
};

/**
 * Operational expectations are deliberately separate from raw connectivity.
 * "Offline" only means fault when the machine is expected to be available.
 * These profiles reflect the current Foundry operating state and should be
 * updated when a repair/commissioning decision changes that state.
 */
export const FOUNDRY_PRINTER_EXPECTATIONS: Record<string, PrinterExpectedStateProfile> = {
  PR1: {
    printerId: "PR1",
    controlPath: "Fluidd",
    expectedPower: "on-demand",
    operationalDisposition: "out-of-service",
    reason: "Neptune 4 Max requires bed leveling and calibration before production use.",
  },
  "PR-KOBRA-S1-MAX-COMBO": {
    printerId: "PR-KOBRA-S1-MAX-COMBO",
    controlPath: "Anycubic Next",
    expectedPower: "always-on",
    operationalDisposition: "production-ready",
  },
  PR2: {
    printerId: "PR2",
    controlPath: "Anycubic Next",
    expectedPower: "on-demand",
    operationalDisposition: "out-of-service",
    reason: "Kobra 3 Combo requires installation of the replacement X-axis ribbon before production use.",
  },
};

export function evaluatePrinterExpectedState(printer: PrinterRecord): PrinterExpectationSignal | undefined {
  const profile = FOUNDRY_PRINTER_EXPECTATIONS[printer.id];
  if (!profile) return undefined;

  if (profile.operationalDisposition === "out-of-service") {
    if (printer.status === "Offline" || printer.status === "Maintenance") return undefined;
    return {
      printerId: printer.id,
      severity: "attention",
      title: `${printer.name} operational state needs reconciliation`,
      summary: `${printer.name} is recorded as ${printer.status}, but Bastion expects it to remain out of service until its repair/commissioning requirement is cleared.`,
      evidence: [
        `Workspace state: ${printer.status}`,
        `Expected state: out of service`,
        profile.reason ?? "An unresolved maintenance requirement is recorded for this printer.",
        `Native control path: ${profile.controlPath}`,
      ],
      recommendedAction: "Reconcile the printer record with its real repair state; do not route production to it until the requirement is cleared.",
    };
  }

  if (printer.status === "Offline" && profile.expectedPower === "always-on") {
    const activeProduction = Boolean(printer.activeJob?.trim());
    return {
      printerId: printer.id,
      severity: activeProduction ? "critical" : "attention",
      title: `${printer.name} unexpectedly offline`,
      summary: activeProduction
        ? `${printer.name} disappeared while an active job is recorded.`
        : `${printer.name} is expected to remain powered and available but is recorded offline.`,
      evidence: [
        `Expected power: always on`,
        `Workspace state: Offline`,
        activeProduction ? `Active job: ${printer.activeJob}` : "No active job is recorded.",
        `Native control path: ${profile.controlPath}`,
      ],
      recommendedAction: activeProduction
        ? "Inspect the active production job and printer connectivity immediately before taking recovery action."
        : "Confirm whether the printer was intentionally powered down; otherwise inspect its native control path and workstation connectivity.",
    };
  }

  if (printer.status === "Maintenance") {
    return {
      printerId: printer.id,
      severity: "attention",
      title: `${printer.name} is not production-ready`,
      summary: `${printer.name} is expected to be the active production printer but is currently marked for maintenance.`,
      evidence: ["Expected disposition: production ready", "Workspace state: Maintenance", `Native control path: ${profile.controlPath}`],
      recommendedAction: "Inspect the maintenance condition before assigning production.",
    };
  }

  return undefined;
}
