import type { FoundryDomainState } from "../mesh/domainState";
import type { ServiceDescriptor } from "../mesh/serviceRegistry";
import type { RegisteredWorker, ResourceState, SystemHealth } from "../mesh/types";
import type { WatcherObservation } from "../watcher/contracts";
import type { WatcherFinding } from "../watcher/findingEngine";

export type WorldEntityKind =
  | "workstation"
  | "service"
  | "worker"
  | "resource"
  | "project"
  | "production-item"
  | "asset"
  | "inventory"
  | "canon"
  | "decision"
  | "session"
  | "watcher-observation"
  | "watcher-finding";

export type WorldFactAuthority = "authoritative" | "observed" | "derived";
export type WorldFactFreshness = "fresh" | "aging" | "stale" | "unknown";

export interface WorldProvenance {
  source: "mesh" | "foundry-domain" | "watcher" | "world-model";
  authority: WorldFactAuthority;
  observedAt?: string;
  freshness: WorldFactFreshness;
}

export interface WorldRelation {
  type: string;
  targetId: string;
}

export interface WorldEntity {
  id: string;
  kind: WorldEntityKind;
  label: string;
  status?: string;
  attributes: Record<string, unknown>;
  relations: WorldRelation[];
  provenance: WorldProvenance;
}

export interface WorldActiveContext {
  projectId?: string;
  productionItemId?: string;
  sessionId?: string;
  objective?: string;
  stage?: string;
  currentAction?: string;
  nextAction?: string;
  blocker?: string;
}

export interface FoundryWorldModelSnapshot {
  schemaVersion: 1;
  builtAt: string;
  health: SystemHealth;
  safeMode: boolean;
  activeContext: WorldActiveContext;
  entities: WorldEntity[];
}

export interface FoundryWorldModelSources {
  domain(): FoundryDomainState;
  services(): ServiceDescriptor[];
  workers(): RegisteredWorker[];
  resources(): ResourceState[];
  health(): SystemHealth;
  safeMode(): boolean;
  watcherObservations(): WatcherObservation[];
  watcherFindings(): WatcherFinding[];
  now?(): Date;
}

const OPEN_SESSION_STATES = new Set(["active", "paused", "blocked"]);

export class FoundryWorldModel {
  constructor(private readonly sources: FoundryWorldModelSources) {}

  snapshot(): FoundryWorldModelSnapshot {
    const now = this.sources.now?.() ?? new Date();
    const builtAt = now.toISOString();
    const domain = this.sources.domain();
    const services = this.sources.services();
    const workers = this.sources.workers();
    const resources = this.sources.resources();
    const observations = this.sources.watcherObservations();
    const findings = this.sources.watcherFindings();
    const activeSession = [...domain.sessions]
      .filter((session) => OPEN_SESSION_STATES.has(session.state))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    const activeProjectId = activeSession?.activeProjectId ?? domain.activeProjectId;

    const entities: WorldEntity[] = [];
    entities.push({
      id: "workstation:primary",
      kind: "workstation",
      label: "Foundry Workstation",
      status: this.sources.health().state,
      attributes: {
        safeMode: this.sources.safeMode(),
        healthSummary: this.sources.health().summary,
        watcherObservationCount: observations.length,
        activeWatcherFindingCount: findings.length,
      },
      relations: services.map((service) => ({ type: "hosts-service", targetId: `service:${service.id}` })),
      provenance: derivedProvenance(builtAt),
    });

    for (const service of services) {
      entities.push({
        id: `service:${service.id}`,
        kind: "service",
        label: service.name,
        status: service.runtimeState,
        attributes: {
          serviceId: service.id,
          kind: service.kind,
          commissioningState: service.commissioningState,
          enabled: service.enabled,
          endpoint: service.endpoint,
          workerId: service.workerId,
          metadata: service.metadata,
        },
        relations: [
          ...service.dependencies.map((id) => ({ type: "depends-on", targetId: `service:${id}` })),
          ...(service.workerId ? [{ type: "represented-by", targetId: `worker:${service.workerId}` }] : []),
        ],
        provenance: authoritativeProvenance("mesh"),
      });
    }

    for (const worker of workers) {
      entities.push({
        id: `worker:${worker.identity.id}`,
        kind: "worker",
        label: worker.identity.name,
        status: worker.status.state,
        attributes: {
          workerId: worker.identity.id,
          kind: worker.identity.kind,
          enabled: worker.identity.enabled,
          commissioningState: worker.identity.commissioningState,
          health: worker.status.health,
          currentActivity: worker.status.currentActivity,
          lastHeartbeatAt: worker.status.lastHeartbeatAt,
          lastError: worker.status.lastError,
        },
        relations: [],
        provenance: authoritativeProvenance("mesh", worker.status.lastHeartbeatAt, now),
      });
    }

    for (const resource of resources) {
      entities.push({
        id: `resource:${resource.id}`,
        kind: "resource",
        label: resource.name,
        status: resource.pressure,
        attributes: {
          resourceId: resource.id,
          utilizationPercent: resource.utilizationPercent,
          used: resource.used,
          capacity: resource.capacity,
          unit: resource.unit,
          metadata: resource.metadata,
        },
        relations: [],
        provenance: authoritativeProvenance("mesh", resource.updatedAt, now),
      });
    }

    for (const project of domain.projects) {
      entities.push({
        id: `project:${project.id}`,
        kind: "project",
        label: project.name,
        status: project.status,
        attributes: { ...project, active: project.id === activeProjectId },
        relations: [
          ...domain.productionItems.filter((item) => item.projectId === project.id).map((item) => ({ type: "has-production-item", targetId: `production-item:${item.id}` })),
          ...domain.assets.filter((asset) => domain.productionItems.some((item) => item.projectId === project.id && item.workbench?.assetId === asset.id)).map((asset) => ({ type: "uses-asset", targetId: `asset:${asset.id}` })),
          ...domain.decisions.filter((decision) => decision.projectId === project.id).map((decision) => ({ type: "has-decision", targetId: `decision:${decision.id}` })),
          ...domain.sessions.filter((session) => session.activeProjectId === project.id).map((session) => ({ type: "has-session", targetId: `session:${session.id}` })),
        ],
        provenance: authoritativeProvenance("foundry-domain", project.updatedAt, now),
      });
    }

    for (const item of domain.productionItems) {
      entities.push({
        id: `production-item:${item.id}`,
        kind: "production-item",
        label: item.name,
        status: item.status ?? item.stage,
        attributes: { ...item, active: item.id === activeSession?.activeProductionItemId },
        relations: [
          ...(item.projectId ? [{ type: "belongs-to-project", targetId: `project:${item.projectId}` }] : []),
          ...(item.workbench?.assetId ? [{ type: "uses-asset", targetId: `asset:${item.workbench.assetId}` }] : []),
        ],
        provenance: authoritativeProvenance("foundry-domain"),
      });
    }

    for (const asset of domain.assets) {
      entities.push(domainEntity("asset", asset.id, asset.name, asset.status, asset, builtAt));
    }
    for (const item of domain.inventory) {
      entities.push(domainEntity("inventory", item.id, item.name, item.status, item, builtAt));
    }
    for (const canon of domain.canon) {
      entities.push(domainEntity("canon", canon.id, canon.name, canon.status, canon, builtAt));
    }
    for (const decision of domain.decisions) {
      entities.push({
        ...domainEntity("decision", decision.id, decision.subject, undefined, decision, builtAt),
        relations: [
          ...(decision.projectId ? [{ type: "about-project", targetId: `project:${decision.projectId}` }] : []),
          ...(decision.productionItemId ? [{ type: "about-production-item", targetId: `production-item:${decision.productionItemId}` }] : []),
        ],
      });
    }
    for (const session of domain.sessions) {
      entities.push({
        ...domainEntity("session", session.id, `Foundry Session ${session.id}`, session.state, session, builtAt, session.updatedAt, now),
        relations: [
          ...(session.activeProjectId ? [{ type: "active-project", targetId: `project:${session.activeProjectId}` }] : []),
          ...(session.activeProductionItemId ? [{ type: "active-production-item", targetId: `production-item:${session.activeProductionItemId}` }] : []),
          ...session.participatingWorkerIds.map((id) => ({ type: "participant", targetId: `worker:${id}` })),
        ],
      });
    }

    for (const observation of observations) {
      entities.push({
        id: observationEntityId(observation),
        kind: "watcher-observation",
        label: `${observation.domain} observation`,
        status: observation.availability,
        attributes: {
          providerId: observation.providerId,
          domain: observation.domain,
          availability: observation.availability,
          subjectId: observation.subjectId,
          value: observation.value,
          detail: observation.detail,
        },
        relations: [{ type: "observed-on", targetId: "workstation:primary" }],
        provenance: observedProvenance(observation.observedAt, now),
      });
    }

    for (const finding of findings) {
      entities.push({
        id: `watcher-finding:${finding.id}`,
        kind: "watcher-finding",
        label: finding.summary,
        status: finding.severity,
        attributes: { ...finding },
        relations: [{ type: "finding-on", targetId: finding.subjectId ? `subject:${finding.subjectId}` : "workstation:primary" }],
        provenance: observedProvenance(finding.observedAt, now),
      });
    }

    return {
      schemaVersion: 1,
      builtAt,
      health: this.sources.health(),
      safeMode: this.sources.safeMode(),
      activeContext: {
        projectId: activeProjectId,
        productionItemId: activeSession?.activeProductionItemId,
        sessionId: activeSession?.id,
        objective: activeSession?.currentObjective,
        stage: activeSession?.currentStage,
        currentAction: activeSession?.currentAction,
        nextAction: activeSession?.nextAction,
        blocker: activeSession?.blockedBy,
      },
      entities: entities.sort((a, b) => a.id.localeCompare(b.id)),
    };
  }

  getEntity(id: string): WorldEntity | undefined {
    return this.snapshot().entities.find((entity) => entity.id === id);
  }
}

function domainEntity(
  kind: Extract<WorldEntityKind, "asset" | "inventory" | "canon" | "decision" | "session">,
  id: string,
  label: string,
  status: string | undefined,
  attributes: Record<string, unknown>,
  builtAt: string,
  observedAt?: string,
  now?: Date,
): WorldEntity {
  return {
    id: `${kind}:${id}`,
    kind,
    label,
    status,
    attributes: { ...attributes },
    relations: [],
    provenance: authoritativeProvenance("foundry-domain", observedAt ?? builtAt, now),
  };
}

function observationEntityId(observation: WatcherObservation): string {
  return `watcher-observation:${observation.providerId}:${observation.domain}:${observation.subjectId ?? "host"}`;
}

function authoritativeProvenance(
  source: "mesh" | "foundry-domain",
  observedAt?: string,
  now = new Date(),
): WorldProvenance {
  return { source, authority: "authoritative", observedAt, freshness: freshness(observedAt, now) };
}

function observedProvenance(observedAt: string, now: Date): WorldProvenance {
  return { source: "watcher", authority: "observed", observedAt, freshness: freshness(observedAt, now) };
}

function derivedProvenance(observedAt: string): WorldProvenance {
  return { source: "world-model", authority: "derived", observedAt, freshness: "fresh" };
}

function freshness(observedAt: string | undefined, now: Date): WorldFactFreshness {
  if (!observedAt) return "unknown";
  const observed = Date.parse(observedAt);
  if (!Number.isFinite(observed)) return "unknown";
  const ageMs = Math.max(0, now.getTime() - observed);
  if (ageMs <= 30_000) return "fresh";
  if (ageMs <= 120_000) return "aging";
  return "stale";
}
