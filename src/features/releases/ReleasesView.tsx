import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { pillClass } from "../../lib/inventory";
import type { ForgekeeperState } from "../../state/useForgekeeperState";

export function ReleasesView({ state }: { state: ForgekeeperState }) {
  return (
    <Card title="Releases" right={<div className="flex gap-2"><Input value={state.newReleaseName} onChange={(e) => state.setNewReleaseName(e.target.value)} placeholder="Release name" className="w-44" /><Button onClick={state.addRelease}>Add</Button></div>}>
      <div className="grid gap-4 xl:grid-cols-2">
        {state.releases.map((release) => (
          <div key={release.id} className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
            <div className="flex items-center justify-between gap-3"><div className="font-semibold">{release.name}</div><span className={`rounded-full border px-3 py-1 text-xs ${pillClass(release.status)}`}>{release.status}</span></div>
            <div className="mt-3 flex flex-wrap gap-2">{release.productIds.map((productId) => { const product = state.products.find((p) => p.id === productId); return <div key={productId} className="rounded-xl border border-white/10 bg-[#111722] px-3 py-3"><div className="font-medium">{product?.name || productId}</div><div className="mt-2"><Button variant="danger" className="h-8 px-3 text-xs" onClick={() => state.removeProductFromRelease(release.id, productId)}>Remove</Button></div></div>; })}</div>
            <div className="mt-3"><Select defaultValue="" onChange={(e) => e.target.value && state.addProductToRelease(release.id, e.target.value)}><option value="">Add product</option>{state.products.filter((p) => !release.productIds.includes(p.id)).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</Select></div>
          </div>
        ))}
      </div>
    </Card>
  );
}
