import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";

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
            value={tools.orcaPath}
            onChange={(e) => updateExternalTools({ orcaPath: e.target.value })}
            placeholder="C:\Program Files\OrcaSlicer\OrcaSlicer.exe"
          />
        </label>

        <label className="space-y-2">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Anycubic Slicer Next Path</div>
          <Input
            value={tools.anycubicPath}
            onChange={(e) => updateExternalTools({ anycubicPath: e.target.value })}
            placeholder="C:\Program Files\AnycubicSlicerNext\AnycubicSlicerNext.exe"
          />
        </label>

        <label className="space-y-2">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Blender Path</div>
          <Input
            value={tools.blenderPath}
            onChange={(e) => updateExternalTools({ blenderPath: e.target.value })}
            placeholder="C:\Users\dbrew\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Blender"
          />
        </label>

        <label className="space-y-2">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Meshy URL</div>
          <Input
            value={tools.meshyUrl}
            onChange={(e) => updateExternalTools({ meshyUrl: e.target.value })}
            placeholder="https://www.meshy.ai/"
          />
        </label>

        <label className="space-y-2 md:col-span-2">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Forgekeeper Library Path</div>
          <Input
            value={tools.libraryPath}
            onChange={(e) => updateExternalTools({ libraryPath: e.target.value })}
            placeholder="C:\Forgekeeper Library"
          />
        </label>
      </div>

      <div className="mt-4 rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm text-slate-400">
        Default routing: Kobra 3 Combo → Anycubic Slicer Next; Neptune 4 Max → OrcaSlicer.
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="ghost" onClick={() => state.openExternalTool("orca")}>Open Orca</Button>
        <Button variant="ghost" onClick={() => state.openExternalTool("anycubic")}>Open Anycubic</Button>
        <Button variant="ghost" onClick={() => state.openExternalTool("blender")}>Open Blender</Button>
        <Button onClick={() => state.openExternalTool("meshy")}>Open Meshy.ai</Button>
      </div>
    </Card>
  );
}