import { Card } from "../../components/ui/Card";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { DesignPlanningRecord, PlannedFilament, PlannedPrototype, PlanningStatus, PrototypePriority, PrototypeStatus } from "../../types/planning";

const prototypeStatuses: PrototypeStatus[] = ["Active Idea", "In Progress", "Refining", "Modeled", "On Hold"];

function statusClass(value: string) {
  if (value === "High" || value === "Need to Order") return "border-amber-500/25 bg-amber-500/15 text-amber-200";
  if (value === "Approved" || value === "Active" || value === "Modeled") return "border-emerald-500/25 bg-emerald-500/15 text-emerald-300";
  return "border-white/10 bg-white/5 text-slate-300";
}

const priorities: PrototypePriority[] = ["High", "Medium", "Low"];

export function PlanningView({ state }: { state: ForgekeeperState }) {
  const prototypes: PlannedPrototype[] = state.prototypes ?? [];
  const plannedFilament: PlannedFilament[] = state.plannedFilament ?? [];
  const designPlanning = state.designPlanning ?? [];
  const realmMaterials = state.realmMaterials ?? [];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card title="Planned Design Projects"><div className="text-3xl font-semibold">{designPlanning.length}</div><div className="mt-1 text-xs text-slate-500">Architecture records</div></Card>
        <Card title="Prototype Backlog"><div className="text-3xl font-semibold">{prototypes.length}</div><div className="mt-1 text-xs text-slate-500">Ideas and active tests</div></Card>
        <Card title="Filament To Order"><div className="text-3xl font-semibold">{plannedFilament.filter((f) => f.status === "Need to Order").length}</div><div className="mt-1 text-xs text-slate-500">Planned material library</div></Card>
        <Card title="Realm Profiles"><div className="text-3xl font-semibold">{realmMaterials.length}</div><div className="mt-1 text-xs text-slate-500">Material / finish guides</div></Card>
      </div>

      <Card title="Add Prototype">
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),auto]">
          <Input
            value={state.newPrototypeName}
            onChange={(event) => state.setNewPrototypeName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") state.addPrototype(); }}
            placeholder="Prototype or experiment name"
          />
          <Button onClick={state.addPrototype}>Add Prototype</Button>
        </div>
      </Card>

      <Card title="Prototype Board" right={<span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">Planning, not production</span>}>
        <div className="grid gap-4 xl:grid-cols-5">
          {prototypeStatuses.map((status) => {
            const items = prototypes.filter((prototype) => prototype.status === status);
            return (
              <div key={status} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-100">{status}</div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">{items.length}</span>
                </div>
                <div className="space-y-3">
                  {items.map((prototype) => (
                    <div key={prototype.id} className="rounded-xl border border-white/10 bg-[#111722] p-3">
                      <div className="font-medium text-slate-100">{prototype.designName}</div>
                      <div className="mt-1 text-xs text-slate-500">{prototype.family} · {prototype.collection}</div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <span className={`rounded-full border px-2 py-0.5 text-xs ${statusClass(prototype.priority)}`}>{prototype.priority}</span>
                        {prototype.realm ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">{prototype.realm}</span> : null}
                      </div>
                      <div className="mt-3 text-xs text-slate-400">Next: {prototype.nextStep}</div>
                      <div className="mt-3">
                        <Select value={prototype.status} onChange={(e) => state.updatePrototype(prototype.id, { status: e.target.value as PrototypeStatus })}>
                          {prototypeStatuses.map((option) => <option key={option} value={option}>{option}</option>)}
                        </Select>
                      </div>
                      <div className="mt-2 grid gap-2">
                        <Input value={prototype.family} onChange={(event) => state.updatePrototype(prototype.id, { family: event.target.value })} placeholder="Design family" />
                        <Input value={prototype.collection} onChange={(event) => state.updatePrototype(prototype.id, { collection: event.target.value })} placeholder="Collection" />
                        <Select value={prototype.priority} onChange={(event) => state.updatePrototype(prototype.id, { priority: event.target.value as PrototypePriority })}>
                          {priorities.map((priority) => <option key={priority} value={priority}>{priority} priority</option>)}
                        </Select>
                        <Input value={prototype.nextStep} onChange={(event) => state.updatePrototype(prototype.id, { nextStep: event.target.value })} placeholder="Next concrete step" />
                        <Textarea value={prototype.notes} onChange={(event) => state.updatePrototype(prototype.id, { notes: event.target.value })} placeholder="Prototype notes" className="min-h-[60px]" />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => state.promotePrototypeToDesign(prototype.id)}>Promote to Design Library</Button>
                        <Button variant="danger" className="h-8 px-3 text-xs" onClick={() => state.removePrototype(prototype.id)}>Remove</Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1fr,1fr]">
        <Card title="Filament Planner / Shopping List" right={<span className="text-xs text-slate-500">Planned ≠ Owned</span>}>
          <div className="mb-4 grid gap-2 md:grid-cols-[minmax(0,1fr),auto]">
            <Input value={state.newPlannedFilamentName} onChange={(event) => state.setNewPlannedFilamentName(event.target.value)} placeholder="Material to research or order" />
            <Button onClick={state.addPlannedFilament}>Add Material</Button>
          </div>
          <div className="space-y-3">
            {plannedFilament.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-100">{item.brand} {item.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.materialFamily} · {item.batchGroup}</div>
                  </div>
                  <span className={`rounded-full border px-3 py-1 text-xs ${statusClass(item.status)}`}>{item.status}</span>
                </div>
                <div className="mt-3 text-sm text-slate-400">{item.finishDirection}</div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <Input value={item.brand} onChange={(event) => state.updatePlannedFilament(item.id, { brand: event.target.value })} placeholder="Brand" />
                  <Input value={item.batchGroup} onChange={(event) => state.updatePlannedFilament(item.id, { batchGroup: event.target.value })} placeholder="Batch group" />
                  <Textarea value={item.finishDirection} onChange={(event) => state.updatePlannedFilament(item.id, { finishDirection: event.target.value })} placeholder="Finish direction" className="min-h-[60px] md:col-span-2" />
                  <Textarea value={item.notes} onChange={(event) => state.updatePlannedFilament(item.id, { notes: event.target.value })} placeholder="Material notes" className="min-h-[60px] md:col-span-2" />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.realms.map((realm) => <span key={realm} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-xs text-slate-300">{realm}</span>)}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Select value={item.status} onChange={(e) => state.updatePlannedFilament(item.id, { status: e.target.value as PlanningStatus })} className="w-40">
                    <option value="Need to Order">Need to Order</option>
                    <option value="Ordered">Ordered</option>
                    <option value="In Testing">In Testing</option>
                    <option value="Approved">Approved</option>
                    <option value="Active">Active</option>
                    <option value="Archived">Archived</option>
                  </Select>
                  <Button variant="ghost" onClick={() => state.movePlannedFilamentToInventory?.(item.id)}>Move to Inventory</Button>
                  <Button variant="danger" onClick={() => state.removePlannedFilament(item.id)}>Remove</Button>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Realm Material Reference">
          <div className="space-y-3">
            {realmMaterials.map((realm) => (
              <div key={realm.realm} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold text-slate-100">{realm.realm}</div>
                  <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400">{realm.batchGroup}</span>
                </div>
                <div className="mt-2 text-xs text-slate-500">Base candidates: {realm.baseCandidates.join(" · ")}</div>
                <div className="mt-3 text-sm text-slate-400">{realm.finishDirection}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card title="Design Planning Board">
        <div className="mb-4 grid gap-2 md:grid-cols-[minmax(0,1fr),auto]">
          <Input value={state.newDesignPlanningName} onChange={(event) => state.setNewDesignPlanningName(event.target.value)} placeholder="Base design or system name" />
          <Button onClick={state.addDesignPlanning}>Add Architecture Record</Button>
        </div>
        <div className="grid gap-3 xl:grid-cols-2">
          {designPlanning.map((item: DesignPlanningRecord) => (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-semibold text-slate-100">{item.baseDesign}</div>
                  <div className="mt-1 text-xs text-slate-500">{item.designFamily} · {item.collection} · {item.tier}</div>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs ${statusClass(item.prototypePriority)}`}>{item.prototypePriority}</span>
              </div>
              <div className="mt-3 text-sm text-slate-400">{item.coreFunction}</div>
              <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                <div>Core Parts: {item.coreParts}</div>
                <div>Variant Parts: {item.variantParts}</div>
                <div>Attachments: {item.attachmentTypes}</div>
                <div>Printer Fit: {item.bestPrinterFit}</div>
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-2">
                <Input value={item.baseDesign} onChange={(event) => state.updateDesignPlanning(item.id, { baseDesign: event.target.value })} placeholder="Base design" />
                <Input value={item.designFamily} onChange={(event) => state.updateDesignPlanning(item.id, { designFamily: event.target.value })} placeholder="Design family" />
                <Input value={item.collection} onChange={(event) => state.updateDesignPlanning(item.id, { collection: event.target.value })} placeholder="Collection" />
                <Select value={item.prototypePriority} onChange={(event) => state.updateDesignPlanning(item.id, { prototypePriority: event.target.value as PrototypePriority })}>
                  {priorities.map((priority) => <option key={priority} value={priority}>{priority} priority</option>)}
                </Select>
                <Textarea value={item.coreFunction} onChange={(event) => state.updateDesignPlanning(item.id, { coreFunction: event.target.value })} placeholder="Core function" className="min-h-[60px] md:col-span-2" />
                <Textarea value={item.coreParts} onChange={(event) => state.updateDesignPlanning(item.id, { coreParts: event.target.value })} placeholder="Core parts" className="min-h-[60px]" />
                <Textarea value={item.variantParts} onChange={(event) => state.updateDesignPlanning(item.id, { variantParts: event.target.value })} placeholder="Variant parts" className="min-h-[60px]" />
                <Textarea value={item.notes} onChange={(event) => state.updateDesignPlanning(item.id, { notes: event.target.value })} placeholder="Architecture notes" className="min-h-[60px] md:col-span-2" />
              </div>
              <Button variant="danger" className="mt-3" onClick={() => state.removeDesignPlanning(item.id)}>Remove Record</Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
