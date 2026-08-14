import { MeshCapabilities } from "./catalog";
import type {
  DecisionRecord,
  DomainMutationContext,
  FoundrySession,
  FoundrySessionState,
  ParkedThought,
  ParkedThoughtCategory,
  ResumeContext,
} from "./domainServices";
import type { FoundryMeshRuntime } from "./runtime";
import type { WorkerIdentity } from "./types";

function contextFor(worker: WorkerIdentity, reason?: string, correlationId?: string): DomainMutationContext {
  return {
    requestedBy:
      worker.id === "foundry-core"
        ? { type: "system", id: worker.id, label: worker.name }
        : { type: "worker", id: worker.id, label: worker.name },
    correlationId,
    reason,
  };
}

export function registerDomainTools(runtime: FoundryMeshRuntime): void {
  runtime.tools.register(
    {
      name: "foundry.get_active_work",
      capabilityId: MeshCapabilities.productionRead,
      description: "Read the canonical active Foundry work and resume context.",
      risk: "read",
      audit: false,
      inputSchema: { type: "object", additionalProperties: false },
    },
    () => runtime.domain.get().production.getActiveWork(),
  );

  runtime.tools.register(
    {
      name: "foundry.get_active_session",
      capabilityId: MeshCapabilities.foundrySessionRead,
      description: "Read the current Foundry session without changing it.",
      risk: "read",
      audit: false,
      inputSchema: { type: "object", additionalProperties: false },
    },
    () => runtime.domain.get().sessions.getActive(),
  );

  runtime.tools.register<{ id: string }, unknown>(
    {
      name: "foundry.get_project",
      capabilityId: MeshCapabilities.foundryProjectRead,
      description: "Read one canonical Foundry project summary.",
      risk: "read",
      audit: false,
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
    ({ id }) => runtime.domain.get().projects.get(id),
  );

  runtime.tools.register(
    {
      name: "foundry.list_projects",
      capabilityId: MeshCapabilities.foundryProjectRead,
      description: "List canonical Foundry projects.",
      risk: "read",
      audit: false,
      inputSchema: { type: "object", additionalProperties: false },
    },
    () => runtime.domain.get().projects.list(),
  );

  runtime.tools.register<{ projectId?: string }, unknown>(
    {
      name: "foundry.list_production",
      capabilityId: MeshCapabilities.productionRead,
      description: "List canonical production items, optionally scoped to a project.",
      risk: "read",
      audit: false,
      inputSchema: {
        type: "object",
        properties: { projectId: { type: "string" } },
        additionalProperties: false,
      },
    },
    ({ projectId }) => runtime.domain.get().production.list(projectId),
  );

  runtime.tools.register<
    {
      id?: string;
      projectId?: string;
      productionItemId?: string;
      objective?: string;
      stage?: string;
      currentAction?: string;
      nextAction?: string;
      blocker?: string;
      resumeContext?: ResumeContext;
      reason?: string;
    },
    FoundrySession
  >(
    {
      name: "foundry.session.start",
      capabilityId: MeshCapabilities.foundrySessionWrite,
      description: "Start a durable Foundry working session. Only one open session may exist at a time.",
      risk: "moderate",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          projectId: { type: "string" },
          productionItemId: { type: "string" },
          objective: { type: "string" },
          stage: { type: "string" },
          currentAction: { type: "string" },
          nextAction: { type: "string" },
          blocker: { type: "string" },
          resumeContext: { type: "object" },
          reason: { type: "string" },
        },
        additionalProperties: false,
      },
    },
    async (payload, request, worker) => {
      const now = new Date().toISOString();
      const session: FoundrySession = {
        id: payload.id ?? crypto.randomUUID(),
        startedAt: now,
        updatedAt: now,
        state: payload.blocker ? "blocked" : "active",
        activeProjectId: payload.projectId,
        activeProductionItemId: payload.productionItemId,
        currentObjective: payload.objective,
        currentStage: payload.stage,
        currentAction: payload.currentAction,
        nextAction: payload.nextAction,
        blockedBy: payload.blocker,
        parkedThoughtIds: [],
        participatingWorkerIds: worker.id === "foundry-core" ? [] : [worker.id],
        resumeContext: payload.resumeContext,
      };
      await runtime.domain.get().sessions.start(session, contextFor(worker, payload.reason, request.correlationId));
      return (await runtime.domain.get().sessions.get(session.id)) as FoundrySession;
    },
  );

  runtime.tools.register<
    {
      id: string;
      state?: Extract<FoundrySessionState, "active" | "paused" | "blocked">;
      objective?: string;
      stage?: string;
      currentAction?: string;
      nextAction?: string;
      blocker?: string;
      resumeContext?: ResumeContext;
      reason?: string;
    },
    FoundrySession
  >(
    {
      name: "foundry.session.update",
      capabilityId: MeshCapabilities.foundrySessionWrite,
      description: "Update durable session and re-entry context without closing the session.",
      risk: "low",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          state: { type: "string", enum: ["active", "paused", "blocked"] },
          objective: { type: "string" },
          stage: { type: "string" },
          currentAction: { type: "string" },
          nextAction: { type: "string" },
          blocker: { type: "string" },
          resumeContext: { type: "object" },
          reason: { type: "string" },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
    (payload, request, worker) =>
      runtime.domain.get().sessions.update(
        payload.id,
        {
          state: payload.state,
          currentObjective: payload.objective,
          currentStage: payload.stage,
          currentAction: payload.currentAction,
          nextAction: payload.nextAction,
          blockedBy: payload.blocker,
          resumeContext: payload.resumeContext,
        },
        contextFor(worker, payload.reason, request.correlationId),
      ),
  );

  runtime.tools.register<{ id: string; state: "completed" | "abandoned"; reason?: string }, { ended: boolean }>(
    {
      name: "foundry.session.end",
      capabilityId: MeshCapabilities.foundrySessionWrite,
      description: "Close a durable Foundry session as completed or abandoned.",
      risk: "moderate",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          state: { type: "string", enum: ["completed", "abandoned"] },
          reason: { type: "string" },
        },
        required: ["id", "state"],
        additionalProperties: false,
      },
    },
    async (payload, request, worker) => {
      await runtime.domain.get().sessions.end(
        payload.id,
        payload.state,
        contextFor(worker, payload.reason, request.correlationId),
      );
      return { ended: true };
    },
  );

  runtime.tools.register<
    {
      id?: string;
      text: string;
      category: ParkedThoughtCategory;
      source?: string;
      projectId?: string;
      productionItemId?: string;
      reason?: string;
    },
    ParkedThought
  >(
    {
      name: "foundry.capture_thought",
      capabilityId: MeshCapabilities.productionThoughtCapture,
      description: "Capture a side thought into durable Foundry state without changing active work.",
      risk: "low",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          text: { type: "string" },
          category: {
            type: "string",
            enum: ["interesting-later", "useful-dependency", "blocker", "architecture-changing", "shiny"],
          },
          source: { type: "string" },
          projectId: { type: "string" },
          productionItemId: { type: "string" },
          reason: { type: "string" },
        },
        required: ["text", "category"],
        additionalProperties: false,
      },
    },
    async (payload, request, worker) => {
      const thought: ParkedThought = {
        id: payload.id ?? crypto.randomUUID(),
        capturedAt: new Date().toISOString(),
        text: payload.text,
        category: payload.category,
        source: payload.source ?? worker.id,
        relatedProjectId: payload.projectId,
        relatedProductionItemId: payload.productionItemId,
      };
      await runtime.domain.get().sessions.captureThought(
        thought,
        contextFor(worker, payload.reason, request.correlationId),
      );
      return thought;
    },
  );

  runtime.tools.register<{ id: string; nextAction: string; reason?: string }, { updated: boolean }>(
    {
      name: "foundry.production.set_next_action",
      capabilityId: MeshCapabilities.productionWrite,
      description: "Set the canonical next action on a production item.",
      risk: "low",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          nextAction: { type: "string" },
          reason: { type: "string" },
        },
        required: ["id", "nextAction"],
        additionalProperties: false,
      },
    },
    async (payload, request, worker) => {
      await runtime.domain.get().production.setNextAction(
        payload.id,
        payload.nextAction,
        contextFor(worker, payload.reason, request.correlationId),
      );
      return { updated: true };
    },
  );

  runtime.tools.register<{ id: string; blocker?: string; reason?: string }, { updated: boolean }>(
    {
      name: "foundry.production.set_blocker",
      capabilityId: MeshCapabilities.productionWrite,
      description: "Set or clear the canonical blocker on a production item.",
      risk: "low",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          blocker: { type: "string" },
          reason: { type: "string" },
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
    async (payload, request, worker) => {
      await runtime.domain.get().production.setBlocker(
        payload.id,
        payload.blocker,
        contextFor(worker, payload.reason, request.correlationId),
      );
      return { updated: true };
    },
  );

  runtime.tools.register<{ projectId?: string }, unknown>(
    {
      name: "foundry.decisions.list",
      capabilityId: MeshCapabilities.foundryDecisionRead,
      description: "Read durable Foundry decision records.",
      risk: "read",
      audit: false,
      inputSchema: {
        type: "object",
        properties: { projectId: { type: "string" } },
        additionalProperties: false,
      },
    },
    ({ projectId }) => runtime.domain.get().decisions.list(projectId),
  );

  runtime.tools.register<
    {
      id?: string;
      subject: string;
      decision: string;
      rationale?: string;
      projectId?: string;
      productionItemId?: string;
      reason?: string;
    },
    DecisionRecord
  >(
    {
      name: "foundry.decision.record",
      capabilityId: MeshCapabilities.foundryDecisionWrite,
      description: "Record an immutable Foundry decision through governed authority.",
      risk: "moderate",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          subject: { type: "string" },
          decision: { type: "string" },
          rationale: { type: "string" },
          projectId: { type: "string" },
          productionItemId: { type: "string" },
          reason: { type: "string" },
        },
        required: ["subject", "decision"],
        additionalProperties: false,
      },
    },
    async (payload, request, worker) => {
      const mutationContext = contextFor(worker, payload.reason, request.correlationId);
      const record: DecisionRecord = {
        id: payload.id ?? crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        subject: payload.subject,
        decision: payload.decision,
        rationale: payload.rationale,
        projectId: payload.projectId,
        productionItemId: payload.productionItemId,
        madeBy: mutationContext.requestedBy,
      };
      await runtime.domain.get().decisions.record(record, mutationContext);
      return record;
    },
  );
}
