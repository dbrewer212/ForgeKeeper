import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { money } from "../../lib/format";
import type { ForgekeeperState } from "../../state/useForgekeeperState";

type ProductionColumn = {
  label: string;
  statuses: Array<"Queued" | "Printing" | "Finishing" | "Packed" | "Shipped">;
};

const columns: ProductionColumn[] = [
  { label: "Queued", statuses: ["Queued"] },
  { label: "Printing", statuses: ["Printing"] },
  { label: "Finishing", statuses: ["Finishing"] },
  { label: "Complete", statuses: ["Packed", "Shipped"] },
];

export function ProductionView({ state }: { state: ForgekeeperState }) {
  return (
    <div className="space-y-6">
      <Card title="Add Production Job" right={<span className="text-xs text-slate-500">Internal Foundry work only</span>}>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),260px,auto]">
          <Input
            autoFocus={state.quickAction === "newOrder"}
            value={state.newOrderCustomer}
            onChange={(event) => state.setNewOrderCustomer(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") state.addOrder(); }}
            placeholder="Job name"
          />
          <Select value={state.selectedProductId} onChange={(event) => state.setSelectedProductId(event.target.value)}>
            <option value="">Select design</option>
            {state.products.map((design) => <option key={design.id} value={design.id}>{design.name}</option>)}
          </Select>
          <Button onClick={state.addOrder}>Add Job</Button>
        </div>
      </Card>

      <Card title="Production Board" right={<Button variant="ghost" onClick={state.exportOrdersCsv}>Export CSV</Button>}>
        <div className="grid gap-4 xl:grid-cols-4">
          {columns.map((column) => {
            const jobs = state.orders.filter((job) => column.statuses.includes(job.status));
            return (
              <section key={column.label} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-100">{column.label}</div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{jobs.length}</span>
                </div>
                <div className="space-y-4">
                  {jobs.map((job) => {
                    const design = state.products.find((item) => item.id === job.productId);
                    const breakdown = state.getCostBreakdownForOrder(job);
                    return (
                      <article key={job.id} className="rounded-2xl border border-white/10 bg-[#111722] p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-semibold text-slate-100">{job.customer || `Production ${job.id}`}</div>
                            <div className="mt-1 text-xs text-slate-500">{design?.name || job.productId} · Qty {job.quantity}</div>
                          </div>
                          <span className="rounded-full border border-amber-500/20 bg-amber-500/5 px-2.5 py-1 text-[11px] text-amber-300">{job.priority}</span>
                        </div>

                        <div className="mt-4 grid gap-2">
                          <Field label="Job name"><Input value={job.customer} onChange={(event) => state.updateOrder(job.id, { customer: event.target.value })} /></Field>
                          <Field label="Design"><Select value={job.productId} onChange={(event) => state.updateOrder(job.id, { productId: event.target.value })}>{state.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
                          <Field label="Material spool"><Select value={job.filamentId || ""} onChange={(event) => state.updateOrder(job.id, { filamentId: event.target.value || undefined })}><option value="">No spool selected</option>{state.filament.map((item) => <option key={item.id} value={item.id}>{item.foundrySpoolCode} · {item.colorName} · {item.material}</option>)}</Select></Field>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Field label="Stage"><Select value={job.status} onChange={(event) => state.updateOrder(job.id, { status: event.target.value as typeof job.status })}><option value="Queued">Queued</option><option value="Printing">Printing</option><option value="Finishing">Finishing</option><option value="Packed">Complete</option>{job.status === "Shipped" ? <option value="Shipped">Complete (legacy)</option> : null}</Select></Field>
                            <Field label="Priority"><Select value={job.priority} onChange={(event) => state.updateOrder(job.id, { priority: event.target.value as typeof job.priority })}><option>Low</option><option>Normal</option><option>High</option><option>Rush</option></Select></Field>
                          </div>
                          <Field label="Printer"><Select value={job.printerId || ""} onChange={(event) => state.updateOrder(job.id, { printerId: event.target.value || undefined })}><option value="">Unassigned</option>{state.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}</Select></Field>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Field label="Quantity"><Input type="number" min={1} value={job.quantity} onChange={(event) => state.updateOrder(job.id, { quantity: Number(event.target.value) })} /></Field>
                            <Field label="Target date"><Input type="date" value={job.dueDate} onChange={(event) => state.updateOrder(job.id, { dueDate: event.target.value })} /></Field>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Field label="Print hours / unit"><Input type="number" min={0} step="0.1" value={job.estimatedPrintHours} onChange={(event) => state.updateOrder(job.id, { estimatedPrintHours: Number(event.target.value) })} /></Field>
                            <Field label="Labor hours"><Input type="number" min={0} step="0.1" value={job.laborHours} onChange={(event) => state.updateOrder(job.id, { laborHours: Number(event.target.value) })} /></Field>
                          </div>
                          <Field label="Production notes"><Textarea value={job.notes} onChange={(event) => state.updateOrder(job.id, { notes: event.target.value })} className="min-h-[70px]" /></Field>
                        </div>

                        <div className="mt-4 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-xs">
                          <CostLine label="Material" value={money(breakdown.material)} />
                          <CostLine label="Electricity" value={money(breakdown.electricity)} />
                          <CostLine label="Labor" value={money(breakdown.labor)} />
                          <CostLine label="Total estimated cost" value={money(breakdown.total)} />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <Button variant="ghost" onClick={() => state.consumeFilamentForOrder(job.id)}>{job.materialConsumed ? "Material Recorded" : "Record Material Use"}</Button>
                          {job.status === "Queued" ? <Button variant="ghost" onClick={() => state.updateOrder(job.id, { status: "Printing" })}>Start Printing</Button> : null}
                          {job.status === "Printing" ? <Button variant="ghost" onClick={() => state.updateOrder(job.id, { status: "Finishing" })}>Move to Finishing</Button> : null}
                          {job.status === "Finishing" ? <Button variant="ghost" onClick={() => state.updateOrder(job.id, { status: "Packed" })}>Mark Complete</Button> : null}
                          <Button variant="danger" onClick={() => state.removeOrder(job.id)}>Remove</Button>
                        </div>
                      </article>
                    );
                  })}
                  {jobs.length === 0 ? <div className="rounded-xl border border-dashed border-white/10 p-5 text-center text-xs text-slate-500">No jobs in this stage.</div> : null}
                </div>
              </section>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><div className="mb-1.5 text-[11px] uppercase tracking-wide text-slate-500">{label}</div>{children}</label>;
}

function CostLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 py-1"><span className="text-slate-500">{label}</span><span className="font-medium text-slate-100">{value}</span></div>;
}
