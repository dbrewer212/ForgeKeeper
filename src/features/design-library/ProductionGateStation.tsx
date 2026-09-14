import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { getWorkbenchProductionGate } from "../../workbench/productionGate";
import { useWorkbenchVault } from "../../workbench/useWorkbenchVault";

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
  const [printerDraft, setPrinterDraft] = useState("");
  const selectedPrinterId = preparation?.printerId || printerDraft;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

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

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-4">
        <div className="text-xs uppercase tracking-[0.24em] text-amber-400">Foundry Workbench</div>
        <h1 className="mt-1 text-2xl font-semibold text-slate-100">Production Release Gate</h1>
        <p className="mt-1 max-w-4xl text-sm text-slate-400">Approve the manufacturing authority, confirm the execution printer, and release a validated preparation into Production Steward. Once released, normal execution and returned physical results stay in Production.</p>
      </div>

      {preparations.length === 0 ? (
        <Card title="No Production Candidates"><div className="text-sm text-slate-400">Validate a preparation in Build Bench before entering the release gate.</div></Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(320px,0.85fr),minmax(0,1.15fr)]">
          <div className="space-y-5">
            <Card title="Candidate">
              <label className="block text-xs text-slate-500">Preparation</label>
              <Select value={preparation?.preparationId ?? ""} onChange={(event) => { setPreparationId(event.target.value); setPrinterDraft(""); }}>
                {preparations.map((item) => {
                  const itemAsset = runtime.workbench.assets.find((candidate) => candidate.assetId === item.assetId);
                  return <option key={item.preparationId} value={item.preparationId}>{itemAsset?.name ?? item.assetId} · {item.status}</option>;
                })}
              </Select>
              <div className="mt-3 space-y-2">
                <Readout label="Asset" value={asset?.name ?? preparation?.assetId ?? "Unknown"} />
                <Readout label="Revision" value={preparation?.revisionId ?? "Unknown"} />
                <Readout label="Preparation" value={preparation?.preparationId ?? "Unknown"} />
                <Readout label="Assigned spools" value={preparation?.physicalSpoolIds?.length ? preparation.physicalSpoolIds.join(", ") : "None fixed at preparation time"} />
              </div>
            </Card>

            <Card title="Execution Printer">
              <div className="text-sm leading-6 text-slate-400">A released job must have a real execution printer. If Build Bench already fixed one, it remains authoritative. Otherwise choose it here instead of navigating backward.</div>
              <label className="mt-3 block text-xs text-slate-500">Printer</label>
              <Select
                className="mt-1"
                value={selectedPrinterId}
                disabled={Boolean(preparation?.printerId) || preparation?.status === "submitted"}
                onChange={(event) => setPrinterDraft(event.target.value)}
              >
                <option value="">Select printer</option>
                {state.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name} · {printer.status}</option>)}
              </Select>
              {preparation?.printerId ? <div className="mt-2 text-xs text-slate-500">This preparation was validated for the selected printer. Change the manufacturing assignment in Build Bench only if the preparation itself must change.</div> : null}
            </Card>

            <Card title="Manufacturing Authority">
              <Readout label="Process" value={spec?.intendedProcess ?? "No ManufacturingSpec"} />
              <Readout label="Approval" value={spec?.approvalState ?? "Missing"} />
              <Readout label="Approved By" value={spec?.approvedBy ?? "Not approved"} />
              {spec && spec.approvalState !== "approved" ? (
                <Button className="mt-3 w-full" disabled={busy} onClick={() => void run(async () => {
                  await getWorkbenchProductionGate().approveManufacturingSpec(spec.manufacturingSpecId);
                  setMessage("Manufacturing specification approved. The preparation can now be released.");
                })}>Approve Manufacturing Spec</Button>
              ) : null}
            </Card>
          </div>

          <div className="space-y-5">
            <Card title="Release to Production">
              <div className="rounded-xl border border-white/10 bg-[#0b1119] p-4 text-sm leading-6 text-slate-400">
                <div className="font-medium text-slate-200">{asset?.name ?? "Selected preparation"}</div>
                <div className="mt-2">Release creates the durable Production Steward job. After handoff, Production becomes the operator workspace for tracking execution, finishing, blockers, print outcome, evidence, and material reconciliation.</div>
              </div>
              {preparation?.status === "submitted" ? (
                <Button className="mt-4 w-full" onClick={() => state.setView("production")}>Open Production</Button>
              ) : (
                <Button className="mt-4 w-full" disabled={busy || !preparation || !spec || spec.approvalState !== "approved" || !selectedPrinterId} onClick={() => void run(async () => {
                  if (!preparation) return;
                  await getWorkbenchProductionGate().release(preparation.preparationId, selectedPrinterId);
                  setMessage("Released to Production Steward. Opening Production…");
                  state.setView("production");
                })}>{busy ? "Releasing…" : "Release & Open Production"}</Button>
              )}
              {!selectedPrinterId && preparation?.status !== "submitted" ? <div className="mt-3 text-xs text-amber-300">Choose the execution printer before release.</div> : null}
            </Card>

            <Card title="Returned Evidence" right={<span className="text-xs text-slate-500">{evidence.length} record{evidence.length === 1 ? "" : "s"}</span>}>
              <div className="text-sm leading-6 text-slate-400">Evidence is entered during execution in Production. This Workbench view remains a read-only lineage check for the selected preparation.</div>
              <div className="mt-4 space-y-3">
                {evidence.slice().reverse().map((record) => (
                  <div key={record.printRecordId} className="rounded-xl border border-white/10 bg-[#0b1119] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-medium text-slate-200">{record.outcome}</div>
                      <div className="text-xs text-slate-500">{record.completedAt ?? record.createdAt}</div>
                    </div>
                    <div className="mt-2 text-xs text-slate-400">{record.printerId} · {record.measuredMaterialGrams !== undefined ? `${record.measuredMaterialGrams.toFixed(1)}g` : "material not measured"}</div>
                  </div>
                ))}
                {!evidence.length ? <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-sm text-slate-500">No returned physical result has been recorded yet.</div> : null}
              </div>
            </Card>

            {message ? <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-200">{message}</div> : null}
            {error ? <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-200">{error}</div> : null}
          </div>
        </div>
      )}
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/8 bg-black/10 p-3"><div className="text-[10px] uppercase tracking-[0.12em] text-slate-600">{label}</div><div className="mt-1 break-all text-sm text-slate-300">{value}</div></div>;
}
