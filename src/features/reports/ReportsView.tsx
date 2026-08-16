import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import type { ProductionItemSummary } from "../../mesh/domainServices";
import { getFoundryMeshRuntime } from "../../mesh";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { useWorkbenchVault } from "../../workbench/useWorkbenchVault";

export function ReportsView({ state }: { state: ForgekeeperState }) {
  const workbench = useWorkbenchVault(state);
  const runtime = useMemo(() => getFoundryMeshRuntime(), []);
  const [productionItems, setProductionItems] = useState<ProductionItemSummary[]>([]);
  const [runtimeError, setRuntimeError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function refresh() {
      try {
        await runtime.initialize();
        const items = await runtime.domain.get().production.list();
        if (!cancelled) {
          setProductionItems(items);
          setRuntimeError("");
        }
      } catch (cause) {
        if (!cancelled) setRuntimeError(cause instanceof Error ? cause.message : String(cause));
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [runtime]);

  const activeProduction = productionItems.filter((item) => item.status !== "completed");
  const attentionProduction = activeProduction.filter((item) => item.blocker || item.status === "attention-required");
  const completedProduction = productionItems.filter((item) => item.status === "completed");
  const activeSpools = state.filament.filter((spool) => spool.status !== "Archived");
  const knownMaterialGrams = activeSpools
    .filter((spool) => spool.quantityConfidence !== "Unknown")
    .reduce((sum, spool) => sum + spool.gramsAvailable, 0);
  const unknownSpools = activeSpools.filter((spool) => spool.quantityConfidence === "Unknown").length;
  const consumptionGrams = Math.abs(state.materialTransactions
    .filter((entry) => entry.type === "Consumption")
    .reduce((sum, entry) => sum + Math.min(0, entry.deltaGrams), 0));
  const successfulPrints = workbench.workbench.printRecords.filter((record) => record.outcome === "success").length;
  const partialPrints = workbench.workbench.printRecords.filter((record) => record.outcome === "partial-success").length;
  const failedPrints = workbench.workbench.printRecords.filter((record) => record.outcome === "failed").length;
  const approvedSpecs = workbench.workbench.manufacturingSpecs.filter((spec) => spec.approvalState === "approved").length;
  const releasedPreparations = workbench.workbench.preparations.filter((prep) => prep.status === "submitted").length;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-700/35 bg-[linear-gradient(180deg,rgba(25,22,19,0.94),rgba(13,11,9,0.96))] p-5 shadow-forge">
        <div className="text-xs uppercase tracking-[0.24em] text-amber-400">Foundry Evidence</div>
        <h1 className="mt-1 text-3xl font-semibold text-slate-100">Reports & Operational History</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">Read-only reporting over Workbench evidence, Production Steward state, physical material records, and the machine roster. Legacy Product/Order records are not used as manufacturing truth.</p>
      </div>

      {runtimeError ? <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-4 text-sm text-rose-300">Mesh runtime: {runtimeError}</div> : null}
      {workbench.error ? <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-4 text-sm text-rose-300">Workbench runtime: {workbench.error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Assets" value={workbench.assets.length} helper={`${workbench.workbench.revisions.length} revisions`} />
        <Metric label="Approved specs" value={approvedSpecs} helper={`${releasedPreparations} released preparations`} />
        <Metric label="Active production" value={activeProduction.length} helper={`${attentionProduction.length} need attention`} />
        <Metric label="Completed work" value={completedProduction.length} helper={`${workbench.workbench.printRecords.length} print records`} />
        <Metric label="Known material" value={`${(knownMaterialGrams / 1000).toFixed(2)} kg`} helper={`${unknownSpools} unknown spool${unknownSpools === 1 ? "" : "s"}`} />
        <Metric label="Printers" value={state.printers.length} helper={`${state.printers.filter((printer) => printer.status === "Offline" || printer.status === "Maintenance").length} unavailable`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Workbench Evidence Chain" right={<span className="text-xs text-slate-500">Asset → Revision → Preparation → Print</span>}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Readout label="Registered files" value={workbench.workbench.files.length} />
            <Readout label="Immutable revisions" value={workbench.workbench.revisions.length} />
            <Readout label="Inspector records" value={workbench.workbench.inspections.length} />
            <Readout label="Preparations" value={workbench.workbench.preparations.length} />
            <Readout label="Assemblies" value={workbench.workbench.assemblies.length} />
            <Readout label="Relationships" value={workbench.workbench.relationships.length} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Outcome label="Successful" value={successfulPrints} tone="good" />
            <Outcome label="Partial" value={partialPrints} tone="warn" />
            <Outcome label="Failed" value={failedPrints} tone="bad" />
          </div>
        </Card>

        <Card title="Production Steward History" right={<span className="text-xs text-slate-500">Durable Mesh production items</span>}>
          <div className="space-y-3">
            {productionItems.slice(0, 12).map((item) => (
              <div key={item.id} className={`rounded-xl border p-3 ${item.blocker || item.status === "attention-required" ? "border-rose-500/20 bg-rose-500/5" : "border-slate-700/55 bg-slate-900/55"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{item.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.stage || "stage unset"} · {item.status || "status unset"}</div>
                  </div>
                  {item.workbench ? <div className="text-[10px] text-amber-300">{item.workbench.preparationId}</div> : null}
                </div>
                <div className="mt-2 text-xs text-slate-400">{item.blocker ? `Blocked: ${item.blocker}` : item.nextAction || "No next action recorded"}</div>
              </div>
            ))}
            {productionItems.length === 0 ? <div className="rounded-xl border border-dashed border-slate-700/60 p-6 text-center text-sm text-slate-500">No durable production history yet.</div> : null}
          </div>
        </Card>

        <Card title="Material Ledger" right={<Button variant="ghost" onClick={state.exportFilamentCsv}>Export Materials CSV</Button>}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Readout label="Physical spools" value={activeSpools.length} />
            <Readout label="Known grams" value={knownMaterialGrams.toFixed(0)} />
            <Readout label="Consumed grams" value={consumptionGrams.toFixed(0)} />
            <Readout label="Ledger entries" value={state.materialTransactions.length} />
          </div>
          <div className="mt-4 space-y-2">
            {state.materialTransactions.slice(0, 10).map((entry) => {
              const spool = state.filament.find((item) => item.id === entry.spoolId);
              return (
                <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 py-2 text-xs last:border-0">
                  <div><span className="font-medium text-slate-300">{entry.type}</span><span className="ml-2 text-slate-500">{spool?.foundrySpoolCode || entry.spoolId}</span></div>
                  <div className={entry.deltaGrams < 0 ? "text-amber-300" : "text-emerald-300"}>{entry.deltaGrams > 0 ? "+" : ""}{entry.deltaGrams.toFixed(1)}g</div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="Machine Roster" right={<Button variant="ghost" onClick={state.exportPrintersCsv}>Export Printers CSV</Button>}>
          <div className="space-y-3">
            {state.printers.map((printer) => (
              <div key={printer.id} className="rounded-xl border border-slate-700/55 bg-slate-900/55 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{printer.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{printer.model || "model unset"} · {printer.buildVolume || "build volume unset"}</div>
                  </div>
                  <div className={`text-xs font-semibold ${printer.status === "Offline" ? "text-rose-300" : printer.status === "Maintenance" ? "text-amber-300" : "text-emerald-300"}`}>{printer.status}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Recovery & Portable Exports" right={<span className="text-xs text-slate-500">Safety, not live authority</span>}>
          <div className="flex flex-wrap gap-2">
            <Button onClick={state.exportBackupJson}>Legacy Workspace JSON Backup</Button>
            <Button variant="ghost" onClick={state.exportMaintenanceCsv}>Maintenance CSV</Button>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-400">Workbench truth remains in SQLite and Forgepack is the portable asset/export format. The JSON backup is retained for recovery of compatibility-era workspace state while that bridge still exists.</p>
        </Card>

        <Card title="Compatibility Records" right={<span className="rounded-full border border-amber-700/35 bg-amber-900/20 px-3 py-1 text-xs text-amber-300">Not production authority</span>}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Readout label="Legacy products" value={state.products.length} />
            <Readout label="Legacy orders" value={state.orders.length} />
            <Readout label="Legacy trials" value={state.printTrials.length} />
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-400">These records remain available only for migration, historical recovery, and data reconciliation. They do not determine Workbench identity, manufacturing approval, Production Steward state, printer state, or returned PrintRecord evidence.</p>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return <div className="rounded-2xl border border-slate-700/55 bg-slate-900/60 p-4 shadow-forge-inset"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">{label}</div><div className="mt-2 text-2xl font-semibold text-slate-100">{value}</div><div className="mt-1 text-xs text-slate-500">{helper}</div></div>;
}

function Readout({ label, value }: { label: string; value: string | number }) {
  return <div className="rounded-xl border border-slate-700/55 bg-slate-950/55 p-3"><div className="text-[10px] uppercase tracking-[0.12em] text-slate-600">{label}</div><div className="mt-1 text-lg font-semibold text-slate-200">{value}</div></div>;
}

function Outcome({ label, value, tone }: { label: string; value: number; tone: "good" | "warn" | "bad" }) {
  const style = tone === "good" ? "border-emerald-500/20 bg-emerald-500/5 text-emerald-300" : tone === "bad" ? "border-rose-500/20 bg-rose-500/5 text-rose-300" : "border-amber-500/20 bg-amber-500/5 text-amber-300";
  return <div className={`rounded-xl border p-3 ${style}`}><div className="text-[10px] uppercase tracking-[0.12em] opacity-70">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div>;
}
