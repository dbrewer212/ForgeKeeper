import { getKeeperAlerts } from "../lib/keeper/keeperAlerts";
import type { ServiceDescriptor } from "../mesh/serviceRegistry";
import type { SystemHealth } from "../mesh/types";

export type BastionAlertSeverity = "routine" | "info" | "attention" | "approval" | "critical" | "emergency";
export type BastionAlertDelivery = "in-app" | "notify" | "urgent" | "approval";
export type BastionAlertState = "active" | "acknowledged" | "resolved";

export type BastionAlert = {
  id: string;
  eventId: string;
  source: string;
  category: "workspace" | "service" | "system" | "approval" | "production" | "material" | "printer";
  severity: BastionAlertSeverity;
  delivery: BastionAlertDelivery;
  timestamp: string;
  affectedEntity?: string;
  title: string;
  message: string;
  summary: string;
  evidence: string[];
  recommendedAction?: string;
  allowedActions: string[];
  correlationId?: string;
  expiresAt?: string;
  dedupeKey: string;
  state: BastionAlertState;
  relatedRecordId?: string;
};

export type BastionAlertSnapshot = {
  sampledAt?: string;
  health?: SystemHealth;
  safeMode?: boolean;
  services?: ServiceDescriptor[];
  pendingApprovals?: number;
};

type AlertSeed = Omit<BastionAlert, "eventId" | "timestamp" | "summary" | "evidence" | "allowedActions" | "dedupeKey" | "state"> & Partial<Pick<BastionAlert,
  "eventId" | "timestamp" | "summary" | "evidence" | "allowedActions" | "dedupeKey" | "state"
>>;

function alert(seed: AlertSeed, fallbackTimestamp: string): BastionAlert {
  return {
    ...seed,
    eventId: seed.eventId ?? seed.id,
    timestamp: seed.timestamp ?? fallbackTimestamp,
    summary: seed.summary ?? seed.message,
    evidence: seed.evidence ?? [],
    allowedActions: seed.allowedActions ?? [],
    dedupeKey: seed.dedupeKey ?? seed.id,
    state: seed.state ?? "active",
  };
}

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

export function dedupeBastionAlerts(alerts: BastionAlert[]): BastionAlert[] {
  const unique = new Map<string, BastionAlert>();
  for (const candidate of alerts) {
    const current = unique.get(candidate.dedupeKey);
    if (!current || rank(candidate.severity) > rank(current.severity) || candidate.timestamp > current.timestamp) {
      unique.set(candidate.dedupeKey, candidate);
    }
  }
  return [...unique.values()].sort((left, right) => {
    const severityDelta = rank(right.severity) - rank(left.severity);
    return severityDelta !== 0 ? severityDelta : right.timestamp.localeCompare(left.timestamp);
  });
}

export function buildBastionAlerts(state: any, snapshot?: BastionAlertSnapshot): BastionAlert[] {
  const alerts: BastionAlert[] = [];
  const sampledAt = snapshot?.sampledAt ?? snapshot?.health?.updatedAt ?? new Date().toISOString();

  if (state?.storageStatus === "Error") {
    alerts.push(alert({
      id: "bastion-storage-fault",
      source: "Forgekeeper",
      category: "system",
      severity: "critical",
      delivery: "urgent",
      affectedEntity: "workspace-storage",
      title: "Workspace storage fault",
      message: state.storageError || "Forgekeeper could not initialize native workspace storage.",
      evidence: state.storageError ? [String(state.storageError)] : [],
      recommendedAction: "Inspect the SQLite workspace failure before allowing state-changing Foundry work.",
      allowedActions: ["inspect-storage", "enter-safe-mode"],
      correlationId: "workspace-storage",
    }, sampledAt));
  }

  for (const keeperAlert of getKeeperAlerts(state)) {
    const severity: BastionAlertSeverity = keeperAlert.severity === "critical"
      ? "critical"
      : keeperAlert.severity === "warning"
        ? "attention"
        : keeperAlert.severity === "opportunity"
          ? "routine"
          : "info";
    const category: BastionAlert["category"] = keeperAlert.section === "filament"
      ? "material"
      : keeperAlert.section === "printers"
        ? "printer"
        : keeperAlert.section === "orders"
          ? "production"
          : "workspace";
    alerts.push(alert({
      id: `keeper:${keeperAlert.id}`,
      source: "Forgekeeper",
      category,
      severity,
      delivery: severity === "critical" ? "urgent" : severity === "attention" ? "notify" : "in-app",
      affectedEntity: keeperAlert.relatedRecordId,
      title: keeperAlert.title,
      message: keeperAlert.message,
      evidence: [keeperAlert.message],
      recommendedAction: keeperAlert.suggestedActionId,
      allowedActions: keeperAlert.suggestedActionId ? [keeperAlert.suggestedActionId] : [],
      relatedRecordId: keeperAlert.relatedRecordId,
      correlationId: keeperAlert.relatedRecordId,
      dedupeKey: `keeper:${keeperAlert.id}`,
    }, sampledAt));
  }

  if (snapshot?.safeMode) {
    alerts.push(alert({
      id: "bastion-safe-mode",
      source: "Bastion",
      category: "system",
      severity: "critical",
      delivery: "urgent",
      affectedEntity: "foundry-execution",
      title: "Foundry Safe Mode active",
      message: "Autonomous execution admission is restricted until an authorized operator releases Safe Mode.",
      evidence: snapshot.health?.safeModeReason ? [snapshot.health.safeModeReason] : [],
      recommendedAction: "Inspect the triggering condition before releasing Safe Mode.",
      allowedActions: ["inspect", "exit-safe-mode"],
      correlationId: "safe-mode",
    }, sampledAt));
  }

  if (snapshot?.health && ["critical", "safe-mode"].includes(snapshot.health.state)) {
    alerts.push(alert({
      id: `bastion-health:${snapshot.health.state}`,
      source: "Bastion",
      category: "system",
      severity: snapshot.health.state === "critical" ? "emergency" : "critical",
      delivery: "urgent",
      affectedEntity: "foundry-health",
      title: `Foundry health: ${snapshot.health.state}`,
      message: snapshot.health.summary,
      timestamp: snapshot.health.updatedAt,
      evidence: [
        ...snapshot.health.criticalWorkers.map((worker) => `Critical worker: ${worker}`),
        ...snapshot.health.degradedWorkers.map((worker) => `Degraded worker: ${worker}`),
      ],
      recommendedAction: "Inspect affected workers and keep unsafe execution restricted until the health condition is understood.",
      allowedActions: ["inspect-workers", "enter-safe-mode"],
      correlationId: `health:${snapshot.health.state}`,
    }, sampledAt));
  } else if (snapshot?.health?.state === "degraded") {
    alerts.push(alert({
      id: "bastion-health:degraded",
      source: "Bastion",
      category: "system",
      severity: "attention",
      delivery: "notify",
      affectedEntity: "foundry-health",
      title: "Foundry health degraded",
      message: snapshot.health.summary,
      timestamp: snapshot.health.updatedAt,
      evidence: snapshot.health.degradedWorkers.map((worker) => `Degraded worker: ${worker}`),
      recommendedAction: "Inspect degraded workers before escalating automation or production load.",
      allowedActions: ["inspect-workers"],
      correlationId: "health:degraded",
    }, sampledAt));
  }

  for (const service of snapshot?.services ?? []) {
    if (service.runtimeState !== "degraded" && service.runtimeState !== "failed") continue;
    alerts.push(alert({
      id: `service:${service.id}:${service.runtimeState}`,
      source: service.name,
      category: "service",
      severity: service.runtimeState === "failed" ? "critical" : "attention",
      delivery: service.runtimeState === "failed" ? "urgent" : "notify",
      affectedEntity: service.id,
      title: `${service.name} ${service.runtimeState}`,
      message: `Bastion reports ${service.name} is ${service.runtimeState}. Inspect the service before restoring normal operation.`,
      evidence: [`Commissioning: ${service.commissioningState}`, `Runtime: ${service.runtimeState}`],
      recommendedAction: "Inspect or probe the managed service before any governed restart/start decision.",
      allowedActions: ["probe-service", "inspect-service", "request-service-restart"],
      relatedRecordId: service.id,
      correlationId: `service:${service.id}`,
      dedupeKey: `service:${service.id}`,
    }, sampledAt));
  }

  if ((snapshot?.pendingApprovals ?? 0) > 0) {
    alerts.push(alert({
      id: "bastion-pending-approvals",
      source: "Foundry Mesh",
      category: "approval",
      severity: "approval",
      delivery: "approval",
      affectedEntity: "approval-inbox",
      title: "Operator approval required",
      message: `${snapshot?.pendingApprovals ?? 0} governed Foundry action${snapshot?.pendingApprovals === 1 ? " is" : "s are"} awaiting operator authority.`,
      evidence: [`Pending approvals: ${snapshot?.pendingApprovals ?? 0}`],
      recommendedAction: "Inspect each request, its evidence, risk, and affected resources before deciding.",
      allowedActions: ["inspect-approval", "approve", "reject"],
      correlationId: "pending-approvals",
    }, sampledAt));
  }

  return dedupeBastionAlerts(alerts);
}
