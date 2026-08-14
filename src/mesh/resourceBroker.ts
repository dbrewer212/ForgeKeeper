import type {
  ResourceLease,
  ResourcePressure,
  ResourceRequest,
  ResourceState,
} from "./types";

export interface ResourceAdmission {
  request: ResourceRequest;
  granted: boolean;
  queued: boolean;
  reason?: string;
  lease?: ResourceLease;
}

export interface ResourceQueueEntry {
  request: ResourceRequest;
  queuedAt: string;
}

export interface ResourceBroker {
  updateState(state: ResourceState): void;
  getState(resourceId: string): ResourceState | undefined;
  listStates(): ResourceState[];
  request(request: ResourceRequest): ResourceLease | null;
  admit(request: ResourceRequest, queueOnFailure?: boolean): ResourceAdmission;
  release(leaseId: string): void;
  listActiveLeases(resourceId?: string): ResourceLease[];
  listWorkerLeases(workerId: string): ResourceLease[];
  listPendingRequests(resourceId?: string): ResourceQueueEntry[];
  cancelPendingRequest(requestId: string): boolean;
  cancelPendingForWorker(workerId: string): ResourceQueueEntry[];
  cancelAllPending(): ResourceQueueEntry[];
  drainPending(resourceId?: string): ResourceAdmission[];
  purgeExpired(now?: Date): ResourceLease[];
  setAdmissionEnabled(enabled: boolean, reason?: string): void;
  isAdmissionEnabled(): boolean;
  getAdmissionPauseReason(): string | undefined;
}

export class InMemoryResourceBroker implements ResourceBroker {
  private readonly states = new Map<string, ResourceState>();
  private readonly leases = new Map<string, ResourceLease>();
  private readonly pending = new Map<string, ResourceQueueEntry>();
  private admissionEnabled = true;
  private admissionPauseReason?: string;

  updateState(state: ResourceState): void {
    this.states.set(state.id, structuredClone(state));
    this.purgeExpired();
  }

  getState(resourceId: string): ResourceState | undefined {
    const state = this.states.get(resourceId);
    return state ? structuredClone(state) : undefined;
  }

  listStates(): ResourceState[] {
    return [...this.states.values()].map((state) => structuredClone(state));
  }

  request(request: ResourceRequest): ResourceLease | null {
    return this.admit(request, false).lease ?? null;
  }

  admit(request: ResourceRequest, queueOnFailure = false): ResourceAdmission {
    this.purgeExpired();

    const existingLease = [...this.leases.values()].find((lease) => lease.requestId === request.id);
    if (existingLease) {
      return {
        request: structuredClone(request),
        granted: true,
        queued: false,
        lease: structuredClone(existingLease),
        reason: "Request already owns an active lease.",
      };
    }

    if (!this.admissionEnabled) {
      return {
        request: structuredClone(request),
        granted: false,
        queued: false,
        reason: this.admissionPauseReason ?? "Resource admission is paused.",
      };
    }

    const state = this.states.get(request.resourceId);
    if (!state) {
      return this.reject(request, `Resource ${request.resourceId} is not registered.`, queueOnFailure);
    }

    const pressureReason = this.pressureRejectionReason(state.pressure, request.priority);
    if (pressureReason) return this.reject(request, pressureReason, queueOnFailure);

    const activeForResource = this.activeLeasesFor(request.resourceId);
    const exclusivityReason = this.exclusivityRejectionReason(request, activeForResource);
    if (exclusivityReason) return this.reject(request, exclusivityReason, queueOnFailure);

    const capacityReason = this.capacityRejectionReason(state, request, activeForResource);
    if (capacityReason) return this.reject(request, capacityReason, queueOnFailure);

    this.pending.delete(request.id);

    const units = normalizeRequestedUnits(request);
    const grantedAt = new Date();
    const durationMs = normalizeLeaseDuration(request.leaseDurationMs);
    const lease: ResourceLease = {
      id: crypto.randomUUID(),
      requestId: request.id,
      workerId: request.requesterWorkerId,
      resourceId: request.resourceId,
      grantedAt: grantedAt.toISOString(),
      units,
      exclusive: Boolean(request.exclusive),
      expiresAt: durationMs ? new Date(grantedAt.getTime() + durationMs).toISOString() : undefined,
    };

    this.leases.set(lease.id, lease);
    return {
      request: structuredClone(request),
      granted: true,
      queued: false,
      lease: structuredClone(lease),
    };
  }

  release(leaseId: string): void {
    this.leases.delete(leaseId);
  }

  listActiveLeases(resourceId?: string): ResourceLease[] {
    this.purgeExpired();
    const leases = resourceId ? this.activeLeasesFor(resourceId) : [...this.leases.values()];
    return leases.map((lease) => structuredClone(lease));
  }

  listWorkerLeases(workerId: string): ResourceLease[] {
    this.purgeExpired();
    return [...this.leases.values()]
      .filter((lease) => lease.workerId === workerId)
      .map((lease) => structuredClone(lease));
  }

  listPendingRequests(resourceId?: string): ResourceQueueEntry[] {
    const entries = [...this.pending.values()]
      .filter((entry) => !resourceId || entry.request.resourceId === resourceId)
      .sort(compareQueueEntries);
    return entries.map((entry) => structuredClone(entry));
  }

  cancelPendingRequest(requestId: string): boolean {
    return this.pending.delete(requestId);
  }

  cancelPendingForWorker(workerId: string): ResourceQueueEntry[] {
    const canceled: ResourceQueueEntry[] = [];
    for (const [requestId, entry] of this.pending.entries()) {
      if (entry.request.requesterWorkerId !== workerId) continue;
      canceled.push(structuredClone(entry));
      this.pending.delete(requestId);
    }
    return canceled.sort(compareQueueEntries);
  }

  cancelAllPending(): ResourceQueueEntry[] {
    const canceled = this.listPendingRequests();
    this.pending.clear();
    return canceled;
  }

  drainPending(resourceId?: string): ResourceAdmission[] {
    if (!this.admissionEnabled) return [];

    this.purgeExpired();
    const candidates = this.listPendingRequests(resourceId);
    const results: ResourceAdmission[] = [];

    for (const entry of candidates) {
      const admission = this.admit(entry.request, false);
      if (admission.granted) {
        this.pending.delete(entry.request.id);
        results.push(admission);
      }
    }

    return results;
  }

  purgeExpired(now = new Date()): ResourceLease[] {
    const expired: ResourceLease[] = [];
    for (const [leaseId, lease] of this.leases.entries()) {
      if (!lease.expiresAt) continue;
      const expiresAt = Date.parse(lease.expiresAt);
      if (!Number.isFinite(expiresAt) || expiresAt > now.getTime()) continue;
      expired.push(structuredClone(lease));
      this.leases.delete(leaseId);
    }
    return expired;
  }

  setAdmissionEnabled(enabled: boolean, reason?: string): void {
    this.admissionEnabled = enabled;
    this.admissionPauseReason = enabled ? undefined : reason?.trim() || "Resource admission is paused.";
  }

  isAdmissionEnabled(): boolean {
    return this.admissionEnabled;
  }

  getAdmissionPauseReason(): string | undefined {
    return this.admissionPauseReason;
  }

  private reject(request: ResourceRequest, reason: string, queueOnFailure: boolean): ResourceAdmission {
    let queued = false;
    if (queueOnFailure && this.admissionEnabled && this.states.has(request.resourceId)) {
      const existing = this.pending.get(request.id);
      this.pending.set(request.id, {
        request: structuredClone(request),
        queuedAt: existing?.queuedAt ?? new Date().toISOString(),
      });
      queued = true;
    }

    return {
      request: structuredClone(request),
      granted: false,
      queued,
      reason,
    };
  }

  private activeLeasesFor(resourceId: string): ResourceLease[] {
    return [...this.leases.values()].filter((lease) => lease.resourceId === resourceId);
  }

  private pressureRejectionReason(pressure: ResourcePressure, priority: number): string | undefined {
    switch (pressure) {
      case "normal":
        return undefined;
      case "elevated":
        return priority >= 25 ? undefined : "Resource pressure is elevated; priority must be at least 25.";
      case "high":
        return priority >= 75 ? undefined : "Resource pressure is high; priority must be at least 75.";
      case "critical":
        return "Resource pressure is critical; new leases are blocked.";
    }
  }

  private exclusivityRejectionReason(request: ResourceRequest, active: ResourceLease[]): string | undefined {
    if (request.exclusive && active.length > 0) {
      return `Resource ${request.resourceId} already has active leases and cannot grant an exclusive lease.`;
    }
    if (active.some((lease) => lease.exclusive)) {
      return `Resource ${request.resourceId} is held by an exclusive lease.`;
    }
    return undefined;
  }

  private capacityRejectionReason(
    state: ResourceState,
    request: ResourceRequest,
    active: ResourceLease[],
  ): string | undefined {
    if (state.capacity === undefined) return undefined;

    const capacity = finiteNonNegative(state.capacity);
    const observedUsed = finiteNonNegative(state.used ?? 0);
    const reserved = active.reduce((total, lease) => total + finiteNonNegative(lease.units ?? 1), 0);
    const requested = normalizeRequestedUnits(request);
    const available = Math.max(0, capacity - observedUsed - reserved);

    if (requested > available) {
      return `Resource ${state.id} has ${available} ${state.unit ?? "units"} available but ${requested} were requested.`;
    }
    return undefined;
  }
}

function normalizeRequestedUnits(request: ResourceRequest): number {
  const value = request.requestedUnits ?? request.estimatedCost ?? 1;
  if (!Number.isFinite(value) || value <= 0) return 1;
  return value;
}

function normalizeLeaseDuration(durationMs: number | undefined): number | undefined {
  if (durationMs === undefined) return undefined;
  if (!Number.isFinite(durationMs) || durationMs <= 0) return undefined;
  return Math.floor(durationMs);
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function compareQueueEntries(a: ResourceQueueEntry, b: ResourceQueueEntry): number {
  if (a.request.priority !== b.request.priority) return b.request.priority - a.request.priority;
  const requestedOrder = a.request.requestedAt.localeCompare(b.request.requestedAt);
  if (requestedOrder !== 0) return requestedOrder;
  return a.queuedAt.localeCompare(b.queuedAt);
}
