import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { money } from "../../lib/format";
import { pillClass } from "../../lib/inventory";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type {
  DepositStatus,
  OrderPriority,
  OrderStatus,
  OrderType,
} from "../../types/domain";

const statuses: OrderStatus[] = [
  "Inquiry",
  "Estimate",
  "Awaiting Deposit",
  "Queued",
  "Production",
  "Finishing",
  "Completed",
  "Voided",
];

const priorities: OrderPriority[] = ["Low", "Normal", "High", "Rush"];
const orderTypes: OrderType[] = ["Catalog Order", "Custom Request"];
const depositStatuses: DepositStatus[] = [
  "Not Requested",
  "Awaiting Deposit",
  "Deposit Received",
  "Paid in Full",
  "Waived",
  "Refunded",
];

function getNextStatus(status: OrderStatus): OrderStatus {
  const currentIndex = statuses.indexOf(status);
  if (currentIndex < 0) return "Inquiry";
  return statuses[Math.min(statuses.length - 2, currentIndex + 1)];
}

function appendReviewNote(existingNotes: string, note: string): string {
  const timestamp = new Date().toLocaleString();
  const entry = `[${timestamp}] ${note}`;
  return existingNotes ? `${existingNotes}\n${entry}` : entry;
}

export function OrdersView({ state }: { state: ForgekeeperState }) {
  const inquiryCount = state.orders.filter((order) => order.status === "Inquiry").length;
  const awaitingDepositCount = state.orders.filter((order) => order.status === "Awaiting Deposit").length;
  const queuedCount = state.orders.filter((order) => order.status === "Queued").length;
  const depositNeededCount = state.orders.filter(
    (order) => order.depositRequired && !order.depositPaid && order.status !== "Voided",
  ).length;

  return (
    <div className="space-y-6">
      <Card
        title="Add Order / Request"
        right={<span className="text-xs text-slate-500">Admin intake</span>}
      >
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),220px,auto]">
          <Input
            autoFocus={state.quickAction === "newOrder"}
            value={state.newOrderCustomer}
            onChange={(e) => state.setNewOrderCustomer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") state.addOrder();
            }}
            placeholder="Customer / request name"
          />

          <Select
            value={state.selectedProductId}
            onChange={(e) => state.setSelectedProductId(e.target.value)}
          >
            {state.products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
              </option>
            ))}
          </Select>

          <Button onClick={state.addOrder}>Add Request</Button>
        </div>

        <div className="mt-4 rounded-2xl border border-amber-300/15 bg-amber-400/10 p-4 text-sm leading-6 text-slate-300">
          Orders now support commission intake: customer contact, request type,
          deposit tracking, estimate state, queue state, and completion review.
        </div>
      </Card>

      <Card title="Admin Review" right={<span className="text-xs text-slate-500">Commission control</span>}>
        <div className="grid gap-3 md:grid-cols-4">
          <ReviewMetric label="New Inquiries" value={inquiryCount} />
          <ReviewMetric label="Awaiting Deposit" value={awaitingDepositCount} />
          <ReviewMetric label="Deposit Needed" value={depositNeededCount} />
          <ReviewMetric label="Queued Work" value={queuedCount} />
        </div>

        <div className="mt-4 rounded-2xl border border-sky-300/15 bg-sky-400/10 p-4 text-sm leading-6 text-slate-300">
          Review path: approve inquiry, prepare estimate, request deposit, then
          queue the work only after commitment is recorded.
        </div>
      </Card>

      <Card title="Forge Queue" right={<Button variant="ghost" onClick={state.exportOrdersCsv}>Export CSV</Button>}>
        <div className="grid gap-4 xl:grid-cols-4">
          {statuses.map((status) => {
            const statusOrders = state.orders.filter((order) => order.status === status);

            return (
              <div key={status} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-100">{status}</div>
                  <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(String(status))}`}>
                    {statusOrders.length}
                  </span>
                </div>

                <div className="space-y-3">
                  {statusOrders.map((order) => {
                    const product = state.products.find((p) => p.id === order.productId);
                    const cost = state.getCostBreakdownForOrder(order);
                    const depositLabel = order.depositPaid
                      ? "Deposit Paid"
                      : order.depositRequired
                        ? "Deposit Needed"
                        : "No Deposit";

                    const approveInquiry = () => {
                      state.updateOrder(order.id, {
                        status: "Estimate",
                        depositRequired: true,
                        depositStatus: "Awaiting Deposit",
                        notes: appendReviewNote(order.notes, "Inquiry approved for estimate review."),
                      });
                    };

                    const markEstimateSent = () => {
                      state.updateOrder(order.id, {
                        status: "Awaiting Deposit",
                        depositRequired: true,
                        depositStatus: "Awaiting Deposit",
                        quotedPrice: order.quotedPrice || Number(cost.suggestedPrice.toFixed(2)),
                        notes: appendReviewNote(order.notes, "Estimate prepared/sent. Awaiting deposit."),
                      });
                    };

                    const markDepositReceived = () => {
                      state.updateOrder(order.id, {
                        status: "Queued",
                        depositRequired: true,
                        depositPaid: true,
                        depositStatus: "Deposit Received",
                        notes: appendReviewNote(order.notes, "Deposit received. Request moved to queue."),
                      });
                    };

                    const voidRequest = () => {
                      state.updateOrder(order.id, {
                        status: "Voided",
                        notes: appendReviewNote(order.notes, "Request voided during admin review."),
                      });
                    };

                    return (
                      <div key={order.id} className="rounded-xl border border-white/10 bg-[#111722] p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-medium text-slate-100">{order.customer}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {product?.name || order.productId} · {order.orderType} · Quote {money(order.quotedPrice)}
                            </div>
                          </div>

                          <span className={`rounded-full border px-2 py-1 text-[11px] ${pillClass(order.depositPaid ? "Paid" : order.priority)}`}>
                            {order.depositPaid ? "Deposit Paid" : order.priority}
                          </span>
                        </div>

                        <div className="mt-3 grid gap-2 rounded-xl border border-sky-400/15 bg-sky-400/10 p-3 text-xs text-slate-300 sm:grid-cols-2">
                          <CostLine label="Email" value={order.customerEmail || "Not set"} />
                          <CostLine label="Phone" value={order.customerPhone || "Not set"} />
                          <CostLine label="Source" value={order.requestSource || "Admin"} />
                          <CostLine label="Deposit" value={`${money(order.depositAmount)} · ${depositLabel}`} />
                        </div>

                        <div className="mt-3 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-xs text-slate-300">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <CostLine label="Material" value={money(cost.material)} />
                            <CostLine label="Electricity" value={money(cost.electricity)} />
                            <CostLine label="Labor" value={money(cost.labor)} />
                            <CostLine label="Profit" value={`${money(cost.profit)} / ${cost.marginPercent.toFixed(1)}%`} />
                            <CostLine label="Filament" value={order.materialConsumed ? "Consumed" : `${cost.gramsUsed.toFixed(0)}g pending`} />
                            <CostLine label="Suggested" value={money(cost.suggestedPrice)} />
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              variant="ghost"
                              className="h-8 px-3 text-xs"
                              onClick={() =>
                                state.updateOrder(order.id, {
                                  quotedPrice: Number(cost.suggestedPrice.toFixed(2)),
                                })
                              }
                            >
                              Use Suggested Price
                            </Button>

                            <Button
                              variant="ghost"
                              className="h-8 px-3 text-xs"
                              onClick={() => state.consumeFilamentForOrder(order.id)}
                            >
                              {order.materialConsumed ? "Material Consumed" : "Consume Filament"}
                            </Button>
                          </div>
                        </div>

                        <div className="mt-3 rounded-xl border border-amber-300/15 bg-black/20 p-3">
                          <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                            Admin Review Actions
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {order.status === "Inquiry" ? (
                              <Button className="h-8 px-3 text-xs" onClick={approveInquiry}>
                                Approve for Estimate
                              </Button>
                            ) : null}

                            {order.status === "Estimate" ? (
                              <Button className="h-8 px-3 text-xs" onClick={markEstimateSent}>
                                Mark Estimate Sent
                              </Button>
                            ) : null}

                            {order.status === "Awaiting Deposit" ? (
                              <Button className="h-8 px-3 text-xs" onClick={markDepositReceived}>
                                Mark Deposit Received
                              </Button>
                            ) : null}

                            {order.status !== "Completed" && order.status !== "Voided" ? (
                              <Button variant="ghost" className="h-8 px-3 text-xs" onClick={voidRequest}>
                                Void Request
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-3 grid gap-2">
                          <Input
                            value={order.customer}
                            onChange={(e) => state.updateOrder(order.id, { customer: e.target.value })}
                            placeholder="Customer name"
                          />

                          <Input
                            value={order.customerEmail || ""}
                            onChange={(e) => state.updateOrder(order.id, { customerEmail: e.target.value })}
                            placeholder="Customer email"
                          />

                          <Input
                            value={order.customerPhone || ""}
                            onChange={(e) => state.updateOrder(order.id, { customerPhone: e.target.value })}
                            placeholder="Customer phone"
                          />

                          <Input
                            value={order.contact || ""}
                            onChange={(e) => state.updateOrder(order.id, { contact: e.target.value })}
                            placeholder="Preferred contact / contact notes"
                          />

                          <Select
                            value={order.orderType}
                            onChange={(e) => state.updateOrder(order.id, { orderType: e.target.value as OrderType })}
                          >
                            {orderTypes.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                          </Select>

                          <Select
                            value={order.productId}
                            onChange={(e) => state.updateOrder(order.id, { productId: e.target.value })}
                          >
                            {state.products.map((product) => (
                              <option key={product.id} value={product.id}>
                                {product.name}
                              </option>
                            ))}
                          </Select>

                          <Select
                            value={order.status}
                            onChange={(e) => state.updateOrder(order.id, { status: e.target.value as OrderStatus })}
                          >
                            {statuses.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </Select>

                          <Select
                            value={order.priority}
                            onChange={(e) => state.updateOrder(order.id, { priority: e.target.value as OrderPriority })}
                          >
                            {priorities.map((p) => (
                              <option key={p} value={p}>
                                {p}
                              </option>
                            ))}
                          </Select>

                          <Select
                            value={order.depositStatus}
                            onChange={(e) =>
                              state.updateOrder(order.id, {
                                depositStatus: e.target.value as DepositStatus,
                                depositPaid:
                                  e.target.value === "Deposit Received" ||
                                  e.target.value === "Paid in Full",
                              })
                            }
                          >
                            {depositStatuses.map((depositStatus) => (
                              <option key={depositStatus} value={depositStatus}>
                                {depositStatus}
                              </option>
                            ))}
                          </Select>

                          <Select
                            value={order.filamentId || ""}
                            onChange={(e) => state.updateOrder(order.id, { filamentId: e.target.value || undefined })}
                          >
                            <option value="">No filament selected</option>
                            {state.filament.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.colorName} ({item.material})
                              </option>
                            ))}
                          </Select>

                          <Select
                            value={order.printerId || ""}
                            onChange={(e) => state.updateOrder(order.id, { printerId: e.target.value || undefined })}
                          >
                            <option value="">Unassigned printer</option>
                            {state.printers.map((printer) => (
                              <option key={printer.id} value={printer.id}>
                                {printer.name}
                              </option>
                            ))}
                          </Select>

                          <Input
                            type="number"
                            value={order.depositAmount}
                            onChange={(e) => state.updateOrder(order.id, { depositAmount: Number(e.target.value) })}
                            placeholder="Deposit amount"
                          />

                          <Input
                            type="number"
                            value={order.quantity}
                            onChange={(e) => state.updateOrder(order.id, { quantity: Number(e.target.value) })}
                            placeholder="Quantity"
                          />

                          <Input
                            type="number"
                            value={order.materialGrams ?? product?.estimatedFilamentGrams ?? 0}
                            onChange={(e) => state.updateOrder(order.id, { materialGrams: Number(e.target.value) })}
                            placeholder="Filament grams per unit"
                          />

                          <Input
                            value={order.dueDate}
                            onChange={(e) => state.updateOrder(order.id, { dueDate: e.target.value })}
                            placeholder="Due date"
                          />

                          <Input
                            value={order.tracking}
                            onChange={(e) => state.updateOrder(order.id, { tracking: e.target.value })}
                            placeholder="Tracking / delivery notes"
                          />

                          <Input
                            type="number"
                            value={order.quotedPrice}
                            onChange={(e) => state.updateOrder(order.id, { quotedPrice: Number(e.target.value) })}
                            placeholder="Quoted price"
                          />

                          <Input
                            type="number"
                            value={order.estimatedPrintHours}
                            onChange={(e) => state.updateOrder(order.id, { estimatedPrintHours: Number(e.target.value) })}
                            placeholder="Print hours per unit"
                          />

                          <Input
                            type="number"
                            value={order.laborHours}
                            onChange={(e) => state.updateOrder(order.id, { laborHours: Number(e.target.value) })}
                            placeholder="Labor hours"
                          />

                          <Textarea
                            value={order.notes}
                            onChange={(e) => state.updateOrder(order.id, { notes: e.target.value })}
                            placeholder="Commission notes, requested changes, paint preferences, customer details, or fulfillment notes"
                            className="min-h-[72px]"
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <Button
                            variant="ghost"
                            className="h-8 px-3 text-xs"
                            onClick={() =>
                              state.updateOrder(order.id, {
                                depositRequired: !order.depositRequired,
                                depositStatus: !order.depositRequired ? "Awaiting Deposit" : "Not Requested",
                              })
                            }
                          >
                            {order.depositRequired ? "Deposit Required" : "No Deposit"}
                          </Button>

                          <Button
                            variant="ghost"
                            className="h-8 px-3 text-xs"
                            onClick={() =>
                              state.updateOrder(order.id, {
                                depositPaid: !order.depositPaid,
                                depositStatus: !order.depositPaid ? "Deposit Received" : "Awaiting Deposit",
                              })
                            }
                          >
                            {order.depositPaid ? "Mark Deposit Unpaid" : "Mark Deposit Paid"}
                          </Button>

                          <Button
                            variant="ghost"
                            className="h-8 px-3 text-xs"
                            onClick={() => state.updateOrder(order.id, { paid: !order.paid })}
                          >
                            {order.paid ? "Mark Unpaid" : "Mark Paid"}
                          </Button>

                          {status !== "Completed" && status !== "Voided" ? (
                            <Button
                              variant="ghost"
                              className="h-8 px-3 text-xs"
                              onClick={() =>
                                state.updateOrder(order.id, {
                                  status: getNextStatus(order.status),
                                })
                              }
                            >
                              Move Next
                            </Button>
                          ) : null}

                          <Button
                            variant="danger"
                            className="h-8 px-3 text-xs"
                            onClick={() => state.removeOrder(order.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })}

                  {statusOrders.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-slate-500">
                      No {status.toLowerCase()} requests.
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function ReviewMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black text-slate-50">{value}</div>
    </div>
  );
}

function CostLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-100">{value}</span>
    </div>
  );
}
