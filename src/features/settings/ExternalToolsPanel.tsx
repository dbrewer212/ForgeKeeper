import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { openLocalPathBestEffort, openWebUrl } from "../../lib/externalTools";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import type { SlicerKey } from "../../types/domain";

export function ExternalToolsPanel({ state }: { state: ForgekeeperState }) {
  const settings = state.settings;
  const update = state.updateSettings;

  return (
    <Card title="External Tools & Forgekeeper Library">
      <div className="grid gap-4 xl:grid-cols-2">
        <label className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Forgekeeper Library Folder</div>
          <Input value={settings.forgekeeperLibraryPath ?? ""} onChange={(e) => update({ forgekeeperLibraryPath: e.target.value })} placeholder="C:\\ForgekeeperLibrary" />
        </label>
        <label className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Default Slicer</div>
          <Select value={settings.defaultSlicer ?? "orca"} onChange={(e) => update({ defaultSlicer: e.target.value as SlicerKey })}>
            <option value="orca">OrcaSlicer</option>
            <option value="anycubic">Anycubic Slicer Next</option>
          </Select>
        </label>
        <label className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">OrcaSlicer Path</div>
          <Input value={settings.orcaSlicerPath ?? ""} onChange={(e) => update({ orcaSlicerPath: e.target.value })} placeholder="C:\\Program Files\\OrcaSlicer\\OrcaSlicer.exe" />
        </label>
        <label className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Anycubic Slicer Next Path</div>
          <Input value={settings.anycubicSlicerPath ?? ""} onChange={(e) => update({ anycubicSlicerPath: e.target.value })} placeholder="C:\\Program Files\\AnycubicSlicerNext\\AnycubicSlicerNext.exe" />
        </label>
        <label className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Blender Path</div>
          <Input value={settings.blenderPath ?? ""} onChange={(e) => update({ blenderPath: e.target.value })} placeholder="C:\\Users\\dbrew\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Blender" />
        </label>
        <label className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Meshy.ai URL</div>
          <Input value={settings.meshyUrl ?? ""} onChange={(e) => update({ meshyUrl: e.target.value })} placeholder="https://www.meshy.ai/" />
        </label>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm text-slate-400">
        Default routing: Kobra 3 Combo → Anycubic Slicer Next; Neptune 4 Max → OrcaSlicer.
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => openLocalPathBestEffort(settings.forgekeeperLibraryPath || "")}>Open Library Folder</Button>
        <Button variant="ghost" onClick={() => openLocalPathBestEffort(settings.orcaSlicerPath || "")}>Open Orca Path</Button>
        <Button variant="ghost" onClick={() => openLocalPathBestEffort(settings.anycubicSlicerPath || "")}>Open Anycubic Path</Button>
        <Button variant="ghost" onClick={() => openLocalPathBestEffort(settings.blenderPath || "")}>Open Blender Path</Button>
        <Button onClick={() => openWebUrl(settings.meshyUrl || "https://www.meshy.ai/")}>Open Meshy.ai</Button>
      </div>
    </Card>
  );
}
