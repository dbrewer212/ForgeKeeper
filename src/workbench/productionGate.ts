import { HumanAuthority } from "../mesh/domainServices";
import { getFoundryMeshRuntime } from "../mesh/runtime";
import type { ManufacturingSpec, PrintOutcome, PrintRecord } from "./contracts";
import { WorkbenchRepository } from "./repository";
import { getWorkbenchService } from "./service";

export type PrintEvidenceInput = {
  preparationId: string;
  printerId: string;
  outcome: PrintOutcome;
  observation?: string;
  failureMode?: string;
  elapsedSeconds?: number;
  measuredMaterialGrams?: number;
};

export class WorkbenchProductionGate {
  constructor(
    private readonly repository = new WorkbenchRepository(),
    private readonly workbench = getWorkbenchService(),
  ) {}

  async approveManufacturingSpec(manufacturingSpecId: string): Promise<ManufacturingSpec> {
    const state = await this.repository.loadState();
    const spec = state.manufacturingSpecs.find((item) => item.manufacturingSpecId === manufacturingSpecId);
    if (!spec) throw new Error(`Unknown ManufacturingSpec: ${manufacturingSpecId}`);
    return this.workbench.updateManufacturingSpec({
      ...spec,
      approvalState: "approved",
      approvedBy: "foundry-owner",
      approvedAt: new Date().toISOString(),
    });
  }

  async release(preparationId: string): Promise<{ productionJobId: string }> {
    return this.workbench.submitProductionCandidate(preparationId);
  }

  async recordEvidence(input: PrintEvidenceInput): Promise<PrintRecord> {
    const state = await this.repository.loadState();
    const preparation = state.preparations.find((item) => item.preparationId === input.preparationId);
    if (!preparation) throw new Error(`Unknown preparation: ${input.preparationId}`);
    if (preparation.status !== "submitted" || !preparation.productionJobId) {
      throw new Error("Print evidence can only be recorded for a preparation released to Production Steward.");
    }
    if (!input.printerId.trim()) throw new Error("A printer is required for physical print evidence.");

    const now = new Date().toISOString();
    const record = await this.workbench.recordPrintResult({
      assetId: preparation.assetId,
      revisionId: preparation.revisionId,
      preparationId: preparation.preparationId,
      productionJobId: preparation.productionJobId,
      printerId: input.printerId,
      materialProfileId: preparation.materialProfileId,
      slicerId: preparation.slicerId,
      profileRef: preparation.slicerProfileRef,
      completedAt: now,
      elapsedSeconds: input.elapsedSeconds,
      measuredMaterialGrams: input.measuredMaterialGrams,
      outcome: input.outcome,
      telemetryRefIds: [],
      observations: input.observation?.trim() ? [{
        observationId: `observation:${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`,
        authorActorId: "foundry-owner",
        category: "operator-result",
        text: input.observation.trim(),
        createdAt: now,
      }] : [],
      failureMode: input.failureMode?.trim() || undefined,
      evidenceFileIds: [],
    });

    const runtime = getFoundryMeshRuntime();
    await runtime.initialize();
    const current = await runtime.domain.get().production.get(preparation.productionJobId);
    if (current) {
      const successful = input.outcome === "success" || input.outcome === "partial-success";
      await runtime.domainState.upsertProductionItem({
        ...current,
        stage: "evidence-recorded",
        status: successful ? "completed" : "attention-required",
        nextAction: successful
          ? "Review returned print evidence and determine whether the manufacturing specification should remain approved."
          : "Review failure evidence, identify corrective action, and return the asset to preparation or inspection as required.",
      }, {
        requestedBy: HumanAuthority,
        authorizedBy: HumanAuthority,
        correlationId: preparation.productionJobId,
        reason: `Recorded ${input.outcome} print evidence for Workbench preparation ${preparation.preparationId}.`,
      });
    }

    return record;
  }
}

let singleton: WorkbenchProductionGate | null = null;
export function getWorkbenchProductionGate(): WorkbenchProductionGate {
  singleton ??= new WorkbenchProductionGate();
  return singleton;
}
