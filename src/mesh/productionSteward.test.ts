import { describe, expect, it } from "vitest";
import { HumanAuthority } from "./domainServices";
import { InMemoryMeshPersistence } from "./persistence";
import { ProductionSteward } from "./productionSteward";
import { FoundryMeshRuntime } from "./runtime";

const context = {
  requestedBy: HumanAuthority,
  authorizedBy: HumanAuthority,
  reason: "Production Steward concurrency test.",
};

async function addJob(runtime: FoundryMeshRuntime, id: string, printerId: string) {
  await runtime.domainState.upsertProductionItem({
    id,
    name: id,
    stage: "ready-for-production",
    status: "queued",
    workbench: {
      assetId: `asset:${id}`,
      revisionId: `revision:${id}`,
      preparationId: `preparation:${id}`,
      printerId,
    },
  }, context);
}

describe("ProductionSteward machine concurrency", () => {
  it("allows multiple running production items on different printers while keeping one human focus session", async () => {
    const runtime = new FoundryMeshRuntime(new InMemoryMeshPersistence());
    await runtime.initialize();
    const steward = new ProductionSteward(runtime);

    await addJob(runtime, "job-a", "printer-a");
    await addJob(runtime, "job-b", "printer-b");

    await steward.startProductionItem("job-a");
    await steward.startProductionItem("job-b");

    await expect(runtime.domain.get().production.get("job-a")).resolves.toMatchObject({ stage: "printing", status: "active" });
    await expect(runtime.domain.get().production.get("job-b")).resolves.toMatchObject({ stage: "printing", status: "active" });
    await expect(runtime.domain.get().sessions.getActive()).resolves.toMatchObject({ activeProductionItemId: "job-a" });
  });

  it("prevents two executing jobs from claiming the same physical printer", async () => {
    const runtime = new FoundryMeshRuntime(new InMemoryMeshPersistence());
    await runtime.initialize();
    const steward = new ProductionSteward(runtime);

    await addJob(runtime, "job-a", "printer-a");
    await addJob(runtime, "job-b", "printer-a");
    await steward.startProductionItem("job-a");

    await expect(steward.startProductionItem("job-b")).rejects.toThrow(/already running/i);
    await expect(runtime.domain.get().production.get("job-b")).resolves.toMatchObject({ stage: "ready-for-production", status: "queued" });
  });

  it("restores a non-focused executing job to active after its blocker is cleared", async () => {
    const runtime = new FoundryMeshRuntime(new InMemoryMeshPersistence());
    await runtime.initialize();
    const steward = new ProductionSteward(runtime);

    await addJob(runtime, "job-a", "printer-a");
    await addJob(runtime, "job-b", "printer-b");
    await steward.startProductionItem("job-a");
    await steward.startProductionItem("job-b");
    await steward.markAttention("job-b", "Temporary machine check");
    await steward.clearAttention("job-b");

    await expect(runtime.domain.get().production.get("job-b")).resolves.toMatchObject({
      stage: "printing",
      status: "active",
      blocker: undefined,
    });
  });

  it("returns a stopped focused job to queued retry state instead of pretending the printer is running", async () => {
    const runtime = new FoundryMeshRuntime(new InMemoryMeshPersistence());
    await runtime.initialize();
    const steward = new ProductionSteward(runtime);

    await addJob(runtime, "job-a", "printer-a");
    await steward.startProductionItem("job-a");
    await runtime.domainState.upsertProductionItem({
      ...(await runtime.domain.get().production.get("job-a"))!,
      stage: "stopped",
      status: "attention-required",
      blocker: "Print failed",
    }, context);
    await steward.clearAttention("job-a");

    await expect(runtime.domain.get().production.get("job-a")).resolves.toMatchObject({
      stage: "stopped",
      status: "queued",
      blocker: undefined,
    });
    await expect(runtime.domain.get().sessions.getActive()).resolves.toMatchObject({
      state: "paused",
      activeProductionItemId: "job-a",
    });
  });
});
