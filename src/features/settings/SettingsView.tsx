import type { ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { ExternalToolsPanel } from "./ExternalToolsPanel";

export function SettingsView({ state }: { state: ForgekeeperState }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Workspace Setup">
        <div className="space-y-4">
          <Field label="Workspace Name">
            <Input value={state.settings.workspaceName} onChange={(e) => state.updateSettings({ workspaceName: e.target.value })} />
          </Field>
          <Field label="Owner / Operator">
            <Input value={state.settings.ownerName} onChange={(e) => state.updateSettings({ ownerName: e.target.value })} />
          </Field>
          <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm text-slate-300">
            This is a single-user administrative workspace. Customer accounts, customer catalogs, and
            sales-order intake are not part of the active application.
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className={state.settings.setupCompleted ? "text-sm text-emerald-300" : "text-sm text-amber-200"}>
              {state.settings.setupCompleted ? "Workspace setup complete" : "Workspace setup needs review"}
            </span>
            <Button onClick={() => state.updateSettings({ setupCompleted: true })}>Mark Setup Complete</Button>
          </div>
        </div>
      </Card>

      <Card title="Data Core">
        <div className="space-y-3 text-sm text-slate-300">
          <InfoLine
            title={state.storageBackend === "sqlite" ? "SQLite Active" : "Browser Preview"}
            body={state.storageBackend === "sqlite"
              ? "The versioned local SQLite database is the authoritative source for this workspace."
              : "This preview uses browser storage. The installed desktop application uses SQLite."}
          />
          <InfoLine
            title="Schema"
            body="Workspace schema 4 · synchronized station tables, production batches, movement ledger, cost snapshots, and activity history."
          />
          <InfoLine
            title={state.integrityIssues.length === 0 ? "Integrity Check Passed" : `${state.integrityIssues.length} Integrity Issue${state.integrityIssues.length === 1 ? "" : "s"}`}
            body={state.integrityIssues.length === 0
              ? "All operational references currently resolve to valid workspace records."
              : "Open Reports to review broken record relationships before creating a backup."}
          />
        </div>
      </Card>

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
          <InfoLine title="Filament" body="Spool price and spool grams create cost per gram. Design and job gram use drives material cost." />
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
            Use this as the folder root for STL, concept, and reference assets. Individual files and folders are linked from their Design Library records.
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
