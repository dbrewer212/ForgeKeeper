import type {
  ActiveWorkSnapshot,
  DomainMutationContext,
  FoundrySession,
  ParkedThought,
  ParkedThoughtCategory,
  ProductionItemSummary,
  ResumeContext,
} from "./domainServices";
import { HumanAuthority } from "./domainServices";
import type { FoundryMeshRuntime } from "./runtime";

export type StewardMode = "start" | "stay" | "recover" | "finish";

export type StewardBrief = {
  generatedAt: string;
  mode: StewardMode;
  activeWork: ActiveWorkSnapshot;
  smallestMeaningfulAction?: string;
  blocker?: string;
  parkedThoughtCount: number;
  reentry: ResumeContext;
  completionReady: boolean;
};

export type ProductionCandidate = {
  productionItemId: string;
  name: string;
  projectId?: string;
  assetId: string;
  revisionId: string;
  preparationId: string;
  printerId?: string;
};

export type ProductionExecutionStage = "ready-for-production" | "printing" | "finishing";

function humanContext(reason: string, correlationId?: string): DomainMutationContext {
  return {
    requestedBy: HumanAuthority,
    authorizedBy: HumanAuthority,
    correlationId,
    reason,
  };
}

function machineIsExecuting(item: ProductionItemSummary): boolean {
  return item.status !== "completed" && (item.stage === "printing" || item.stage === "finishing");
}

export class ProductionSteward {
  constructor(private readonly runtime: FoundryMeshRuntime) {}

  async inspect(): Promise<StewardBrief> {
    const domain = this.runtime.domain.get();
    const activeWork = await domain.production.getActiveWork();
    const session = activeWork.session;
    const blocker = activeWork.blocker ?? session?.blockedBy;
    const nextAction = activeWork.nextAction ?? session?.nextAction;
    const currentAction = activeWork.currentAction ?? session?.currentAction;
    const objective = activeWork.objective ?? session?.currentObjective;

    let mode: StewardMode;
    if (!session) mode = "start";
    else if (session.state === "blocked" || blocker) mode = "recover";
    else if (!nextAction && (session.state === "active" || session.state === "paused")) mode = "finish";
    else mode = "stay";

    const reentry: ResumeContext = {
      ...activeWork.resumeContext,
      currentCondition: activeWork.resumeContext?.currentCondition ?? currentAction ?? objective,
      blocker: activeWork.resumeContext?.blocker ?? blocker,
      nextAction: activeWork.resumeContext?.nextAction ?? nextAction,
    };

    return {
      generatedAt: new Date().toISOString(),
      mode,
      activeWork,
      smallestMeaningfulAction: nextAction ?? currentAction ?? objective,
      blocker,
      parkedThoughtCount: activeWork.parkedThoughtCount,
      reentry,
      completionReady: Boolean(session && !blocker && !nextAction && session.state === "active"),
    };
  }

  async acceptProductionCandidate(
    candidate: ProductionCandidate,
    context: DomainMutationContext = humanContext(`Accept Workbench preparation ${candidate.preparationId}.`, candidate.productionItemId),
  ): Promise<ProductionItemSummary> {
    await this.runtime.initialize();
    const existing = await this.runtime.domain.get().production.get(candidate.productionItemId);
    if (existing) return existing;

    const item: ProductionItemSummary = {
      id: candidate.productionItemId,
      projectId: candidate.projectId,
      name: candidate.name,
      stage: "ready-for-production",
      status: "queued",
      nextAction: candidate.printerId
        ? `Begin the approved preparation on ${candidate.printerId} and mark the print as started when physical execution begins.`
        : `Assign an execution printer before starting preparation ${candidate.preparationId}.`,
      workbench: {
        assetId: candidate.assetId,
        revisionId: candidate.revisionId,
        preparationId: candidate.preparationId,
        printerId: candidate.printerId,
      },
    };

    await this.runtime.domainState.upsertProductionItem(item, {
      ...context,
      correlationId: context.correlationId ?? candidate.productionItemId,
      reason: context.reason ?? `Accepted Workbench preparation ${candidate.preparationId} for production.`,
    });
    return item;
  }

  async startProductionItem(
    productionItemId: string,
    context: DomainMutationContext = humanContext(`Begin production tracking for ${productionItemId}.`, productionItemId),
  ): Promise<ProductionItemSummary> {
    await this.runtime.initialize();
    const domain = this.runtime.domain.get();
    const item = await domain.production.get(productionItemId);
    if (!item) throw new Error(`Production item ${productionItemId} does not exist.`);
    if (item.status === "completed") throw new Error(`Production item ${productionItemId} is already completed.`);
    if (item.blocker) throw new Error(`Production item ${productionItemId} still has blocker: ${item.blocker}`);

    const printerId = item.workbench?.printerId;
    if (item.workbench && !printerId) {
      throw new Error(`Assign an execution printer before starting ${item.name}.`);
    }
    if (printerId) {
      const conflict = (await domain.production.list()).find((candidate) =>
        candidate.id !== item.id && candidate.workbench?.printerId === printerId && machineIsExecuting(candidate)
      );
      if (conflict) {
        throw new Error(`${printerId} is already running ${conflict.name}. Finish or stop that job before starting ${item.name} on the same printer.`);
      }
    }

    // A Foundry session represents the operator's focus/re-entry context, not a mutex on machine work.
    // Multiple printers may execute concurrently while one (or none) is the focused human session.
    const active = await domain.sessions.getActive();
    if (!active) {
      const now = new Date().toISOString();
      const session: FoundrySession = {
        id: `session:production:${productionItemId}:${Date.now()}`,
        startedAt: now,
        updatedAt: now,
        state: "active",
        activeProjectId: item.projectId,
        activeProductionItemId: item.id,
        currentObjective: `Produce ${item.name}`,
        currentStage: "printing",
        currentAction: printerId
          ? `Execute preparation ${item.workbench?.preparationId ?? "approved preparation"} on ${printerId}.`
          : `Execute preparation ${item.workbench?.preparationId ?? "approved preparation"}.`,
        nextAction: "Monitor the print through Bastion and record the physical result when execution finishes.",
        parkedThoughtIds: [],
        participatingWorkerIds: [],
        resumeContext: {
          currentCondition: "Production execution started.",
          nextAction: "Monitor through Bastion and record the physical result.",
        },
      };
      await domain.sessions.start(session, context);
    } else if (active.activeProductionItemId === productionItemId) {
      await domain.sessions.update(active.id, {
        state: "active",
        currentStage: "printing",
        currentAction: printerId
          ? `Execute preparation ${item.workbench?.preparationId ?? "approved preparation"} on ${printerId}.`
          : `Execute preparation ${item.workbench?.preparationId ?? "approved preparation"}.`,
        nextAction: "Monitor the print through Bastion and record the physical result when execution finishes.",
        blockedBy: undefined,
      }, context);
    }

    const next: ProductionItemSummary = {
      ...item,
      stage: "printing",
      status: "active",
      blocker: undefined,
      nextAction: "Monitor the print through Bastion and record the physical result when execution finishes.",
    };
    await this.runtime.domainState.upsertProductionItem(next, context);
    return next;
  }

  async advanceProductionItem(
    productionItemId: string,
    stage: Extract<ProductionExecutionStage, "printing" | "finishing">,
    context: DomainMutationContext = humanContext(`Advance production item ${productionItemId} to ${stage}.`, productionItemId),
  ): Promise<ProductionItemSummary> {
    await this.runtime.initialize();
    const domain = this.runtime.domain.get();
    const item = await domain.production.get(productionItemId);
    if (!item) throw new Error(`Production item ${productionItemId} does not exist.`);
    if (item.status === "completed") throw new Error(`Production item ${productionItemId} is already completed.`);

    const next: ProductionItemSummary = {
      ...item,
      stage,
      status: item.blocker ? "attention-required" : "active",
      nextAction: stage === "finishing"
        ? "Complete finishing/inspection and record the physical print result in Production."
        : "Monitor the print through Bastion and record the physical result when execution finishes.",
    };
    await this.runtime.domainState.upsertProductionItem(next, context);

    const active = await domain.sessions.getActive();
    if (active?.activeProductionItemId === productionItemId) {
      await domain.sessions.update(active.id, {
        currentStage: stage,
        currentAction: next.nextAction,
        nextAction: next.nextAction,
        state: item.blocker ? "blocked" : "active",
      }, context);
    }
    return next;
  }

  async markAttention(
    productionItemId: string,
    blocker: string,
    context: DomainMutationContext = humanContext(`Mark production item ${productionItemId} attention-required.`, productionItemId),
  ): Promise<ProductionItemSummary> {
    const trimmed = blocker.trim();
    if (!trimmed) throw new Error("A production blocker must explain what needs attention.");
    await this.runtime.initialize();
    const domain = this.runtime.domain.get();
    const item = await domain.production.get(productionItemId);
    if (!item) throw new Error(`Production item ${productionItemId} does not exist.`);
    const next = { ...item, status: "attention-required", blocker: trimmed };
    await this.runtime.domainState.upsertProductionItem(next, context);
    const active = await domain.sessions.getActive();
    if (active?.activeProductionItemId === productionItemId) {
      await domain.sessions.update(active.id, { state: "blocked", blockedBy: trimmed }, context);
    }
    return next;
  }

  async clearAttention(
    productionItemId: string,
    context: DomainMutationContext = humanContext(`Clear production blocker for ${productionItemId}.`, productionItemId),
  ): Promise<ProductionItemSummary> {
    await this.runtime.initialize();
    const domain = this.runtime.domain.get();
    const item = await domain.production.get(productionItemId);
    if (!item) throw new Error(`Production item ${productionItemId} does not exist.`);
    const active = await domain.sessions.getActive();
    const isFocused = active?.activeProductionItemId === productionItemId;
    const isExecuting = machineIsExecuting(item);
    const nextAction = isExecuting
      ? item.nextAction
      : item.workbench?.printerId
        ? `Prepare the corrective retry on ${item.workbench.printerId}; mark the print as started only when physical execution actually begins.`
        : "Assign an execution printer, prepare the corrective retry, and mark the print as started only when physical execution actually begins.";
    const next: ProductionItemSummary = {
      ...item,
      blocker: undefined,
      status: isExecuting ? "active" : "queued",
      nextAction,
    };
    await this.runtime.domainState.upsertProductionItem(next, context);
    if (isFocused && active) {
      await domain.sessions.update(active.id, {
        state: isExecuting ? "active" : "paused",
        blockedBy: undefined,
        currentAction: nextAction,
        nextAction,
      }, context);
    }
    return next;
  }

  async completeProductionItem(
    productionItemId: string,
    context: DomainMutationContext = humanContext(`Complete production item ${productionItemId}.`, productionItemId),
  ): Promise<ProductionItemSummary> {
    await this.runtime.initialize();
    const domain = this.runtime.domain.get();
    const item = await domain.production.get(productionItemId);
    if (!item) throw new Error(`Production item ${productionItemId} does not exist.`);
    if (item.blocker) throw new Error(`Production item ${productionItemId} still has blocker: ${item.blocker}`);

    const active = await domain.sessions.getActive();
    if (active?.activeProductionItemId === productionItemId) {
      await domain.sessions.end(active.id, "completed", context);
    }
    const next: ProductionItemSummary = {
      ...item,
      stage: "complete",
      status: "completed",
      blocker: undefined,
      nextAction: undefined,
    };
    await this.runtime.domainState.upsertProductionItem(next, context);
    return next;
  }

  async captureBranch(
    text: string,
    category: ParkedThoughtCategory,
    source = "Production Steward",
    context: DomainMutationContext = { requestedBy: HumanAuthority, authorizedBy: HumanAuthority },
  ): Promise<ParkedThought> {
    const domain = this.runtime.domain.get();
    const session = await domain.sessions.getActive();
    if (!session) throw new Error("Crow Taxi capture requires an active Foundry session.");
    const trimmed = text.trim();
    if (!trimmed) throw new Error("Cannot capture an empty thought.");

    const thought: ParkedThought = {
      id: `thought-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      capturedAt: new Date().toISOString(),
      text: trimmed,
      category,
      source,
      relatedProjectId: session.activeProjectId,
      relatedProductionItemId: session.activeProductionItemId,
    };
    await domain.sessions.captureThought(thought, context);
    return thought;
  }

  async setNextAction(
    nextAction: string,
    context: DomainMutationContext = { requestedBy: HumanAuthority, authorizedBy: HumanAuthority },
  ): Promise<void> {
    const trimmed = nextAction.trim();
    if (!trimmed) throw new Error("Next action cannot be empty.");
    const domain = this.runtime.domain.get();
    const active = await domain.production.getActiveWork();
    if (active.productionItemId) {
      await domain.production.setNextAction(active.productionItemId, trimmed, context);
    }
    if (active.session) {
      await domain.sessions.update(active.session.id, { nextAction: trimmed }, context);
    }
  }
}
