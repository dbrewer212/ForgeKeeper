import type {
  ResourceLease,
  ResourcePressure,
  ResourceRequest,
  ResourceState,
} from "./types";

export interface ResourceBroker {
  updateState(state: ResourceState): void;
  getState(resourceId: string): ResourceState | undefined;
  request(request: ResourceRequest): ResourceLease | null;
  release(leaseId: string): void;
  listActiveLeases(): ResourceLease[];
}

export class InMemoryResourceBroker implements ResourceBroker {
  private readonly states = new Map<string, ResourceState>();
  private readonly leases = new Map<string, ResourceLease>();

  updateState(state: ResourceState): void {
    this.states.set(state.id, state);
  }

  getState(resourceId: string): ResourceState | undefined {
    return this.states.get(resourceId);
  }

  request(request: ResourceRequest): ResourceLease | null {
    const state = this.states.get(request.resourceId);
    if (!state) return null;
    if (!this.canGrant(state.pressure, request.priority)) return null;

    const lease: ResourceLease = {
      id: crypto.randomUUID(),
      requestId: request.id,
      workerId: request.requesterWorkerId,
      resourceId: request.resourceId,
      grantedAt: new Date().toISOString(),
    };

    this.leases.set(lease.id, lease);
    return lease;
  }

  release(leaseId: string): void {
    this.leases.delete(leaseId);
  }

  listActiveLeases(): ResourceLease[] {
    return [...this.leases.values()];
  }

  private canGrant(pressure: ResourcePressure, priority: number): boolean {
    switch (pressure) {
      case "normal":
        return true;
      case "elevated":
        return priority >= 25;
      case "high":
        return priority >= 75;
      case "critical":
        return false;
    }
  }
}
