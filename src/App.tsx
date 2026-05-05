import { Sidebar } from "./components/layout/Sidebar";
import { Topbar } from "./components/layout/Topbar";
import { CatalogView } from "./features/catalog/CatalogView";
import { CollectionsView } from "./features/collections/CollectionsView";
import { DashboardView } from "./features/dashboard/DashboardView";
import { FilamentView } from "./features/filament/FilamentView";
import { OrdersView } from "./features/orders/OrdersView";
import { PrintersView } from "./features/printers/PrintersView";
import { ReleasesView } from "./features/releases/ReleasesView";
import { ReportsView } from "./features/reports/ReportsView";
import { SettingsView } from "./features/settings/SettingsView";
import { useForgekeeperState } from "./state/useForgekeeperState";

export default function App() {
  const state = useForgekeeperState();
  const views = {
    dashboard: <DashboardView state={state} />,
    catalog: <CatalogView state={state} />,
    collections: <CollectionsView state={state} />,
    releases: <ReleasesView state={state} />,
    orders: <OrdersView state={state} />,
    filament: <FilamentView state={state} />,
    printers: <PrintersView state={state} />,
    reports: <ReportsView state={state} />,
    settings: <SettingsView state={state} />,
  } as const;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(245,158,11,0.08),_transparent_25%),linear-gradient(180deg,#070b11_0%,#0b1017_100%)] text-slate-100">
      <div className="grid min-h-screen grid-cols-1 xl:grid-cols-[280px,minmax(0,1fr)]">
        <Sidebar state={state} />
        <main className="px-5 py-6 sm:px-6">
          <Topbar state={state} />
          {views[state.view]}
        </main>
      </div>
    </div>
  );
}
