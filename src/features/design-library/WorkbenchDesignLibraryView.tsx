import { useState } from "react";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { AssetVaultView } from "./AssetVaultView";
import { IntakeStation } from "./IntakeStation";

type WorkbenchSurface = "vault" | "intake";

export function WorkbenchDesignLibraryView({ state }: { state: ForgekeeperState }) {
  const [surface, setSurface] = useState<WorkbenchSurface>("vault");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSurface("vault")}
              className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold ${surface === "vault" ? "bg-amber-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
            >
              Asset Vault
            </button>
            <button
              type="button"
              onClick={() => setSurface("intake")}
              className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold ${surface === "intake" ? "bg-amber-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
            >
              Intake Station
            </button>
          </div>
          <div className="text-xs text-slate-500">Workbench Domain · Shared Foundry identity</div>
        </div>
      </div>

      {surface === "vault" ? <AssetVaultView state={state} /> : <IntakeStation state={state} />}
    </div>
  );
}
