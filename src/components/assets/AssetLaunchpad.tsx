import { Button } from "../ui/Button";
import { slicerForPrinter, toolLabel } from "../../lib/externalTools";

type AssetLaunchpadProps = {
  stlPath?: string;
  printerName?: string;
  settings: any;
};

function openUrl(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function AssetLaunchpad({ stlPath, printerName, settings }: AssetLaunchpadProps) {
  const preferred = slicerForPrinter(printerName);
  const preferredLabel = toolLabel(preferred);

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">Asset Launchpad</div>
          <div className="text-xs text-slate-500">Preferred slicer: {printerName ? `${printerName} -> ${preferredLabel}` : preferredLabel}</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => openUrl(settings?.meshyUrl ?? "https://www.meshy.ai/")}>Open Meshy.ai</Button>
        <Button variant="ghost" onClick={() => window.alert(`Tauri launch pending. STL path: ${stlPath || "none linked"}`)}>Open STL Folder</Button>
        <Button variant="ghost" onClick={() => window.alert(`Tauri launch pending. Preferred slicer: ${preferredLabel}`)}>Open in {preferredLabel}</Button>
        <Button variant="ghost" onClick={() => window.alert("Tauri launch pending. Blender path will be used from Settings.")}>Open in Blender</Button>
      </div>
      <div className="mt-3 text-xs text-slate-500">
        Linked STL: {stlPath || "No STL path linked yet."}
      </div>
    </div>
  );
}
