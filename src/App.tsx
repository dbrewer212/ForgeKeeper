import { useForgekeeperState } from "./state/useForgekeeperState";

import { Sidebar } from "./components/layout/Sidebar";
import { DashboardView } from "./features/dashboard/DashboardView";
import { DesignLibraryView } from "./features/design-library/DesignLibraryView";
import { ProductionView } from "./features/production/ProductionView";
import { FilamentView } from "./features/filament/FilamentView";
import { PrintersView } from "./features/printers/PrintersView";
import { ReportsView } from "./features/reports/ReportsView";
import { SettingsView } from "./features/settings/SettingsView";
import { WorkspaceSetupView } from "./features/setup/WorkspaceSetupView";

// ✅ NEW
import { PlanningView } from "./features/planning/PlanningView";

export default function App() {
  const state = useForgekeeperState();

  if (!state.isReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070b11] text-slate-300">
        <div className="rounded-2xl border border-white/10 bg-[#0d131c] px-6 py-5">Opening the Foundry…</div>
      </div>
    );
  }

  if (state.storageError && state.storageBackend === "sqlite") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#070b11] p-6 text-slate-100">
        <div className="max-w-xl rounded-2xl border border-rose-500/30 bg-rose-500/10 p-6">
          <h1 className="text-xl font-semibold">ForgeKeeper could not open its data core.</h1>
          <p className="mt-3 text-sm text-rose-100/80">{state.storageError}</p>
          <button className="mt-5 rounded-xl bg-amber-600 px-4 py-2 font-medium" onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  if (!state.settings.setupCompleted) {
    return <WorkspaceSetupView state={state} />;
  }

  const renderView = () => {
    switch (state.view) {
      case "dashboard":
        return <DashboardView state={state} />;
      case "designs":
        return <DesignLibraryView state={state} />;
      case "production":
        return <ProductionView state={state} />;
      case "filament":
        return <FilamentView state={state} />;
      case "printers":
        return <PrintersView state={state} />;
      case "reports":
        return <ReportsView state={state} />;
      case "settings":
        return <SettingsView state={state} />;
      case "planning": // ✅ NEW
        return <PlanningView state={state} />;
      default:
        return <DashboardView state={state} />;
    }
  };

  return (
    <>
      {state.storageError ? (
        <div className="fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-xl border border-rose-500/30 bg-rose-950 px-4 py-2 text-sm text-rose-100">
          Workspace changes are not being saved: {state.storageError}
        </div>
      ) : null}
      <div className="flex h-screen">
        <Sidebar state={state} />
        <main className="flex-1 overflow-auto p-4">
          {renderView()}
        </main>
      </div>
    </>
  );
}
