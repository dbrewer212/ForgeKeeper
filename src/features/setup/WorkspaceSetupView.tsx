import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import type { ForgekeeperState } from "../../state/useForgekeeperState";

export function WorkspaceSetupView({ state }: { state: ForgekeeperState }) {
  const [workspaceName, setWorkspaceName] = useState(state.settings.workspaceName || "Fenrir Forgeworks");
  const [ownerName, setOwnerName] = useState(state.settings.ownerName);
  const [assetRootPath, setAssetRootPath] = useState(state.settings.assetRootPath);
  const [laborRate, setLaborRate] = useState(state.settings.laborRate);
  const [electricityRate, setElectricityRate] = useState(state.settings.electricityRate);
  const [productionHoursPerDay, setProductionHoursPerDay] = useState(state.settings.productionHoursPerDay);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!workspaceName.trim() || !ownerName.trim()) return;
    state.completeSetup({
      workspaceName,
      ownerName,
      assetRootPath,
      laborRate,
      electricityRate,
      productionHoursPerDay,
    });
  }

  return (
    <div className="min-h-screen bg-[#070b11] p-6 text-slate-100">
      <div className="mx-auto max-w-4xl py-10">
        <div className="mb-8">
          <div className="text-xs uppercase tracking-[0.28em] text-amber-400">ForgeKeeper</div>
          <h1 className="mt-3 text-4xl font-semibold">Establish Your Foundry</h1>
          <p className="mt-3 max-w-2xl text-slate-400">
            This creates one private, user-owned workshop. Design projects, production jobs, materials,
            printers, planning, and reports will share this workspace.
          </p>
        </div>

        {state.legacyImported ? (
          <div className="mb-6 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            Existing prototype data was imported. Production information was preserved; customer and sales-only fields were excluded.
          </div>
        ) : null}

        <form onSubmit={submit}>
          <div className="grid gap-6 xl:grid-cols-2">
            <Card title="Workspace Identity">
              <div className="space-y-4">
                <Field label="Workspace Name">
                  <Input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} autoFocus />
                </Field>
                <Field label="Owner / Operator">
                  <Input value={ownerName} onChange={(event) => setOwnerName(event.target.value)} placeholder="Your name" />
                </Field>
                <Field label="Asset Root Path">
                  <Input value={assetRootPath} onChange={(event) => setAssetRootPath(event.target.value)} placeholder="C:\FenrirForgeworks\assets" />
                </Field>
              </div>
            </Card>

            <Card title="Operating Defaults">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Labor Rate / Hour">
                  <Input type="number" min={0} step="0.01" value={laborRate} onChange={(event) => setLaborRate(Number(event.target.value))} />
                </Field>
                <Field label="Electricity / kWh">
                  <Input type="number" min={0} step="0.001" value={electricityRate} onChange={(event) => setElectricityRate(Number(event.target.value))} />
                </Field>
                <Field label="Production Hours / Day">
                  <Input type="number" min={1} step="0.5" value={productionHoursPerDay} onChange={(event) => setProductionHoursPerDay(Number(event.target.value))} />
                </Field>
              </div>
              <div className="mt-5 rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm text-slate-400">
                Printers and materials are added from their own stations after setup so every record reflects your actual workshop.
              </div>
            </Card>
          </div>

          <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-[#0d131c] p-5">
            <div>
              <div className="font-medium">Local-first workspace</div>
              <div className="mt-1 text-sm text-slate-500">
                {state.storageBackend === "sqlite" ? "SQLite is the authoritative desktop store." : "Browser preview storage is active; the desktop build uses SQLite."}
              </div>
            </div>
            <Button type="submit" disabled={!workspaceName.trim() || !ownerName.trim()}>Enter the Foundry</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block"><div className="mb-2 text-xs uppercase tracking-wide text-slate-500">{label}</div>{children}</label>;
}
