import { useEffect, useState } from "react";
import type { CommissioningReadinessReport } from "../../mesh/commissioningDiagnostics";
import type { CommissioningVerificationReport } from "../../mesh/commissioningVerification";
import { getFoundryMeshRuntime } from "../../mesh";

type ToolResponse = {
  result?: {
    result?: unknown;
    error?: string;
    state?: string;
  };
};

function toolValue<T>(response: ToolResponse): T {
  if (response.result?.error) throw new Error(response.result.error);
  if (response.result?.result === undefined) throw new Error("Foundry tool returned no result.");
  return response.result.result as T;
}

export function CommissioningView() {
  const [readiness, setReadiness] = useState<CommissioningReadinessReport>();
  const [verification, setVerification] = useState<CommissioningVerificationReport>();
  const [liveProbes, setLiveProbes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function refreshReadiness() {
    setBusy(true);
    setError(undefined);
    try {
      const runtime = getFoundryMeshRuntime();
      await runtime.initialize();
      const response = await runtime.tools.invoke({
        toolName: "mesh.commissioning.readiness",
        requesterWorkerId: "foundry-core",
        payload: {},
        reason: "Human-requested commissioning readiness inspection.",
      });
      setReadiness(toolValue<CommissioningReadinessReport>(response));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function runVerification() {
    setBusy(true);
    setError(undefined);
    try {
      const runtime = getFoundryMeshRuntime();
      await runtime.initialize();
      const response = await runtime.tools.invoke({
        toolName: "mesh.commissioning.verify",
        requesterWorkerId: "foundry-core",
        payload: { liveProbes },
        reason: "Human-requested non-destructive commissioning verification.",
      });
      const report = toolValue<CommissioningVerificationReport>(response);
      setVerification(report);
      setReadiness(report.readiness);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refreshReadiness();
  }, []);

  return (
    <div className="space-y-4 text-gray-100">
      <div className="rounded-xl border border-amber-900/60 bg-gray-950 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-[0.22em] text-amber-500">Temporary commissioning scaffold</div>
            <h1 className="mt-1 text-2xl font-semibold text-amber-300">Foundry Commissioning Console</h1>
            <p className="mt-2 max-w-3xl text-sm text-gray-400">
              Read-only verification surface for staged Mesh architecture. Running these checks does not commission,
              enable, start, or stop any worker or managed service.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void refreshReadiness()}
              className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50"
            >
              Refresh readiness
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void runVerification()}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50"
            >
              {busy ? "Checking…" : "Run verification"}
            </button>
          </div>
        </div>

        <label className="mt-4 inline-flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={liveProbes}
            onChange={(event) => setLiveProbes(event.target.checked)}
            className="h-4 w-4 accent-amber-600"
          />
          Include live localhost probes (still non-destructive)
        </label>

        {error && (
          <div className="mt-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}
      </div>

      {verification && (
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Verification result</h2>
              <p className="text-xs text-gray-500">{verification.generatedAt}</p>
            </div>
            <div className={`rounded-full px-3 py-1 text-sm font-semibold ${verification.architectureHealthy ? "bg-emerald-950 text-emerald-300" : "bg-red-950 text-red-300"}`}>
              {verification.architectureHealthy ? "ARCHITECTURE HEALTHY" : "FAILURES FOUND"}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {(["pass", "warn", "fail", "skip"] as const).map((key) => (
              <div key={key} className="rounded-lg border border-gray-800 bg-gray-900 p-3">
                <div className="text-xs uppercase tracking-wide text-gray-500">{key}</div>
                <div className="mt-1 text-2xl font-semibold">{verification.counts[key]}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 space-y-2">
            {verification.checks.map((check) => (
              <div key={check.id} className="rounded-lg border border-gray-800 bg-gray-900/70 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${
                    check.status === "pass" ? "bg-emerald-950 text-emerald-300" :
                    check.status === "fail" ? "bg-red-950 text-red-300" :
                    check.status === "warn" ? "bg-amber-950 text-amber-300" : "bg-gray-800 text-gray-400"
                  }`}>
                    {check.status}
                  </span>
                  <span className="text-xs uppercase tracking-wide text-gray-500">{check.category}</span>
                  {check.subjectId && <span className="text-xs text-gray-600">{check.subjectId}</span>}
                </div>
                <div className="mt-1 text-sm text-gray-200">{check.summary}</div>
                {check.detail && <div className="mt-1 text-xs text-gray-500">{check.detail}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {readiness && (
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Commissioning readiness</h2>
              <p className="text-xs text-gray-500">{readiness.generatedAt}</p>
            </div>
            <div className="text-sm text-gray-400">
              Safe Mode: <span className={readiness.safeMode ? "text-amber-300" : "text-emerald-300"}>{readiness.safeMode ? "ON" : "OFF"}</span>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {readiness.services.map((service) => (
              <div key={service.serviceId} className="rounded-lg border border-gray-800 bg-gray-900/70 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="font-medium text-gray-100">{service.name}</div>
                    <div className="text-xs text-gray-500">{service.serviceId}</div>
                  </div>
                  <span className="rounded bg-gray-800 px-2 py-1 text-xs uppercase text-gray-300">{service.level}</span>
                </div>
                <div className="mt-3 text-xs text-gray-400">
                  Commissioning: {service.commissioningState} · Runtime: {service.runtimeState}
                </div>
                {[...service.structuralBlockers, ...service.commissioningRequirements, ...service.activationBlockers]
                  .filter((item, index, all) => all.indexOf(item) === index)
                  .slice(0, 5)
                  .map((blocker) => (
                    <div key={blocker} className="mt-2 rounded bg-black/30 px-2 py-1.5 text-xs text-gray-500">
                      {blocker}
                    </div>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
