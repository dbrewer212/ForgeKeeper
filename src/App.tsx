import { useForgekeeperState } from "./state/useForgekeeperState";
import { Sidebar } from "./components/layout/Sidebar";
import { DashboardView } from "./features/dashboard/DashboardView";
import { CatalogView } from "./features/catalog/CatalogView";
import { OrdersView } from "./features/orders/OrdersView";
import { FilamentView } from "./features/filament/FilamentView";
import { PrintersView } from "./features/printers/PrintersView";
import { ReportsView } from "./features/reports/ReportsView";
import { SettingsView } from "./features/settings/SettingsView";
import { PlanningView } from "./features/planning/PlanningView";

export default function App() {
  const state = useForgekeeperState();

  const renderView = () => {
    switch (state.view) {
      case "dashboard":
        return <DashboardView state={state} />;
      case "catalog":
        return <CatalogView state={state} />;
      case "orders":
        return <OrdersView state={state} />;
      case "filament":
        return <FilamentView state={state} />;
      case "printers":
        return <PrintersView state={state} />;
      case "planning":
        return <PlanningView state={state} />;
      case "reports":
        return <ReportsView state={state} />;
      case "settings":
        return <SettingsView state={state} />;
      default:
        return <DashboardView state={state} />;
    }
  };

  return (
    <div className="relative h-screen w-screen overflow-hidden text-slate-100">
      <div className="absolute inset-0 pointer-events-none" />

      <div className="relative z-10 flex h-full p-4 gap-4">
        <Sidebar state={state} />

        <main className="forge-glass flex min-w-0 flex-1 flex-col overflow-hidden rounded-3xl">
          <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-amber-300/80">
                Fenrir Forgeworks
              </p>
              <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-50">
                ForgeKeeper Command Ledger
              </h1>
            </div>

            <div className="hidden rounded-2xl border border-amber-300/15 bg-amber-400/10 px-4 py-2 text-right md:block">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-200">
                Local Forge
              </p>
              <p className="text-sm text-slate-300">
                Business systems online
              </p>
            </div>
          </header>

          <section className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
            {renderView()}
          </section>
        </main>
      </div>
    </div>
  );
}