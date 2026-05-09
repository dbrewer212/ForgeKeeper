import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import type { ForgekeeperState } from "../../state/useForgekeeperState";

export function CollectionsView({ state }: { state: ForgekeeperState }) {
  return (
    <Card title="Collections" right={<div className="flex gap-2"><Input value={state.newCollectionName} onChange={(e) => state.setNewCollectionName(e.target.value)} placeholder="Collection name" className="w-44" /><Button onClick={state.addCollection}>Add</Button></div>}>
      <div className="grid gap-4 xl:grid-cols-2">
        {state.collections.map((collection) => (
          <div key={collection.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
            <div className="font-semibold">{collection.name}</div>
            <div className="mt-1 text-sm text-slate-400">Hero: {state.products.find((p) => p.id === collection.heroProductId)?.name || "None"}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {state.products.filter((p) => p.collection === collection.name).map((product) => (
                <div key={product.id} className="rounded-xl border border-white/10 bg-[#111722] px-3 py-3">
                  <div className="font-medium">{product.name}</div>
                  <div className="mt-2 flex gap-2"><Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => state.setCollectionHero(collection.id, product.id)}>Hero</Button><Button variant="danger" className="h-8 px-3 text-xs" onClick={() => state.assignProductToCollection(product.id, "Unassigned")}>Remove</Button></div>
                </div>
              ))}
            </div>
            <div className="mt-3"><Select defaultValue="" onChange={(e) => e.target.value && state.assignProductToCollection(e.target.value, collection.name)}><option value="">Add product</option>{state.products.filter((p) => p.collection !== collection.name).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</Select></div>
          </div>
        ))}
      </div>
    </Card>
  );
}
