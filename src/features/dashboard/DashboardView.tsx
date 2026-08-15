import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import type { ParkedThoughtCategory, ProductionItemSummary } from "../../mesh/domainServices";
import { getFoundryMeshRuntime } from "../../mesh";
import { ProductionSteward, type StewardBrief } from "../../mesh/productionSteward";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { useWorkbenchVault } from "../../workbench/useWorkbenchVault";

const thoughtCategories: Array<{ value: ParkedThoughtCategory; label: string }> = [
  { value: "shiny", label: "Shiny" },
  { value: "interesting-later", label: "Interesting later" },
  { value: "useful-dependency", label: "Useful dependency" },
  { value: "blocker", label: "Blocker" },
  { value: "architecture-changing", label: "Architecture changing" },
];

export function DashboardView({ state }: { state: ForgekeeperState }) {
  const workbench = useWorkbenchVault(state);
  const runtime = useMemo(() => getFoundryMeshRuntime(), []);
  const steward = useMemo(() => new ProductionSteward(runtime), [runtime]);
  const [brief, setBrief] = useState<StewardBrief>();
  const [productionItems, setProductionItems] = useState<ProductionItemSummary[]>([]);
  const [runtimeError, setRuntimeError] = useState("");
  const [thought, setThought] = useState("");
  const [thoughtCategory, setThoughtCategory] = useState<ParkedThoughtCategory>("shiny");
  const [captureMessage, setCaptureMessage] = useState("");

  async function refreshRuntime() {
    try {
      await runtime.initialize();
      const [nextBrief, nextItems] = await Promise.all([
        steward.inspect(),
        runtime.domain.get().production.list(),
      ]);
      setBrief(nextBrief);
      setProductionItems(nextItems);
      setRuntimeError("");
    } catch (cause) {
      setRuntimeError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  useEffect(() => {
    void refreshRuntime();
    const timer = window.setInterval(() => void refreshRuntime(), 5000);
    return () => window.clearInterval(timer);
  }, []);

  const actionableProduction = useMemo(
    () => productionItems.filter((item) => item.status !== "completed"),
    [productionItems],
  );
  const attentionProduction = actionableProduction.filter((item) => item.blocker || item.status === "attention-required");
  const inspectionRequired = workbench.assets.filter((asset) => asset.lifecycleStatus === "inspection-required").length;
  const approvedSpecs = workbench.workbench.manufacturingSpecs.filter((spec) => spec.approvalState === "approved").length;
  const submittedPreparations = workbench.workbench.preparations.filter((item) => item.status === "submitted").length;
  const knownMaterialGrams = state.filament
    .filter((spool) => spool.status !== "Archived" && spool.quantityConfidence !== "Unknown")
    .reduce((sum, spool) => sum + spool.gramsAvailable, 0);
  const unknownSpools = state.filament.filter((spool) => spool.status !== "Archived" && spool.quantityConfidence === "Unknown").length;
  const offlinePrinters = state.printers.filter((printer) => printer.status === "Offline" || printer.status === "Maintenance").length;

  async function captureThought() {
    if (!thought.trim()) return;
    setCaptureMessage("");
    try {
      await steward.captureBranch(thought.trim(), thoughtCategory, "ForgeKeeper Dashboard");
      setThought("");
      setCaptureMessage("Thought parked against the active Foundry session. Current work remains active.");
      await refreshRuntime();
    } catch (cause) {
      setCaptureMessage(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.24em] text-amber-400">Fenrir Forgeworks</div>
            <h1 className="mt-1 text-3xl font-semibold text-slate-100">Foundry Command</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">Operational view of canonical assets, Production Steward work, physical materials, and the machine roster. Legacy Product/Order records are not used as production truth.</p>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-right">
            <div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">Workspace storage</div>
            <div className={`mt-1 text-sm font-semibold ${state.storageStatus === "SQLite" ? "text-emerald-300" : state.storageStatus === "Error" ? "text-rose-300" : "text-amber-300"}`}>{state.storageStatus}</div>
          </div>
        </div>
      </div>

      <Card title="Enter the Workshop" right={<span className="text-xs text-slate-500">Direct Foundry stations</span>}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickAction title="Design Library" helper="Vault, Intake, Inspector, Build Bench" onClick={() => state.setView("designs")} />
          <QuickAction title="Production" helper="Production Steward execution queue" onClick={() => state.setView("production")} />
          <QuickAction title="Materials" helper="Physical spool inventory and ledger" onClick={() => state.setView("filament")} />
          <QuickAction title="Printer Pool" helper="Machine roster and maintenance" onClick={() => state.setView("printers")} />
        </div>
      </Card>

      {runtimeError ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">Mesh runtime: {runtimeError}</div> : null}
      {workbench.error ? <div className="rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4 text-sm text-rose-300">Workbench runtime: {workbench.error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Foundry assets" value={workbench.assets.length} helper={`${inspectionRequired} inspection-required`} />
        <Metric label="Approved specs" value={approvedSpecs} helper={`${submittedPreparations} released preparations`} />
        <Metric label="Production work" value={actionableProduction.length} helper={`${attentionProduction.length} need attention`} />
        <Metric label="Known material" value={`${(knownMaterialGrams / 1000).toFixed(2)} kg`} helper={`${unknownSpools} unknown spool${unknownSpools === 1 ? "" : "s"}`} />
        <Metric label="Printers" value={state.printers.length} helper={`${offlinePrinters} offline / maintenance`} />
        <Metric label="Print evidence" value={workbench.workbench.printRecords.length} helper="Returned physical results" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <Card title="Production Steward" right={<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">{brief?.mode ?? "loading"}</span>}>
          <div className="grid gap-4 lg:grid-cols-2">
            <Readout label="Objective" value={brief?.activeWork.objective || "No active Foundry session"} />
            <Readout label="Stage" value={brief?.activeWork.stage || "No active stage"} />
            <Readout label="Current action" value={brief?.activeWork.currentAction || "No active action"} />
            <Readout label="Smallest meaningful action" value={brief?.smallestMeaningfulAction || "Start or select Foundry work"} accent />
            <Readout label="Blocker" value={brief?.blocker || "None"} warning={Boolean(brief?.blocker)} />
            <Readout label="Parked thoughts" value={String(brief?.parkedThoughtCount ?? 0)} />
          </div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-[#0b1119] p-4">
            <div className="text-xs uppercase tracking-[0.14em] text-amber-400">Crow Taxi</div>
            <div className="mt-1 text-sm text-slate-400">Capture the branch without replacing the active objective. Shiny is allowed to exist. It just doesn’t get root access.</div>
            <div className="mt-3 grid gap-3 md:grid-cols-[180px,minmax(0,1fr),auto]">
              <Select value={thoughtCategory} onChange={(event) => setThoughtCategory(event.target.value as ParkedThoughtCategory)}>
                {thoughtCategories.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </Select>
              <Input value={thought} onChange={(event) => setThought(event.target.value)} placeholder="Capture the branch before it steals the brain cell…" />
              <Button disabled={!thought.trim() || !brief?.activeWork.session} onClick={() => void captureThought()}>Park It</Button>
            </div>
            {captureMessage ? <div className="mt-3 text-xs text-slate-400">{captureMessage}</div> : null}
          </div>
        </Card>

        <Card title="Steward Queue" right={<Button variant="ghost" onClick={() => state.setView("production")}>Open Production</Button>}>
          <div className="space-y-3">
            {actionableProduction.slice(0, 6).map((item) => (
              <div key={item.id} className={`rounded-xl border p-3 ${item.blocker || item.status === "attention-required" ? "border-rose-500/20 bg-rose-500/5" : item.id === brief?.activeWork.productionItemId ? "border-emerald-500/20 bg-emerald-500/5" : "border-white/10 bg-[#0b1119]"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium text-slate-200">{item.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.stage || "stage unset"} · {item.status || "status unset"}</div>
                  </div>
                  {item.workbench?.printerId ? <span className="text-[10px] text-amber-300">{item.workbench.printerId}</span> : null}
                </div>
                <div className="mt-2 text-xs text-slate-400">{item.blocker ? `Blocked: ${item.blocker}` : item.nextAction || "No next action recorded"}</div>
              </div>
            ))}
            {actionableProduction.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-slate-500">Production Steward queue is clear.</div> : null}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Card title="Workbench Readiness">
          <StatusLine label="Registered assets" value={workbench.assets.length} />
          <StatusLine label="Inspection-required" value={inspectionRequired} warning={inspectionRequired > 0} />
          <StatusLine label="Inspector evidence" value={workbench.workbench.inspections.length} />
          <StatusLine label="Preparations" value={workbench.workbench.preparations.length} />
          <StatusLine label="Assemblies" value={workbench.workbench.assemblies.length} />
          <StatusLine label="Forgepack-ready files" value={workbench.workbench.files.filter((file) => file.ownedByFoundry).length} />
        </Card>

        <Card title="Physical Materials">
          <StatusLine label="Active spools" value={state.filament.filter((spool) => spool.status !== "Archived").length} />
          <StatusLine label="Unknown quantity" value={unknownSpools} warning={unknownSpools > 0} />
          <StatusLine label="Known kilograms" value={(knownMaterialGrams / 1000).toFixed(2)} />
          <StatusLine label="Ledger entries" value={state.materialTransactions.length} />
          <StatusLine label="Active reservations" value={state.materialReservations.filter((item) => item.status === "Active").length} />
        </Card>

        <Card title="Printer Roster">
          <div className="space-y-2">
            {state.printers.map((printer) => (
              <div key={printer.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0b1119] p-3">
                <div>
                  <div className="text-sm font-medium text-slate-200">{printer.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{printer.model} · {printer.buildVolume || "build volume unset"}</div>
                </div>
                <span className={`text-xs font-semibold ${printer.status === "Offline" ? "text-rose-300" : printer.status === "Maintenance" ? "text-amber-300" : "text-emerald-300"}`}>{printer.status}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function QuickAction({ title, helper, onClick }: { title: string; helper: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="min-h-[84px] rounded-2xl border border-white/10 bg-[#0d131c] px-4 py-4 text-left transition hover:bg-white/5">
      <div className="text-sm font-semibold text-slate-100">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-500">{helper}</div>
    </button>
  );
}

function Metric({ label, value, helper }: { label: string; value: string | number; helper: string }) {
  return <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4"><div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">{label}</div><div className="mt-2 text-2xl font-semibold text-slate-100">{value}</div><div className="mt-1 text-xs text-slate-500">{helper}</div></div>;
}

function Readout({ label, value, accent = false, warning = false }: { label: string; value: string; accent?: boolean; warning?: boolean }) {
  return <div className={`rounded-xl border p-4 ${warning ? "border-rose-500/20 bg-rose-500/5" : accent ? "border-amber-500/20 bg-amber-500/5" : "border-white/10 bg-[#0b1119]"}`}><div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">{label}</div><div className={`mt-2 text-sm ${warning ? "text-rose-200" : accent ? "text-amber-200" : "text-slate-300"}`}>{value}</div></div>;
}

function StatusLine({ label, value, warning = false }: { label: string; value: string | number; warning?: boolean }) {
  return <div className="flex items-center justify-between gap-3 border-b border-white/5 py-3 last:border-0"><div className="text-sm text-slate-400">{label}</div><div className={`text-sm font-semibold ${warning ? "text-amber-300" : "text-slate-200"}`}>{value}</div></div>;
}
