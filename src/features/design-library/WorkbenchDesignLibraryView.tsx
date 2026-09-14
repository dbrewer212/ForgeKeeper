import { useState } from "react";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { CanonRegistryView } from "../canon/CanonRegistryView";
import { AssetVaultView } from "./AssetVaultView";
import { BuildBenchStation } from "./BuildBenchStation";
import { ForgepackStation } from "./ForgepackStation";
import { IntakeStation } from "./IntakeStation";
import { ModelInspectorStation } from "./ModelInspectorStation";
import { ModelWorkspaceView } from "./ModelWorkspaceView";
import { ProductionGateStation } from "./ProductionGateStation";
import { ProviderGenerationStation } from "./ProviderGenerationStation";
import { VariantAssemblyStation } from "./VariantAssemblyStation";

type PrimarySurface = "models" | "add" | "generate" | "advanced";
type AdvancedSurface = "vault" | "inspector" | "build-bench" | "variants-assemblies" | "production-gate" | "forgepack" | "canon";

export function WorkbenchDesignLibraryView({ state }: { state: ForgekeeperState }) {
  const [surface, setSurface] = useState<PrimarySurface>("models");
  const [advancedSurface, setAdvancedSurface] = useState<AdvancedSurface>("vault");

  function openAdvanced(next: AdvancedSurface = "vault") {
    setAdvancedSurface(next);
    setSurface("advanced");
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            <PrimaryButton active={surface === "models"} onClick={() => setSurface("models")}>Models</PrimaryButton>
            <PrimaryButton active={surface === "add"} onClick={() => setSurface("add")}>Add / Import</PrimaryButton>
            <PrimaryButton active={surface === "generate"} onClick={() => setSurface("generate")}>Generate</PrimaryButton>
            <PrimaryButton active={surface === "advanced"} onClick={() => setSurface("advanced")}>Advanced</PrimaryButton>
          </div>
          <div className="text-xs text-slate-500">Everyday model work stays in Models. Specialist tools remain available under Advanced.</div>
        </div>
      </div>

      {surface === "models" ? (
        <ModelWorkspaceView
          state={state}
          onAddModel={() => setSurface("add")}
          onGenerate={() => setSurface("generate")}
          onAdvanced={() => openAdvanced("vault")}
        />
      ) : null}
      {surface === "add" ? <IntakeStation state={state} /> : null}
      {surface === "generate" ? <ProviderGenerationStation state={state} /> : null}
      {surface === "advanced" ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-[#0b1119] p-3">
            <div className="mb-2 text-[10px] uppercase tracking-[0.16em] text-slate-600">Specialist Workbench Tools</div>
            <div className="flex flex-wrap gap-2">
              <SecondaryButton active={advancedSurface === "vault"} onClick={() => setAdvancedSurface("vault")}>Full Asset Vault</SecondaryButton>
              <SecondaryButton active={advancedSurface === "inspector"} onClick={() => setAdvancedSurface("inspector")}>Inspector</SecondaryButton>
              <SecondaryButton active={advancedSurface === "build-bench"} onClick={() => setAdvancedSurface("build-bench")}>Build Bench</SecondaryButton>
              <SecondaryButton active={advancedSurface === "variants-assemblies"} onClick={() => setAdvancedSurface("variants-assemblies")}>Variants / Assemblies</SecondaryButton>
              <SecondaryButton active={advancedSurface === "production-gate"} onClick={() => setAdvancedSurface("production-gate")}>Production Release</SecondaryButton>
              <SecondaryButton active={advancedSurface === "forgepack"} onClick={() => setAdvancedSurface("forgepack")}>Forgepack / Transfer</SecondaryButton>
              <SecondaryButton active={advancedSurface === "canon"} onClick={() => setAdvancedSurface("canon")}>Canon Registry</SecondaryButton>
            </div>
          </div>

          {advancedSurface === "vault" ? <AssetVaultView state={state} /> : null}
          {advancedSurface === "inspector" ? <ModelInspectorStation state={state} /> : null}
          {advancedSurface === "build-bench" ? <BuildBenchStation state={state} /> : null}
          {advancedSurface === "variants-assemblies" ? <VariantAssemblyStation state={state} /> : null}
          {advancedSurface === "production-gate" ? <ProductionGateStation state={state} /> : null}
          {advancedSurface === "forgepack" ? <ForgepackStation state={state} /> : null}
          {advancedSurface === "canon" ? <CanonRegistryView state={state} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function PrimaryButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return <button type="button" onClick={onClick} className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold ${active ? "bg-amber-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}>{children}</button>;
}

function SecondaryButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return <button type="button" onClick={onClick} className={`min-h-[38px] rounded-lg px-3 py-2 text-xs font-semibold ${active ? "bg-amber-500/20 text-amber-200" : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200"}`}>{children}</button>;
}
