import { useEffect, useMemo, useState } from "react";
import { FoundryStationView } from "../components/layout/FoundryStationView";
import { foundryStations } from "../core/stations";
import { useForgekeeperState } from "../state/useForgekeeperState";
import type { AppData, ViewKey } from "../types/domain";
import { ensureWorkbenchBootstrap } from "../workbench/bootstrap";

const primaryNavigation: Array<{ view: ViewKey; label: string; shortLabel: string }> = [
  { view: "dashboard", label: "Command", shortLabel: "Command" },
  { view: "designs", label: "Design Library", shortLabel: "Designs" },
  { view: "production", label: "Production", shortLabel: "Production" },
  { view: "filament", label: "Materials", shortLabel: "Materials" },
];

const extraStations: Array<{ view: ViewKey; label: string; description: string }> = [
  ...foundryStations
    .filter((station) => !primaryNavigation.some((item) => item.view === station.view))
    .map((station) => ({
      view: station.view as ViewKey,
      label: station.label,
      description: station.description,
    })),
  {
    view: "commissioning",
    label: "Commissioning",
    description: "Subsystem verification, diagnostics, activation, and readiness controls.",
  },
];

export default function MobileFoundryWorkspace() {
  const state = useForgekeeperState();
  const [stationSheetOpen, setStationSheetOpen] = useState(false);

  useEffect(() => {
    if (!state.storageReady || state.storageStatus !== "SQLite") return;
    let cancelled = false;

    void ensureWorkbenchBootstrap(state as unknown as AppData)
      .then((result) => {
        if (!cancelled) console.info("Mobile workbench bootstrap", result);
      })
      .catch((cause) => {
        if (!cancelled) console.error("Mobile workbench bootstrap failed:", cause);
      });

    return () => {
      cancelled = true;
    };
  }, [state.storageReady, state.storageStatus]);

  const activeStation = useMemo(() => {
    const current = state.view as string;
    if (current === "catalog") return { label: "Design Library", description: "Projects, models, references, and production assets." };
    if (current === "orders") return { label: "Production", description: "Jobs, assignments, outcomes, and material use." };
    if (current === "commissioning") return { label: "Commissioning", description: "Subsystem verification and activation." };
    return foundryStations.find((station) => station.view === current) ?? foundryStations[0];
  }, [state.view]);

  const navigate = (view: ViewKey) => {
    state.setView(view);
    setStationSheetOpen(false);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "smooth" }));
  };

  const storageTone = state.storageStatus === "SQLite"
    ? "border-emerald-700/40 bg-emerald-950/30 text-emerald-200"
    : state.storageStatus === "Error"
      ? "border-rose-700/40 bg-rose-950/35 text-rose-200"
      : "border-amber-700/40 bg-amber-950/25 text-amber-200";

  const storageLabel = state.storageStatus === "SQLite"
    ? "Native storage"
    : state.storageStatus === "Error"
      ? "Storage fault"
      : state.storageReady
        ? state.storageStatus
        : "Opening workspace";

  return (
    <div className="mobile-foundry min-h-[100dvh] bg-[linear-gradient(180deg,rgba(8,7,6,0.88),rgba(13,11,9,0.96))] text-slate-100">
      <header className="mobile-foundry-header sticky top-0 z-30 border-b border-amber-900/35 bg-[linear-gradient(180deg,rgba(13,11,9,0.98),rgba(8,7,6,0.95))] px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] shadow-[0_12px_30px_rgba(0,0,0,0.32)] backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[9px] uppercase tracking-[0.28em] text-amber-500">Fenrir Forgeworks</div>
            <div className="mt-0.5 flex items-baseline gap-2">
              <h1 className="truncate text-xl font-bold tracking-[0.025em] text-amber-200">Forgekeeper</h1>
              <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Mobile Foundry</span>
            </div>
            <div className="mt-1 truncate text-xs text-slate-400">{activeStation.label} · {activeStation.description}</div>
          </div>

          <div className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${storageTone}`}>
            {storageLabel}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-3 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-3 sm:px-4">
        {state.storageStatus === "Error" ? (
          <div className="mb-3 rounded-2xl border border-rose-500/30 bg-rose-950/35 p-4 shadow-forge">
            <div className="text-[10px] uppercase tracking-[0.2em] text-rose-300">Workspace storage failure</div>
            <div className="mt-2 text-sm font-semibold text-rose-100">The native Foundry workspace could not initialize.</div>
            <div className="mt-2 break-all rounded-xl border border-rose-500/20 bg-black/30 p-3 font-mono text-[11px] leading-5 text-rose-200">
              {state.storageError || "No storage error message was returned."}
            </div>
          </div>
        ) : null}

        {!state.storageReady ? (
          <div className="rounded-2xl border border-amber-800/30 bg-slate-950/70 p-6 shadow-forge">
            <div className="text-[10px] uppercase tracking-[0.24em] text-amber-500">Foundry workspace</div>
            <div className="mt-2 text-lg font-semibold text-slate-200">Bringing the mobile forge online…</div>
            <div className="mt-2 text-sm text-slate-500">Opening the same workspace model used by desktop Forgekeeper.</div>
          </div>
        ) : (
          <div className="mobile-station-viewport min-w-0 overflow-x-hidden">
            <FoundryStationView state={state} />
          </div>
        )}
      </main>

      <nav className="mobile-foundry-nav fixed inset-x-0 bottom-0 z-40 border-t border-amber-900/40 bg-[linear-gradient(180deg,rgba(12,10,8,0.96),rgba(7,6,5,0.99))] px-2 pb-[max(env(safe-area-inset-bottom),0.4rem)] pt-2 shadow-[0_-12px_36px_rgba(0,0,0,0.42)] backdrop-blur-xl" aria-label="Mobile Foundry navigation">
        <div className="mx-auto grid w-full max-w-3xl grid-cols-5 gap-1">
          {primaryNavigation.map((item) => {
            const current = state.view as string;
            const active = current === item.view || (item.view === "designs" && current === "catalog") || (item.view === "production" && current === "orders");
            return (
              <button
                key={item.view}
                type="button"
                onClick={() => navigate(item.view)}
                className={`min-h-[50px] rounded-xl border px-1.5 py-2 text-center text-[11px] font-semibold transition ${
                  active
                    ? "border-amber-600/55 bg-amber-950/40 text-amber-100 shadow-forge-inset"
                    : "border-transparent text-slate-400 active:bg-slate-800/70 active:text-slate-100"
                }`}
              >
                {item.shortLabel}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => setStationSheetOpen(true)}
            className={`min-h-[50px] rounded-xl border px-1.5 py-2 text-center text-[11px] font-semibold transition ${
              extraStations.some((item) => item.view === state.view)
                ? "border-amber-600/55 bg-amber-950/40 text-amber-100 shadow-forge-inset"
                : "border-transparent text-slate-400 active:bg-slate-800/70 active:text-slate-100"
            }`}
          >
            Stations
          </button>
        </div>
      </nav>

      {stationSheetOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-black/65 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Foundry stations">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Close station menu" onClick={() => setStationSheetOpen(false)} />
          <section className="relative max-h-[82dvh] w-full overflow-auto rounded-t-[28px] border-t border-amber-700/40 bg-[linear-gradient(180deg,#15120f,#080706)] px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4 shadow-[0_-24px_60px_rgba(0,0,0,0.6)]">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-700" />
            <div className="mx-auto w-full max-w-3xl">
              <div className="mb-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-amber-500">Foundry stations</div>
                <div className="mt-1 text-lg font-semibold text-amber-100">Full workspace access</div>
                <p className="mt-1 text-xs leading-5 text-slate-500">Every operational station remains available on mobile; this menu replaces the desktop sidebar rather than removing functionality.</p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {extraStations.map((station) => (
                  <button
                    key={station.view}
                    type="button"
                    onClick={() => navigate(station.view)}
                    className={`rounded-2xl border p-4 text-left transition ${
                      state.view === station.view
                        ? "border-amber-600/55 bg-amber-950/35 text-amber-100"
                        : "border-slate-800/90 bg-slate-950/55 text-slate-200 active:border-amber-800/60 active:bg-slate-900"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{station.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">{station.description}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setStationSheetOpen(false)}
                className="mt-4 min-h-[48px] w-full rounded-xl border border-slate-700 bg-slate-900/80 px-4 text-sm font-semibold text-slate-300"
              >
                Return to {activeStation.label}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
