import { Button } from "../ui/Button";
import { copyText, getToolPath, launchExternalTool, openLocalPathBestEffort, openWebUrl, slicerForPrinter, toolLabel } from "../../lib/externalTools";

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

async function launchWithAsset(toolPath: string, assetPath: string | undefined, label: string) {
  if (!assetPath?.trim()) {
    window.alert(`No STL has been linked yet, so ${label} cannot be opened with an asset.`);
    return;
  }
  try {
    await launchExternalTool(toolPath, assetPath);
  } catch (error) {
    window.alert(`${label} could not be launched. ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function AssetLaunchpad({ stlPath, folderPath, printerName, slicer, settings }: AssetLaunchpadProps) {
  const preferred = slicer || slicerForPrinter(printerName);
  const preferredLabel = toolLabel(preferred);
  const preferredPath = getToolPath(settings, preferred);
  const blenderPath = getToolPath(settings, "blender");

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
        <Button variant="ghost" onClick={() => void openWebUrl(settings?.meshyUrl || "https://www.meshy.ai/")}>Open Meshy.ai</Button>
        <Button variant="ghost" onClick={() => copyOrAlert(stlPath || "", "STL path")}>Copy STL Path</Button>
        <Button variant="ghost" onClick={() => copyOrAlert(folderPath || "", "STL folder")}>Copy Folder Path</Button>
        <Button variant="ghost" onClick={() => void openLocalPathBestEffort(stlPath || "")}>Open STL</Button>
        <Button variant="ghost" onClick={() => void openLocalPathBestEffort(folderPath || "")}>Open Folder</Button>
        <Button variant="ghost" onClick={() => void launchWithAsset(preferredPath, stlPath, preferredLabel)}>
          Open in {preferredLabel}
        </Button>
        <Button variant="ghost" onClick={() => void launchWithAsset(blenderPath, stlPath, "Blender")}>
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
