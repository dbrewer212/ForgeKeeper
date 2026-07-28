import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { StatCard } from "../../components/ui/StatCard";
import { money } from "../../lib/format";
import type { ForgekeeperState } from "../../state/useForgekeeperState";

export function ReportsView({ state }: { state: ForgekeeperState }) {
  const jobBreakdowns = state.productionJobs.map((job) => ({ job, breakdown: state.getCostBreakdownForJob(job) }));
  const production = state.productionMetrics;

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Backup & Exports" right={<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">Portable Data</span>}>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button onClick={state.exportBackupJson}>Full JSON Backup</Button>
          <label className="flex h-10 cursor-pointer items-center rounded-xl border border-white/10 bg-white/5 px-4 text-sm font-medium text-slate-200 transition hover:bg-white/10">
            Import Backup
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) state.importBackupFile(file);
                event.currentTarget.value = "";
              }}
            />
          </label>
          <Button variant="ghost" onClick={state.resetWorkspace}>Reset Workspace</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={state.exportDesignProjectsCsv}>Design Projects</Button>
          <Button variant="ghost" onClick={state.exportStlsCsv}>STLs</Button>
          <Button variant="ghost" onClick={state.exportConceptsCsv}>Concepts</Button>
          <Button variant="ghost" onClick={state.exportVariantsCsv}>Variants</Button>
          <Button variant="ghost" onClick={state.exportCollectionsCsv}>Collections</Button>
          <Button variant="ghost" onClick={state.exportReleasesCsv}>Releases</Button>
          <Button variant="ghost" onClick={state.exportProductionJobsCsv}>Production Jobs</Button>
          <Button variant="ghost" onClick={state.exportProductionBatchesCsv}>Production Batches</Button>
          <Button variant="ghost" onClick={state.exportFilamentCsv}>Materials</Button>
          <Button variant="ghost" onClick={state.exportMaterialMovementsCsv}>Material Movements</Button>
          <Button variant="ghost" onClick={state.exportPrintersCsv}>Printers</Button>
          <Button variant="ghost" onClick={state.exportMaintenanceCsv}>Maintenance</Button>
          <Button variant="ghost" onClick={state.exportCostSnapshotsCsv}>Cost Snapshots</Button>
          <Button variant="ghost" onClick={state.exportActivityLogCsv}>Activity Log</Button>
        </div>
      </Card>

      <Card title="Operational Snapshot">
        <div className="grid gap-4 md:grid-cols-2">
          <StatCard label="Active Jobs" value={state.productionJobs.filter((job) => !["Complete", "Cancelled"].includes(job.status)).length} helper="Queued through finishing" />
          <StatCard label="Estimated Direct Cost" value={money(state.metrics.costs)} helper="Material + electricity + labor + finishing" />
          <StatCard label="Completed Jobs" value={state.metrics.done} helper="Internal work completed" />
          <StatCard label="Design Projects" value={state.metrics.designProjects} helper="User-owned design records" />
        </div>
      </Card>

      <Card title="Production Intelligence">
        <div className="grid gap-4 md:grid-cols-2">
          <StatCard label="Queue Hours" value={`${production.totalQueueHours.toFixed(1)}h`} helper={`${production.unassignedQueueHours.toFixed(1)}h unassigned`} />
          <StatCard label="Completion Estimate" value={`${production.estimatedCompletionDays.toFixed(1)} days`} helper={`${production.estimatedCompletionHours.toFixed(1)} production hours`} />
          <StatCard label="Filament Needed" value={`${(production.filamentNeededGrams / 1000).toFixed(2)}kg`} helper="Active queue demand" />
          <StatCard label="Bottlenecks" value={production.bottlenecks.length} helper="Printer load warnings" />
        </div>
        <div className="mt-5 space-y-3">
          {production.printerLoads.map((load) => (
            <div key={load.printerId} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-100">{load.name}</span>
                <span className="text-amber-300">{load.hours.toFixed(1)}h / {load.jobs} jobs</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Material Demand Forecast">
        <div className="space-y-3">
          {production.filamentDemand.map((item) => (
            <div key={item.filamentId} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-100">{item.name}</span>
                <span className={item.shortageGrams > 0 ? "text-rose-300" : "text-emerald-300"}>{item.neededGrams.toFixed(0)}g needed</span>
              </div>
              <div className="mt-1 text-slate-500">Available {item.availableGrams.toFixed(0)}g {item.shortageGrams > 0 ? `· Short ${item.shortageGrams.toFixed(0)}g` : "· Covered"}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Job Cost Breakdown">
        <div className="space-y-3">
          {jobBreakdowns.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-[#0d131c] p-6 text-sm text-slate-500">No production jobs to summarize.</div>
          ) : jobBreakdowns.map(({ job, breakdown }) => (
            <div key={job.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-slate-100">{job.name}</div>
                <div className="text-amber-300">{money(breakdown.total)} estimated</div>
              </div>
              <div className="mt-3 grid gap-2 text-slate-400 md:grid-cols-2">
                <Line label="Material" value={money(breakdown.material)} />
                <Line label="Electricity" value={money(breakdown.electricity)} />
                <Line label="Labor" value={money(breakdown.labor)} />
                <Line label="Finishing / Other" value={money(breakdown.packaging + breakdown.other)} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="System Cohesion">
        <div className="grid gap-3 text-sm text-slate-300">
          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">Design Library owns design identity. Production, Planning, Materials, and Reports reference those stable design records.</div>
          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">All station data persists through one repository. The desktop build uses the versioned SQLite workspace.</div>
          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">No customer accounts, customer catalog, sales intake, or order processing are part of this workspace.</div>
        </div>
      </Card>

      <Card title="Data Integrity">
        {state.integrityIssues.length === 0 ? (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            All operational record relationships are valid.
          </div>
        ) : (
          <div className="space-y-3">
            {state.integrityIssues.map((issue, index) => (
              <div key={`${issue.code}-${issue.recordId ?? index}`} className="rounded-2xl border border-rose-500/25 bg-rose-500/10 p-4 text-sm text-rose-100">
                <div className="font-semibold">{issue.code}</div>
                <div className="mt-1 text-rose-100/75">{issue.message}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title="Completed Cost Snapshots">
        <div className="space-y-3">
          {state.costSnapshots.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-[#0d131c] p-6 text-sm text-slate-500">No completed-job snapshots yet.</div>
          ) : state.costSnapshots.slice(0, 20).map((snapshot) => {
            const job = state.productionJobs.find((item) => item.id === snapshot.productionJobId);
            return (
              <div key={snapshot.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-100">{job?.name ?? snapshot.productionJobId}</div>
                  <div className="text-amber-300">{money(snapshot.totalCost)}</div>
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  {snapshot.gramsUsed.toFixed(0)}g · {snapshot.printHours.toFixed(1)}h · {new Date(snapshot.capturedAt).toLocaleString()}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Recent Activity">
        <div className="space-y-3">
          {state.activityLog.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-[#0d131c] p-6 text-sm text-slate-500">No activity recorded yet.</div>
          ) : state.activityLog.slice(0, 25).map((event) => (
            <div key={event.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm">
              <div className="font-medium text-slate-100">{event.summary}</div>
              <div className="mt-1 text-xs text-slate-500">{event.station} · {new Date(event.occurredAt).toLocaleString()}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span>{label}</span><span className="font-medium text-slate-100">{value}</span></div>;
}
