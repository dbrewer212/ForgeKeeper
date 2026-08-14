import { useState } from "react";
import { CatalogView } from "../catalog/CatalogView";
import { CanonRegistryView } from "../canon/CanonRegistryView";
import type { ForgekeeperState } from "../../state/useForgekeeperState";

type LibrarySection = "designs" | "canon";

export function DesignLibraryView({ state }: { state: ForgekeeperState }) {
  const [section, setSection] = useState<LibrarySection>("designs");

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-amber-500/15 bg-[#0d131c] p-3">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSection("designs")}
            className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold ${section === "designs" ? "bg-amber-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
          >
            Designs & Production Assets
          </button>
          <button
            type="button"
            onClick={() => setSection("canon")}
            className={`min-h-[44px] rounded-xl px-4 py-2 text-sm font-semibold ${section === "canon" ? "bg-amber-600 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
          >
            Canon Registry
          </button>
        </div>
      </div>
      {section === "canon" ? <CanonRegistryView state={state} /> : <CatalogView state={state} />}
    </div>
  );
}
