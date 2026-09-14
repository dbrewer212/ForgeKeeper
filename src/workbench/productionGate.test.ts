import { describe, expect, it } from "vitest";
import { HumanAuthority } from "../mesh/domainServices";
import { InMemoryMeshPersistence } from "../mesh/persistence";
import { FoundryMeshRuntime } from "../mesh/runtime";
import { WorkbenchProductionGate } from "./productionGate";
import { WorkbenchRepository } from "./repository";
import type { WorkbenchService } from "./service";

const productionJobId = "production-job:test";
const preparationId = "preparation:test";
const preparation = {
  preparationId,
  assetId: "asset:test",
  revisionId: "revision:test",
  manufacturingSpecId: "spec:test",
  status: "submitted",
  productionJobId,
  printerId: "printer:test",
  createdAt: new Date(0).toISOString(),
};

async function runtimeWithRunningJob() {
  const runtime = new FoundryMeshRuntime(new InMemoryMeshPersistence());
  await runtime.initialize();
  await runtime.domainState.upsertProductionItem({
    id: productionJobId,
    name: "Test production job",
    stage: "ready-for-production",
    status: "queued",
    workbench: {
      assetId: preparation.assetId,
      revisionId: preparation.revisionId,
      preparationId,
      printerId: preparation.printerId,
    },
  }, {
    requestedBy: HumanAuthority,
    authorizedBy: HumanAuthority,
    reason: "Production Gate test setup.",
  });
  await runtime.productionSteward.startProductionItem(productionJobId);
  return runtime;
}

function evidenceGate(runtime: FoundryMeshRuntime) {
  const repository = {
    loadState: async () => ({ preparations: [preparation] }),
  } as unknown as WorkbenchRepository;
  const workbench = {
    recordPrintResult: async (input: Record<string, unknown>) => ({
      ...input,
      printRecordId: "print-record:test",
      createdAt: new Date().toISOString(),
    }),
  } as unknown as WorkbenchService;
  return new WorkbenchProductionGate(repository, workbench, runtime);
}

describe("WorkbenchProductionGate", () => {
  it("persists an execution-printer assignment before releasing an unassigned preparation", async () => {
    const runtime = new FoundryMeshRuntime(new InMemoryMeshPersistence());
    await runtime.initialize();
    let currentPreparation = {
      ...preparation,
      status: "validated",
      productionJobId: undefined,
      printerId: undefined,
    };
    const events: Array<{ eventType: string; payload: Record<string, unknown> }> = [];
    const repository = {
      loadState: async () => ({ preparations: [currentPreparation] }),
      upsertPreparation: async (value: typeof currentPreparation & { printerId?: string }) => {
        currentPreparation = { ...currentPreparation, ...value };
      },
      appendEvent: async (event: { eventType: string; payload: Record<string, unknown> }) => {
        events.push(event);
      },
    } as unknown as WorkbenchRepository;
    const workbench = {
      submitProductionCandidate: async () => {
        expect(currentPreparation.printerId).toBe("printer:test");
        return { productionJobId };
      },
    } as unknown as WorkbenchService;
    const gate = new WorkbenchProductionGate(repository, workbench, runtime);

    await expect(gate.release(preparationId, "printer:test")).resolves.toEqual({ productionJobId });
    expect(currentPreparation.printerId).toBe("printer:test");
    expect(events).toContainEqual(expect.objectContaining({
      eventType: "preparation.execution_printer.assigned",
      payload: expect.objectContaining({ printerId: "printer:test" }),
    }));
  });

  it("keeps partial-success in operator review instead of treating it as completion", async () => {
    const runtime = await runtimeWithRunningJob();
    const gate = evidenceGate(runtime);

    await gate.recordEvidence({
      preparationId,
      printerId: preparation.printerId,
      outcome: "partial-success",
    });

    await expect(runtime.domain.get().production.get(productionJobId)).resolves.toMatchObject({
      status: "attention-required",
      blocker: expect.stringContaining("partial-success"),
    });
    await expect(runtime.domain.get().sessions.getActive()).resolves.toMatchObject({
      state: "blocked",
      activeProductionItemId: productionJobId,
    });
  });

  it("blocks duplicate returned evidence until the job deliberately enters a retry execution", async () => {
    const runtime = await runtimeWithRunningJob();
    const gate = evidenceGate(runtime);

    await gate.recordEvidence({
      preparationId,
      printerId: preparation.printerId,
      outcome: "failed",
      failureMode: "Adhesion failure",
    });

    await expect(gate.recordEvidence({
      preparationId,
      printerId: preparation.printerId,
      outcome: "failed",
    })).rejects.toThrow(/resolve the current blocker|printing or finishing/i);
  });

  it("closes focused production only for a successful returned result", async () => {
    const runtime = await runtimeWithRunningJob();
    const gate = evidenceGate(runtime);

    await gate.recordEvidence({
      preparationId,
      printerId: preparation.printerId,
      outcome: "success",
    });

    await expect(runtime.domain.get().production.get(productionJobId)).resolves.toMatchObject({
      status: "completed",
      stage: "complete",
      blocker: undefined,
    });
    await expect(runtime.domain.get().sessions.getActive()).resolves.toBeUndefined();
  });
});
