import { useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Sidebar } from "./components/layout/Sidebar";
import { FoundryStationView } from "./components/layout/FoundryStationView";
import { DesktopFoundryLinkRuntime } from "./foundry-link/DesktopFoundryLinkRuntime";
import { useForgekeeperState } from "./state/useForgekeeperState";
import type { AppData } from "./types/domain";
import { ensureWorkbenchBootstrap } from "./workbench/bootstrap";

export default function ForgekeeperWorkspace() {
  const state = useForgekeeperState();

  useEffect(() => {
    if (!state.storageReady) return;
    let cancelled = false;

    void (async () => {
      if (state.storageStatus === "SQLite") {
        try {
          const result = await ensureWorkbenchBootstrap(state as unknown as AppData);
          console.info("Workbench bootstrap", result);
        } catch (cause) {
          console.error("Workbench bootstrap failed:", cause);
        }
      }

      if (cancelled) return;
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      if (cancelled) return;

      try {
        await invoke("bastion_open_window");
      } catch (cause) {
        console.error("Bastion auto-open failed:", cause);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.storageReady, state.storageStatus]);

  const openBastion = useCallback(async () => {
    try {
      await invoke("bastion_open_window");
    } catch (cause) {
      window.alert(cause instanceof Error ? cause.message : String(cause));
    }
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-[linear-gradient(135deg,rgba(8,7,6,0.2),rgba(21,18,15,0.32))] text-slate-100">
      <DesktopFoundryLinkRuntime state={state} />
      <Sidebar view={state.view as string} setView={state.setView} onBastion={openBastion} />
      <main className="relative flex-1 overflow-auto">
        <div className="pointer-events-none sticky top-0 z-10 h-px bg-[linear-gradient(90deg,rgba(199,148,56,0.35),rgba(169,117,36,0.08),transparent)]" />
        <div className="mx-auto min-h-full w-full max-w-[1920px] p-4 lg:p-5 xl:p-6">
          {state.storageStatus === "Error" ? (
            <div className="mb-4 rounded-2xl border border-rose-500/30 bg-rose-950/30 p-4 shadow-forge">
              <div className="text-[10px] uppercase tracking-[0.2em] text-rose-300">Workspace storage failure</div>
              <div className="mt-2 text-sm font-semibold text-rose-100">SQLite workspace could not initialize.</div>
              <div className="mt-2 break-all rounded-xl border border-rose-500/20 bg-black/30 p-3 font-mono text-xs leading-5 text-rose-200">
                {state.storageError || "No storage error message was returned."}
              </div>
            </div>
          ) : null}
          <FoundryStationView state={state} />
        </div>
      </main>
    </div>
  );
}
