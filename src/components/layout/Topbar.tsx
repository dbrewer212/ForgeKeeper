import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";

export function Topbar({ state }: { state: ForgekeeperState }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-white/10 bg-[linear-gradient(180deg,rgba(17,23,34,0.98),rgba(10,14,22,0.96))] px-6 py-5 shadow-[0_10px_35px_rgba(0,0,0,0.25)] sticky top-4 z-20 backdrop-blur">
      <div>
        <div className="text-[11px] uppercase tracking-[0.28em] text-amber-400">Forgekeeper</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-100">{state.view.charAt(0).toUpperCase() + state.view.slice(1)}</h1>
        <p className="mt-1 text-sm text-slate-400">Workshop command layer for products, production, filament, printers, and planning.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input value={state.searchTerm} onChange={(e) => state.setSearchTerm(e.target.value)} placeholder="Search products..." className="w-56" />
        <Button variant="ghost" onClick={state.exportOrdersCsv}>Export Orders</Button>
        <Button variant="ghost" onClick={() => state.triggerQuickAction("newOrder")}>New Order</Button>
        <Button onClick={() => state.setView("catalog")}>Open Catalog</Button>
      </div>
    </div>
  );
}
