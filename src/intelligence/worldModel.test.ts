import { describe, expect, it } from "vitest";
import { createEmptyFoundryDomainState } from "../mesh/domainState";
import type { RegisteredWorker, ResourceState, SystemHealth } from "../mesh/types";
import type { WatcherObservation } from "../watcher/contracts";
import type { WatcherFinding } from "../watcher/findingEngine";
import { FoundryWorldModel } from "./worldModel";

const now = new Date("2026-09-10T17:00:00.000Z");
const health: SystemHealth = {
  state: "nominal",
  summary: "Foundry mesh nominal.",
  updatedAt: now.toISOString(),
  degradedWorkers: [],
  criticalWorkers: [],
};

const worker: RegisteredWorker = {
  identity: {
    id: "watcher",
    name: "The Watcher",
    kind: "watcher",
    capabilities: ["watcher.telemetry.read"],
    enabled: true,
    commissioningState: "active",
  },
  status: {
    workerId: "watcher",
    state: "idle",
    health: "nominal",
    lastHeartbeatAt: "2026-09-10T16:59:50.000Z",
  },
};

const resource: ResourceState = {
  id: "cpu",
  name: "CPU",
  pressure: "normal",
  utilizationPercent: 25,
  updatedAt: "2026-09-10T16:59:50.000Z",
};

const observation: WatcherObservation = {
  id: "memory:1",
  providerId: "windows-memory",
  observedAt: "2026-09-10T16:59:50.000Z",
  domain: "memory",
  availability: "available",
  value: { totalBytes: 100, usedBytes: 50 },
};

const finding: WatcherFinding = {
  id: "watcher:storage-pressure:C",
  code: "storage.capacity-pressure",
  domain: "storage",
  providerId: "windows-storage",
  subjectId: "C:",
  severity: "warning",
  summary: "C: storage utilization is 92.0%.",
  observedAt: "2026-09-10T16:59:45.000Z",
  evidence: { utilizationPercent: 92 },
};

describe("FoundryWorldModel", () => {
  it("projects authoritative Foundry state and observed Watcher state without owning a second database", () => {
    const domain = createEmptyFoundryDomainState();
    domain.activeProjectId = "motorcycle-goblin";
    domain.projects.push({ id: "motorcycle-goblin", name: "Motorcycle Goblin", status: "active", updatedAt: "2026-09-10T16:58:00.000Z" });
    domain.productionItems.push({ id: "model", projectId: "motorcycle-goblin", name: "Model", stage: "refinement" });
    domain.sessions.push({
      id: "session-1",
      startedAt: "2026-09-10T16:50:00.000Z",
      updatedAt: "2026-09-10T16:59:00.000Z",
      state: "active",
      activeProjectId: "motorcycle-goblin",
      activeProductionItemId: "model",
      currentObjective: "Refine model",
      nextAction: "Inspect latest geometry",
      parkedThoughtIds: [],
      participatingWorkerIds: ["watcher"],
    });

    const model = new FoundryWorldModel({
      domain: () => domain,
      services: () => [{
        id: "watcher-service",
        name: "Watcher Monitoring",
        kind: "monitoring",
        commissioningState: "active",
        runtimeState: "online",
        enabled: true,
        workerId: "watcher",
        dependencies: [],
      }],
      workers: () => [worker],
      resources: () => [resource],
      health: () => health,
      safeMode: () => false,
      watcherObservations: () => [observation],
      watcherFindings: () => [finding],
      now: () => now,
    });

    const snapshot = model.snapshot();

    expect(snapshot.activeContext.projectId).toBe("motorcycle-goblin");
    expect(snapshot.activeContext.productionItemId).toBe("model");
    expect(snapshot.activeContext.nextAction).toBe("Inspect latest geometry");
    expect(snapshot.entities.some((entity) => entity.id === "workstation:primary")).toBe(true);
    expect(snapshot.entities.some((entity) => entity.id === "service:watcher-service")).toBe(true);
    expect(snapshot.entities.some((entity) => entity.id === "project:motorcycle-goblin")).toBe(true);
    expect(snapshot.entities.some((entity) => entity.kind === "watcher-observation" && entity.provenance.authority === "observed")).toBe(true);
    expect(snapshot.entities.some((entity) => entity.kind === "watcher-finding" && entity.status === "warning")).toBe(true);
  });

  it("marks old Watcher observations stale", () => {
    const model = new FoundryWorldModel({
      domain: () => createEmptyFoundryDomainState(),
      services: () => [],
      workers: () => [],
      resources: () => [],
      health: () => health,
      safeMode: () => false,
      watcherObservations: () => [{ ...observation, observedAt: "2026-09-10T16:50:00.000Z" }],
      watcherFindings: () => [],
      now: () => now,
    });

    const observed = model.snapshot().entities.find((entity) => entity.kind === "watcher-observation");
    expect(observed?.provenance.freshness).toBe("stale");
  });
});
