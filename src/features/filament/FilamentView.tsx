import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import { filamentCostPerGram } from "../../lib/cost";
import { money } from "../../lib/format";
import { inventoryState, pillClass } from "../../lib/inventory";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { FilamentMaterial } from "../../types/domain";

const materialOptions: FilamentMaterial[] = ["PLA", "PLA+", "PETG", "ABS", "TPU"];

export function FilamentView({ state }: { state: ForgekeeperState }) {
  return (
    <div className="space-y-6">
      <Card title="Add Filament" right={<span className="text-xs text-slate-500">Inventory + Cost Source</span>}>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr),auto]">
          <Input
            autoFocus={state.quickAction === "newFilament"}
            value={state.newFilamentName}
            onChange={(e) => state.setNewFilamentName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") state.addFilament(); }}
            placeholder="Color / spool name, example: Obsidian Black"
          />
          <Button onClick={state.addFilament}>Add Filament</Button>
        </div>
      </Card>

      <Card title="Filament Inventory" right={<Button variant="ghost" onClick={state.exportFilamentCsv}>Export CSV</Button>}>
        <div className="space-y-3">
          {state.filament.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-[#0d131c] p-6 text-sm text-slate-500">No filament added yet.</div>
          ) : state.filament.map((item) => {
            const stock = inventoryState(item.gramsAvailable, item.reorderPointGrams);
            const costPerGram = filamentCostPerGram(item);
            return (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-100">{item.colorName}</div>
                    <div className="mt-1 text-sm text-slate-400">{item.brand} · {item.material} · {item.colorFamily}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">{money(costPerGram)}/g</span>
                    <span className={`rounded-full border px-3 py-1 text-xs ${pillClass(stock)}`}>{stock} · {item.gramsAvailable}g</span>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                  <Input value={item.brand} onChange={(e) => state.updateFilament(item.id, { brand: e.target.value })} placeholder="Brand" />
                  <Input value={item.colorName} onChange={(e) => state.updateFilament(item.id, { colorName: e.target.value })} placeholder="Color name" />
                  <Input value={item.colorFamily} onChange={(e) => state.updateFilament(item.id, { colorFamily: e.target.value })} placeholder="Color family" />
                  <Select value={item.material} onChange={(e) => state.updateFilament(item.id, { material: e.target.value as FilamentMaterial })}>
                    {materialOptions.map((material) => <option key={material} value={material}>{material}</option>)}
                  </Select>
                  <Input type="number" value={item.spoolPrice} onChange={(e) => state.updateFilament(item.id, { spoolPrice: Number(e.target.value) })} placeholder="Spool price" />
                  <Input type="number" value={item.spoolWeightGrams} onChange={(e) => state.updateFilament(item.id, { spoolWeightGrams: Number(e.target.value) })} placeholder="Spool weight grams" />
                  <Input
                    key={`${item.id}-${item.gramsAvailable}`}
                    type="number"
                    defaultValue={item.gramsAvailable}
                    onBlur={(e) => {
                      const next = Math.max(0, Number(e.target.value));
                      state.adjustFilament(item.id, next - item.gramsAvailable, "Correction", "Manual stock correction");
                    }}
                    placeholder="Grams available"
                  />
                  <Input type="number" value={item.reorderPointGrams} onChange={(e) => state.updateFilament(item.id, { reorderPointGrams: Number(e.target.value) })} placeholder="Reorder point" />
                  <Textarea value={item.notes} onChange={(e) => state.updateFilament(item.id, { notes: e.target.value })} placeholder="Filament notes" className="min-h-[70px] md:col-span-2 xl:col-span-4" />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => state.adjustFilament(item.id, 100)}>+100g</Button>
                  <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => state.adjustFilament(item.id, -100)}>-100g</Button>
                  <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => state.adjustFilament(item.id, item.spoolWeightGrams - item.gramsAvailable, "Correction", "Reset to full spool weight")}>Reset Full Spool</Button>
                  <Button variant="danger" className="h-8 px-3 text-xs" onClick={() => state.removeFilament(item.id)}>Remove</Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="Material Movement Ledger" right={<Button variant="ghost" onClick={state.exportMaterialMovementsCsv}>Export CSV</Button>}>
        <div className="space-y-3">
          {state.materialMovements.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-[#0d131c] p-6 text-sm text-slate-500">
              No inventory movements recorded yet.
            </div>
          ) : state.materialMovements.slice(0, 100).map((movement) => {
            const item = state.filament.find((record) => record.id === movement.filamentId);
            const job = state.productionJobs.find((record) => record.id === movement.productionJobId);
            return (
              <div key={movement.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm">
                <div>
                  <div className="font-medium text-slate-100">{item?.colorName ?? "Removed material"} · {movement.type}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {new Date(movement.occurredAt).toLocaleString()}
                    {job ? ` · ${job.name}` : ""}
                    {movement.notes ? ` · ${movement.notes}` : ""}
                  </div>
                </div>
                <div className={movement.grams >= 0 ? "font-semibold text-emerald-300" : "font-semibold text-amber-300"}>
                  {movement.grams >= 0 ? "+" : ""}{movement.grams.toFixed(0)}g
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
