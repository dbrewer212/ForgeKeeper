import { memo } from "react";
import { foundryStations } from "../../core/stations";

type SidebarProps = {
  view: string;
  setView: (view: any) => void;
  onBastion: () => void;
};

export const Sidebar = memo(function Sidebar({ view, setView, onBastion }: SidebarProps) {
  const navItem = (key: string, label: string, description?: string) => {
    const active = view === key || (key === "designs" && view === "catalog") || (key === "production" && view === "orders");
    return (
      <button
        onClick={() => setView(key)}
        title={description}
        className={`mb-2 min-h-[44px] w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
          active
            ? "border-amber-600/55 bg-[linear-gradient(90deg,rgba(169,117,36,0.28),rgba(66,46,18,0.42))] font-semibold text-amber-100 shadow-[inset_3px_0_0_#c79438,0_5px_18px_rgba(0,0,0,0.24)]"
            : "border-transparent bg-slate-900/48 text-slate-300 hover:border-slate-700/70 hover:bg-slate-800/65 hover:text-slate-100"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <aside className="relative w-64 shrink-0 overflow-hidden border-r border-amber-900/35 bg-[linear-gradient(180deg,rgba(13,11,9,0.995),rgba(8,7,6,0.995))] p-4 shadow-[14px_0_40px_rgba(0,0,0,0.3)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,rgba(169,117,36,0.12),transparent_72%)]" />

      <div className="relative mb-6 border-b border-amber-900/35 pb-4">
        <div className="text-[10px] uppercase tracking-[0.28em] text-amber-500">Fenrir Forgeworks</div>
        <div className="mt-1 text-xl font-bold tracking-[0.035em] text-amber-300">Forgekeeper</div>
        <div className="mt-1 text-xs text-slate-500">Foundry command station</div>
      </div>

      <button
        type="button"
        onClick={onBastion}
        className="relative mb-4 min-h-[48px] w-full rounded-xl border border-amber-700/50 bg-[linear-gradient(180deg,rgba(96,65,20,0.48),rgba(44,32,17,0.64))] px-3 py-2 text-left font-semibold text-amber-100 shadow-forge-inset transition hover:border-amber-500/60 hover:brightness-110"
      >
        <span className="block text-[10px] uppercase tracking-[0.18em] text-amber-500">Machine console</span>
        <span className="mt-0.5 block">Bastion</span>
      </button>

      <nav className="relative" aria-label="Foundry stations">
        {foundryStations.map((station) => (
          <div key={station.id}>
            {navItem(station.view, station.label, station.description)}
          </div>
        ))}
      </nav>

      <div className="relative my-4 border-t border-slate-800/80" />
      <div className="relative">{navItem("commissioning", "Commissioning", "Temporary subsystem commissioning and verification console.")}</div>
    </aside>
  );
});
