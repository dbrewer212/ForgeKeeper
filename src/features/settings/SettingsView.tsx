import type { ChangeEvent, ReactNode } from "react";
import { useRef } from "react";

import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { STORAGE_KEY } from "../../lib/storage";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import { ExternalToolsPanel } from "./ExternalToolsPanel";

export function SettingsView({ state }: { state: ForgekeeperState }) {
  const importInputRef = useRef<HTMLInputElement | null>(null);

  async function handleImportBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      const importedData =
        parsed && typeof parsed === "object" && "data" in parsed
          ? parsed.data
          : parsed;

      if (!importedData || typeof importedData !== "object") {
        window.alert("That backup file does not look like valid ForgeKeeper data.");
        return;
      }

      const confirmed = window.confirm(
        "Import this ForgeKeeper backup? This will replace the current local workspace and reload the app."
      );

      if (!confirmed) return;

      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(importedData));
      window.location.reload();
    } catch (error) {
      console.error("ForgeKeeper backup import failed", error);
      window.alert("ForgeKeeper could not import that backup file.");
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card title="Smart Cost Defaults">
        <div className="mb-4 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-4 text-sm leading-6 text-slate-300">
          Electricity is set to $0.203/kWh by default, matching the high end of
          your 19 to 20.3 cent range. Use $0.19 if you want the low estimate.
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Labor Rate / Hour">
            <Input
              type="number"
              value={state.settings.laborRate}
              onChange={(e) =>
                state.updateSettings({ laborRate: Number(e.target.value) })
              }
            />
          </Field>

          <Field label="Electricity Rate / kWh">
            <Input
              type="number"
              step="0.001"
              value={state.settings.electricityRate}
              onChange={(e) =>
                state.updateSettings({ electricityRate: Number(e.target.value) })
              }
            />
          </Field>

          <Field label="Default Printer Watts">
            <Input
              type="number"
              value={state.settings.machineWatts}
              onChange={(e) =>
                state.updateSettings({ machineWatts: Number(e.target.value) })
              }
            />
          </Field>

          <Field label="Packaging Cost">
            <Input
              type="number"
              step="0.01"
              value={state.settings.packagingCost}
              onChange={(e) =>
                state.updateSettings({ packagingCost: Number(e.target.value) })
              }
            />
          </Field>

          <Field label="Other Cost">
            <Input
              type="number"
              step="0.01"
              value={state.settings.otherCost}
              onChange={(e) =>
                state.updateSettings({ otherCost: Number(e.target.value) })
              }
            />
          </Field>

          <Field label="Target Margin %">
            <Input
              type="number"
              step="1"
              value={state.settings.targetMarginPercent}
              onChange={(e) =>
                state.updateSettings({
                  targetMarginPercent: Number(e.target.value),
                })
              }
            />
          </Field>

          <Field label="Production Hours / Day">
            <Input
              type="number"
              step="0.5"
              value={state.settings.productionHoursPerDay}
              onChange={(e) =>
                state.updateSettings({
                  productionHoursPerDay: Number(e.target.value),
                })
              }
            />
          </Field>
        </div>
      </Card>

      <Card title="Cost Engine Sources">
        <div className="grid gap-3 text-sm text-slate-300">
          <InfoLine
            title="Filament"
            body="Spool price and spool grams create cost per gram. Product/order gram use drives material cost."
          />
          <InfoLine
            title="Printer"
            body="Printer wattage plus print hours and electricity rate create power cost."
          />
          <InfoLine
            title="Labor"
            body="Labor hours multiplied by your default labor rate creates labor cost."
          />
          <InfoLine
            title="Suggested Price"
            body="Total cost divided by target margin creates a pricing floor you can accept or override."
          />
          <InfoLine
            title="Production Forecast"
            body="Production hours per day converts queue hours into completion-day estimates and bottleneck warnings."
          />
        </div>
      </Card>

      <Card title="Local Asset Plan">
        <div className="space-y-4">
          <Field label="Asset Root Path">
            <Input
              value={state.settings.assetRootPath}
              onChange={(e) =>
                state.updateSettings({ assetRootPath: e.target.value })
              }
            />
          </Field>

          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-sm leading-6 text-slate-300">
            Use this as the planned folder root for STL and concept assets.
            True file upload/linking can be added later after the business
            foundation is stable.
          </div>
        </div>
      </Card>

      <ExternalToolsPanel state={state} />

      <Card title="Backup Controls">
        <div className="space-y-4">
          <div className="rounded-2xl border border-sky-300/15 bg-sky-400/10 p-4 text-sm leading-6 text-slate-300">
            Export before major edits. Import restores a saved ForgeKeeper JSON
            backup into local storage and reloads the workspace.
          </div>

          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportBackup}
          />

          <div className="flex flex-wrap gap-2">
            <Button onClick={state.exportBackupJson}>
              Download JSON Backup
            </Button>

            <Button
              variant="ghost"
              onClick={() => importInputRef.current?.click()}
            >
              Import JSON Backup
            </Button>

            <Button variant="danger" onClick={state.resetWorkspace}>
              Reset Workspace
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      {children}
    </label>
  );
}

function InfoLine({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-4">
      <div className="font-semibold text-slate-100">{title}</div>
      <div className="mt-1 leading-6 text-slate-400">{body}</div>
    </div>
  );
}