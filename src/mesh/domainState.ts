import type {
  ActiveWorkSnapshot,
  AssetSummary,
  CanonSummary,
  DecisionRecord,
  DomainMutationContext,
  FoundryDomainServices,
  FoundrySession,
  InventorySummary,
  ParkedThought,
  ProductionItemSummary,
  ProjectSummary,
} from "./domainServices";
import { MeshEvents } from "./events";
import { createFoundryEvent } from "./eventBus";
import type { FoundryEvent } from "./types";

export interface FoundryDomainState {
  schemaVersion: 1;
  activeProjectId?: string;
  projects: ProjectSummary[];
  productionItems: ProductionItemSummary[];
  assets: AssetSummary[];
  inventory: InventorySummary[];
  canon: CanonSummary[];
  decisions: DecisionRecord[];
  sessions: FoundrySession[];
  parkedThoughts: ParkedThought[];
}

export interface FoundryDomainHooks {
  publish(event: FoundryEvent): Promise<void>;
  persist(): Promise<void>;
}

type DomainEntityType =
  | "project"
  | "production-item"
  | "asset"
  | "inventory"
  | "canon"
  | "decision"
  | "session"
  | "parked-thought";

const openSessionStates = new Set<FoundrySession["state"]>(["active", "paused", "blocked"]);

export function createEmptyFoundryDomainState(): FoundryDomainState {
  return {
    schemaVersion: 1,
    projects: [],
    productionItems: [],
    assets: [],
    inventory: [],
    canon: [],
    decisions: [],
    sessions: [],
    parkedThoughts: [],
  };
}

export class FoundryDomainStateStore {
  private state: FoundryDomainState = createEmptyFoundryDomainState();

  readonly services: FoundryDomainServices;

  constructor(private readonly hooks: FoundryDomainHooks) {
    this.services = {
      projects: {
        get: async (id) => clone(this.state.projects.find((project) => project.id === id)),
        list: async () => clone(this.state.projects),
        getActive: async () => {
          const activeProjectId = this.state.activeProjectId ?? this.getActiveSessionInternal()?.activeProjectId;
          return clone(this.state.projects.find((project) => project.id === activeProjectId));
        },
      },
      production: {
        get: async (id) => clone(this.state.productionItems.find((item) => item.id === id)),
        list: async (projectId) => clone(
          projectId
            ? this.state.productionItems.filter((item) => item.projectId === projectId)
            : this.state.productionItems,
        ),
        getActiveWork: async () => this.getActiveWorkSnapshot(),
        setNextAction: async (id, nextAction, context) => {
          const current = this.requireProductionItem(id);
          const next = { ...current, nextAction };
          replaceById(this.state.productionItems, next);
          await this.auditMutation("production-item", id, "set-next-action", current, next, context);
        },
        setBlocker: async (id, blocker, context) => {
          const current = this.requireProductionItem(id);
          const next = { ...current, blocker };
          replaceById(this.state.productionItems, next);
          await this.auditMutation("production-item", id, blocker ? "set-blocker" : "clear-blocker", current, next, context);
        },
      },
      assets: {
        get: async (id) => clone(this.state.assets.find((asset) => asset.id === id)),
        search: async (query) => clone(searchNamed(this.state.assets, query)),
      },
      inventory: {
        get: async (id) => clone(this.state.inventory.find((item) => item.id === id)),
        search: async (query) => clone(searchNamed(this.state.inventory, query)),
      },
      canon: {
        get: async (id) => clone(this.state.canon.find((entry) => entry.id === id)),
        search: async (query) => clone(searchNamed(this.state.canon, query)),
      },
      decisions: {
        get: async (id) => clone(this.state.decisions.find((decision) => decision.id === id)),
        list: async (projectId) => clone(
          projectId ? this.state.decisions.filter((decision) => decision.projectId === projectId) : this.state.decisions,
        ),
        record: async (decision, context) => {
          if (this.state.decisions.some((existing) => existing.id === decision.id)) {
            throw new Error(`Decision ${decision.id} already exists and decision records are immutable.`);
          }
          this.state.decisions.push(clone(decision));
          await this.auditMutation("decision", decision.id, "record", undefined, decision, context);
        },
      },
      sessions: {
        get: async (id) => clone(this.state.sessions.find((session) => session.id === id)),
        getActive: async () => clone(this.getActiveSessionInternal()),
        start: async (session, context) => this.startSession(session, context),
        update: async (id, patch, context) => this.updateSession(id, patch, context),
        end: async (id, state, context) => this.endSession(id, state, context),
        captureThought: async (thought, context) => this.captureThought(thought, context),
        getParkedThoughts: async (sessionId) => {
          const session = this.state.sessions.find((candidate) => candidate.id === sessionId);
          if (!session) return [];
          const ids = new Set(session.parkedThoughtIds);
          return clone(this.state.parkedThoughts.filter((thought) => ids.has(thought.id)));
        },
      },
    };
  }

  snapshot(): FoundryDomainState {
    return clone(this.state);
  }

  restore(state: FoundryDomainState): void {
    if (state.schemaVersion !== 1) {
      throw new Error(`Unsupported Foundry domain state schema version: ${state.schemaVersion}.`);
    }
    this.state = normalizeDomainState(state);
  }

  async upsertProject(project: ProjectSummary, context: DomainMutationContext): Promise<void> {
    const previous = this.state.projects.find((candidate) => candidate.id === project.id);
    const next = { ...project, updatedAt: project.updatedAt ?? new Date().toISOString() };
    upsertById(this.state.projects, next);
    await this.auditMutation("project", project.id, previous ? "update" : "create", previous, next, context);
  }

  async setActiveProject(projectId: string | undefined, context: DomainMutationContext): Promise<void> {
    if (projectId && !this.state.projects.some((project) => project.id === projectId)) {
      throw new Error(`Project ${projectId} does not exist.`);
    }
    const previous = this.state.activeProjectId;
    this.state.activeProjectId = projectId;
    await this.auditMutation("project", projectId ?? "active-project", "set-active", previous, projectId, context);
  }

  async upsertProductionItem(item: ProductionItemSummary, context: DomainMutationContext): Promise<void> {
    if (item.projectId && !this.state.projects.some((project) => project.id === item.projectId)) {
      throw new Error(`Production item ${item.id} references unknown project ${item.projectId}.`);
    }
    const previous = this.state.productionItems.find((candidate) => candidate.id === item.id);
    upsertById(this.state.productionItems, clone(item));
    await this.auditMutation("production-item", item.id, previous ? "update" : "create", previous, item, context);
  }

  async upsertAsset(asset: AssetSummary, context: DomainMutationContext): Promise<void> {
    const previous = this.state.assets.find((candidate) => candidate.id === asset.id);
    upsertById(this.state.assets, clone(asset));
    await this.auditMutation("asset", asset.id, previous ? "update" : "create", previous, asset, context);
  }

  async upsertInventory(item: InventorySummary, context: DomainMutationContext): Promise<void> {
    const previous = this.state.inventory.find((candidate) => candidate.id === item.id);
    upsertById(this.state.inventory, clone(item));
    await this.auditMutation("inventory", item.id, previous ? "update" : "create", previous, item, context);
  }

  async upsertCanon(entry: CanonSummary, context: DomainMutationContext): Promise<void> {
    const previous = this.state.canon.find((candidate) => candidate.id === entry.id);
    upsertById(this.state.canon, clone(entry));
    await this.auditMutation("canon", entry.id, previous ? "update" : "create", previous, entry, context);
  }

  async resolveThought(thoughtId: string, context: DomainMutationContext): Promise<void> {
    const current = this.state.parkedThoughts.find((thought) => thought.id === thoughtId);
    if (!current) throw new Error(`Parked thought ${thoughtId} does not exist.`);
    if (current.resolvedAt) return;
    const next = { ...current, resolvedAt: new Date().toISOString() };
    replaceById(this.state.parkedThoughts, next);
    await this.auditMutation("parked-thought", thoughtId, "resolve", current, next, context);
  }

  private async startSession(session: FoundrySession, context: DomainMutationContext): Promise<void> {
    if (this.state.sessions.some((candidate) => candidate.id === session.id)) {
      throw new Error(`Session ${session.id} already exists.`);
    }
    const active = this.getActiveSessionInternal();
    if (active) {
      throw new Error(`Session ${active.id} is still ${active.state}; only one open Foundry session may exist at a time.`);
    }
    if (session.activeProjectId && !this.state.projects.some((project) => project.id === session.activeProjectId)) {
      throw new Error(`Session ${session.id} references unknown project ${session.activeProjectId}.`);
    }
    if (
      session.activeProductionItemId &&
      !this.state.productionItems.some((item) => item.id === session.activeProductionItemId)
    ) {
      throw new Error(`Session ${session.id} references unknown production item ${session.activeProductionItemId}.`);
    }

    const now = new Date().toISOString();
    const next: FoundrySession = {
      ...clone(session),
      startedAt: session.startedAt || now,
      updatedAt: now,
      endedAt: undefined,
      parkedThoughtIds: [...new Set(session.parkedThoughtIds)],
      participatingWorkerIds: [...new Set(session.participatingWorkerIds)],
    };
    this.state.sessions.push(next);
    if (next.activeProjectId) this.state.activeProjectId = next.activeProjectId;
    await this.auditMutation("session", next.id, "start", undefined, next, context, MeshEvents.productionSessionStarted);
  }

  private async updateSession(
    id: string,
    patch: Partial<FoundrySession>,
    context: DomainMutationContext,
  ): Promise<FoundrySession> {
    const current = this.requireSession(id);
    if (!openSessionStates.has(current.state)) {
      throw new Error(`Session ${id} is already ${current.state} and cannot be updated.`);
    }
    if (patch.state === "completed" || patch.state === "abandoned") {
      throw new Error(`Use SessionService.end() to close session ${id}.`);
    }
    const next: FoundrySession = {
      ...current,
      ...clone(patch),
      id: current.id,
      startedAt: current.startedAt,
      endedAt: undefined,
      updatedAt: new Date().toISOString(),
      parkedThoughtIds: patch.parkedThoughtIds
        ? [...new Set(patch.parkedThoughtIds)]
        : current.parkedThoughtIds,
      participatingWorkerIds: patch.participatingWorkerIds
        ? [...new Set(patch.participatingWorkerIds)]
        : current.participatingWorkerIds,
    };
    replaceById(this.state.sessions, next);
    if (next.activeProjectId) this.state.activeProjectId = next.activeProjectId;
    await this.auditMutation("session", id, "update", current, next, context);
    return clone(next);
  }

  private async endSession(
    id: string,
    state: "completed" | "abandoned",
    context: DomainMutationContext,
  ): Promise<void> {
    const current = this.requireSession(id);
    if (!openSessionStates.has(current.state)) {
      if (current.state === state) return;
      throw new Error(`Session ${id} is already ${current.state}.`);
    }
    const now = new Date().toISOString();
    const next: FoundrySession = { ...current, state, updatedAt: now, endedAt: now };
    replaceById(this.state.sessions, next);
    await this.auditMutation("session", id, "end", current, next, context, MeshEvents.productionSessionEnded);
  }

  private async captureThought(thought: ParkedThought, context: DomainMutationContext): Promise<void> {
    if (this.state.parkedThoughts.some((existing) => existing.id === thought.id)) {
      throw new Error(`Parked thought ${thought.id} already exists.`);
    }
    const activeSession = this.getActiveSessionInternal();
    const normalized: ParkedThought = {
      ...clone(thought),
      relatedProjectId: thought.relatedProjectId ?? activeSession?.activeProjectId,
      relatedProductionItemId: thought.relatedProductionItemId ?? activeSession?.activeProductionItemId,
    };
    this.state.parkedThoughts.push(normalized);

    let previousSession: FoundrySession | undefined;
    let currentSession: FoundrySession | undefined;
    if (activeSession && !activeSession.parkedThoughtIds.includes(thought.id)) {
      previousSession = clone(activeSession);
      currentSession = {
        ...activeSession,
        parkedThoughtIds: [...activeSession.parkedThoughtIds, thought.id],
        updatedAt: new Date().toISOString(),
      };
      replaceById(this.state.sessions, currentSession);
    }

    await this.auditMutation(
      "parked-thought",
      thought.id,
      "capture",
      undefined,
      { thought: normalized, previousSession, currentSession },
      context,
      MeshEvents.productionThoughtCaptured,
    );
  }

  private getActiveSessionInternal(): FoundrySession | undefined {
    return this.state.sessions
      .filter((session) => openSessionStates.has(session.state))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  }

  private getActiveWorkSnapshot(): ActiveWorkSnapshot {
    const session = this.getActiveSessionInternal();
    const productionItem = session?.activeProductionItemId
      ? this.state.productionItems.find((item) => item.id === session.activeProductionItemId)
      : undefined;

    return clone({
      session,
      projectId: session?.activeProjectId ?? this.state.activeProjectId,
      productionItemId: session?.activeProductionItemId,
      objective: session?.currentObjective,
      stage: session?.currentStage ?? productionItem?.stage,
      currentAction: session?.currentAction,
      nextAction: session?.nextAction ?? productionItem?.nextAction,
      blocker: session?.blockedBy ?? productionItem?.blocker,
      lastCheckpointId: session?.lastCheckpointId,
      parkedThoughtCount: session?.parkedThoughtIds.length ?? 0,
      resumeContext: session?.resumeContext,
    });
  }

  private requireProductionItem(id: string): ProductionItemSummary {
    const item = this.state.productionItems.find((candidate) => candidate.id === id);
    if (!item) throw new Error(`Production item ${id} does not exist.`);
    return item;
  }

  private requireSession(id: string): FoundrySession {
    const session = this.state.sessions.find((candidate) => candidate.id === id);
    if (!session) throw new Error(`Session ${id} does not exist.`);
    return session;
  }

  private async auditMutation(
    entityType: DomainEntityType,
    entityId: string,
    operation: string,
    previous: unknown,
    current: unknown,
    context: DomainMutationContext,
    eventType: string = MeshEvents.domainRecordChanged,
  ): Promise<void> {
    await this.hooks.publish(
      createFoundryEvent({
        type: eventType,
        sourceWorkerId: context.requestedBy.type === "worker" ? context.requestedBy.id : "foundry-core",
        subjectId: entityId,
        correlationId: context.correlationId,
        payload: {
          entityType,
          operation,
          previous: clone(previous),
          current: clone(current),
          requestedBy: context.requestedBy,
          authorizedBy: context.authorizedBy,
          reason: context.reason,
        },
      }),
    );
    await this.hooks.persist();
  }
}

export function normalizeDomainState(state: Partial<FoundryDomainState>): FoundryDomainState {
  if (state.schemaVersion !== undefined && state.schemaVersion !== 1) {
    throw new Error(`Unsupported Foundry domain state schema version: ${String(state.schemaVersion)}.`);
  }
  return {
    schemaVersion: 1,
    activeProjectId: state.activeProjectId,
    projects: clone(state.projects ?? []),
    productionItems: clone(state.productionItems ?? []),
    assets: clone(state.assets ?? []),
    inventory: clone(state.inventory ?? []),
    canon: clone(state.canon ?? []),
    decisions: clone(state.decisions ?? []),
    sessions: clone(state.sessions ?? []),
    parkedThoughts: clone(state.parkedThoughts ?? []),
  };
}

function searchNamed<T extends { name: string }>(items: T[], query: string): T[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [...items];
  return items.filter((item) => item.name.toLocaleLowerCase().includes(normalized));
}

function upsertById<T extends { id: string }>(items: T[], value: T): void {
  const index = items.findIndex((item) => item.id === value.id);
  if (index === -1) items.push(value);
  else items[index] = value;
}

function replaceById<T extends { id: string }>(items: T[], value: T): void {
  const index = items.findIndex((item) => item.id === value.id);
  if (index === -1) throw new Error(`Record ${value.id} does not exist.`);
  items[index] = value;
}

function clone<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return structuredClone(value);
}
