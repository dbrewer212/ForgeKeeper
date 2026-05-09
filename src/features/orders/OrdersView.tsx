import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { money } from "../../lib/format";
import { pillClass } from "../../lib/inventory";
import type { ForgekeeperState, QueueStatus } from "../../state/useForgekeeperState";
import type { OrderPriority, OrderStatus } from "../../types/domain";

const statuses: OrderStatus[] = ["Queued", "Printing", "Finishing", "Packed", "Shipped"];
const priorities: OrderPriority[] = ["Low", "Normal", "High", "Rush"];

export function OrdersView({ state }: { state: ForgekeeperState }) {
  return (
    <div className="space-y-6">
      <Card title="Add Order" right={<span className="text-xs text-slate-500">Uses selected catalog product</span>}>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),220px,auto]">
          <Input
            autoFocus={state.quickAction === "newOrder"}
            value={state.newOrderCustomer}
            onChange={(e) => state.setNewOrderCustomer(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") state.addOrder(); }}
            placeholder="Customer / order name"
          />
          <Select value={state.selectedProductId} onChange={(e) => state.setSelectedProductId(e.target.value)}>
            {state.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </Select>
          <Button onClick={state.addOrder}>Add Order</Button>
        </div>
      </Card>

      <Card title="Orders Board" right={<Button variant="ghost" onClick={state.exportOrdersCsv}>Export CSV</Button>}>
        <div className="grid gap-4 xl:grid-cols-5">
          {(Object.keys(state.queueCounts) as QueueStatus[]).map((status) => (
            <div key={status} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="font-semibold text-slate-100">{status}</div>
                <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(String(status))}`}>{state.queueCounts[status]}</span>
              </div>

              <div className="space-y-3">
                {state.orders.filter((o) => o.status === status).map((order) => {
                  const product = state.products.find((p) => p.id === order.productId);
                  const cost = state.getCostBreakdownForOrder(order);
                  return (
                    <div key={order.id} className="rounded-xl border border-white/10 bg-[#111722] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-slate-100">{order.customer}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {product?.name || order.productId} · Quote {money(order.quotedPrice)} · Cost {money(cost.total)} · Suggested {money(cost.suggestedPrice)}
                          </div>
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[11px] ${pillClass(order.paid ? "Paid" : order.priority)}`}>{order.paid ? "Paid" : order.priority}</span>
                      </div>

                      <div className="mt-3 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-xs text-slate-300">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <CostLine label="Material" value={money(cost.material)} />
                          <CostLine label="Electricity" value={money(cost.electricity)} />
                          <CostLine label="Labor" value={money(cost.labor)} />
                          <CostLine label="Profit" value={`${money(cost.profit)} / ${cost.marginPercent.toFixed(1)}%`} />
                          <CostLine label="Filament" value={order.materialConsumed ? "Consumed" : `${cost.gramsUsed.toFixed(0)}g pending`} />
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => state.updateOrder(order.id, { quotedPrice: Number(cost.suggestedPrice.toFixed(2)) })}>Use Suggested Price</Button>
                          <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => state.consumeFilamentForOrder(order.id)}>{order.materialConsumed ? "Material Consumed" : "Consume Filament"}</Button>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2">
                        <Input value={order.customer} onChange={(e) => state.updateOrder(order.id, { customer: e.target.value })} placeholder="Customer" />
                        <Select value={order.productId} onChange={(e) => state.updateOrder(order.id, { productId: e.target.value })}>
                          {state.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                        </Select>
                        <Select value={order.filamentId || ""} onChange={(e) => state.updateOrder(order.id, { filamentId: e.target.value || undefined })}>
                          <option value="">No filament selected</option>
                          {state.filament.map((item) => <option key={item.id} value={item.id}>{item.colorName} ({item.material})</option>)}
                        </Select>
                        <Select value={order.status} onChange={(e) => state.updateOrder(order.id, { status: e.target.value as OrderStatus })}>
                          {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                        </Select>
                        <Select value={order.priority} onChange={(e) => state.updateOrder(order.id, { priority: e.target.value as OrderPriority })}>
                          {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
                        </Select>
                        <Select value={order.printerId || ""} onChange={(e) => state.updateOrder(order.id, { printerId: e.target.value || undefined })}>
                          <option value="">Unassigned printer</option>
                          {state.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}
                        </Select>
                        <Input type="number" value={order.quantity} onChange={(e) => state.updateOrder(order.id, { quantity: Number(e.target.value) })} placeholder="Quantity" />
                        <Input type="number" value={order.materialGrams ?? product?.estimatedFilamentGrams ?? 0} onChange={(e) => state.updateOrder(order.id, { materialGrams: Number(e.target.value) })} placeholder="Filament grams per unit" />
                        <Input value={order.dueDate} onChange={(e) => state.updateOrder(order.id, { dueDate: e.target.value })} placeholder="Due date" />
                        <Input value={order.tracking} onChange={(e) => state.updateOrder(order.id, { tracking: e.target.value })} placeholder="Tracking" />
                        <Input type="number" value={order.quotedPrice} onChange={(e) => state.updateOrder(order.id, { quotedPrice: Number(e.target.value) })} placeholder="Quoted price" />
                        <Input type="number" value={order.estimatedPrintHours} onChange={(e) => state.updateOrder(order.id, { estimatedPrintHours: Number(e.target.value) })} placeholder="Print hours per unit" />
                        <Input type="number" value={order.laborHours} onChange={(e) => state.updateOrder(order.id, { laborHours: Number(e.target.value) })} placeholder="Labor hours" />
                        <Textarea value={order.notes} onChange={(e) => state.updateOrder(order.id, { notes: e.target.value })} placeholder="Order notes" className="min-h-[64px]" />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => state.updateOrder(order.id, { paid: !order.paid })}>{order.paid ? "Mark Unpaid" : "Mark Paid"}</Button>
                        {status !== "Shipped" ? <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => state.updateOrder(order.id, { status: statuses[Math.min(statuses.length - 1, statuses.indexOf(order.status) + 1)] })}>Move Next</Button> : null}
                        <Button variant="danger" className="h-8 px-3 text-xs" onClick={() => state.removeOrder(order.id)}>Remove</Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function CostLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-100">{value}</span></div>;
}
