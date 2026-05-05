import { Button } from "../ui/Button";
import { copyText, describeLaunchTarget, getToolPath, openLocalPathBestEffort, openWebUrl, slicerForPrinter, toolLabel } from "../../lib/externalTools";

type AssetLaunchpadProps = {
  stlPath?: string;
  folderPath?: string;
  printerName?: string;
  slicer?: "orca" | "anycubic";
  settings: any;
};

async function copyOrAlert(value: string, label: string) {
  if (!value) {
    window.alert(`${label} is not linked yet.`);
    return;
  }
  const copied = await copyText(value);
  window.alert(copied ? `${label} copied to clipboard.` : `${label}: ${value}`);
}

export function AssetLaunchpad({ stlPath, folderPath, printerName, slicer, settings }: AssetLaunchpadProps) {
  const preferred = slicer || slicerForPrinter(printerName);
  const preferredLabel = toolLabel(preferred);
  const preferredPath = getToolPath(settings, preferred);

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
        <Button variant="ghost" onClick={() => openWebUrl(settings?.meshyUrl || "https://www.meshy.ai/")}>Open Meshy.ai</Button>
        <Button variant="ghost" onClick={() => copyOrAlert(stlPath || "", "STL path")}>Copy STL Path</Button>
        <Button variant="ghost" onClick={() => copyOrAlert(folderPath || "", "STL folder")}>Copy Folder Path</Button>
        <Button variant="ghost" onClick={() => openLocalPathBestEffort(stlPath || "")}>Open STL</Button>
        <Button variant="ghost" onClick={() => openLocalPathBestEffort(folderPath || "")}>Open Folder</Button>
        <Button variant="ghost" onClick={() => window.alert(`Launch target copied as reference:\n${describeLaunchTarget(preferred, stlPath)}\n\nConfigured app path:\n${preferredPath}\n\nFull app launching with file arguments will be enabled in the next Tauri shell-permission pass.`)}>
          Open in {preferredLabel}
        </Button>
        <Button variant="ghost" onClick={() => window.alert(`Blender path:\n${getToolPath(settings, "blender")}\n\nSTL path:\n${stlPath || "No STL linked yet."}`)}>
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
