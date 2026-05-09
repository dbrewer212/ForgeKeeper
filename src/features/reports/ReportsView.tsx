import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { StatCard } from "../../components/ui/StatCard";
import { money } from "../../lib/format";
import type { ForgekeeperState } from "../../state/useForgekeeperState";

export function ReportsView({ state }: { state: ForgekeeperState }) {
  const margin = state.metrics.revenue > 0 ? (state.metrics.profit / state.metrics.revenue) * 100 : 0;
  const orderBreakdowns = state.orders.map((order) => ({ order, breakdown: state.getCostBreakdownForOrder(order) }));
  const suggestedRevenue = orderBreakdowns.reduce((sum, item) => sum + item.breakdown.suggestedPrice, 0);
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
          <Button variant="ghost" onClick={state.resetWorkspace}>Reset Demo Data</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={state.exportProductsCsv}>Products</Button>
          <Button variant="ghost" onClick={state.exportStlsCsv}>STLs</Button>
          <Button variant="ghost" onClick={state.exportConceptsCsv}>Concepts</Button>
          <Button variant="ghost" onClick={state.exportVariantsCsv}>Variants</Button>
          <Button variant="ghost" onClick={state.exportCollectionsCsv}>Collections</Button>
          <Button variant="ghost" onClick={state.exportReleasesCsv}>Releases</Button>
          <Button variant="ghost" onClick={state.exportOrdersCsv}>Orders</Button>
          <Button variant="ghost" onClick={state.exportFilamentCsv}>Filament</Button>
          <Button variant="ghost" onClick={state.exportPrintersCsv}>Printers</Button>
          <Button variant="ghost" onClick={state.exportMaintenanceCsv}>Maintenance</Button>
        </div>
      </Card>

      <Card title="Business Snapshot">
        <div className="grid gap-4 md:grid-cols-2">
          <StatCard label="Revenue" value={money(state.metrics.revenue)} helper="Gross quoted value" />
          <StatCard label="Direct Costs" value={money(state.metrics.costs)} helper="Material + electricity + labor + packaging" />
          <StatCard label="Profit" value={money(state.metrics.profit)} helper={`${margin.toFixed(1)}% estimated margin`} />
          <StatCard label="Suggested Revenue" value={money(suggestedRevenue)} helper={`${state.settings.targetMarginPercent}% target margin floor`} />
        </div>
      </Card>

      <Card title="Production Intelligence Summary">
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

      <Card title="Cost Engine Breakdown">
        <div className="space-y-3">
          {orderBreakdowns.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 bg-[#0d131c] p-6 text-sm text-slate-500">No orders to summarize.</div> : orderBreakdowns.map(({ order, breakdown }) => (
            <div key={order.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="font-semibold text-slate-100">{order.customer}</div>
                <div className="text-amber-300">{money(breakdown.profit)} profit</div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2 text-slate-400">
                <Line label="Material" value={money(breakdown.material)} />
                <Line label="Electricity" value={money(breakdown.electricity)} />
                <Line label="Labor" value={money(breakdown.labor)} />
                <Line label="Total Cost" value={money(breakdown.total)} />
                <Line label="Suggested" value={money(breakdown.suggestedPrice)} />
                <Line label="Actual Margin" value={`${breakdown.marginPercent.toFixed(1)}%`} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="System Cohesion">
        <div className="grid gap-3 text-sm text-slate-300">
          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">Catalog owns product identity. Orders, releases, collections, STL records, variants, and concept specs reference catalog products.</div>
          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">Smart costs pull from Settings, Filament spool cost, Printer wattage, Product estimates, and Order overrides.</div>
          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">Production intelligence estimates queue load, printer bottlenecks, material demand, and completion time.</div>
          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">Use JSON backup before major edits or before moving to a desktop/local-file version.</div>
        </div>
      </Card>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span>{label}</span><span className="font-medium text-slate-100">{value}</span></div>;
}
