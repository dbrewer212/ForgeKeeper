import { lazy, Suspense } from "react";
import type { ForgekeeperState } from "../../state/useForgekeeperState";

const DashboardView = lazy(() => import("../../features/dashboard/DashboardView").then((module) => ({ default: module.DashboardView })));
const WorkbenchDesignLibraryView = lazy(() => import("../../features/design-library/WorkbenchDesignLibraryView").then((module) => ({ default: module.WorkbenchDesignLibraryView })));
const ProductionView = lazy(() => import("../../features/production/ProductionView").then((module) => ({ default: module.ProductionView })));
const FilamentView = lazy(() => import("../../features/filament/FilamentView").then((module) => ({ default: module.FilamentView })));
const PrintersView = lazy(() => import("../../features/printers/PrintersView").then((module) => ({ default: module.PrintersView })));
const ReportsView = lazy(() => import("../../features/reports/ReportsView").then((module) => ({ default: module.ReportsView })));
const AdministrationView = lazy(() => import("../../features/administration/AdministrationView").then((module) => ({ default: module.AdministrationView })));
const PlanningView = lazy(() => import("../../features/planning/PlanningView").then((module) => ({ default: module.PlanningView })));
const CommissioningView = lazy(() => import("../../features/commissioning/CommissioningView").then((module) => ({ default: module.CommissioningView })));

export function FoundryStationView({ state }: { state: ForgekeeperState }) {
  const renderView = () => {
    switch (state.view as string) {
      case "dashboard":
        return <DashboardView state={state} />;
      case "designs":
      case "catalog":
        return <WorkbenchDesignLibraryView state={state} />;
      case "production":
      case "orders":
        return <ProductionView />;
      case "filament":
        return <FilamentView state={state} />;
      case "printers":
        return <PrintersView state={state} />;
      case "reports":
        return <ReportsView state={state} />;
      case "settings":
        return <AdministrationView state={state} />;
      case "planning":
        return <PlanningView state={state} />;
      case "commissioning":
        return <CommissioningView />;
      default:
        return <DashboardView state={state} />;
    }
  };

  return <Suspense fallback={<StationLoading />}>{renderView()}</Suspense>;
}

function StationLoading() {
  return (
    <div className="rounded-2xl border border-amber-800/30 bg-slate-950/70 p-8 shadow-forge">
      <div className="text-[10px] uppercase tracking-[0.24em] text-amber-500">Foundry station</div>
      <div className="mt-2 text-lg font-semibold text-slate-200">Bringing station online…</div>
      <div className="mt-2 text-sm text-slate-500">Loading only the tools required for this workspace.</div>
    </div>
  );
}
