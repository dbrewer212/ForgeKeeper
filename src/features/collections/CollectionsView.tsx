import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Textarea } from "../../components/ui/Textarea";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { DesignLine } from "../../types/domain";

const lines: DesignLine[] = ["ForgeTech", "Foundry", "Relics of the Nine Realms", "Runehallow Relics"];

export function CollectionsView({ state }: { state: ForgekeeperState }) {
  return (
    <Card title="Collections" right={<div className="flex gap-2"><Input value={state.newCollectionName} onChange={(e) => state.setNewCollectionName(e.target.value)} placeholder="Collection name" className="w-44" /><Button onClick={state.addCollection}>Add</Button></div>}>
      <div className="grid gap-4 xl:grid-cols-2">
        {state.collections.map((collection) => (
          <div key={collection.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Input value={collection.name} onChange={(event) => state.updateCollection(collection.id, { name: event.target.value })} placeholder="Collection name" />
              <Select value={collection.line} onChange={(event) => state.updateCollection(collection.id, { line: event.target.value as DesignLine })}>
                {lines.map((line) => <option key={line} value={line}>{line}</option>)}
              </Select>
              <Textarea value={collection.description} onChange={(event) => state.updateCollection(collection.id, { description: event.target.value })} placeholder="Collection purpose and notes" className="min-h-[64px] md:col-span-2" />
            </div>
            <div className="mt-1 text-sm text-slate-400">Hero: {state.designProjects.find((p) => p.id === collection.heroDesignProjectId)?.name || "None"}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {state.designProjects.filter((p) => p.collection === collection.name).map((design) => (
                <div key={design.id} className="rounded-xl border border-white/10 bg-[#111722] px-3 py-3">
                  <div className="font-medium">{design.name}</div>
                  <div className="mt-2 flex gap-2"><Button variant="ghost" className="h-8 px-3 text-xs" onClick={() => state.setCollectionHero(collection.id, design.id)}>Hero</Button><Button variant="danger" className="h-8 px-3 text-xs" onClick={() => state.assignDesignToCollection(design.id, "Unassigned")}>Remove</Button></div>
                </div>
              ))}
            </div>
            <div className="mt-3"><Select defaultValue="" onChange={(e) => e.target.value && state.assignDesignToCollection(e.target.value, collection.name)}><option value="">Add design</option>{state.designProjects.filter((p) => p.collection !== collection.name).map((design) => <option key={design.id} value={design.id}>{design.name}</option>)}</Select></div>
            <Button variant="danger" className="mt-3" onClick={() => state.removeCollection(collection.id)}>Remove Collection</Button>
          </div>
        ))}
      </div>
    </Card>
  );
}
