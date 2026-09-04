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
        description: "Foundry maintenance worker",
        commissioningState: "active",
        runtimeState: "failed",
        startMode: "manual",
        managed: true,
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
});
