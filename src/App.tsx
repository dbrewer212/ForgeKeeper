import { useForgekeeperState } from "./state/useForgekeeperState";

import { Sidebar } from "./components/layout/Sidebar";
import { DashboardView } from "./features/dashboard/DashboardView";
import { CatalogView } from "./features/catalog/CatalogView";
import { OrdersView } from "./features/orders/OrdersView";
import { FilamentView } from "./features/filament/FilamentView";
import { PrintersView } from "./features/printers/PrintersView";
import { ReportsView } from "./features/reports/ReportsView";
import { SettingsView } from "./features/settings/SettingsView";
import { CanonRegistryView } from "./features/canon/CanonRegistryView";
import { RecoveryAuditView } from "./features/recovery/RecoveryAuditView";

// ✅ NEW
import { PlanningView } from "./features/planning/PlanningView";

export default function App() {
  const state = useForgekeeperState();

  if (!state.storageReady) {
    return (
      <div className="flex h-screen items-center justify-center bg-[#090d13] text-slate-200">
        <div className="rounded-2xl border border-amber-500/20 bg-[#101722] px-8 py-6 text-center shadow-2xl">
          <div className="text-lg font-semibold text-amber-400">Opening Forgekeeper</div>
          <div className="mt-2 text-sm text-slate-400">Loading the local workshop database…</div>
        </div>
      </div>
    );
  }

  const renderView = () => {
    switch (state.view) {
      case "dashboard":
        return <DashboardView state={state} />;
      case "canon":
        return <CanonRegistryView state={state} />;
      case "catalog":
        return <CatalogView state={state} />;
      case "orders":
        return <OrdersView state={state} />;
      case "filament":
        return <FilamentView state={state} />;
      case "printers":
        return <PrintersView state={state} />;
      case "reports":
        return <ReportsView state={state} />;
      case "recovery":
        return <RecoveryAuditView state={state} />;
      case "settings":
        return <SettingsView state={state} />;
      case "planning": // ✅ NEW
        return <PlanningView state={state} />;
      default:
        return <DashboardView state={state} />;
    }
  };

  return (
    <div className="flex h-screen">
      <Sidebar state={state} />
      <main className="flex-1 overflow-auto p-4">
        {renderView()}
      </main>
    </div>
  );
}
