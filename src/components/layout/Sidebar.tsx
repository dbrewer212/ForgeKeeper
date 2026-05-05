import { money } from "../../lib/format";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { FenrirLogo } from "../branding/FenrirLogo";
import { NavButton } from "./NavButton";

const views = ["dashboard", "catalog", "collections", "releases", "orders", "filament", "printers", "reports", "settings"] as const;

export function Sidebar({ state }: { state: ForgekeeperState }) {
  return (
    <aside className="border-b border-amber-500/10 bg-[linear-gradient(180deg,#080c13,#0a1018)] px-5 py-6 xl:border-b-0 xl:border-r">
      <div className="rounded-3xl border border-amber-500/15 bg-[linear-gradient(180deg,rgba(17,23,34,0.98),rgba(10,14,22,0.96))] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
        <div className="aspect-square w-full overflow-hidden rounded-2xl border border-amber-500/20 bg-black/40">
          <FenrirLogo />
        </div>
      </div>
      <div className="mt-6 space-y-2">
        {views.map((view) => <NavButton key={view} active={state.view === view} label={view.charAt(0).toUpperCase() + view.slice(1)} onClick={() => state.setView(view)} />)}
      </div>
      <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-4">
        <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Workshop Summary</div>
        <div className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between"><span className="text-slate-400">Products</span><span className="font-semibold text-slate-100">{state.metrics.products}</span></div>
          <div className="flex items-center justify-between"><span className="text-slate-400">Orders</span><span className="font-semibold text-slate-100">{state.metrics.orders}</span></div>
          <div className="flex items-center justify-between"><span className="text-slate-400">Printers</span><span className="font-semibold text-slate-100">{state.metrics.printers}</span></div>
          <div className="flex items-center justify-between"><span className="text-slate-400">Revenue</span><span className="font-semibold text-amber-300">{money(state.metrics.revenue)}</span></div>
        </div>
      </div>
    </aside>
  );
}
