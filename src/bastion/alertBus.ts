import { getKeeperAlerts } from "../lib/keeper/keeperAlerts";
import type { ServiceDescriptor } from "../mesh/serviceRegistry";
import type { SystemHealth } from "../mesh/types";

export type BastionAlertSeverity = "routine" | "info" | "attention" | "approval" | "critical" | "emergency";
export type BastionAlertDelivery = "in-app" | "notify" | "urgent" | "approval";

export type BastionAlert = {
  id: string;
  source: string;
  category: "workspace" | "service" | "system" | "approval" | "production" | "material" | "printer";
  severity: BastionAlertSeverity;
  delivery: BastionAlertDelivery;
  title: string;
  message: string;
  relatedRecordId?: string;
};

export type BastionAlertSnapshot = {
  health?: SystemHealth;
  safeMode?: boolean;
  services?: ServiceDescriptor[];
  pendingApprovals?: number;
};

function rank(severity: BastionAlertSeverity): number {
  return {
    routine: 0,
    info: 1,
    attention: 2,
    approval: 3,
    critical: 4,
    emergency: 5,
  }[severity];
}

export function buildBastionAlerts(state: any, snapshot?: BastionAlertSnapshot): BastionAlert[] {
  const alerts: BastionAlert[] = [];

  if (state?.storageStatus === "Error") {
    alerts.push({
      id: "bastion-storage-fault",
      source: "Forgekeeper",
      category: "system",
      severity: "critical",
      delivery: "urgent",
      title: "Workspace storage fault",
      message: state.storageError || "Forgekeeper could not initialize native workspace storage.",
    });
  }

  for (const alert of getKeeperAlerts(state)) {
    const severity: BastionAlertSeverity = alert.severity === "critical"
      ? "critical"
      : alert.severity === "warning"
        ? "attention"
        : alert.severity === "opportunity"
          ? "routine"
          : "info";
    const category: BastionAlert["category"] = alert.section === "filament"
      ? "material"
      : alert.section === "printers"
        ? "printer"
        : alert.section === "orders"
          ? "production"
          : "workspace";
    alerts.push({
      id: `keeper:${alert.id}`,
      source: "Forgekeeper",
      category,
      severity,
      delivery: severity === "critical" ? "urgent" : severity === "attention" ? "notify" : "in-app",
      title: alert.title,
      message: alert.message,
      relatedRecordId: alert.relatedRecordId,
    });
  }

  if (snapshot?.safeMode) {
    alerts.push({
      id: "bastion-safe-mode",
      source: "Bastion",
      category: "system",
      severity: "critical",
      delivery: "urgent",
      title: "Foundry Safe Mode active",
      message: "Autonomous execution admission is restricted until an authorized operator releases Safe Mode.",
    });
  }

  if (snapshot?.health && ["critical", "safe-mode"].includes(snapshot.health.state)) {
    alerts.push({
      id: `bastion-health:${snapshot.health.state}`,
      source: "Bastion",
      category: "system",
      severity: snapshot.health.state === "critical" ? "emergency" : "critical",
      delivery: "urgent",
      title: `Foundry health: ${snapshot.health.state}`,
      message: snapshot.health.summary,
    });
  } else if (snapshot?.health?.state === "degraded") {
    alerts.push({
      id: "bastion-health:degraded",
      source: "Bastion",
      category: "system",
      severity: "attention",
      delivery: "notify",
      title: "Foundry health degraded",
      message: snapshot.health.summary,
    });
  }

  for (const service of snapshot?.services ?? []) {
    if (service.runtimeState !== "degraded" && service.runtimeState !== "failed") continue;
    alerts.push({
      id: `service:${service.id}:${service.runtimeState}`,
      source: service.name,
      category: "service",
      severity: service.runtimeState === "failed" ? "critical" : "attention",
      delivery: service.runtimeState === "failed" ? "urgent" : "notify",
      title: `${service.name} ${service.runtimeState}`,
      message: `Bastion reports ${service.name} is ${service.runtimeState}. Inspect the service before restoring normal operation.`,
      relatedRecordId: service.id,
    });
  }

  if ((snapshot?.pendingApprovals ?? 0) > 0) {
    alerts.push({
      id: "bastion-pending-approvals",
      source: "Foundry Mesh",
      category: "approval",
      severity: "approval",
      delivery: "approval",
      title: "Operator approval required",
      message: `${snapshot?.pendingApprovals ?? 0} governed Foundry action${snapshot?.pendingApprovals === 1 ? " is" : "s are"} awaiting operator authority.`,
    });
  }

  const unique = new Map(alerts.map((alert) => [alert.id, alert]));
  return [...unique.values()].sort((left, right) => rank(right.severity) - rank(left.severity));
}
