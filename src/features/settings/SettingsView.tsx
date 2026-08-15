import type { ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { ExternalToolsPanel } from "./ExternalToolsPanel";
import { GenerationProvidersPanel } from "./GenerationProvidersPanel";

export function SettingsView({ state }: { state: ForgekeeperState }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Commercial Cost Defaults" right={<span className="text-xs text-slate-500">Pricing support · not production authority</span>}>
        <div className="mb-4 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4 text-sm text-slate-300">
          These values support estimating, quoting, and historical compatibility records. Workbench manufacturing approval, Production Steward execution, material ledger truth, and machine state are independent of commercial costing defaults.
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
          <InfoLine title="Material" body="Physical spool cost and measured consumption can support historical cost evidence. The material ledger remains the inventory authority." />
          <InfoLine title="Printer" body="Printer wattage plus elapsed or estimated print time and electricity rate provide power-cost estimates." />
          <InfoLine title="Labor" body="Labor time multiplied by the configured rate provides an operator-cost estimate." />
          <InfoLine title="Suggested Price" body="Commercial pricing can use total estimated cost and target margin without changing manufacturing or production approval." />
          <InfoLine title="Production Capacity" body="Production-hour defaults are planning aids only; actual production state comes from Production Steward and returned evidence." />
        </div>
      </Card>

      <Card title="Compatibility Path Settings" right={<span className="text-xs text-slate-500">Legacy bridge</span>}>
        <div className="space-y-4">
          <Field label="Legacy Asset Root Path">
            <Input value={state.settings.assetRootPath} onChange={(e) => state.updateSettings({ assetRootPath: e.target.value })} />
          </Field>
          <div className="rounded-2xl border border-slate-700/55 bg-slate-900/55 p-4 text-sm leading-6 text-slate-300">
            This path is retained for compatibility and recovery of pre-Workbench records. New geometry enters through Workbench Intake, where provenance, file identity, revision lineage, inspection, and Foundry ownership are recorded explicitly.
          </div>
        </div>
      </Card>

      <ExternalToolsPanel state={state} />

      <GenerationProvidersPanel state={state} />

      <Card title="Recovery Controls" right={<span className="text-xs text-slate-500">Compatibility workspace backup</span>}>
        <div className="flex flex-wrap gap-2">
          <Button onClick={state.exportBackupJson}>Download Verified JSON Backup</Button>
          <Button variant="ghost" onClick={state.resetWorkspace}>Reset Compatibility Workspace</Button>
        </div>
        <div className="mt-4 text-sm leading-6 text-slate-400">Workbench SQLite state and Forgepack exports are separate from this compatibility backup. Use the Recovery & Audit section below for verified checkpoints and integrity review.</div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><div className="mb-2 text-xs uppercase tracking-wide text-slate-500">{label}</div>{children}</label>;
}

function InfoLine({ title, body }: { title: string; body: string }) {
  return <div className="rounded-2xl border border-slate-700/55 bg-slate-900/55 p-4"><div className="font-semibold text-slate-100">{title}</div><div className="mt-1 text-slate-400">{body}</div></div>;
}
