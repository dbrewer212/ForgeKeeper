import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { launchExternalTool, openUrl } from "../../lib/tauriLaunchpad";

export function ExternalToolsPanel({ state }: { state: any }) {
  const tools = state.settings.externalTools;

  function updateExternalTools(patch: Partial<typeof tools>) {
    state.updateSettings({
      externalTools: {
        ...tools,
        ...patch,
      },
    });
  }

  return (
    <Card title="External Tools & Production Launchpad">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-2">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">OrcaSlicer Path</div>
          <Input
            value={tools.orcaSlicerPath}
            onChange={(event) => updateExternalTools({ orcaSlicerPath: event.target.value })}
            placeholder="C:\\Program Files\\OrcaSlicer\\OrcaSlicer.exe"
          />
        </label>

        <label className="space-y-2">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Anycubic Slicer Next Path</div>
          <Input
            value={tools.anycubicSlicerPath}
            onChange={(event) => updateExternalTools({ anycubicSlicerPath: event.target.value })}
            placeholder="C:\\Program Files\\AnycubicSlicerNext\\AnycubicSlicerNext.exe"
          />
        </label>

        <label className="space-y-2">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Blender Path</div>
          <Input
            value={tools.blenderPath}
            onChange={(event) => updateExternalTools({ blenderPath: event.target.value })}
            placeholder="C:\\Users\\dbrew\\AppData\\Roaming\\Microsoft\\Windows\\Start Menu\\Programs\\Blender"
          />
        </label>

        <label className="space-y-2">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Meshy URL</div>
          <Input
            value={tools.meshyUrl}
            onChange={(event) => updateExternalTools({ meshyUrl: event.target.value })}
            placeholder="https://www.meshy.ai/"
          />
        </label>

        <label className="space-y-2 md:col-span-2">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Forgekeeper Library Path</div>
          <Input
            value={tools.forgekeeperLibraryPath}
            onChange={(event) => updateExternalTools({ forgekeeperLibraryPath: event.target.value })}
            placeholder="C:\\ForgekeeperLibrary"
          />
        </label>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm text-slate-400">
        Default routing: Kobra 3 Combo → Anycubic Slicer Next; Neptune 4 Max → OrcaSlicer.
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => launchExternalTool(tools.orcaSlicerPath, undefined, "OrcaSlicer")}>Open Orca</Button>
        <Button variant="ghost" onClick={() => launchExternalTool(tools.anycubicSlicerPath, undefined, "Anycubic Slicer Next")}>Open Anycubic</Button>
        <Button variant="ghost" onClick={() => launchExternalTool(tools.blenderPath, undefined, "Blender")}>Open Blender</Button>
        <Button onClick={() => openUrl(tools.meshyUrl)}>Open Meshy.ai</Button>
      </div>
    </Card>
  );
}
