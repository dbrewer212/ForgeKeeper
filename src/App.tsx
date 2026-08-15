import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { useForgekeeperState } from "./state/useForgekeeperState";
import type { AppData } from "./types/domain";
import { ensureWorkbenchBootstrap } from "./workbench/bootstrap";

import { Sidebar } from "./components/layout/Sidebar";
import { DashboardView } from "./features/dashboard/DashboardView";
import { WorkbenchDesignLibraryView } from "./features/design-library/WorkbenchDesignLibraryView";
import { ProductionView } from "./features/production/ProductionView";
import { FilamentView } from "./features/filament/FilamentView";
import { PrintersView } from "./features/printers/PrintersView";
import { ReportsView } from "./features/reports/ReportsView";
import { AdministrationView } from "./features/administration/AdministrationView";
import { PlanningView } from "./features/planning/PlanningView";
import { CommissioningView } from "./features/commissioning/CommissioningView";
import { BastionView } from "./features/bastion/BastionView";

const bastionLauncherDefaults = { settings: {} };

export default function App() {
  const currentWindow = getCurrentWebviewWindow();
  if (currentWindow.label === "bastion") {
    return (
      <BastionView
        state={bastionLauncherDefaults}
        onExit={() => void invoke("bastion_close_window")}
      />
    );
  }

  return <ForgekeeperWorkspace />;
}

function ForgekeeperWorkspace() {
  const state = useForgekeeperState();

  useEffect(() => {
    void invoke("bastion_open_window").catch((cause) => {
      console.error("Bastion auto-open failed:", cause);
    });
  }, []);

  useEffect(() => {
    if (!state.storageReady || state.storageStatus !== "SQLite") return;
    void ensureWorkbenchBootstrap(state as unknown as AppData)
      .then((result) => console.info("Workbench bootstrap", result))
      .catch((cause) => console.error("Workbench bootstrap failed:", cause));
  }, [state.storageReady, state.storageStatus]);

  const renderView = () => {
    switch (state.view as string) {
      case "dashboard":
        return <DashboardView state={state} />;
      case "designs":
      case "catalog":
        return <WorkbenchDesignLibraryView state={state} />;
      case "production":
      case "orders":
        return <ProductionView state={state} />;
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

  async function openBastion() {
    try {
      await invoke("bastion_open_window");
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <div className="flex h-screen">
      <Sidebar state={state} onBastion={() => void openBastion()} />
      <main className="flex-1 overflow-auto p-4">
        {renderView()}
      </main>
    </div>
  );
}
