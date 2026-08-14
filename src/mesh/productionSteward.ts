import type {
  ActiveWorkSnapshot,
  DomainMutationContext,
  ParkedThought,
  ParkedThoughtCategory,
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
