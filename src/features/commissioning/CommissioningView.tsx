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

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export function CommissioningView() {
  const [readiness, setReadiness] = useState<CommissioningReadinessReport>();
  const [verification, setVerification] = useState<CommissioningVerificationReport>();
  const [liveProbes, setLiveProbes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [ollamaExecutable, setOllamaExecutable] = useState("");
  const [ollamaEndpoint, setOllamaEndpoint] = useState("http://127.0.0.1:11434");
  const [ollamaHealthPath, setOllamaHealthPath] = useState("/api/version");
  const [ollamaMessage, setOllamaMessage] = useState<string>();

  async function refreshReadiness() {
    setBusy(true);
    setError(undefined);
    try {
      const runtime = getFoundryMeshRuntime();
      await runtime.initialize();
      hydrateOllamaFields(runtime);
      const response = await runtime.tools.invoke({
        toolName: "mesh.commissioning.readiness",
        requesterWorkerId: "foundry-core",
        payload: {},
        reason: "Human-requested commissioning readiness inspection.",
      });
      setReadiness(toolValue<CommissioningReadinessReport>(response));
    } catch (cause) {
      setError(errorText(cause));
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
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function bindOllama() {
    setBusy(true);
    setError(undefined);
    setOllamaMessage(undefined);
    try {
      const runtime = getFoundryMeshRuntime();
      await runtime.initialize();
      const service = runtime.services.get("ollama-service");
      if (!service) throw new Error("Ollama service descriptor is missing.");
      if (!ollamaExecutable.trim()) throw new Error("Enter the local Ollama executable path before binding.");
      if (!ollamaEndpoint.trim()) throw new Error("Enter the Ollama localhost endpoint before binding.");

      const rawControl = service.metadata?.localControl;
      const existingControl = rawControl && typeof rawControl === "object" ? rawControl as Record<string, unknown> : {};
      const endpoint = ollamaEndpoint.trim().replace(/\/$/, "");
      const healthPath = ollamaHealthPath.trim() || "/api/version";
      const probeUrl = `${endpoint}/${healthPath.replace(/^\//, "")}`;

      runtime.services.update("ollama-service", {
        endpoint,
        healthPath,
        metadata: {
          ...service.metadata,
          localControl: {
            ...existingControl,
            executable: ollamaExecutable.trim(),
            probeUrl,
            timeoutMs: 1500,
          },
        },
      });
      await runtime.save();
      const issues = runtime.serviceLifecycle.validationIssues("ollama-service");
      if (issues.length > 0) throw new Error(issues.join(" "));

      setOllamaMessage("Ollama machine-local configuration is bound and structurally valid.");
      await refreshReadiness();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function probeOllama() {
    setBusy(true);
    setError(undefined);
    setOllamaMessage(undefined);
    try {
      const runtime = getFoundryMeshRuntime();
      await runtime.initialize();
      const issues = runtime.serviceLifecycle.validationIssues("ollama-service");
      if (issues.length > 0) throw new Error(issues.join(" "));
      const probe = await runtime.serviceLifecycle.inspectProbe("ollama-service");
      if (!probe.online) throw new Error(probe.detail ?? "Ollama did not answer its localhost health probe.");
      setOllamaMessage(`Ollama live probe passed. ${probe.detail ?? ""}`.trim());
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function commissionOllama() {
    setBusy(true);
    setError(undefined);
    setOllamaMessage(undefined);
    const runtime = getFoundryMeshRuntime();
    try {
      await runtime.initialize();
      const issues = runtime.serviceLifecycle.validationIssues("ollama-service");
      if (issues.length > 0) throw new Error(issues.join(" "));

      const probe = await runtime.serviceLifecycle.inspectProbe("ollama-service");
      if (!probe.online) throw new Error(probe.detail ?? "Ollama did not answer its localhost health probe.");

      await runtime.commissioning.transition(
        "ollama",
        "commissioning",
        "Human-authorized Ollama local inference commissioning.",
      );
      runtime.services.update("ollama-service", {
        commissioningState: "commissioning",
        enabled: true,
      });
      await runtime.save();

      await runtime.serviceLifecycle.start("ollama-service");
      await runtime.commissioning.transition(
        "ollama",
        "active",
        "Ollama passed local health probe and service startup verification.",
      );
      runtime.services.update("ollama-service", {
        commissioningState: "active",
        runtimeState: "online",
        enabled: true,
      });
      await runtime.save();

      setOllamaMessage("OLLAMA COMMISSIONED — worker active, service online, localhost probe passed.");
      await refreshReadiness();
    } catch (cause) {
      const worker = runtime.workers.get("ollama");
      if (worker?.identity.commissioningState === "commissioning") {
        try {
          await runtime.commissioning.transition("ollama", "failed", "Ollama commissioning failed.");
        } catch {
          // Preserve the original commissioning error.
        }
      }
      const service = runtime.services.get("ollama-service");
      if (service?.commissioningState === "commissioning") {
        runtime.services.update("ollama-service", {
          commissioningState: "failed",
          enabled: false,
        });
        await runtime.save().catch(() => undefined);
      }
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  function hydrateOllamaFields(runtime: ReturnType<typeof getFoundryMeshRuntime>) {
    const service = runtime.services.get("ollama-service");
    if (!service) return;
    if (service.endpoint) setOllamaEndpoint(service.endpoint);
    if (service.healthPath) setOllamaHealthPath(service.healthPath);
    const control = service.metadata?.localControl;
    if (control && typeof control === "object") {
      const executable = (control as Record<string, unknown>).executable;
      if (typeof executable === "string" && executable.trim()) setOllamaExecutable(executable);
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
              Verification stays non-destructive. Explicit service commissioning controls below require a successful local probe before activation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => void refreshReadiness()} className="rounded-lg bg-gray-800 px-4 py-2 text-sm text-gray-200 hover:bg-gray-700 disabled:opacity-50">
              Refresh readiness
            </button>
            <button type="button" disabled={busy} onClick={() => void runVerification()} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-500 disabled:opacity-50">
              {busy ? "Working…" : "Run verification"}
            </button>
          </div>
        </div>
        <label className="mt-4 inline-flex items-center gap-2 text-sm text-gray-300">
          <input type="checkbox" checked={liveProbes} onChange={(event) => setLiveProbes(event.target.checked)} className="h-4 w-4 accent-amber-600" />
          Include live localhost probes
        </label>
        {error && <div className="mt-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3 text-sm text-red-300">{error}</div>}
      </div>

      <div className="rounded-xl border border-emerald-900/60 bg-gray-950 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-500">First external subsystem</div>
            <h2 className="mt-1 text-xl font-semibold text-emerald-300">Ollama Local Inference</h2>
            <p className="mt-1 text-sm text-gray-400">Machine-local binding is persisted in the Mesh snapshot on this workstation, not hard-coded into the repository.</p>
          </div>
          <div className="text-xs text-gray-500">Expected endpoint: localhost:11434</div>
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <label className="text-xs text-gray-400 lg:col-span-2">
            Executable
            <input value={ollamaExecutable} onChange={(event) => setOllamaExecutable(event.target.value)} placeholder="C:\\...\\ollama.exe" className="mt-1 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-emerald-700" />
          </label>
          <label className="text-xs text-gray-400">
            Endpoint
            <input value={ollamaEndpoint} onChange={(event) => setOllamaEndpoint(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-emerald-700" />
          </label>
          <label className="text-xs text-gray-400">
            Health path
            <input value={ollamaHealthPath} onChange={(event) => setOllamaHealthPath(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-emerald-700" />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void bindOllama()} className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700 disabled:opacity-50">Bind Ollama</button>
          <button type="button" disabled={busy} onClick={() => void probeOllama()} className="rounded-lg bg-sky-900 px-4 py-2 text-sm text-sky-100 hover:bg-sky-800 disabled:opacity-50">Probe Ollama</button>
          <button type="button" disabled={busy} onClick={() => void commissionOllama()} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">Commission Ollama</button>
        </div>
        {ollamaMessage && <div className="mt-4 rounded-lg border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">{ollamaMessage}</div>}
      </div>

      {verification && (
        <div className="rounded-xl border border-gray-800 bg-gray-950 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-lg font-semibold">Verification result</h2><p className="text-xs text-gray-500">{verification.generatedAt}</p></div>
            <div className={`rounded-full px-3 py-1 text-sm font-semibold ${verification.architectureHealthy ? "bg-emerald-950 text-emerald-300" : "bg-red-950 text-red-300"}`}>
              {verification.architectureHealthy ? "ARCHITECTURE HEALTHY" : "FAILURES FOUND"}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {(["pass", "warn", "fail", "skip"] as const).map((key) => <div key={key} className="rounded-lg border border-gray-800 bg-gray-900 p-3"><div className="text-xs uppercase tracking-wide text-gray-500">{key}</div><div className="mt-1 text-2xl font-semibold">{verification.counts[key]}</div></div>)}
          </div>
          <div className="mt-4 space-y-2">
            {verification.checks.map((check) => (
              <div key={check.id} className="rounded-lg border border-gray-800 bg-gray-900/70 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-0.5 text-xs font-semibold uppercase ${check.status === "pass" ? "bg-emerald-950 text-emerald-300" : check.status === "fail" ? "bg-red-950 text-red-300" : check.status === "warn" ? "bg-amber-950 text-amber-300" : "bg-gray-800 text-gray-400"}`}>{check.status}</span>
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
            <div><h2 className="text-lg font-semibold">Commissioning readiness</h2><p className="text-xs text-gray-500">{readiness.generatedAt}</p></div>
            <div className="text-sm text-gray-400">Safe Mode: <span className={readiness.safeMode ? "text-amber-300" : "text-emerald-300"}>{readiness.safeMode ? "ON" : "OFF"}</span></div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {readiness.services.map((service) => (
              <div key={service.serviceId} className="rounded-lg border border-gray-800 bg-gray-900/70 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div><div className="font-medium text-gray-100">{service.name}</div><div className="text-xs text-gray-500">{service.serviceId}</div></div>
                  <span className="rounded bg-gray-800 px-2 py-1 text-xs uppercase text-gray-300">{service.level}</span>
                </div>
                <div className="mt-3 text-xs text-gray-400">Commissioning: {service.commissioningState} · Runtime: {service.runtimeState}</div>
                {[...service.structuralBlockers, ...service.commissioningRequirements, ...service.activationBlockers].filter((item, index, all) => all.indexOf(item) === index).slice(0, 5).map((blocker) => <div key={blocker} className="mt-2 rounded bg-black/30 px-2 py-1.5 text-xs text-gray-500">{blocker}</div>)}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
