import { Button } from "../ui/Button";
import { getToolPath, slicerForPrinter, toolLabel } from "../../lib/externalTools";
import { copyToClipboard, launchExternalTool, openPath, openUrl } from "../../lib/tauriLaunchpad";

type AssetLaunchpadProps = {
  stlPath?: string;
  folderPath?: string;
  printerName?: string;
  slicer?: "orca" | "anycubic";
  settings: any;
};

export function AssetLaunchpad({ stlPath, folderPath, printerName, slicer, settings }: AssetLaunchpadProps) {
  const preferred = slicer || slicerForPrinter(printerName);
  const preferredLabel = toolLabel(preferred);
  const preferredPath = getToolPath(settings, preferred);
  const blenderPath = getToolPath(settings, "blender");
  const meshyUrl = settings?.meshyUrl || "https://www.meshy.ai/";

  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-100">Asset Launchpad</div>
          <div className="text-xs text-slate-500">
            Preferred slicer: {printerName ? `${printerName} → ${preferredLabel}` : preferredLabel}
          </div>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        <Button variant="ghost" onClick={() => openUrl(meshyUrl)}>Open Meshy.ai</Button>
        <Button variant="ghost" onClick={() => copyToClipboard(stlPath || "", "STL path")}>Copy STL Path</Button>
        <Button variant="ghost" onClick={() => copyToClipboard(folderPath || "", "STL folder")}>Copy Folder Path</Button>
        <Button variant="ghost" onClick={() => openPath(stlPath || "", "STL file")}>Open STL</Button>
        <Button variant="ghost" onClick={() => openPath(folderPath || "", "STL folder")}>Open Folder</Button>
        <Button variant="ghost" onClick={() => launchExternalTool(preferredPath, stlPath, preferredLabel)}>
          Open in {preferredLabel}
        </Button>
        <Button variant="ghost" onClick={() => launchExternalTool(blenderPath, stlPath, "Blender")}>
          Open in Blender
        </Button>
      </div>

      <div className="mt-3 space-y-1 text-xs text-slate-500">
        <div>Linked STL: {stlPath || "No STL path linked yet."}</div>
        <div>Library folder: {folderPath || "No folder linked yet."}</div>
      </div>
    </div>
  );
}
