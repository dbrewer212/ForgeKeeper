import { useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { PrintOutcome } from "../../workbench/contracts";
import { getWorkbenchProductionGate } from "../../workbench/productionGate";
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

  const [printerId, setPrinterId] = useState("");
  const selectedPrinterId = printerId || preparation?.printerId || "";
  const [outcome, setOutcome] = useState<PrintOutcome>("success");
  const [observation, setObservation] = useState("");
  const [failureMode, setFailureMode] = useState("");
  const [elapsedMinutes, setElapsedMinutes] = useState("");
  const [materialGrams, setMaterialGrams] = useState("");
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
        <h1 className="mt-1 text-2xl font-semibold text-slate-100">Production Gate</h1>
        <p className="mt-1 max-w-4xl text-sm text-slate-400">Human approval remains explicit. Validated preparation is released to Production Steward, supervised through Bastion, and returned physical evidence is attached to the exact asset revision and production job.</p>
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

            <Card title="Steward Handoff">
              <div className="text-sm text-slate-400">Release is available only after the exact preparation is validated and its ManufacturingSpec is approved.</div>
              <Button className="mt-3 w-full" disabled={busy || !preparation || !spec || spec.approvalState !== "approved" || preparation.status === "submitted"} onClick={() => void run(async () => {
                if (!preparation) return;
                const result = await getWorkbenchProductionGate().release(preparation.preparationId);
                setMessage(`Released to Production Steward as ${result.productionJobId}.`);
              })}>{preparation?.status === "submitted" ? "Released to Steward" : "Release to Production Steward"}</Button>
            </Card>
          </div>

          <div className="space-y-5">
            <Card title="Physical Print Evidence" right={<span className="text-xs text-slate-500">{evidence.length} record{evidence.length === 1 ? "" : "s"}</span>}>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs text-slate-500">Printer
                  <Select className="mt-1" value={selectedPrinterId} onChange={(event) => setPrinterId(event.target.value)}>
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
                <Input type="number" min="0" step="0.1" value={materialGrams} onChange={(event) => setMaterialGrams(event.target.value)} placeholder="Measured material grams" />
              </div>
              <Textarea className="mt-3 min-h-[90px]" value={observation} onChange={(event) => setObservation(event.target.value)} placeholder="Operator observation / print result notes" />
              <Input className="mt-3" value={failureMode} onChange={(event) => setFailureMode(event.target.value)} placeholder="Failure mode, if applicable" />
              <Button className="mt-3" disabled={busy || !preparation?.productionJobId || !selectedPrinterId} onClick={() => void run(async () => {
                if (!preparation) return;
                const record = await getWorkbenchProductionGate().recordEvidence({
                  preparationId: preparation.preparationId,
                  printerId: selectedPrinterId,
                  outcome,
                  observation,
                  failureMode,
                  elapsedSeconds: elapsedMinutes ? Math.round(Number(elapsedMinutes) * 60) : undefined,
                  measuredMaterialGrams: materialGrams ? Number(materialGrams) : undefined,
                });
                setMessage(`Print evidence ${record.printRecordId} returned to the asset history.`);
                setObservation("");
                setFailureMode("");
                setElapsedMinutes("");
                setMaterialGrams("");
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
