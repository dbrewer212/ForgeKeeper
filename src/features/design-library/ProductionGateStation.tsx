import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { printerProductionSnapshot } from "../../lib/printerOperations";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { PrintOutcome } from "../../workbench/contracts";
import { getWorkbenchProductionGate, type PrintMaterialAllocation } from "../../workbench/productionGate";
import { useWorkbenchVault } from "../../workbench/useWorkbenchVault";

const outcomes: PrintOutcome[] = ["success", "partial-success", "failed", "cancelled", "aborted"];

export function ProductionGateStation({ state }: { state: ForgekeeperState }) {
  const runtime = useWorkbenchVault(state);
  const preparations = useMemo(
    () => runtime.workbench.preparations
      .filter((item) => item.status === "validated" || item.status === "approved" || item.status === "submitted")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [runtime.workbench.preparations],
  );
  const [preparationId, setPreparationId] = useState("");
  const preparation = preparations.find((item) => item.preparationId === preparationId) ?? preparations[0];
  const asset = runtime.workbench.assets.find((item) => item.assetId === preparation?.assetId);
  const spec = runtime.workbench.manufacturingSpecs.find((item) => item.manufacturingSpecId === preparation?.manufacturingSpecId);
  const evidence = preparation ? runtime.workbench.printRecords.filter((item) => item.preparationId === preparation.preparationId) : [];
  const preparedPrinter = preparation?.printerId ? state.printers.find((item) => item.id === preparation.printerId) : undefined;
  const preparedPrinterSnapshot = preparedPrinter ? printerProductionSnapshot(preparedPrinter) : undefined;

  const [printerId, setPrinterId] = useState("");
  const selectedPrinterId = printerId || preparation?.printerId || "";
  const [outcome, setOutcome] = useState<PrintOutcome>("success");
  const [observation, setObservation] = useState("");
  const [failureMode, setFailureMode] = useState("");
  const [elapsedMinutes, setElapsedMinutes] = useState("");
  const [allocationDrafts, setAllocationDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const candidateSpools = useMemo(() => {
    if (!preparation?.materialProfileId) return [];
    const assigned = new Set(preparation.physicalSpoolIds ?? []);
    const matching = state.filament.filter((spool) =>
      spool.profileId === preparation.materialProfileId && spool.status !== "Archived" && spool.status !== "Empty" && spool.condition !== "Empty"
    );
    return [...matching].sort((a, b) => {
      const aAssigned = assigned.has(a.id) ? 0 : 1;
      const bAssigned = assigned.has(b.id) ? 0 : 1;
      return aAssigned - bAssigned || a.foundrySpoolCode.localeCompare(b.foundrySpoolCode);
    });
  }, [preparation?.materialProfileId, preparation?.physicalSpoolIds, state.filament]);

  useEffect(() => {
    setAllocationDrafts({});
  }, [preparation?.preparationId]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      await action();
      await runtime.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
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
      if (preparation?.physicalSpoolIds?.length && !preparation.physicalSpoolIds.includes(spool.id)) return `${spool.foundrySpoolCode} was not assigned to this preparation. Return to Build Bench if the physical spool assignment changed before execution.`;
    }
    return undefined;
  }

  const releaseBlockedReason = !preparation?.printerId
    ? "Assign a printer in Build Bench before production release."
    : !preparedPrinter
      ? `Assigned printer ${preparation.printerId} is not in the Printer Pool.`
      : !preparedPrinterSnapshot?.productionEligible
        ? preparedPrinterSnapshot?.eligibilityReason ?? "Assigned printer is not production-cleared."
        : undefined;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-4">
        <div className="text-xs uppercase tracking-[0.24em] text-amber-400">Foundry Workbench</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-100">Production Gate</h1>
        <p className="mt-1 max-w-4xl text-sm text-slate-400">Human approval remains explicit. Validated preparation is released to Production Steward only when its assigned printer is operationally cleared, supervised through Bastion, and returned physical evidence is attached to the exact asset revision, production job, printer, and physical material consumed.</p>
      </div>

      {preparations.length === 0 ? (
        <Card title="No Production Candidates"><div className="text-sm text-slate-400">Validate a preparation in Build Bench before entering the production gate.</div></Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[380px,minmax(0,1fr)]">
          <div className="space-y-5">
            <Card title="Candidate">
              <label className="block text-xs text-slate-500">Preparation</label>
              <Select value={preparation?.preparationId ?? ""} onChange={(event) => { setPreparationId(event.target.value); setPrinterId(""); }}>
                {preparations.map((item) => {
                  const itemAsset = runtime.workbench.assets.find((candidate) => candidate.assetId === item.assetId);
                  return <option key={item.preparationId} value={item.preparationId}>{itemAsset?.name ?? item.assetId} · {item.status}</option>;
                })}
              </Select>
              <div className="mt-3 space-y-2">
                <Readout label="Asset" value={asset?.name ?? preparation?.assetId ?? "Unknown"} />
                <Readout label="Revision" value={preparation?.revisionId ?? "Unknown"} />
                <Readout label="Preparation" value={preparation?.preparationId ?? "Unknown"} />
                <Readout label="Status" value={preparation?.status ?? "Unknown"} />
                <Readout label="Production Job" value={preparation?.productionJobId ?? "Not released"} />
                <Readout label="Assigned printer" value={preparedPrinter?.name ?? preparation?.printerId ?? "Unassigned"} />
                <Readout label="Assigned spools" value={preparation?.physicalSpoolIds?.length ? preparation.physicalSpoolIds.join(", ") : "None fixed at preparation time"} />
              </div>
            </Card>

            <Card title="Manufacturing Authority">
              <Readout label="Process" value={spec?.intendedProcess ?? "No ManufacturingSpec"} />
              <Readout label="Approval" value={spec?.approvalState ?? "Missing"} />
              <Readout label="Approved By" value={spec?.approvedBy ?? "Not approved"} />
              {spec && spec.approvalState !== "approved" ? (
                <Button className="mt-3 w-full" disabled={busy} onClick={() => void run(async () => {
                  await getWorkbenchProductionGate().approveManufacturingSpec(spec.manufacturingSpecId);
                  setMessage("Manufacturing specification approved by Foundry owner authority.");
                })}>Approve Manufacturing Spec</Button>
              ) : null}
            </Card>

            <Card title="Printer Readiness">
              {preparedPrinterSnapshot ? (
                <div className="space-y-2">
                  <Readout label="Operational state" value={preparedPrinterSnapshot.operationalState} />
                  <Readout label="Expected power" value={preparedPrinterSnapshot.expectedPowerState} />
                  <Readout label="Connectivity" value={preparedPrinterSnapshot.connectivity} />
                  <Readout label="Production clearance" value={preparedPrinterSnapshot.productionClearance} />
                  <Readout label="Native control" value={preparedPrinterSnapshot.nativeControlPath} />
                  <div className={`mt-3 rounded-xl border p-3 text-xs leading-5 ${preparedPrinterSnapshot.productionEligible ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-200" : "border-amber-500/20 bg-amber-500/5 text-amber-200"}`}>
                    {preparedPrinterSnapshot.productionEligible ? "Eligible for Production Steward scheduling." : preparedPrinterSnapshot.eligibilityReason}
                  </div>
                </div>
              ) : <div className="text-sm text-amber-300">No valid printer is assigned to this preparation. Return to Build Bench to assign one.</div>}
            </Card>

            <Card title="Steward Handoff">
              <div className="text-sm text-slate-400">Release requires a validated preparation, an approved ManufacturingSpec, and an assigned production-cleared printer.</div>
              {releaseBlockedReason ? <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-200">{releaseBlockedReason}</div> : null}
              <Button className="mt-3 w-full" disabled={busy || !preparation || !spec || spec.approvalState !== "approved" || preparation.status === "submitted" || Boolean(releaseBlockedReason)} onClick={() => void run(async () => {
                if (!preparation || !preparedPrinter) return;
                const result = await getWorkbenchProductionGate().release(preparation.preparationId, printerProductionSnapshot(preparedPrinter));
                setMessage(`Released to Production Steward as ${result.productionJobId}.`);
              })}>{preparation?.status === "submitted" ? "Released to Steward" : "Release to Production Steward"}</Button>
            </Card>
          </div>

          <div className="space-y-5">
            <Card title="Physical Print Evidence" right={<span className="text-xs text-slate-500">{evidence.length} record{evidence.length === 1 ? "" : "s"}</span>}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs text-slate-500">Printer
                  <Select className="mt-1" value={selectedPrinterId} onChange={(event) => setPrinterId(event.target.value)} disabled={Boolean(preparation?.printerId)}>
                    <option value="">Select printer</option>
                    {state.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}
                  </Select>
                </label>
                <label className="text-xs text-slate-500">Outcome
                  <Select className="mt-1" value={outcome} onChange={(event) => setOutcome(event.target.value as PrintOutcome)}>
                    {outcomes.map((item) => <option key={item} value={item}>{item}</option>)}
                  </Select>
                </label>
                <Input type="number" min="0" value={elapsedMinutes} onChange={(event) => setElapsedMinutes(event.target.value)} placeholder="Elapsed minutes" />
              </div>

              {preparation?.materialProfileId ? (
                <div className="mt-4 rounded-2xl border border-white/10 bg-[#0b1119] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs uppercase tracking-[0.14em] text-amber-400">Physical material used</div>
                      <div className="mt-1 text-xs text-slate-500">Enter actual grams only for spools that fed this print. Zero/blank means the spool was not consumed.</div>
                    </div>
                    <div className="text-sm text-slate-300">{materialAllocations().reduce((sum, item) => sum + item.grams, 0).toFixed(1)}g total</div>
                  </div>
                  <div className="mt-3 space-y-2">
                    {candidateSpools.map((spool) => {
                      const assigned = preparation.physicalSpoolIds?.includes(spool.id) ?? false;
                      return (
                        <div key={spool.id} className={`grid gap-3 rounded-xl border p-3 md:grid-cols-[minmax(0,1fr),140px] ${assigned ? "border-amber-500/20 bg-amber-500/5" : "border-white/8 bg-black/10"}`}>
                          <div>
                            <div className="text-sm font-medium text-slate-200">{spool.foundrySpoolCode}{assigned ? " · assigned" : ""}</div>
                            <div className="mt-1 text-xs text-slate-500">{spool.colorName} · {spool.quantityConfidence} · {spool.quantityConfidence === "Unknown" ? "remainder unknown" : `${spool.gramsAvailable.toFixed(1)}g available`}</div>
                          </div>
                          <Input type="number" min="0" step="0.1" value={allocationDrafts[spool.id] ?? ""} onChange={(event) => setAllocationDrafts((current) => ({ ...current, [spool.id]: event.target.value }))} placeholder="grams used" />
                        </div>
                      );
                    })}
                    {candidateSpools.length === 0 ? <div className="text-sm text-amber-300">No usable physical spool matches this preparation. Record/measure inventory or return to Build Bench before posting material consumption.</div> : null}
                  </div>
                </div>
              ) : null}

              <Textarea className="mt-3 min-h-[90px]" value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="Operator observation / print result notes" />
              <Input className="mt-3" value={failureMode} onChange={(event) => setFailureMode(event.target.value)} placeholder="Failure mode, if applicable" />
              <Button className="mt-3" disabled={busy || !preparation?.productionJobId || !selectedPrinterId} onClick={() => void run(async () => {
                if (!preparation) return;
                const allocations = materialAllocations();
                const allocationError = validateLedgerAllocations(allocations);
                if (allocationError) throw new Error(allocationError);

                const record = await getWorkbenchProductionGate().recordEvidence({
                  preparationId: preparation.preparationId,
                  printerId: selectedPrinterId,
                  outcome,
                  observation,
                  failureMode,
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
                    throw new Error(`Print evidence ${record.printRecordId} was recorded, but material ledger reconciliation failed. Do not re-record the print; reconcile physical spool consumption against that PrintRecord.`);
                  }
                }

                setMessage(`Print evidence ${record.printRecordId} returned to the asset history${allocations.length ? " and physical spool consumption was posted to the material ledger" : ""}.`);
                setObservation("");
                setFailureMode("");
                setElapsedMinutes("");
                setAllocationDrafts({});
              })}>Record Returned Evidence</Button>
            </Card>

            {evidence.length ? <Card title="Evidence History">
              <div className="space-y-3">{evidence.map((record) => (
                <div key={record.printRecordId} className="rounded-xl border border-white/10 bg-[#0b1119] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium text-slate-200">{record.outcome}</div>
                    <div className="text-xs text-slate-500">{record.completedAt ?? record.createdAt}</div>
                  </div>
                  <div className="mt-2 text-xs text-slate-400">{record.printerId} · {record.productionJobId}</div>
                  <div className="mt-1 text-xs text-slate-500">Material: {record.measuredMaterialGrams !== undefined ? `${record.measuredMaterialGrams.toFixed(1)}g` : "not measured"} · Spools: {record.physicalSpoolIds?.length ? record.physicalSpoolIds.join(", ") : "not recorded"}</div>
                  {record.observations.map((item) => <div key={item.observationId} className="mt-2 text-sm text-slate-300">{item.text}</div>)}
                </div>
              ))}</div>
            </Card> : null}

            {message ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">{message}</div> : null}
            {error ? <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200">{error}</div> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return <div className="border-b border-white/5 py-2 last:border-0"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">{label}</div><div className="mt-1 break-words text-sm text-slate-300">{value}</div></div>;
}
