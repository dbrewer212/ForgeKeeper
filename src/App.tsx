import { lazy, Suspense } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { BastionView } from "./features/bastion/BastionView";
import { BastionProductionQueue } from "./features/bastion/BastionProductionQueue";
import { isFoundryMobileRuntime } from "./platform/runtime";

const ForgekeeperWorkspace = lazy(() => import("./ForgekeeperWorkspace"));
const MobileFoundryWorkspace = lazy(() => import("./mobile/MobileFoundryWorkspace"));
const bastionLauncherDefaults = { settings: {} };

export default function App() {
  if (isFoundryMobileRuntime()) {
    return (
      <Suspense fallback={<WorkspaceLoading mobile />}>
        <MobileFoundryWorkspace />
      </Suspense>
    );
  }

  const currentWindow = getCurrentWebviewWindow();
  if (currentWindow.label === "bastion") {
    return (
      <>
        <BastionView
          state={bastionLauncherDefaults}
          onExit={() => void invoke("bastion_close_window")}
        />
        <BastionProductionQueue />
      </>
    );
  }

  return (
    <Suspense fallback={<WorkspaceLoading />}>
      <ForgekeeperWorkspace />
    </Suspense>
  );
}

function WorkspaceLoading({ mobile = false }: { mobile?: boolean }) {
  return (
    <div className="flex h-[100dvh] items-center justify-center bg-foundry-soot p-6 text-slate-100">
      <div className="w-full max-w-lg rounded-2xl border border-amber-800/30 bg-slate-950/80 p-8 shadow-forge">
        <div className="text-[10px] uppercase tracking-[0.28em] text-amber-500">Fenrir Forgeworks</div>
        <div className="mt-2 text-2xl font-semibold text-amber-200">Forgekeeper</div>
        <div className="mt-2 text-sm text-slate-500">{mobile ? "Opening the Mobile Foundry…" : "Opening the Foundry workspace…"}</div>
      </div>
    </div>
  );
}
