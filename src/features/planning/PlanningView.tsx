import { useMemo } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { useWorkbenchVault } from "../../workbench/useWorkbenchVault";

export function PlanningView({ state }: { state: ForgekeeperState }) {
  const workbench = useWorkbenchVault(state);
  const inspectionByRevision = useMemo(() => new Set(workbench.workbench.inspections.map((item) => item.revisionId)), [workbench.workbench.inspections]);
  const specByRevision = useMemo(() => new Map(workbench.workbench.manufacturingSpecs.map((item) => [item.revisionId, item])), [workbench.workbench.manufacturingSpecs]);
  const preparationsByRevision = useMemo(() => {
    const map = new Map<string, number>();
    for (const preparation of workbench.workbench.preparations) map.set(preparation.revisionId, (map.get(preparation.revisionId) ?? 0) + 1);
    return map;
  }, [workbench.workbench.preparations]);

  const inspectionNeeded = workbench.assets.filter((asset) => asset.lifecycleStatus === "inspection-required");
  const draftSpecs = workbench.workbench.manufacturingSpecs.filter((spec) => spec.approvalState !== "approved");
  const approvedWithoutPreparation = workbench.workbench.manufacturingSpecs.filter((spec) => spec.approvalState === "approved" && !workbench.workbench.preparations.some((prep) => prep.manufacturingSpecId === spec.id));
  const submittedPreparations = workbench.workbench.preparations.filter((prep) => prep.status === "submitted");
  const activeSpools = state.filament.filter((spool) => spool.status !== "Archived");
  const unknownSpools = activeSpools.filter((spool) => spool.quantityConfidence === "Unknown");
  const emptySpools = activeSpools.filter((spool) => spool.status === "Empty" || spool.gramsAvailable <= 0);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-amber-700/35 bg-[linear-gradient(180deg,rgba(25,22,19,0.94),rgba(13,11,9,0.96))] p-5 shadow-forge">
        <div className="text-xs uppercase tracking-[0.24em] text-amber-400">Workbench Planning</div>
        <h1 className="mt-1 text-3xl font-semibold text-slate-100">Readiness & Dependency Board</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-400">Planning is derived from canonical Workbench state. It identifies what must happen next without creating a second Product/Order workflow or changing manufacturing authority.</p>
      </div>

      {workbench.error ? <div className="rounded-xl border border-rose-500/25 bg-rose-500/5 p-4 text-sm text-rose-300">Workbench runtime: {workbench.error}</div> : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        <Metric label="Assets" value={workbench.assets.length} helper="Canonical Workbench identities" />
        <Metric label="Needs inspection" value={inspectionNeeded.length} helper="Geometry/evidence gate" warning={inspectionNeeded.length > 0} />
        <Metric label="Draft specs" value={draftSpecs.length} helper="Manufacturing decision pending" warning={draftSpecs.length > 0} />
        <Metric label="Ready for prep" value={approvedWithoutPreparation.length} helper="Approved spec, no preparation" />
        <Metric label="Released prep" value={submittedPreparations.length} helper="Eligible for production handoff" />
        <Metric label="Material uncertainty" value={unknownSpools.length} helper={`${emptySpools.length} empty / depleted`} warning={unknownSpools.length > 0 || emptySpools.length > 0} />
      </div>

      <Card title="Readiness Lanes" right={<span className="text-xs text-slate-500">Derived, not manually staged</span>}>
        <div className="grid gap-4 xl:grid-cols-4">
          <Lane title="Inspect" helper="Revision needs evidence" count={inspectionNeeded.length}>
            {inspectionNeeded.map((asset) => <AssetRow key={asset.id} name={asset.name} detail={asset.currentRevisionId || "No current revision"} />)}
          </Lane>
          <Lane title="Specify" helper="Inspection exists; manufacturing approval incomplete" count={draftSpecs.length}>
            {draftSpecs.map((spec) => {
              const asset = workbench.assets.find((item) => item.id === spec.assetId);
              return <AssetRow key={spec.id} name={asset?.name || spec.assetId} detail={`${spec.process} · ${spec.approvalState}`} />;
            })}
          </Lane>
          <Lane title="Prepare" helper="Approved manufacturing spec needs a production preparation" count={approvedWithoutPreparation.length}>
            {approvedWithoutPreparation.map((spec) => {
              const asset = workbench.assets.find((item) => item.id === spec.assetId);
              return <AssetRow key={spec.id} name={asset?.name || spec.assetId} detail={`${spec.process} · revision ${shortId(spec.revisionId)}`} />;
            })}
          </Lane>
          <Lane title="Release" helper="Preparation ready for Production Steward" count={submittedPreparations.length}>
            {submittedPreparations.map((prep) => {
              const asset = workbench.assets.find((item) => item.id === prep.assetId);
              return <AssetRow key={prep.id} name={asset?.name || prep.assetId} detail={`${prep.printerId || "printer unset"} · ${prep.physicalSpoolIds.length} spool${prep.physicalSpoolIds.length === 1 ? "" : "s"}`} />;
            })}
          </Lane>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.1fr,0.9fr]">
        <Card title="Asset Dependency Detail" right={<Button variant="ghost" onClick={() => state.setView("designs")}>Open Workbench</Button>}>
          <div className="space-y-3">
            {workbench.assets.map((asset) => {
              const revisionId = asset.currentRevisionId;
              const spec = revisionId ? specByRevision.get(revisionId) : undefined;
              const inspected = revisionId ? inspectionByRevision.has(revisionId) : false;
              const preparationCount = revisionId ? preparationsByRevision.get(revisionId) ?? 0 : 0;
              return (
                <div key={asset.id} className="rounded-xl border border-slate-700/55 bg-slate-900/55 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-slate-100">{asset.name}</div>
                      <div className="mt-1 text-xs text-slate-500">{asset.assetType} · {asset.lifecycleStatus}</div>
                    </div>
                    <div className="text-[10px] text-slate-600">{shortId(asset.id)}</div>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-4">
                    <Gate label="Revision" ready={Boolean(revisionId)} value={revisionId ? shortId(revisionId) : "missing"} />
                    <Gate label="Inspection" ready={inspected} value={inspected ? "recorded" : "required"} />
                    <Gate label="Spec" ready={spec?.approvalState === "approved"} value={spec?.approvalState || "missing"} />
                    <Gate label="Preparation" ready={preparationCount > 0} value={preparationCount ? String(preparationCount) : "none"} />
                  </div>
                </div>
              );
            })}
            {workbench.assets.length === 0 ? <div className="rounded-xl border border-dashed border-slate-700/60 p-8 text-center text-sm text-slate-500">No Workbench assets yet. Intake is the entry point for new geometry.</div> : null}
          </div>
        </Card>

        <Card title="Material Readiness" right={<Button variant="ghost" onClick={() => state.setView("filament")}>Open Materials</Button>}>
          <div className="space-y-3">
            {activeSpools.map((spool) => (
              <div key={spool.id} className={`rounded-xl border p-3 ${spool.quantityConfidence === "Unknown" || spool.status === "Empty" ? "border-amber-500/25 bg-amber-500/5" : "border-slate-700/55 bg-slate-900/55"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-100">{spool.foundrySpoolCode}</div>
                    <div className="mt-1 text-xs text-slate-500">{spool.brand} · {spool.material} · {spool.colorName}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-slate-200">{spool.quantityConfidence === "Unknown" ? "Unknown" : `${spool.gramsAvailable.toFixed(0)}g`}</div>
                    <div className="mt-1 text-[10px] text-slate-600">{spool.status}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Planning Authority Boundary">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 text-sm text-slate-400">
          <Boundary title="Identity">Asset Vault owns asset and revision identity.</Boundary>
          <Boundary title="Manufacturing">Build Bench and ManufacturingSpec own preparation decisions and approval.</Boundary>
          <Boundary title="Execution">Production Steward owns the production workflow and active session.</Boundary>
          <Boundary title="Machine state">Bastion / Watcher and explicit printer records own machine condition; Planning never infers it.</Boundary>
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value, helper, warning = false }: { label: string; value: number | string; helper: string; warning?: boolean }) {
  return <div className={`rounded-2xl border p-4 shadow-forge-inset ${warning ? "border-amber-500/25 bg-amber-500/5" : "border-slate-700/55 bg-slate-900/60"}`}><div className="text-[10px] uppercase tracking-[0.14em] text-slate-600">{label}</div><div className={`mt-2 text-2xl font-semibold ${warning ? "text-amber-300" : "text-slate-100"}`}>{value}</div><div className="mt-1 text-xs text-slate-500">{helper}</div></div>;
}

function Lane({ title, helper, count, children }: { title: string; helper: string; count: number; children: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-700/55 bg-slate-950/45 p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold text-slate-100">{title}</div><div className="mt-1 text-xs text-slate-500">{helper}</div></div><span className="rounded-full border border-amber-700/35 bg-amber-900/20 px-2.5 py-1 text-xs font-semibold text-amber-300">{count}</span></div><div className="mt-4 space-y-2">{children}{count === 0 ? <div className="rounded-lg border border-dashed border-slate-800/70 p-4 text-center text-xs text-slate-600">Lane clear</div> : null}</div></div>;
}

function AssetRow({ name, detail }: { name: string; detail: string }) {
  return <div className="rounded-lg border border-slate-800/70 bg-slate-900/70 p-3"><div className="text-sm font-medium text-slate-200">{name}</div><div className="mt-1 text-xs text-slate-500">{detail}</div></div>;
}

function Gate({ label, ready, value }: { label: string; ready: boolean; value: string }) {
  return <div className={`rounded-lg border px-3 py-2 ${ready ? "border-emerald-500/18 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`}><div className="text-[9px] uppercase tracking-[0.12em] text-slate-600">{label}</div><div className={`mt-1 text-xs font-semibold ${ready ? "text-emerald-300" : "text-amber-300"}`}>{value}</div></div>;
}

function Boundary({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rounded-xl border border-slate-700/55 bg-slate-950/45 p-4"><div className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-400">{title}</div><div className="mt-2 leading-6">{children}</div></div>;
}

function shortId(id: string) {
  return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-6)}` : id;
}
