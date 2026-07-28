import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { money } from "../../lib/format";
import { pillClass } from "../../lib/inventory";
import type { ForgekeeperState, QueueStatus } from "../../state/useForgekeeperState";
import type { ProductionBatchStatus, ProductionJob, ProductionPriority, ProductionStatus } from "../../types/domain";

const statuses: ProductionStatus[] = ["Queued", "Printing", "Finishing", "Complete", "Cancelled"];
const priorities: ProductionPriority[] = ["Low", "Normal", "High", "Rush"];
const batchStatuses: ProductionBatchStatus[] = ["Planned", "Ready", "Running", "Complete", "Cancelled"];
type ProductionJobOutcome = NonNullable<ProductionJob["outcome"]>;

export function ProductionView({ state }: { state: ForgekeeperState }) {
  return (
    <div className="space-y-6">
      <Card title="Add Production Job" right={<span className="text-xs text-slate-500">Internal workshop work only</span>}>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),220px,auto]">
          <Input
            autoFocus={state.quickAction === "newJob"}
            value={state.newJobName}
            onChange={(event) => state.setNewJobName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") state.addProductionJob(); }}
            placeholder="Job name"
          />
          <Select value={state.selectedDesignProjectId} onChange={(event) => state.setSelectedDesignProjectId(event.target.value)}>
            <option value="">Select a design</option>
            {state.designProjects.map((design) => <option key={design.id} value={design.id}>{design.name}</option>)}
          </Select>
          <Button onClick={state.addProductionJob}>Add Job</Button>
        </div>
      </Card>

      <Card title="Production Batches" right={<Button variant="ghost" onClick={state.exportProductionBatchesCsv}>Export CSV</Button>}>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),auto]">
          <Input
            value={state.newBatchName}
            onChange={(event) => state.setNewBatchName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") state.addProductionBatch(); }}
            placeholder="Batch name, example: Foundry Whelps - Week 31"
          />
          <Button onClick={state.addProductionBatch}>Create Batch</Button>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          {state.productionBatches.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-[#0d131c] p-6 text-sm text-slate-500">
              No batches yet. Jobs can remain independent or be grouped when production is ready.
            </div>
          ) : state.productionBatches.map((batch) => {
            const jobs = state.productionJobs.filter((job) => job.batchId === batch.id);
            return (
              <div key={batch.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-100">{batch.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{jobs.length} job{jobs.length === 1 ? "" : "s"}</div>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(batch.status)}`}>{batch.status}</span>
                </div>
                <div className="mt-4 grid gap-2">
                  <Input value={batch.name} onChange={(event) => state.updateProductionBatch(batch.id, { name: event.target.value })} />
                  <Select value={batch.status} onChange={(event) => state.updateProductionBatch(batch.id, { status: event.target.value as ProductionBatchStatus })}>
                    {batchStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                  </Select>
                  <Select value={batch.printerId || ""} onChange={(event) => state.updateProductionBatch(batch.id, { printerId: event.target.value || undefined })}>
                    <option value="">No preferred printer</option>
                    {state.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}
                  </Select>
                  <Input type="datetime-local" value={batch.scheduledStart} onChange={(event) => state.updateProductionBatch(batch.id, { scheduledStart: event.target.value })} />
                  <Textarea value={batch.notes} onChange={(event) => state.updateProductionBatch(batch.id, { notes: event.target.value })} placeholder="Batch notes" className="min-h-[64px]" />
                </div>
                <Button variant="danger" className="mt-3 h-8 px-3 text-xs" onClick={() => state.removeProductionBatch(batch.id)}>Remove Batch</Button>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Production Board" right={<Button variant="ghost" onClick={state.exportProductionJobsCsv}>Export CSV</Button>}>
        <div className="grid gap-4 xl:grid-cols-5">
          {(Object.keys(state.queueCounts) as QueueStatus[]).map((status) => (
            <div key={status} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="font-semibold text-slate-100">{status}</div>
                <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(status)}`}>{state.queueCounts[status]}</span>
              </div>

              <div className="space-y-3">
                {state.productionJobs.filter((job) => job.status === status).map((job) => {
                  const design = state.designProjects.find((item) => item.id === job.designProjectId);
                  const cost = state.getCostBreakdownForJob(job);
                  return (
                    <div key={job.id} className="rounded-xl border border-white/10 bg-[#111722] p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-medium text-slate-100">{job.name}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            {design?.name || job.designProjectId} · Estimated cost {money(cost.total)}
                          </div>
                        </div>
                        <span className={`rounded-full border px-2 py-1 text-[11px] ${pillClass(job.priority)}`}>{job.priority}</span>
                      </div>

                      <div className="mt-3 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-xs text-slate-300">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <CostLine label="Material" value={money(cost.material)} />
                          <CostLine label="Electricity" value={money(cost.electricity)} />
                          <CostLine label="Labor" value={money(cost.labor)} />
                          <CostLine label="Total" value={money(cost.total)} />
                          <CostLine label="Filament" value={job.materialConsumed ? "Consumed" : `${cost.gramsUsed.toFixed(0)}g pending`} />
                        </div>
                        <div className="mt-3">
                          <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => state.consumeFilamentForJob(job.id)}>
                            {job.materialConsumed ? "Material Consumed" : "Consume Filament"}
                          </Button>
                        </div>
                      </div>

                      <div className="mt-3 grid gap-2">
                        <Input value={job.name} onChange={(event) => state.updateProductionJob(job.id, { name: event.target.value })} placeholder="Job name" />
                        <Select value={job.designProjectId} onChange={(event) => state.updateProductionJob(job.id, { designProjectId: event.target.value })}>
                          {state.designProjects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </Select>
                        <Select value={job.filamentId || ""} onChange={(event) => state.updateProductionJob(job.id, { filamentId: event.target.value || undefined })}>
                          <option value="">No filament selected</option>
                          {state.filament.map((item) => <option key={item.id} value={item.id}>{item.colorName} ({item.material})</option>)}
                        </Select>
                        <Select value={job.status} onChange={(event) => state.updateProductionJob(job.id, { status: event.target.value as ProductionStatus })}>
                          {statuses.map((item) => <option key={item} value={item}>{item}</option>)}
                        </Select>
                        <Select value={job.priority} onChange={(event) => state.updateProductionJob(job.id, { priority: event.target.value as ProductionPriority })}>
                          {priorities.map((item) => <option key={item} value={item}>{item}</option>)}
                        </Select>
                        <Select value={job.printerId || ""} onChange={(event) => state.updateProductionJob(job.id, { printerId: event.target.value || undefined })}>
                          <option value="">Unassigned printer</option>
                          {state.printers.map((printer) => <option key={printer.id} value={printer.id}>{printer.name}</option>)}
                        </Select>
                        <Select value={job.batchId || ""} onChange={(event) => state.updateProductionJob(job.id, { batchId: event.target.value || undefined })}>
                          <option value="">No production batch</option>
                          {state.productionBatches.map((batch) => <option key={batch.id} value={batch.id}>{batch.name}</option>)}
                        </Select>
                        <Input type="number" min={1} value={job.quantity} onChange={(event) => state.updateProductionJob(job.id, { quantity: Number(event.target.value) })} placeholder="Quantity" />
                        <Input type="number" min={0} value={job.materialGrams ?? design?.estimatedFilamentGrams ?? 0} onChange={(event) => state.updateProductionJob(job.id, { materialGrams: Number(event.target.value) })} placeholder="Filament grams per unit" />
                        <Input type="date" value={job.targetDate} onChange={(event) => state.updateProductionJob(job.id, { targetDate: event.target.value })} />
                        <Input type="number" min={0} step="0.1" value={job.estimatedPrintHours} onChange={(event) => state.updateProductionJob(job.id, { estimatedPrintHours: Number(event.target.value) })} placeholder="Print hours per unit" />
                        <Input type="number" min={0} step="0.1" value={job.laborHours} onChange={(event) => state.updateProductionJob(job.id, { laborHours: Number(event.target.value) })} placeholder="Labor hours" />
                        {["Finishing", "Complete"].includes(job.status) ? (
                          <>
                            <Input type="number" min={0} step="0.1" value={job.actualPrintHours ?? ""} onChange={(event) => state.updateProductionJob(job.id, { actualPrintHours: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="Actual total print hours" />
                            <Input type="number" min={0} step="1" value={job.actualMaterialGrams ?? ""} onChange={(event) => state.updateProductionJob(job.id, { actualMaterialGrams: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="Actual total material grams" />
                            <Input type="number" min={0} max={job.quantity} step="1" value={job.unitsCompleted ?? ""} onChange={(event) => state.updateProductionJob(job.id, { unitsCompleted: event.target.value === "" ? undefined : Number(event.target.value) })} placeholder="Units completed" />
                            <Select value={job.outcome ?? ""} onChange={(event) => state.updateProductionJob(job.id, { outcome: (event.target.value || undefined) as ProductionJobOutcome })}>
                              <option value="">Outcome not recorded</option>
                              <option value="Success">Success</option>
                              <option value="Partial">Partial</option>
                              <option value="Failed">Failed</option>
                            </Select>
                            {job.outcome === "Failed" || job.outcome === "Partial" ? (
                              <Textarea value={job.failureReason ?? ""} onChange={(event) => state.updateProductionJob(job.id, { failureReason: event.target.value })} placeholder="Failure or variance reason" className="min-h-[60px]" />
                            ) : null}
                          </>
                        ) : null}
                        <Textarea value={job.notes} onChange={(event) => state.updateProductionJob(job.id, { notes: event.target.value })} placeholder="Production notes" className="min-h-[64px]" />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {status !== "Complete" && status !== "Cancelled" ? (
                          <Button
                            variant="ghost"
                            className="h-8 px-3 text-xs"
                            onClick={() => state.updateProductionJob(job.id, { status: statuses[Math.min(3, statuses.indexOf(job.status) + 1)] })}
                          >
                            Move Next
                          </Button>
                        ) : null}
                        <Button variant="danger" className="h-8 px-3 text-xs" onClick={() => state.removeProductionJob(job.id)}>Remove</Button>
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
