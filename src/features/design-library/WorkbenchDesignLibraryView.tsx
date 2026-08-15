import { useState } from "react";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { AssetVaultView } from "./AssetVaultView";
import { IntakeStation } from "./IntakeStation";
import { ModelInspectorStation } from "./ModelInspectorStation";
import { BuildBenchStation } from "./BuildBenchStation";
import { VariantAssemblyStation } from "./VariantAssemblyStation";
import { ProductionGateStation } from "./ProductionGateStation";
import { ForgepackStation } from "./ForgepackStation";

type WorkbenchSurface = "vault" | "intake" | "inspector" | "build-bench" | "variants-assemblies" | "production-gate" | "forgepack";

export function WorkbenchDesignLibraryView({ state }: { state: ForgekeeperState }) {
  const [surface, setSurface] = useState<WorkbenchSurface>("vault");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSurface("vault")} className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold ${surface === "vault" ? "bg-amber-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>Asset Vault</button>
            <button type="button" onClick={() => setSurface("intake")} className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold ${surface === "intake" ? "bg-amber-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>Intake Station</button>
            <button type="button" onClick={() => setSurface("inspector")} className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold ${surface === "inspector" ? "bg-amber-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>Model Inspector</button>
            <button type="button" onClick={() => setSurface("build-bench")} className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold ${surface === "build-bench" ? "bg-amber-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>Build Bench</button>
            <button type="button" onClick={() => setSurface("variants-assemblies")} className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold ${surface === "variants-assemblies" ? "bg-amber-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>Variants & Assemblies</button>
            <button type="button" onClick={() => setSurface("production-gate")} className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold ${surface === "production-gate" ? "bg-amber-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>Production Gate</button>
            <button type="button" onClick={() => setSurface("forgepack")} className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold ${surface === "forgepack" ? "bg-amber-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>Forgepack</button>
          </div>
          <div className="text-xs text-slate-500">Workbench Domain · Shared Foundry identity</div>
        </div>
      </div>

      {surface === "vault" ? <AssetVaultView state={state} /> : null}
      {surface === "intake" ? <IntakeStation state={state} /> : null}
      {surface === "inspector" ? <ModelInspectorStation state={state} /> : null}
      {surface === "build-bench" ? <BuildBenchStation state={state} /> : null}
      {surface === "variants-assemblies" ? <VariantAssemblyStation state={state} /> : null}
      {surface === "production-gate" ? <ProductionGateStation state={state} /> : null}
      {surface === "forgepack" ? <ForgepackStation state={state} /> : null}
    </div>
  );
}
