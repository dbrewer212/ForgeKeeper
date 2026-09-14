import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { HumanAuthority, type ProductionItemSummary } from "../../mesh/domainServices";
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
  if (item.status === "completed" || item.stage === "complete") return "done";
  if (item.stage === "printing" || item.stage === "finishing") return "running";
  return "queued";
}

function groupLabel(group: QueueGroup): string {
  if (group === "attention") return "Needs attention";
  if (group === "running") return "Running";
  if (group === "queued") return "Up next";
  return "Recently done";
}

function groupPriority(item: ProductionItemSummary): number {
  const group = queueGroup(item);
  if (group === "attention") return 0;
  if (group === "running") return 1;
  if (group === "queued") return 2;
  return 3;
}

function groupTone(group: QueueGroup): string {
  if (group === "attention") return "border-rose-500/25 bg-rose-500/5";
  if (group === "running") return "border-emerald-500/25 bg-emerald-500/5";
  if (group === "queued") return "border-amber-500/20 bg-amber-500/5";
  return "border-white/10 bg-[#0b1119]";
}

export function ProductionView({ state }: { state: ForgekeeperState }) {
  const workbench = useWorkbenchVault(state);
  const runtime = useMemo(() => getFoundryMeshRuntime(), []);
  const steward = useMemo(() => new ProductionSteward(runtime), [runtime]);
  const gate = useMemo(() => getWorkbenchProductionGate(), []);

  const [items, setItems] = useState<ProductionItemSummary[]>([]);
  const [focusedId, setFocusedId] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [busyId, setBusyId] = useState<string>();
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [message, setMessage] = useState("");
  const [nextActionDrafts, setNextActionDrafts] = useState<Record<string, string>>({});
  const [blockerDrafts, setBlockerDrafts] = useState<Record<string, string>>({});
  const [resultPrinterId, setResultPrinterId] = useState("");
  const [resultOutcome, setResultOutcome] = useState<PrintOutcome>("success");
  const [resultObservation, setResultObservation] = useState("");
  const [resultFailureMode, setResultFailureMode] = useState("");
  const [elapsedMinutes, setElapsedMinutes] = useState("");
  const [allocationDrafts, setAllocationDrafts] = useState<Record<string, string>>({});

  async function refreshQueue() {
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
      return [...productionItems].sort((a, b) => groupPriority(a) - groupPriority(b))[0]?.id;
    });
    setNextActionDrafts((current) => {
      const next = { ...current };
      for (const item of productionItems) if (!(item.id in next)) next[item.id] = item.nextAction ?? "";
      return next;
    });
  }

  async function refreshAll() {
    try {
      await Promise.all([refreshQueue(), workbench.refresh()]);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  useEffect(() => {
    void refreshAll();
    const timer = window.setInterval(() => void refreshQueue().catch(() => undefined), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const ordered = useMemo(() => [...items].sort((a, b) => {
    if (a.id === focusedId) return -1;
    if (b.id === focusedId) return 1;
    return groupPriority(a) - groupPriority(b) || a.name.localeCompare(b.name);
  }), [focusedId, items]);

  const selectedItem = ordered.find((item) => item.id === selectedId) ?? ordered[0];
  const preparation = selectedItem?.workbench
    ? workbench.workbench.preparations.find((item) => item.preparationId === selectedItem.workbench?.preparationId)
    : undefined;
  const asset = preparation ? workbench.workbench.assets.find((item) => item.assetId === preparation.assetId) : undefined;
  const evidence = preparation
    ? workbench.workbench.printRecords.filter((record) => record.preparationId === preparation.preparationId)
    : [];

  const candidateSpools = useMemo(() => {
    if (!preparation?.materialProfileId) return [];
    const assigned = new Set(preparation.physicalSpoolIds ?? []);
    return state.filament
      .filter((spool) => spool.profileId === preparation.materialProfileId && spool.status !== "Archived" && spool.status !== "Empty" && spool.condition !== "Empty")
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
    setWarning("");
    setMessage("");
  }, [selectedItem?.id, preparation?.preparationId]);

  async function run(itemId: string, action: () => Promise<unknown>, refreshWorkbench = false) {
    setBusyId(itemId);
    setError("");
    setWarning("");
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

  async function assignPrinter(item: ProductionItemSummary) {
    if (!preparation) {
      setError("This production item has no Workbench preparation linkage.");
      return;
    }
    if (!resultPrinterId) {
      setError("Choose the execution printer first.");
      return;
    }
    await run(item.id, async () => {
      await gate.assignPrinter(preparation.preparationId, resultPrinterId);
      setMessage("Execution printer assigned. The job is ready to begin when the physical print starts.");
    }, true);
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

  function allocationError(allocations: PrintMaterialAllocation[]): string | undefined {
    for (const allocation of allocations) {
      const spool = state.filament.find((item) => item.id === allocation.spoolId);
      if (!spool) return `Physical spool ${allocation.spoolId} is no longer in inventory.`;
      if (spool.quantityConfidence === "Unknown") return `${spool.foundrySpoolCode} has unknown remaining quantity. Measure or estimate it before posting production consumption.`;
      if (allocation.grams > spool.gramsAvailable) return `${spool.foundrySpoolCode} has ${spool.gramsAvailable.toFixed(1)}g recorded, but ${allocation.grams.toFixed(1)}g was entered as actual use.`;
      if (preparation?.materialProfileId && spool.profileId !== preparation.materialProfileId) return `${spool.foundrySpoolCode} does not match the preparation material profile.`;
      if (preparation?.physicalSpoolIds?.length && !preparation.physicalSpoolIds.includes(spool.id)) return `${spool.foundrySpoolCode} was not assigned to this preparation.`;
    }
    return undefined;
  }

  async function recordResult(item: ProductionItemSummary) {
    if (!preparation) {
      setError("This production item is not linked to a Workbench preparation, so governed print evidence cannot be recorded.");
      return;
    }
    const printerId = resultPrinterId || preparation.printerId || item.workbench?.printerId || "";
    if (!printerId) {
      setError("Select the printer that produced this result.");
      return;
    }
    const allocations = materialAllocations();
    const invalidAllocation = allocationError(allocations);
    if (invalidAllocation) {
      setError(invalidAllocation);
      return;
    }

    await run(item.id, async () => {
      const record = await gate.recordEvidence({
        preparationId: preparation.preparationId,
        printerId,
        outcome: resultOutcome,
        observation: resultObservation,
        failureMode: resultFailureMode,
        elapsedSeconds: elapsedMinutes ? Math.round(Number(elapsedMinutes) * 60) : undefined,
        materialAllocations: allocations,
      });

      let materialReconciled = true;
      if (allocations.length) {
        materialReconciled = state.consumeMaterialForProduction(
          record.productionJobId,
          allocations,
          `Measured production use for ${asset?.name ?? record.assetId}; PrintRecord ${record.printRecordId}`,
        );
      }

      if (!materialReconciled) {
        setWarning(`Print evidence ${record.printRecordId} is safely recorded, but the material ledger could not be reconciled. Do not record the print again; reconcile the spool ledger against this PrintRecord.`);
      }
      setMessage(resultOutcome === "success"
        ? "Result recorded. The job is complete and its returned evidence is attached to the asset history."
        : "Result recorded. The job is now in Needs Attention so the physical evidence can be reviewed before a retry or further production.");
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
      <header className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-amber-400">Production Steward</div>
            <h1 className="mt-1 text-2xl font-semibold text-slate-100">Production</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">Run released work here from printer assignment through physical result. Workbench keeps manufacturing authority and lineage underneath, but normal execution stays on this station.</p>
          </div>
          <Button variant="ghost" onClick={() => void refreshAll()}>Refresh</Button>
        </div>
      </header>

      {error ? <Notice tone="error">{error}</Notice> : null}
      {warning ? <Notice tone="warning">{warning}</Notice> : null}
      {message ? <Notice tone="success">{message}</Notice> : null}
      {workbench.error ? <Notice tone="error">Workbench: {workbench.error}</Notice> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Running" value={runningCount} helper="Printing / finishing now" />
        <Metric label="Needs attention" value={attentionCount} helper="Blocked or returned for review" warning={attentionCount > 0} />
        <Metric label="Up next" value={queuedCount} helper="Released and ready" />
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
                  <div className="mb-2 flex items-center justify-between gap-3"><div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{groupLabel(group)}</div><div className="text-xs text-slate-600">{jobs.length}</div></div>
                  <div className="space-y-2">
                    {jobs.map((item) => (
                      <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} className={`w-full rounded-xl border p-3 text-left transition ${groupTone(group)} ${selectedItem?.id === item.id ? "ring-1 ring-amber-400/50" : "hover:bg-white/[0.04]"}`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-100">{item.name}</div><div className="mt-1 text-[11px] text-slate-500">{item.workbench?.printerId || "Printer unassigned"} · {item.stage ?? "stage unset"}</div></div>
                          {item.id === focusedId ? <Badge label="Focus" tone="focus" /> : null}
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
          <Card title={asset?.name || selectedItem.name} right={<div className="flex flex-wrap gap-2"><Badge label={groupLabel(queueGroup(selectedItem))} tone={queueGroup(selectedItem)} />{selectedItem.id === focusedId ? <Badge label="Your focus" tone="focus" /> : null}</div>}>
            <div className="grid gap-3 md:grid-cols-3">
              <Readout label="Printer" value={selectedItem.workbench?.printerId || "Unassigned"} />
              <Readout label="Stage" value={selectedItem.stage || "Unset"} />
              <Readout label="Evidence" value={`${evidence.length} record${evidence.length === 1 ? "" : "s"}`} />
            </div>

            {selectedItem.blocker ? <div className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/5 p-4 text-sm text-rose-200"><div className="text-[10px] uppercase tracking-[0.14em] text-rose-400">Needs attention</div><div className="mt-2">{selectedItem.blocker}</div></div> : null}

            {!selectedItem.workbench?.printerId && preparation && selectedItem.status !== "completed" ? (
              <section className="mt-5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.04] p-4">
                <div className="text-xs uppercase tracking-[0.14em] text-amber-400">Assign execution printer</div>
                <div className="mt-1 text-sm text-slate-400">This is an older or unassigned released job. Assign its execution printer here; the assignment is written back to Workbench and the Production Steward job.</div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <Select value={resultPrinterId} onChange={(event) => setResultPrinterId(event.target.value)} disabled={busyId === selectedItem.id}>
                    <option value="">Select printer</option>
                    {state.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name} · {printer.status}</option>)}
                  </Select>
                  <Button onClick={() => void assignPrinter(selectedItem)} disabled={busyId === selectedItem.id || !resultPrinterId}>Assign Printer</Button>
                </div>
              </section>
            ) : null}

            <section className="mt-5 rounded-2xl border border-amber-500/15 bg-amber-500/[0.04] p-4">
              <div className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Current action</div>
              <div className="mt-2 text-sm leading-6 text-slate-300">{selectedItem.nextAction || "No next action recorded."}</div>
              <div className="mt-4 flex flex-wrap gap-2">
                {queueGroup(selectedItem) === "queued" && !selectedItem.blocker && selectedItem.workbench?.printerId ? <Button onClick={() => void run(selectedItem.id, () => steward.startProductionItem(selectedItem.id))} disabled={busyId === selectedItem.id}>Mark Print Started</Button> : null}
                {selectedItem.stage === "printing" && !selectedItem.blocker ? <Button variant="ghost" onClick={() => void run(selectedItem.id, () => steward.advanceProductionItem(selectedItem.id, "finishing"))} disabled={busyId === selectedItem.id}>Move to Finishing</Button> : null}
                {selectedItem.blocker ? <Button onClick={() => void run(selectedItem.id, () => steward.clearAttention(selectedItem.id))} disabled={busyId === selectedItem.id}>Clear Blocker / Prepare Retry</Button> : null}
              </div>
              {queueGroup(selectedItem) === "queued" && selectedItem.workbench?.printerId ? <div className="mt-3 text-xs text-slate-500">Mark Print Started updates Foundry tracking when physical execution begins. It does not yet issue the printer's native start command.</div> : null}
            </section>

            {selectedItem.workbench && preparation && !selectedItem.blocker && (selectedItem.stage === "printing" || selectedItem.stage === "finishing") ? (
              <section className="mt-5 rounded-2xl border border-white/10 bg-[#0b1119] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><div className="text-xs uppercase tracking-[0.14em] text-amber-400">Record physical result</div><div className="mt-1 text-sm text-slate-400">One submit records Workbench evidence, updates Production Steward, and posts measured material use.</div></div>
                  <div className="text-xs text-slate-500">{materialAllocations().reduce((sum, item) => sum + item.grams, 0).toFixed(1)}g entered</div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <label className="text-xs text-slate-500">Printer<Select className="mt-1" value={resultPrinterId} onChange={(event) => setResultPrinterId(event.target.value)} disabled={Boolean(preparation.printerId) || busyId === selectedItem.id}><option value="">Select printer</option>{state.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}</Select></label>
                  <label className="text-xs text-slate-500">Outcome<Select className="mt-1" value={resultOutcome} onChange={(event) => setResultOutcome(event.target.value as PrintOutcome)} disabled={busyId === selectedItem.id}>{outcomes.map((outcome) => <option key={outcome} value={outcome}>{outcome}</option>)}</Select></label>
                  <label className="text-xs text-slate-500">Elapsed minutes<Input className="mt-1" type="number" min="0" value={elapsedMinutes} onChange={(event) => setElapsedMinutes(event.target.value)} disabled={busyId === selectedItem.id} /></label>
                </div>
                {candidateSpools.length ? <div className="mt-4 space-y-2"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Measured material use</div>{candidateSpools.map((spool) => <div key={spool.id} className="grid gap-3 rounded-xl border border-white/8 bg-black/10 p-3 md:grid-cols-[minmax(0,1fr),140px]"><div><div className="text-sm font-medium text-slate-200">{spool.foundrySpoolCode}</div><div className="mt-1 text-xs text-slate-500">{spool.colorName} · {spool.quantityConfidence === "Unknown" ? "quantity unknown" : `${spool.gramsAvailable.toFixed(1)}g available`}</div></div><Input type="number" min="0" step="0.1" value={allocationDrafts[spool.id] ?? ""} onChange={(event) => setAllocationDrafts((current) => ({ ...current, [spool.id]: event.target.value }))} placeholder="grams used" disabled={busyId === selectedItem.id} /></div>)}</div> : null}
                <Textarea className="mt-4 min-h-[90px]" value={resultObservation} onChange={(event) => setResultObservation(event.target.value)} placeholder="Observation / result notes (optional)" disabled={busyId === selectedItem.id} />
                {resultOutcome !== "success" ? <Input className="mt-3" value={resultFailureMode} onChange={(event) => setResultFailureMode(event.target.value)} placeholder="Failure mode / corrective clue (recommended)" disabled={busyId === selectedItem.id} /> : null}
                <Button className="mt-4" onClick={() => void recordResult(selectedItem)} disabled={busyId === selectedItem.id || !resultPrinterId}>{busyId === selectedItem.id ? "Recording…" : "Record Result"}</Button>
              </section>
            ) : null}

            {!selectedItem.workbench && selectedItem.status !== "completed" ? <Notice tone="warning">Compatibility-era production item: Workbench lineage is missing, so normal evidence completion is intentionally blocked until it is migrated or linked.</Notice> : null}

            {evidence.length ? <details className="mt-5 rounded-2xl border border-white/10 bg-[#0b1119] p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-200">Evidence history ({evidence.length})</summary><div className="mt-3 space-y-3">{evidence.slice().reverse().map((record) => <div key={record.printRecordId} className="rounded-xl border border-white/8 bg-black/10 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div className="font-medium text-slate-200">{record.outcome}</div><div className="text-xs text-slate-500">{record.completedAt ?? record.createdAt}</div></div><div className="mt-1 text-xs text-slate-500">{record.printerId} · {record.measuredMaterialGrams !== undefined ? `${record.measuredMaterialGrams.toFixed(1)}g` : "material not measured"}</div>{record.observations.map((observation) => <div key={observation.observationId} className="mt-2 text-sm text-slate-300">{observation.text}</div>)}</div>)}</div></details> : null}

            {selectedItem.status !== "completed" ? <details className="mt-5 rounded-2xl border border-white/10 bg-[#0b1119] p-4"><summary className="cursor-pointer text-sm font-semibold text-slate-300">Operator notes & advanced controls</summary><div className="mt-4 space-y-4"><div><div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-slate-600">Next action</div><div className="flex flex-col gap-2 sm:flex-row"><Input value={nextActionDrafts[selectedItem.id] ?? selectedItem.nextAction ?? ""} onChange={(event) => setNextActionDrafts((current) => ({ ...current, [selectedItem.id]: event.target.value }))} disabled={busyId === selectedItem.id} /><Button variant="ghost" onClick={() => void saveNextAction(selectedItem)} disabled={busyId === selectedItem.id}>Save</Button></div></div>{!selectedItem.blocker ? <div><div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-slate-600">Problem / blocker</div><div className="flex flex-col gap-2 sm:flex-row"><Input value={blockerDrafts[selectedItem.id] ?? ""} onChange={(event) => setBlockerDrafts((current) => ({ ...current, [selectedItem.id]: event.target.value }))} placeholder="What needs attention?" disabled={busyId === selectedItem.id} /><Button variant="ghost" onClick={() => void markAttention(selectedItem)} disabled={busyId === selectedItem.id}>Flag Attention</Button></div></div> : null}</div></details> : null}

            <details className="mt-5 rounded-xl border border-white/8 bg-black/10 p-3 text-xs text-slate-500"><summary className="cursor-pointer">Technical details</summary><div className="mt-3 space-y-1 break-all"><div>Production item: {selectedItem.id}</div><div>Asset: {selectedItem.workbench?.assetId ?? "unlinked"}</div><div>Revision: {selectedItem.workbench?.revisionId ?? "unlinked"}</div><div>Preparation: {selectedItem.workbench?.preparationId ?? "unlinked"}</div></div></details>
          </Card>
        ) : <Card title="Job Workspace"><div className="p-6 text-sm text-slate-500">Select or release a production job to begin.</div></Card>}
      </div>
    </div>
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

function Notice({ tone, children }: { tone: "success" | "warning" | "error"; children: React.ReactNode }) {
  const style = tone === "success" ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200" : tone === "warning" ? "border-amber-500/20 bg-amber-500/5 text-amber-200" : "border-rose-500/20 bg-rose-500/5 text-rose-200";
  return <div className={`mt-4 rounded-2xl border p-4 text-sm ${style}`}>{children}</div>;
}
