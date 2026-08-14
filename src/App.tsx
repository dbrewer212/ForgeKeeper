import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
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
import { CommissioningView } from "./features/commissioning/CommissioningView";
import { BastionView } from "./features/bastion/BastionView";

export default function App() {
  const state = useForgekeeperState();
  const currentWindow = getCurrentWebviewWindow();
  const isBastionWindow = currentWindow.label === "bastion";

  useEffect(() => {
    if (isBastionWindow) return;
    void invoke("bastion_open_window").catch((cause) => {
      console.error("Bastion auto-open failed:", cause);
    });
  }, [isBastionWindow]);

  if (isBastionWindow) {
    return <BastionView state={state} onExit={() => void invoke("bastion_close_window")} />;
  }

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
      case "reports":
        return <ReportsView state={state} />;
      case "settings":
        return <SettingsView state={state} />;
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
