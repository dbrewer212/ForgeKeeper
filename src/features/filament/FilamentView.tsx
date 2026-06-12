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


const filamentBrandOptions = ["Anycubic", "Elegoo", "Flashforge", "Amolen", "Polymaker", "Overture", "Sunlu", "Inland", "Custom"];
const filamentMaterialOptions = ["PLA", "PLA+", "PETG", "ABS", "ASA", "TPU", "Resin", "Custom"];
const filamentFinishOptions = ["Standard", "Matte", "Silk", "Metallic", "Marble", "Glow", "Transparent", "Wood", "Carbon Fiber", "Custom"];
const filamentSpoolSizeOptions = ["250g", "500g", "750g", "1kg", "2kg", "Custom"];
const filamentStatusOptions = ["Active", "Hidden", "Flagged", "Retired"];


const materialOptions: FilamentMaterial[] = ["PLA", "PLA+", "PETG", "ABS", "TPU"];

export function FilamentView({ state }: { state: ForgekeeperState }) {
  return (
    <div className="space-y-6">

      <section className="rounded-3xl border border-white/10 bg-[#111821] p-5 shadow-2xl shadow-black/20">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-slate-100">Filament Library Rules</h2>
          <p className="mt-1 text-sm text-slate-500">
            Use structured entries wherever possible. Custom entries can be promoted into the library later, while hidden or retired values preserve history without cluttering future dropdowns.
          </p>
        </div>
        <div className="grid gap-3 text-xs text-slate-400 md:grid-cols-4">
          <div className="rounded-2xl border border-emerald-300/15 bg-emerald-400/5 p-3"><span className="font-semibold text-emerald-200">Active</span><br />Shown in normal dropdowns.</div>
          <div className="rounded-2xl border border-slate-300/15 bg-slate-400/5 p-3"><span className="font-semibold text-slate-200">Hidden</span><br />Kept in admin, hidden from normal entry.</div>
          <div className="rounded-2xl border border-amber-300/15 bg-amber-400/5 p-3"><span className="font-semibold text-amber-200">Flagged</span><br />Visible with a quality warning.</div>
          <div className="rounded-2xl border border-rose-300/15 bg-rose-400/5 p-3"><span className="font-semibold text-rose-200">Retired</span><br />Preserved for old records, hidden from future use.</div>
        </div>
      </section>


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
                  <Input type="number" value={item.gramsAvailable} onChange={(e) => state.updateFilament(item.id, { gramsAvailable: Number(e.target.value) })} placeholder="Grams available" />
                  <Input type="number" value={item.reorderPointGrams} onChange={(e) => state.updateFilament(item.id, { reorderPointGrams: Number(e.target.value) })} placeholder="Reorder point" />
                  <Textarea value={item.notes} onChange={(e) => state.updateFilament(item.id, { notes: e.target.value })} placeholder="Filament notes" className="min-h-[70px] md:col-span-2 xl:col-span-4" />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => state.adjustFilament(item.id, 100)}>+100g</Button>
                  <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => state.adjustFilament(item.id, -100)}>-100g</Button>
                  <Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => state.updateFilament(item.id, { gramsAvailable: item.spoolWeightGrams })}>Reset Full Spool</Button>
                  <Button variant="danger" className="h-8 px-3 text-xs" onClick={() => state.removeFilament(item.id)}>Remove</Button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
