import type { ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { ExternalToolsPanel } from "./ExternalToolsPanel";

export function SettingsView({ state }: { state: ForgekeeperState }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Smart Cost Defaults">
        <div className="mb-4 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4 text-sm text-slate-300">
          Electricity is set to $0.203/kWh by default, matching the high end of your 19 to 20.3 cent range. Use $0.19 if you want the low estimate.
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Labor Rate / Hour">
            <Input type="number" value={state.settings.laborRate} onChange={(e) => state.updateSettings({ laborRate: Number(e.target.value) })} />
          </Field>
          <Field label="Electricity Rate / kWh">
            <Input type="number" step="0.001" value={state.settings.electricityRate} onChange={(e) => state.updateSettings({ electricityRate: Number(e.target.value) })} />
          </Field>
          <Field label="Default Printer Watts">
            <Input type="number" value={state.settings.machineWatts} onChange={(e) => state.updateSettings({ machineWatts: Number(e.target.value) })} />
          </Field>
          <Field label="Packaging Cost">
            <Input type="number" step="0.01" value={state.settings.packagingCost} onChange={(e) => state.updateSettings({ packagingCost: Number(e.target.value) })} />
          </Field>
          <Field label="Other Cost">
            <Input type="number" step="0.01" value={state.settings.otherCost} onChange={(e) => state.updateSettings({ otherCost: Number(e.target.value) })} />
          </Field>
          <Field label="Target Margin %">
            <Input type="number" step="1" value={state.settings.targetMarginPercent} onChange={(e) => state.updateSettings({ targetMarginPercent: Number(e.target.value) })} />
          </Field>
          <Field label="Production Hours / Day">
            <Input type="number" step="0.5" value={state.settings.productionHoursPerDay} onChange={(e) => state.updateSettings({ productionHoursPerDay: Number(e.target.value) })} />
          </Field>
        </div>
      </Card>

      <Card title="Cost Engine Sources">
        <div className="grid gap-3 text-sm text-slate-300">
          <InfoLine title="Filament" body="Spool price and spool grams create cost per gram. Product/order gram use drives material cost." />
          <InfoLine title="Printer" body="Printer wattage plus print hours and electricity rate create power cost." />
          <InfoLine title="Labor" body="Labor hours multiplied by your default labor rate creates labor cost." />
          <InfoLine title="Suggested Price" body="Total cost divided by target margin creates a pricing floor you can accept or override." />
          <InfoLine title="Production Forecast" body="Production hours per day converts queue hours into completion-day estimates and bottleneck warnings." />
        </div>
      </Card>

      <Card title="Local Asset Plan">
        <div className="space-y-4">
          <Field label="Asset Root Path">
            <Input value={state.settings.assetRootPath} onChange={(e) => state.updateSettings({ assetRootPath: e.target.value })} />
          </Field>
          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm text-slate-300">
            Use this as the planned folder root for STL and Concept assets. True file upload/linking should be added after the cost engine is stable.
          </div>
        </div>
      </Card>

      <ExternalToolsPanel state={state} />

      <Card title="Backup Controls">
        <div className="flex flex-wrap gap-2">
          <Button onClick={state.exportBackupJson}>Download JSON Backup</Button>
          <Button variant="ghost" onClick={state.resetWorkspace}>Reset Workspace</Button>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><div className="mb-2 text-xs uppercase tracking-wide text-slate-500">{label}</div>{children}</label>;
}

function InfoLine({ title, body }: { title: string; body: string }) {
  return <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4"><div className="font-semibold text-slate-100">{title}</div><div className="mt-1 text-slate-400">{body}</div></div>;
}
