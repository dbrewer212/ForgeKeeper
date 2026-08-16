import { MeshCapabilities } from "./catalog";
import { InMemoryResourceBroker } from "./resourceBroker";
import type { FoundryMeshRuntime } from "./runtime";
import type { ResourceRequest, ResourceState } from "./types";

export type VerificationStatus = "pass" | "warn" | "fail" | "skip";

export interface VerificationCheck {
  id: string;
  category: "core" | "governance" | "resource" | "persistence" | "service" | "failure" | "live-probe";
  status: VerificationStatus;
  summary: string;
  detail?: string;
  subjectId?: string;
}

export interface CommissioningVerificationOptions {
  liveProbes?: boolean;
}

export interface CommissioningVerificationReport {
  generatedAt: string;
  architectureHealthy: boolean;
  liveProbesRequested: boolean;
  counts: Record<VerificationStatus, number>;
  readiness: ReturnType<FoundryMeshRuntime["diagnostics"]["report"]>;
  checks: VerificationCheck[];
}

export async function runCommissioningVerification(
  runtime: FoundryMeshRuntime,
  options: CommissioningVerificationOptions = {},
): Promise<CommissioningVerificationReport> {
  const checks: VerificationCheck[] = [];
  const readiness = runtime.diagnostics.report();

  verifyCore(runtime, checks);
  verifyGovernance(runtime, checks);
  await verifyPersistence(runtime, checks);
  verifyServiceStructure(runtime, checks);
  verifyFailureContainment(runtime, checks);
  verifyResourceBrokerSimulations(checks);

  if (options.liveProbes) {
    await verifyLiveProbes(runtime, checks);
  } else {
    checks.push({
      id: "live-probes.skipped",
      category: "live-probe",
      status: "skip",
      summary: "Live localhost service probes were not requested.",
    });
  }

  const counts: Record<VerificationStatus, number> = { pass: 0, warn: 0, fail: 0, skip: 0 };
  for (const check of checks) counts[check.status] += 1;

  return {
    generatedAt: new Date().toISOString(),
    architectureHealthy: counts.fail === 0,
    liveProbesRequested: Boolean(options.liveProbes),
    counts,
    readiness,
    checks,
  };
}

function verifyCore(runtime: FoundryMeshRuntime, checks: VerificationCheck[]): void {
  const core = runtime.workers.get("foundry-core");
  const coreHealthy =
    Boolean(core) &&
    core?.identity.enabled === true &&
    (core.identity.commissioningState ?? "active") === "active";

  checks.push({
    id: "core.foundry-core-active",
    category: "core",
    status: coreHealthy ? "pass" : "fail",
    summary: coreHealthy
      ? "Foundry Core is registered, enabled, and active."
      : "Foundry Core is not in its required active authority state.",
  });

  const resourceGateConsistent = runtime.isSafeMode() !== runtime.resources.isAdmissionEnabled();
  checks.push({
    id: "core.safe-mode-resource-gate",
    category: "core",
    status: resourceGateConsistent ? "pass" : "fail",
    summary: resourceGateConsistent
      ? "Safe Mode and Resource Broker admission state agree."
      : "Safe Mode and Resource Broker admission state disagree.",
    detail: `safeMode=${runtime.isSafeMode()} admissionEnabled=${runtime.resources.isAdmissionEnabled()}`,
  });

  if (runtime.isSafeMode()) {
    const pending = runtime.resources.listPendingRequests();
    checks.push({
      id: "core.safe-mode-no-pending-resource-work",
      category: "core",
      status: pending.length === 0 ? "pass" : "fail",
      summary:
        pending.length === 0
          ? "Safe Mode contains no queued resource requests."
          : "Safe Mode still contains queued resource requests.",
      detail: pending.length ? pending.map((entry) => entry.request.id).join(", ") : undefined,
    });
  }
}

function verifyGovernance(runtime: FoundryMeshRuntime, checks: VerificationCheck[]): void {
  const requiredApprovals = [
    [MeshCapabilities.foundryCanonWrite, "canon-write"],
    [MeshCapabilities.meshManageWorker, "worker-management"],
    [MeshCapabilities.meshEnterSafeMode, "enter-safe-mode"],
    [MeshCapabilities.meshExitSafeMode, "exit-safe-mode"],
  ] as const;

  const rules = runtime.permissions.listRules();
  for (const [capabilityId, label] of requiredApprovals) {
    const matching = rules.filter((rule) => rule.capabilityId === capabilityId);
    const protectedByApproval = matching.some((rule) => rule.effect === "approval-required");
    checks.push({
      id: `governance.${label}`,
      category: "governance",
      status: protectedByApproval ? "pass" : "fail",
      summary: protectedByApproval
        ? `${capabilityId} retains an approval-required policy boundary.`
        : `${capabilityId} is missing its approval-required policy boundary.`,
    });
  }
}

async function verifyPersistence(runtime: FoundryMeshRuntime, checks: VerificationCheck[]): Promise<void> {
  try {
    await runtime.persistence.readRecentEvents(1);
    checks.push({
      id: "persistence.event-journal-readable",
      category: "persistence",
      status: "pass",
      summary: "Mesh event journal is readable through the configured persistence provider.",
    });
  } catch (error) {
    checks.push({
      id: "persistence.event-journal-readable",
      category: "persistence",
      status: "fail",
      summary: "Mesh event journal could not be read.",
      detail: error instanceof Error ? error.message : String(error),
    });
  }

  const domain = runtime.domainState.snapshot();
  checks.push({
    id: "persistence.domain-schema",
    category: "persistence",
    status: domain.schemaVersion === 1 ? "pass" : "fail",
    summary:
      domain.schemaVersion === 1
        ? "Foundry domain state uses the supported durable schema."
        : `Foundry domain state reported unsupported schema ${String(domain.schemaVersion)}.`,
  });
}

function verifyServiceStructure(runtime: FoundryMeshRuntime, checks: VerificationCheck[]): void {
  for (const service of runtime.services.list()) {
    const missingDependencies = service.dependencies.filter((dependencyId) => !runtime.services.get(dependencyId));
    checks.push({
      id: `service.${service.id}.dependencies`,
      category: "service",
      status: missingDependencies.length === 0 ? "pass" : "fail",
      subjectId: service.id,
      summary:
        missingDependencies.length === 0
          ? `${service.name} references only registered service dependencies.`
          : `${service.name} references missing service dependencies.`,
      detail: missingDependencies.length ? missingDependencies.join(", ") : undefined,
    });

    if (service.adapterRequired === false) continue;

    const adapterRegistered = runtime.serviceLifecycle.hasAdapter(service.id);
    if (!adapterRegistered) {
      checks.push({
        id: `service.${service.id}.adapter`,
        category: "service",
        status: "warn",
        subjectId: service.id,
        summary: `${service.name} has no runtime adapter registered yet.`,
      });
      continue;
    }

    const issues = runtime.serviceLifecycle.validationIssues(service.id);
    checks.push({
      id: `service.${service.id}.adapter`,
      category: "service",
      status: issues.length === 0 ? "pass" : "warn",
      subjectId: service.id,
      summary:
        issues.length === 0
          ? `${service.name} adapter is structurally configured for commissioning.`
          : `${service.name} adapter is staged but still needs configuration.`,
      detail: issues.length ? issues.join(" ") : undefined,
    });
  }
}

function verifyFailureContainment(runtime: FoundryMeshRuntime, checks: VerificationCheck[]): void {
  for (const worker of runtime.workers.list()) {
    const failed = worker.status.state === "failed" || worker.status.health === "critical";
    if (!failed) continue;

    const heldLeases = runtime.resources.listWorkerLeases(worker.identity.id);
    const pending = runtime.resources
      .listPendingRequests()
      .filter((entry) => entry.request.requesterWorkerId === worker.identity.id);

    checks.push({
      id: `failure.${worker.identity.id}.pending-cleared`,
      category: "failure",
      subjectId: worker.identity.id,
      status: pending.length === 0 ? "pass" : "fail",
      summary:
        pending.length === 0
          ? `${worker.identity.name} has no queued resource work after failure.`
          : `${worker.identity.name} still has queued resource work after failure.`,
      detail: pending.length ? pending.map((entry) => entry.request.id).join(", ") : undefined,
    });

    if (heldLeases.length > 0) {
      checks.push({
        id: `failure.${worker.identity.id}.held-leases`,
        category: "failure",
        subjectId: worker.identity.id,
        status: "warn",
        summary: `${worker.identity.name} has active leases intentionally held for explicit cleanup or expiry.`,
        detail: heldLeases.map((lease) => `${lease.id}:${lease.resourceId}`).join(", "),
      });
    }
  }
}

function verifyResourceBrokerSimulations(checks: VerificationCheck[]): void {
  const now = new Date().toISOString();

  const capacityBroker = new InMemoryResourceBroker();
  capacityBroker.updateState(testResource("verify-capacity", 10, now));
  const first = capacityBroker.admit(testRequest("cap-1", "verify-capacity", 6), false);
  const queued = capacityBroker.admit(testRequest("cap-2", "verify-capacity", 5), true);
  const capacityBehavior = Boolean(first.lease) && !queued.granted && queued.queued;
  checks.push({
    id: "resource.capacity-and-queue",
    category: "resource",
    status: capacityBehavior ? "pass" : "fail",
    summary: capacityBehavior
      ? "Capacity limits reject and queue work that would overcommit the resource."
      : "Capacity or queue admission simulation failed.",
  });

  if (first.lease) capacityBroker.release(first.lease.id);
  const drained = capacityBroker.drainPending("verify-capacity");
  checks.push({
    id: "resource.queue-drain",
    category: "resource",
    status: drained.some((admission) => admission.request.id === "cap-2" && admission.granted) ? "pass" : "fail",
    summary: drained.some((admission) => admission.request.id === "cap-2" && admission.granted)
      ? "Queued work is admitted after capacity is released."
      : "Queued work did not drain after capacity became available.",
  });

  const exclusiveBroker = new InMemoryResourceBroker();
  exclusiveBroker.updateState(testResource("verify-exclusive", 10, now));
  const exclusive = exclusiveBroker.admit({ ...testRequest("exclusive-1", "verify-exclusive", 1), exclusive: true }, false);
  const blocked = exclusiveBroker.admit(testRequest("exclusive-2", "verify-exclusive", 1), false);
  checks.push({
    id: "resource.exclusive-lease",
    category: "resource",
    status: exclusive.granted && !blocked.granted ? "pass" : "fail",
    summary:
      exclusive.granted && !blocked.granted
        ? "Exclusive leases prevent concurrent allocation."
        : "Exclusive lease simulation failed.",
  });

  const safeBroker = new InMemoryResourceBroker();
  safeBroker.updateState(testResource("verify-safe", 10, now));
  safeBroker.setAdmissionEnabled(false, "verification pause");
  const paused = safeBroker.admit(testRequest("safe-1", "verify-safe", 1), true);
  checks.push({
    id: "resource.admission-pause",
    category: "resource",
    status: !paused.granted && !paused.queued ? "pass" : "fail",
    summary:
      !paused.granted && !paused.queued
        ? "Admission pause rejects new work without queuing it for automatic replay."
        : "Admission pause simulation allowed or queued work unexpectedly.",
  });

  const expiryBroker = new InMemoryResourceBroker();
  expiryBroker.updateState(testResource("verify-expiry", 10, now));
  const expiring = expiryBroker.admit({ ...testRequest("expiry-1", "verify-expiry", 1), leaseDurationMs: 1 }, false);
  const expired = expiryBroker.purgeExpired(new Date(Date.now() + 5_000));
  checks.push({
    id: "resource.lease-expiry",
    category: "resource",
    status: Boolean(expiring.lease) && expired.some((lease) => lease.requestId === "expiry-1") ? "pass" : "fail",
    summary:
      Boolean(expiring.lease) && expired.some((lease) => lease.requestId === "expiry-1")
        ? "Expired leases are purged deterministically."
        : "Lease expiry simulation failed.",
  });
}

async function verifyLiveProbes(runtime: FoundryMeshRuntime, checks: VerificationCheck[]): Promise<void> {
  for (const service of runtime.services.list()) {
    if (service.adapterRequired === false || !runtime.serviceLifecycle.hasAdapter(service.id)) continue;
    const issues = runtime.serviceLifecycle.validationIssues(service.id);
    if (issues.length > 0) {
      checks.push({
        id: `live-probe.${service.id}`,
        category: "live-probe",
        status: "skip",
        subjectId: service.id,
        summary: `${service.name} live probe skipped because its adapter is not configured yet.`,
        detail: issues.join(" "),
      });
      continue;
    }

    try {
      const probe = await runtime.serviceLifecycle.inspectProbe(service.id);
      checks.push({
        id: `live-probe.${service.id}`,
        category: "live-probe",
        status: probe.online ? "pass" : "warn",
        subjectId: service.id,
        summary: probe.online
          ? `${service.name} answered its live local probe.`
          : `${service.name} is configured but did not answer its live local probe.`,
        detail: probe.detail,
      });
    } catch (error) {
      checks.push({
        id: `live-probe.${service.id}`,
        category: "live-probe",
        status: "warn",
        subjectId: service.id,
        summary: `${service.name} live probe could not be completed.`,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function testResource(id: string, capacity: number, updatedAt: string): ResourceState {
  return {
    id,
    name: id,
    pressure: "normal",
    capacity,
    used: 0,
    unit: "units",
    updatedAt,
  };
}

function testRequest(id: string, resourceId: string, requestedUnits: number): ResourceRequest {
  return {
    id,
    requestedAt: new Date().toISOString(),
    requesterWorkerId: "verification-worker",
    resourceId,
    priority: 50,
    requestedUnits,
  };
}
