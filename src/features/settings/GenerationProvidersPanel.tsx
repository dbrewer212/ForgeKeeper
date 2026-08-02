import { useState } from "react";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { testProviderConnections, type ProviderConnectionReport } from "../../lib/generationProviders";
import type { ForgekeeperState } from "../../state/useForgekeeperState";

export function GenerationProvidersPanel({ state }: { state: ForgekeeperState }) {
  const [report, setReport] = useState<ProviderConnectionReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const apiFilePath = state.settings.apiCredentialFilePath ?? "";

  async function checkConnections() {
    if (!apiFilePath.trim()) {
      setError("Link the local API credential file first.");
      return;
    }
    setChecking(true);
    setError("");
    try {
      setReport(await testProviderConnections(apiFilePath));
    } catch (caught) {
      setReport(null);
      setError(String(caught));
    } finally {
      setChecking(false);
    }
  }

  return (
    <Card title="Model Generation Providers">
      <div className="space-y-4">
        <label className="block space-y-2">
          <div className="text-xs uppercase tracking-wide text-slate-500">Local API Credential File</div>
          <Input
            value={apiFilePath}
            onChange={(event) => state.updateSettings({ apiCredentialFilePath: event.target.value })}
            placeholder="C:\\ForgekeeperLibrary\\Private\\API.txt"
          />
        </label>

        <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4 text-sm text-slate-400">
          Forgekeeper reads Meshy and PrintPal keys from this local file only when a provider action runs. Keys are never stored in browser data, backups, generation records, or GitHub.
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <ProviderStatus name="Meshy" connection={report?.meshy} />
          <ProviderStatus name="PrintPal" connection={report?.printpal} />
        </div>

        {error ? <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-sm text-red-300">{error}</div> : null}

        <Button onClick={checkConnections} disabled={checking}>
          {checking ? "Checking Providers..." : "Test Meshy & PrintPal"}
        </Button>
      </div>
    </Card>
  );
}

function ProviderStatus({ name, connection }: { name: string; connection?: ProviderConnectionReport["meshy"] }) {
  const state = !connection ? "Not tested" : connection.connected ? "Connected" : connection.configured ? "Connection failed" : "Not configured";
  const color = connection?.connected ? "text-emerald-300" : connection ? "text-amber-300" : "text-slate-500";
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0d131c] p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold text-slate-100">{name}</div>
        <div className={`text-xs uppercase tracking-wide ${color}`}>{state}</div>
      </div>
      <div className="mt-2 text-sm text-slate-400">
        {connection?.message ?? "Run the connection test from the desktop app."}
      </div>
      {connection?.credits != null ? <div className="mt-2 text-sm text-amber-300">{connection.credits} credits available</div> : null}
    </div>
  );
}
