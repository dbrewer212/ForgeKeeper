import { HumanAuthority } from "../mesh/domainServices";
import { ProductionSteward } from "../mesh/productionSteward";
import { getFoundryMeshRuntime } from "../mesh/runtime";
import type { ManufacturingSpec, PrintOutcome, PrintRecord } from "./contracts";
import { WorkbenchRepository } from "./repository";
import { getWorkbenchService } from "./service";

export type PrintMaterialAllocation = {
  spoolId: string;
  grams: number;
};

export type PrintEvidenceInput = {
  preparationId: string;
  printerId: string;
  outcome: PrintOutcome;
  observation?: string;
  failureMode?: string;
  elapsedSeconds?: number;
  measuredMaterialGrams?: number;
  materialAllocations?: PrintMaterialAllocation[];
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
    if (preparation.printerId && input.printerId !== preparation.printerId) {
      throw new Error(`Returned evidence names printer ${input.printerId}, but the preparation was released for ${preparation.printerId}.`);
    }

    const allocations = (input.materialAllocations ?? [])
      .map((item) => ({ spoolId: item.spoolId.trim(), grams: Number(item.grams) }))
      .filter((item) => item.spoolId || item.grams > 0);
    const seen = new Set<string>();
    for (const allocation of allocations) {
      if (!allocation.spoolId || !Number.isFinite(allocation.grams) || allocation.grams <= 0) {
        throw new Error("Every material allocation requires a physical spool and a positive measured gram amount.");
      }
      if (seen.has(allocation.spoolId)) throw new Error(`Physical spool ${allocation.spoolId} is allocated more than once. Combine its measured grams into one entry.`);
      seen.add(allocation.spoolId);
      if (preparation.physicalSpoolIds?.length && !preparation.physicalSpoolIds.includes(allocation.spoolId)) {
        throw new Error(`Physical spool ${allocation.spoolId} was not assigned to preparation ${preparation.preparationId}.`);
      }
    }

    const allocatedGrams = allocations.reduce((sum, item) => sum + item.grams, 0);
    if (input.measuredMaterialGrams !== undefined && allocations.length && Math.abs(input.measuredMaterialGrams - allocatedGrams) > 0.05) {
      throw new Error(`Measured material total (${input.measuredMaterialGrams}g) does not match physical-spool allocations (${allocatedGrams.toFixed(2)}g).`);
    }
    const measuredMaterialGrams = allocations.length ? allocatedGrams : input.measuredMaterialGrams;
    const physicalSpoolIds = allocations.length
      ? allocations.map((item) => item.spoolId)
      : preparation.physicalSpoolIds;

    const now = new Date().toISOString();
    const record = await this.workbench.recordPrintResult({
      assetId: preparation.assetId,
      revisionId: preparation.revisionId,
      preparationId: preparation.preparationId,
      productionJobId: preparation.productionJobId,
      printerId: input.printerId,
      materialProfileId: preparation.materialProfileId,
      physicalSpoolIds,
      slicerId: preparation.slicerId,
      profileRef: preparation.slicerProfileRef,
      completedAt: now,
      elapsedSeconds: input.elapsedSeconds,
      measuredMaterialGrams,
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
    const steward = new ProductionSteward(runtime);
    const successful = input.outcome === "success" || input.outcome === "partial-success";
    const current = await runtime.domain.get().production.get(preparation.productionJobId);
    if (current) {
      const context = {
        requestedBy: HumanAuthority,
        authorizedBy: HumanAuthority,
        correlationId: preparation.productionJobId,
        reason: `Recorded ${input.outcome} print evidence for Workbench preparation ${preparation.preparationId}.`,
      };
      if (successful) {
        await steward.completeProductionItem(preparation.productionJobId, context);
        const completed = await runtime.domain.get().production.get(preparation.productionJobId);
        if (completed) {
          await runtime.domainState.upsertProductionItem({
            ...completed,
            stage: "evidence-recorded",
            nextAction: "Review returned print evidence and determine whether the manufacturing specification should remain approved.",
          }, context);
        }
      } else {
        await steward.markAttention(
          preparation.productionJobId,
          input.failureMode?.trim() || `Returned print outcome: ${input.outcome}. Review evidence and determine corrective action.`,
          context,
        );
        const attention = await runtime.domain.get().production.get(preparation.productionJobId);
        if (attention) {
          await runtime.domainState.upsertProductionItem({
            ...attention,
            stage: "evidence-recorded",
            nextAction: "Review failure evidence, identify corrective action, and return the asset to preparation or inspection as required.",
          }, context);
        }
      }
    }

    return record;
  }
}

let singleton: WorkbenchProductionGate | null = null;
export function getWorkbenchProductionGate(): WorkbenchProductionGate {
  singleton ??= new WorkbenchProductionGate();
  return singleton;
}
