import { describe, expect, it } from "vitest";
import {
  buildBastionAlerts,
  dedupeBastionAlerts,
  type BastionAlert,
} from "./alertBus";

function sampleAlert(overrides: Partial<BastionAlert> = {}): BastionAlert {
  return {
    id: "alert-1",
    eventId: "event-1",
    source: "Watcher",
    category: "system",
    severity: "attention",
    delivery: "notify",
    timestamp: "2026-09-04T12:00:00.000Z",
    title: "Sample alert",
    message: "Something needs review.",
    summary: "Something needs review.",
    evidence: ["sample evidence"],
    recommendedAction: "Inspect it.",
    allowedActions: ["inspect"],
    dedupeKey: "sample-condition",
    state: "active",
    ...overrides,
  };
}

function printer(id: string, name: string, status: "Available" | "Printing" | "Maintenance" | "Offline", activeJob = "") {
  return {
    id,
    name,
    model: name,
    status,
    buildVolume: "test",
    watts: 250,
    activeJob,
    notes: "",
  };
}

describe("Bastion Alert Bus", () => {
  it("deduplicates the same condition and keeps the highest-severity event", () => {
    const alerts = dedupeBastionAlerts([
      sampleAlert({ id: "older", severity: "attention" }),
      sampleAlert({ id: "critical", severity: "critical", timestamp: "2026-09-04T12:01:00.000Z" }),
    ]);

    expect(alerts).toHaveLength(1);
    expect(alerts[0].id).toBe("critical");
    expect(alerts[0].severity).toBe("critical");
  });

  it("produces actionable service evidence instead of a title-only notification", () => {
    const alerts = buildBastionAlerts({}, {
      sampledAt: "2026-09-04T12:00:00.000Z",
      services: [{
        id: "openclaw",
        name: "OpenClaw",
        kind: "automation",
        description: "Foundry maintenance worker",
        commissioningState: "active",
        runtimeState: "failed",
        enabled: true,
        dependencies: ["foundry-domain"],
      }],
      pendingApprovals: 0,
    });

    const serviceAlert = alerts.find((item) => item.affectedEntity === "openclaw");
    expect(serviceAlert?.severity).toBe("critical");
    expect(serviceAlert?.evidence).toContain("Runtime: failed");
    expect(serviceAlert?.allowedActions).toContain("request-service-restart");
    expect(serviceAlert?.dedupeKey).toBe("service:openclaw");
  });

  it("creates an approval-class alert with an inspection-first action", () => {
    const alerts = buildBastionAlerts({}, {
      sampledAt: "2026-09-04T12:00:00.000Z",
      pendingApprovals: 2,
    });

    const approval = alerts.find((item) => item.category === "approval");
    expect(approval?.severity).toBe("approval");
    expect(approval?.allowedActions).toEqual(["inspect-approval", "approve", "reject"]);
    expect(approval?.evidence).toContain("Pending approvals: 2");
  });

  it("does not alert when out-of-service printers remain offline", () => {
    const alerts = buildBastionAlerts({
      printers: [
        printer("PR1", "Neptune 4 Max", "Offline"),
        printer("PR2", "Kobra 3 Combo", "Offline"),
      ],
    }, { sampledAt: "2026-09-04T12:00:00.000Z" });

    expect(alerts.filter((item) => item.category === "printer")).toEqual([]);
  });

  it("flags the always-on S1 Max when it unexpectedly goes offline", () => {
    const alerts = buildBastionAlerts({
      printers: [printer("PR-KOBRA-S1-MAX-COMBO", "Kobra S1 Max Combo", "Offline")],
    }, { sampledAt: "2026-09-04T12:00:00.000Z" });

    const signal = alerts.find((item) => item.affectedEntity === "PR-KOBRA-S1-MAX-COMBO");
    expect(signal?.severity).toBe("attention");
    expect(signal?.message).toContain("expected to remain powered");
  });

  it("escalates an S1 Max disconnect during active production", () => {
    const alerts = buildBastionAlerts({
      printers: [printer("PR-KOBRA-S1-MAX-COMBO", "Kobra S1 Max Combo", "Offline", "Foundry production job")],
    }, { sampledAt: "2026-09-04T12:00:00.000Z" });

    const signal = alerts.find((item) => item.affectedEntity === "PR-KOBRA-S1-MAX-COMBO");
    expect(signal?.severity).toBe("critical");
    expect(signal?.evidence).toContain("Active job: Foundry production job");
  });

  it("flags stale workspace records that incorrectly mark an out-of-service printer available", () => {
    const alerts = buildBastionAlerts({
      printers: [printer("PR1", "Neptune 4 Max", "Printing", "Legacy seed job")],
    }, { sampledAt: "2026-09-04T12:00:00.000Z" });

    const signal = alerts.find((item) => item.affectedEntity === "PR1");
    expect(signal?.severity).toBe("attention");
    expect(signal?.message).toContain("expects it to remain out of service");
  });
});
