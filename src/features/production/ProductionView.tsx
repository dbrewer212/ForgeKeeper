import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import type { ProductionItemSummary } from "../../mesh/domainServices";
import { HumanAuthority } from "../../mesh/domainServices";
import { getFoundryMeshRuntime } from "../../mesh";
import { ProductionSteward } from "../../mesh/productionSteward";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { PrintOutcome } from "../../workbench/contracts";
import { getWorkbenchProductionGate, type PrintMaterialAllocation } from "../../workbench/productionGate";
import { useWorkbenchVault } from "../../workbench/useWorkbenchVault";

const outcomes: PrintOutcome[] = ["success", "partial-success", "failed", "cancelled", "aborted"];

type QueueGroup = "attention" | "running" | "queued" | "done";

function queueGroup(item: ProductionItemSummary): QueueGroup {
  if (item.status === "attention-required" || item.blocker) return "attention";
  if (item.status === "completed" || item.stage === "complete" || item.stage === "evidence-recorded") return "done";
  if (item.stage === "printing" || item.stage === "finishing" || item.status === "active") return "running";
  return "queued";
}

function priority(item: ProductionItemSummary): number {
  const group = queueGroup(item);
  if (group === "attention") return 0;
  if (group === "running") return 1;
  if (group === "queued") return 2;
  return 3;
}

function groupLabel(group: QueueGroup): string {
  if (group === "attention") return "Needs attention";
  if (group === "running") return "Running";
  if (group === "queued") return "Up next";
  return "Recently done";
}

function statusTone(group: QueueGroup): string {
  if (group === "attention") return "border-rose-500/25 bg-rose-500/5";
  if (group === "running") return "border-emerald-500/25 bg-emerald-500/5";
  if (group === "queued") return "border-amber-500/20 bg-amber-500/5";
  return "border-white/10 bg-[#0b1119]";
}

export function ProductionView({ state }: { state: ForgekeeperState }) {
  const workbench = useWorkbenchVault(state);
  const [items, setItems] = useState<ProductionItemSummary[]>([]);
  const [focusedId, setFocusedId] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState<string>();
  const [nextActionDrafts, setNextActionDrafts] = useState<Record<string, string>>({});
  const [blockerDrafts, setBlockerDrafts] = useState<Record<string, string>>({});
  const [resultPrinterId, setResultPrinterId] = useState("");
  const [resultOutcome, setResultOutcome] = useState<PrintOutcome>("success");
  const [resultObservation, setResultObservation] = useState("");
  const [resultFailureMode, setResultFailureMode] = useState("");
  const [elapsedMinutes, setElapsedMinutes] = useState("");
  const [allocationDrafts, setAllocationDrafts] = useState<Record<string, string>>({});

  const runtime = useMemo(() => getFoundryMeshRuntime(), []);
  const steward = useMemo(() => new ProductionSteward(runtime), [runtime]);

  async function refreshQueue() {
    try {
      await runtime.initialize();
      const [productionItems, active] = await Promise.all([
        runtime.domain.get().production.list(),
        runtime.domain.get().production.getActiveWork(),
      ]);
      setItems(productionItems);
      setFocusedId(active.productionItemId);
      setSelectedId((current) => {
        if (current && productionItems.some((item) => item.id === current)) return current;
        if (active.productionItemId && productionItems.some((item) => item.id === active.productionItemId)) return active.productionItemId;
        return [...productionItems].sort((a, b) => priority(a) - priority(b))[0]?.id;
      });
      setNextActionDrafts((current) => {
        const next = { ...current };
        for (const item of productionItems) if (!(item.id in next)) next[item.id] = item.nextAction ?? "";
        return next;
      });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function refreshAll() {
    await Promise.all([refreshQueue(), workbench.refresh()]);
  }

  useEffect(() => {
    void refreshQueue();
    const timer = window.setInterval(() => void refreshQueue(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const ordered = useMemo(
    () => [...items].sort((a, b) => {
      if (a.id === focusedId) return -1;
      if (b.id === focusedId) return 1;
      return priority(a) - priority(b) || a.name.localeCompare(b.name);
    }),
    [focusedId, items],
  );

  const selectedItem = ordered.find((item) => item.id === selectedId) ?? ordered[0];
  const preparation = selectedItem?.workbench
    ? workbench.workbench.preparations.find((item) => item.preparationId === selectedItem.workbench?.preparationId)
    : undefined;
  const asset = preparation
    ? workbench.workbench.assets.find((item) => item.assetId === preparation.assetId)
    : undefined;
  const evidence = preparation
    ? workbench.workbench.printRecords.filter((record) => record.preparationId === preparation.preparationId)
    : [];

  const candidateSpools = useMemo(() => {
    if (!preparation?.materialProfileId) return [];
    const assigned = new Set(preparation.physicalSpoolIds ?? []);
    return state.filament
      .filter((spool) =>
        spool.profileId === preparation.materialProfileId &&
        spool.status !== "Archived" &&
        spool.status !== "Empty" &&
        spool.condition !== "Empty"
      )
      .sort((a, b) => {
        const aAssigned = assigned.has(a.id) ? 0 : 1;
        const bAssigned = assigned.has(b.id) ? 0 : 1;
        return aAssigned - bAssigned || a.foundrySpoolCode.localeCompare(b.foundrySpoolCode);
      });
  }, [preparation?.materialProfileId, preparation?.physicalSpoolIds, state.filament]);

  useEffect(() => {
    setResultPrinterId(preparation?.printerId ?? selectedItem?.workbench?.printerId ?? "");
    setResultOutcome("success");
    setResultObservation("");
    setResultFailureMode("");
    setElapsedMinutes("");
    setAllocationDrafts({});
    setMessage("");
  }, [selectedItem?.id, preparation?.preparationId]);

  async function run(itemId: string, action: () => Promise<unknown>, refreshWorkbench = false) {
    setBusyId(itemId);
    setError("");
    setMessage("");
    try {
      await action();
      if (refreshWorkbench) await refreshAll();
      else await refreshQueue();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusyId(undefined);
    }
  }

  async function saveNextAction(item: ProductionItemSummary) {
    const value = (nextActionDrafts[item.id] ?? "").trim();
    if (!value) {
      setError("Next action cannot be empty.");
      return;
    }
    await run(item.id, () => runtime.domain.get().production.setNextAction(item.id, value, {
      requestedBy: HumanAuthority,
      authorizedBy: HumanAuthority,
      correlationId: item.id,
      reason: "Operator updated the production next action from the Production station.",
    }));
  }

  async function markAttention(item: ProductionItemSummary) {
    const blocker = (blockerDrafts[item.id] ?? "").trim();
    if (!blocker) {
      setError("Explain what needs attention before flagging the job.");
      return;
    }
    await run(item.id, () => steward.markAttention(item.id, blocker));
    setBlockerDrafts((current) => ({ ...current, [item.id]: "" }));
  }

  function materialAllocations(): PrintMaterialAllocation[] {
    return Object.entries(allocationDrafts)
      .map(([spoolId, raw]) => ({ spoolId, grams: Number(raw) }))
      .filter((item) => item.spoolId && Number.isFinite(item.grams) && item.grams > 0);
  }

  function validateLedgerAllocations(allocations: PrintMaterialAllocation[]): string | undefined {
    for (const allocation of allocations) {
      const spool = state.filament.find((item) => item.id === allocation.spoolId);
      if (!spool) return `Physical spool ${allocation.spoolId} is no longer in inventory.`;
      if (spool.quantityConfidence === "Unknown") return `${spool.foundrySpoolCode} has unknown remaining quantity. Measure or estimate it before posting production consumption.`;
      if (allocation.grams > spool.gramsAvailable) return `${spool.foundrySpoolCode} has ${spool.gramsAvailable.toFixed(1)}g recorded, but ${allocation.grams.toFixed(1)}g was entered as actual use.`;
      if (preparation?.materialProfileId && spool.profileId !== preparation.materialProfileId) return `${spool.foundrySpoolCode} does not match the preparation material profile.`;
      if (preparation?.physicalSpoolIds?.length && !preparation.physicalSpoolIds.includes(spool.id)) return `${spool.foundrySpoolCode} was not assigned to this preparation. Update the preparation before posting consumption.`;
    }
    return undefined;
  }

  async function recordResult(item: ProductionItemSummary) {
    if (!preparation) {
      setError("This production item is not linked to a Workbench preparation, so a governed print result cannot be recorded here.");
      return;
    }
    const printerId = resultPrinterId || preparation.printerId || item.workbench?.printerId || "";
    if (!printerId) {
      setError("Select the printer that produced this result.");
      return;
    }
    const allocations = materialAllocations();
    const allocationError = validateLedgerAllocations(allocations);
    if (allocationError) {
      setError(allocationError);
      return;
    }

    await run(item.id, async () => {
      const record = await getWorkbenchProductionGate().recordEvidence({
        preparationId: preparation.preparationId,
        printerId,
        outcome: resultOutcome,
        observation: resultObservation,
        failureMode: resultFailureMode,
        elapsedSeconds: elapsedMinutes ? Math.round(Number(elapsedMinutes) * 60) : undefined,
        materialAllocations: allocations,
      });

      if (allocations.length) {
        const consumed = state.consumeMaterialForProduction(
          record.productionJobId,
          allocations,
          `Measured production use for ${asset?.name ?? record.assetId}; PrintRecord ${record.printRecordId}`,
        );
        if (!consumed) {
          throw new Error(`Print evidence ${record.printRecordId} was recorded, but material ledger reconciliation failed. Do not record the print twice; reconcile physical spool consumption against that PrintRecord.`);
        }
      }

      setMessage(resultOutcome === "success" || resultOutcome === "partial-success"
        ? "Result recorded. Evidence, production state, and material usage are reconciled."
        : "Result recorded and the job has been moved to Needs Attention for corrective action.");
      setResultObservation("");
      setResultFailureMode("");
      setElapsedMinutes("");
      setAllocationDrafts({});
    }, true);
  }

  const runningCount = items.filter((item) => queueGroup(item) === "running").length;
  const attentionCount = items.filter((item) => queueGroup(item) === "attention").length;
  const queuedCount = items.filter((item) => queueGroup(item) === "queued").length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-amber-400">Production Steward</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">Production</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">Run released jobs here from start through returned physical evidence. Workbench still owns manufacturing authority and lineage underneath; you should not have to bounce between stations during normal execution.</p>
          </div>
          <Button variant="ghost" onClick={() => void refreshAll()}>Refresh</Button>
        </div>
      </div>

      {error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">{error}</div> : null}
      {workbench.error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">Workbench: {workbench.error}</div> : null}
      {message ? <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">{message}</div> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Running" value={runningCount} helper="Machine jobs in printing / finishing" />
        <Metric label="Needs attention" value={attentionCount} helper="Blocked or failed work" warning={attentionCount > 0} />
        <Metric label="Up next" value={queuedCount} helper="Released and ready for execution" />
        <Metric label="Your focus" value={focusedId ? items.find((item) => item.id === focusedId)?.name ?? "Focused work" : "None"} helper="Focus does not limit concurrent printers" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(320px,0.8fr),minmax(0,1.6fr)]">
        <Card title="Production Queue" right={<span className="text-xs text-slate-500">{items.filter((item) => item.status !== "completed").length} actionable</span>}>
          <div className="space-y-4">
            {(["attention", "running", "queued", "done"] as QueueGroup[]).map((group) => {
              const jobs = ordered.filter((item) => queueGroup(item) === group).slice(0, group === "done" ? 4 : undefined);
              if (!jobs.length) return null;
              return (
                <section key={group}>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{groupLabel(group)}</div>
                    <div className="text-xs text-slate-600">{jobs.length}</div>
                  </div>
                  <div className="space-y-2">
                    {jobs.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className={`w-full rounded-xl border p-3 text-left transition ${statusTone(group)} ${selectedItem?.id === item.id ? "ring-1 ring-amber-400/50" : "hover:bg-white/[0.04]"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-100">{item.name}</div>
                            <div className="mt-1 text-[11px] text-slate-500">{item.workbench?.printerId || "Printer unassigned"} · {item.stage ?? "stage unset"}</div>
                          </div>
                          {item.id === focusedId ? <span className="rounded-full border border-sky-500/25 bg-sky-500/10 px-2 py-1 text-[9px] font-semibold uppercase text-sky-300">Focus</span> : null}
                        </div>
                        <div className="mt-2 line-clamp-2 text-xs text-slate-400">{item.blocker ? `Blocked: ${item.blocker}` : item.nextAction || "No next action recorded"}</div>
                      </button>
                    ))}
                  </div>
                </section>
              );
            })}
            {!ordered.length ? <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">No production jobs have been released yet.</div> : null}
          </div>
        </Card>

        {selectedItem ? (
          <JobWorkspace
            state={state}
            item={selectedItem}
            focused={selectedItem.id === focusedId}
            busy={busyId === selectedItem.id}
            assetName={asset?.name}
            preparationId={preparation?.preparationId}
            evidenceCount={evidence.length}
            candidateSpools={candidateSpools}
            nextAction={nextActionDrafts[selectedItem.id] ?? selectedItem.nextAction ?? ""}
            blockerDraft={blockerDrafts[selectedItem.id] ?? ""}
            resultPrinterId={resultPrinterId}
            resultOutcome={resultOutcome}
            resultObservation={resultObservation}
            resultFailureMode={resultFailureMode}
            elapsedMinutes={elapsedMinutes}
            allocationDrafts={allocationDrafts}
            evidence={evidence}
            setNextAction={(value) => setNextActionDrafts((current) => ({ ...current, [selectedItem.id]: value }))}
            setBlocker={(value) => setBlockerDrafts((current) => ({ ...current, [selectedItem.id]: value }))}
            setResultPrinterId={setResultPrinterId}
            setResultOutcome={setResultOutcome}
            setResultObservation={setResultObservation}
            setResultFailureMode={setResultFailureMode}
            setElapsedMinutes={setElapsedMinutes}
            setAllocation={(spoolId, value) => setAllocationDrafts((current) => ({ ...current, [spoolId]: value }))}
            saveNextAction={() => void saveNextAction(selectedItem)}
            markPrintStarted={() => void run(selectedItem.id, () => steward.startProductionItem(selectedItem.id))}
            moveToFinishing={() => void run(selectedItem.id, () => steward.advanceProductionItem(selectedItem.id, "finishing"))}
            markAttention={() => void markAttention(selectedItem)}
            clearAttention={() => void run(selectedItem.id, () => steward.clearAttention(selectedItem.id))}
            recordResult={() => void recordResult(selectedItem)}
          />
        ) : (
          <Card title="Job Workspace"><div className="p-6 text-sm text-slate-500">Select or release a production job to begin.</div></Card>
        )}
      </div>
    </div>
  );
}

function JobWorkspace({
  state,
  item,
  focused,
  busy,
  assetName,
  preparationId,
  evidenceCount,
  candidateSpools,
  nextAction,
  blockerDraft,
  resultPrinterId,
  resultOutcome,
  resultObservation,
  resultFailureMode,
  elapsedMinutes,
  allocationDrafts,
  evidence,
  setNextAction,
  setBlocker,
  setResultPrinterId,
  setResultOutcome,
  setResultObservation,
  setResultFailureMode,
  setElapsedMinutes,
  setAllocation,
  saveNextAction,
  markPrintStarted,
  moveToFinishing,
  markAttention,
  clearAttention,
  recordResult,
}: {
  state: ForgekeeperState;
  item: ProductionItemSummary;
  focused: boolean;
  busy: boolean;
  assetName?: string;
  preparationId?: string;
  evidenceCount: number;
  candidateSpools: ForgekeeperState["filament"];
  nextAction: string;
  blockerDraft: string;
  resultPrinterId: string;
  resultOutcome: PrintOutcome;
  resultObservation: string;
  resultFailureMode: string;
  elapsedMinutes: string;
  allocationDrafts: Record<string, string>;
  evidence: ReturnType<typeof useWorkbenchVault>["workbench"]["printRecords"];
  setNextAction(value: string): void;
  setBlocker(value: string): void;
  setResultPrinterId(value: string): void;
  setResultOutcome(value: PrintOutcome): void;
  setResultObservation(value: string): void;
  setResultFailureMode(value: string): void;
  setElapsedMinutes(value: string): void;
  setAllocation(spoolId: string, value: string): void;
  saveNextAction(): void;
  markPrintStarted(): void;
  moveToFinishing(): void;
  markAttention(): void;
  clearAttention(): void;
  recordResult(): void;
}) {
  const group = queueGroup(item);
  const canRecordResult = Boolean(item.workbench && preparationId && (item.stage === "printing" || item.stage === "finishing" || item.status === "attention-required"));
  const measuredTotal = Object.values(allocationDrafts).reduce((sum, raw) => {
    const value = Number(raw);
    return sum + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);

  return (
    <Card title={assetName || item.name} right={<div className="flex flex-wrap gap-2"><Badge label={groupLabel(group)} tone={group} />{focused ? <Badge label="Your focus" tone="focus" /> : null}</div>}>
      <div className="grid gap-3 md:grid-cols-3">
        <Readout label="Printer" value={item.workbench?.printerId || "Unassigned"} />
        <Readout label="Stage" value={item.stage || "Unset"} />
        <Readout label="Evidence" value={`${evidenceCount} record${evidenceCount === 1 ? "" : "s"}`} />
      </div>

      {item.blocker ? <div className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/5 p-4 text-sm text-rose-200"><div className="text-[10px] uppercase tracking-[0.14em] text-rose-400">Needs attention</div><div className="mt-2">{item.blocker}</div></div> : null}

      <div className="mt-5 rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-4">
        <div className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Current action</div>
        <div className="mt-2 text-sm leading-6 text-slate-300">{item.nextAction || "No next action recorded."}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          {group === "queued" && !item.blocker ? <Button onClick={markPrintStarted} disabled={busy}>{busy ? "Updating…" : "Mark Print Started"}</Button> : null}
          {item.stage === "printing" && !item.blocker ? <Button variant="ghost" onClick={moveToFinishing} disabled={busy}>Move to Finishing</Button> : null}
          {item.blocker ? <Button onClick={clearAttention} disabled={busy}>Clear Blocker</Button> : null}
        </div>
        {group === "queued" ? <div className="mt-3 text-xs text-slate-500">Mark Print Started updates Foundry tracking only. It does not send a start command to the physical printer yet.</div> : null}
      </div>

      {canRecordResult ? (
        <div className="mt-5 rounded-2xl border border-white/10 bg-[#0b1119] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-[0.14em] text-amber-400">Record physical result</div>
              <div className="mt-1 text-sm text-slate-400">This single action returns evidence to Workbench, updates Production Steward, and reconciles measured material use.</div>
            </div>
            <div className="text-xs text-slate-500">{measuredTotal.toFixed(1)}g entered</div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <label className="text-xs text-slate-500">Printer
              <Select className="mt-1" value={resultPrinterId} onChange={(event) => setResultPrinterId(event.target.value)} disabled={busy}>
                <option value="">Select printer</option>
                {state.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}
              </Select>
            </label>
            <label className="text-xs text-slate-500">Outcome
              <Select className="mt-1" value={resultOutcome} onChange={(event) => setResultOutcome(event.target.value as PrintOutcome)} disabled={busy}>
                {outcomes.map((outcome) => <option key={outcome} value={outcome}>{outcome}</option>)}
              </Select>
            </label>
            <label className="text-xs text-slate-500">Elapsed minutes
              <Input className="mt-1" type="number" min="0" value={elapsedMinutes} onChange={(event) => setElapsedMinutes(event.target.value)} disabled={busy} />
            </label>
          </div>

          {candidateSpools.length ? (
            <div className="mt-4 space-y-2">
              <div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Measured material use</div>
              {candidateSpools.map((spool) => (
                <div key={spool.id} className="grid gap-3 rounded-xl border border-white/8 bg-black/10 p-3 md:grid-cols-[minmax(0,1fr),140px]">
                  <div>
                    <div className="text-sm font-medium text-slate-200">{spool.foundrySpoolCode}</div>
                    <div className="mt-1 text-xs text-slate-500">{spool.colorName} · {spool.quantityConfidence === "Unknown" ? "quantity unknown" : `${spool.gramsAvailable.toFixed(1)}g available`}</div>
                  </div>
                  <Input type="number" min="0" step="0.1" value={allocationDrafts[spool.id] ?? ""} onChange={(event) => setAllocation(spool.id, event.target.value)} placeholder="grams used" disabled={busy} />
                </div>
              ))}
            </div>
          ) : null}

          <Textarea className="mt-4 min-h-[90px]" value={resultObservation} onChange={(event) => setResultObservation(event.target.value)} placeholder="Observation / result notes (optional)" disabled={busy} />
          {resultOutcome !== "success" ? <Input className="mt-3" value={resultFailureMode} onChange={(event) => setResultFailureMode(event.target.value)} placeholder="Failure mode / corrective clue (recommended)" disabled={busy} /> : null}
          <Button className="mt-4" onClick={recordResult} disabled={busy || !resultPrinterId}>{busy ? "Recording…" : "Record Result"}</Button>
        </div>
      ) : null}

      {!item.workbench && item.status !== "completed" ? <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-amber-200">This is a compatibility-era production item without Workbench lineage. Normal completion is intentionally unavailable until it is migrated or linked so evidence is not lost.</div> : null}

      {evidence.length ? (
        <details className="mt-5 rounded-2xl border border-white/10 bg-[#0b1119] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-200">Evidence history ({evidence.length})</summary>
          <div className="mt-3 space-y-3">
            {evidence.slice().reverse().map((record) => (
              <div key={record.printRecordId} className="rounded-xl border border-white/8 bg-black/10 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium text-slate-200">{record.outcome}</div><div className="text-xs text-slate-500">{record.completedAt ?? record.createdAt}</div></div>
                <div className="mt-1 text-xs text-slate-500">{record.printerId} · {record.measuredMaterialGrams !== undefined ? `${record.measuredMaterialGrams.toFixed(1)}g` : "material not measured"}</div>
                {record.observations.map((observation) => <div key={observation.observationId} className="mt-2 text-sm text-slate-300">{observation.text}</div>)}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {item.status !== "completed" ? (
        <details className="mt-5 rounded-2xl border border-white/10 bg-[#0b1119] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-300">Operator notes & advanced controls</summary>
          <div className="mt-4 space-y-4">
            <div>
              <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-slate-600">Next action</div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={nextAction} onChange={(event) => setNextAction(event.target.value)} disabled={busy} />
                <Button variant="ghost" onClick={saveNextAction} disabled={busy}>Save</Button>
              </div>
            </div>
            {!item.blocker ? (
              <div>
                <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-slate-600">Problem / blocker</div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input value={blockerDraft} onChange={(event) => setBlocker(event.target.value)} placeholder="What needs attention?" disabled={busy} />
                  <Button variant="ghost" onClick={markAttention} disabled={busy}>Flag Attention</Button>
                </div>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}

      <details className="mt-5 rounded-xl border border-white/8 bg-black/10 p-3 text-xs text-slate-500">
        <summary className="cursor-pointer">Technical details</summary>
        <div className="mt-3 space-y-1 break-all">
          <div>Production item: {item.id}</div>
          <div>Asset: {item.workbench?.assetId ?? "unlinked"}</div>
          <div>Revision: {item.workbench?.revisionId ?? "unlinked"}</div>
          <div>Preparation: {item.workbench?.preparationId ?? "unlinked"}</div>
        </div>
      </details>
    </Card>
  );
}

function Metric({ label, value, helper, warning = false }: { label: string; value: string | number; helper: string; warning?: boolean }) {
  return <div className={`rounded-2xl border p-4 ${warning ? "border-rose-500/20 bg-rose-500/5" : "border-white/10 bg-[#0d131c]"}`}><div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">{label}</div><div className={`mt-2 text-xl font-semibold ${warning ? "text-rose-200" : "text-slate-100"}`}>{value}</div><div className="mt-1 text-xs text-slate-500">{helper}</div></div>;
}

function Readout({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-white/10 bg-[#0b1119] p-3"><div className="text-[10px] uppercase tracking-[0.12em] text-slate-600">{label}</div><div className="mt-1 text-sm font-semibold text-slate-200">{value}</div></div>;
}

function Badge({ label, tone }: { label: string; tone: QueueGroup | "focus" }) {
  const style = tone === "attention" ? "border-rose-500/25 bg-rose-500/10 text-rose-300" : tone === "running" ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300" : tone === "queued" ? "border-amber-500/25 bg-amber-500/10 text-amber-300" : tone === "focus" ? "border-sky-500/25 bg-sky-500/10 text-sky-300" : "border-white/10 bg-white/5 text-slate-400";
  return <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase ${style}`}>{label}</span>;
}
