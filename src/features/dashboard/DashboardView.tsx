import { Card } from "../../components/ui/Card";
import { StatCard } from "../../components/ui/StatCard";
import { KeeperAlertPanel } from "../../components/keeper/KeeperAlertPanel";
import { money } from "../../lib/format";
import { inventoryState, pillClass } from "../../lib/inventory";
import type { ForgekeeperState } from "../../state/useForgekeeperState";

export function DashboardView({ state }: { state: ForgekeeperState }) {
  const production = state.productionMetrics;

  return (
    <div className="space-y-6">
      <Card title="Quick Actions" right={<span className="text-xs text-slate-500">Fast Entry</span>}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <QuickAction title="New Order" helper="Jump to order intake" onClick={() => state.triggerQuickAction("newOrder")} />
          <QuickAction title="Add Product" helper="Open catalog entry" onClick={() => state.triggerQuickAction("newProduct")} />
          <QuickAction title="Add Filament" helper="Update material pool" onClick={() => state.triggerQuickAction("newFilament")} />
          <QuickAction title="Add Printer" helper="Expand machine roster" onClick={() => state.triggerQuickAction("newPrinter")} />
        </div>
      </Card>

      <KeeperAlertPanel state={state} title="Keeper System Alerts" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total Orders" value={state.metrics.orders} helper={`${state.queueCounts.Queued} queued`} />
        <StatCard label="Revenue" value={money(state.metrics.revenue)} helper={`${state.metrics.paid} paid orders`} />
        <StatCard label="In Production" value={state.queueCounts.Printing} helper={`${state.queueCounts.Finishing} finishing`} />
        <StatCard label="Completed" value={state.metrics.done} helper="Packed + shipped" />
        <StatCard label="Filament Available" value={`${state.metrics.totalFilamentKg.toFixed(2)} kg`} helper="Across loaded inventory" />
      </div>

      <Card title="Production Intelligence" right={<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">Forecast</span>}>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Queue Hours" value={`${production.totalQueueHours.toFixed(1)}h`} helper={`${production.unassignedQueueHours.toFixed(1)}h unassigned`} />
          <StatCard label="Completion Est." value={`${production.estimatedCompletionHours.toFixed(1)}h`} helper={`${production.estimatedCompletionDays.toFixed(1)} shop days`} />
          <StatCard label="Filament Needed" value={`${(production.filamentNeededGrams / 1000).toFixed(2)}kg`} helper="Active queue demand" />
          <StatCard label="Unassigned Jobs" value={production.unassignedOrders} helper="Needs printer assignment" />
          <StatCard label="Bottlenecks" value={production.bottlenecks.length} helper="Load / offline warnings" />
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
            <div className="text-sm font-semibold text-slate-100">Printer Load</div>
            <div className="mt-4 space-y-3">
              {production.printerLoads.map((load) => (
                <div key={load.printerId} className="rounded-xl border border-white/8 bg-[#111722] px-3 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-100">{load.name}</span>
                    <span className="text-amber-300">{load.hours.toFixed(1)}h · {load.jobs} jobs</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/5">
                    <div className="h-2 rounded-full bg-amber-400" style={{ width: `${Math.min(100, (load.hours / Math.max(1, state.settings.productionHoursPerDay * 2)) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
            <div className="text-sm font-semibold text-slate-100">Filament Forecast</div>
            <div className="mt-4 space-y-3">
              {production.filamentDemand.map((item) => (
                <div key={item.filamentId} className="rounded-xl border border-white/8 bg-[#111722] px-3 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium text-slate-100">{item.name}</span>
                    <span className={item.shortageGrams > 0 ? "text-rose-300" : "text-emerald-300"}>{item.neededGrams.toFixed(0)}g needed</span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">Available {item.availableGrams.toFixed(0)}g {item.shortageGrams > 0 ? `· Short ${item.shortageGrams.toFixed(0)}g` : "· Covered"}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
        <Card title="Workshop Flow" right={<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">Live Snapshot</span>}>
          <div className="grid gap-4 md:grid-cols-5">
            {Object.entries(state.queueCounts).map(([label, value]) => (
              <div key={label} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-center">
                <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
                <div className="mt-2 text-3xl font-semibold text-slate-100">{value}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
              <div className="text-sm font-semibold text-slate-100">Recent Orders</div>
              <div className="mt-4 space-y-3">
                {state.orders.slice(0, 4).map((order) => {
                  const product = state.products.find((p) => p.id === order.productId);
                  return (
                    <div key={order.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-[#111722] px-3 py-3">
                      <div>
                        <div className="text-sm font-medium text-slate-100">{order.customer}</div>
                        <div className="text-xs text-slate-500">{product?.name || order.productId}</div>
                      </div>
                      <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(order.status)}`}>{order.status}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
              <div className="text-sm font-semibold text-slate-100">Top Products</div>
              <div className="mt-4 space-y-3">
                {state.products.map((product) => (
                  <div key={product.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-[#111722] px-3 py-3">
                    <div>
                      <div className="text-sm font-medium text-slate-100">{product.name}</div>
                      <div className="text-xs text-slate-500">{product.collection}</div>
                    </div>
                    <div className="text-sm font-semibold text-amber-300">{state.orders.filter((o) => o.productId === product.id).length}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
        <div className="space-y-6">
          <Card title="Filament Status" right={<span className="text-xs text-slate-500">Pool View</span>}>
            <div className="space-y-3">
              {state.filament.map((item) => (
                <div key={item.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div><div className="font-medium text-slate-100">{item.colorName}</div><div className="text-xs text-slate-500">{item.brand} · {item.material}</div></div>
                    <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(inventoryState(item.gramsAvailable, item.reorderPointGrams))}`}>{item.gramsAvailable}g</span>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/5"><div className="h-2 rounded-full bg-amber-400" style={{ width: `${Math.min(100, (item.gramsAvailable / 1000) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Printer Status" right={<span className="text-xs text-slate-500">Workshop Deck</span>}>
            <div className="space-y-3">
              {state.printers.map((printer) => (
                <div key={printer.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div><div className="font-medium text-slate-100">{printer.name}</div><div className="text-xs text-slate-500">{printer.activeJob || "No active job"}</div></div>
                    <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(printer.status)}`}>{printer.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ title, helper, onClick }: { title: string; helper: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-2xl border border-white/10 bg-[#0d131c] px-4 py-4 text-left transition hover:bg-white/5">
      <div className="text-sm font-semibold text-slate-100">{title}</div>
      <div className="mt-1 text-xs text-slate-500">{helper}</div>
    </button>
  );
}
