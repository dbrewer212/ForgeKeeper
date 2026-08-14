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

type BindingRequest = {
  serviceId: string;
  endpoint: string;
  healthPath: string;
  executable?: string;
  externallyManaged?: boolean;
  owner?: string;
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

  const [openClawEndpoint, setOpenClawEndpoint] = useState("http://127.0.0.1:18789");
  const [openClawHealthPath, setOpenClawHealthPath] = useState("/healthz");
  const [openClawMessage, setOpenClawMessage] = useState<string>();

  async function refreshReadiness() {
    setBusy(true);
    setError(undefined);
    try {
      const runtime = getFoundryMeshRuntime();
      await runtime.initialize();
      hydrateFields(runtime);
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

  async function bindService(request: BindingRequest, onSuccess: (message: string) => void) {
    setBusy(true);
    setError(undefined);
    onSuccess("");
    try {
      const runtime = getFoundryMeshRuntime();
      await runtime.initialize();
      const service = runtime.services.get(request.serviceId);
      if (!service) throw new Error(`Service descriptor ${request.serviceId} is missing.`);
      if (!request.endpoint.trim()) throw new Error("Enter a localhost endpoint before binding.");
      if (!request.externallyManaged && !request.executable?.trim()) {
        throw new Error("Enter the local executable path before binding.");
      }

      const rawControl = service.metadata?.localControl;
      const existingControl = rawControl && typeof rawControl === "object" ? rawControl as Record<string, unknown> : {};
      const endpoint = request.endpoint.trim().replace(/\/$/, "");
      const healthPath = request.healthPath.trim() || "/healthz";
      const probeUrl = `${endpoint}/${healthPath.replace(/^\//, "")}`;

      runtime.services.update(request.serviceId, {
        endpoint,
        healthPath,
        metadata: {
          ...service.metadata,
          localControl: {
            ...existingControl,
            executable: request.externallyManaged ? undefined : request.executable?.trim(),
            probeUrl,
            timeoutMs: 2000,
            externallyManaged: request.externallyManaged === true,
            owner: request.owner,
          },
        },
      });
      await runtime.save();

      const issues = runtime.serviceLifecycle.validationIssues(request.serviceId);
      if (issues.length > 0) throw new Error(issues.join(" "));
      onSuccess("Machine-local configuration is bound and structurally valid.");
      await refreshReadiness();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function probeService(serviceId: string, label: string, onSuccess: (message: string) => void) {
    setBusy(true);
    setError(undefined);
    onSuccess("");
    try {
      const runtime = getFoundryMeshRuntime();
      await runtime.initialize();
      const issues = runtime.serviceLifecycle.validationIssues(serviceId);
      if (issues.length > 0) throw new Error(issues.join(" "));
      const probe = await runtime.serviceLifecycle.inspectProbe(serviceId);
      if (!probe.online) throw new Error(probe.detail ?? `${label} did not answer its localhost health probe.`);
      onSuccess(`${label} live probe passed. ${probe.detail ?? ""}`.trim());
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }

  async function commissionService(
    serviceId: string,
    workerId: string,
    label: string,
    onSuccess: (message: string) => void,
  ) {
    setBusy(true);
    setError(undefined);
    onSuccess("");
    const runtime = getFoundryMeshRuntime();
    try {
      await runtime.initialize();
      const issues = runtime.serviceLifecycle.validationIssues(serviceId);
      if (issues.length > 0) throw new Error(issues.join(" "));

      const probe = await runtime.serviceLifecycle.inspectProbe(serviceId);
      if (!probe.online) throw new Error(probe.detail ?? `${label} did not answer its localhost health probe.`);

      await runtime.commissioning.transition(
        workerId,
        "commissioning",
        `Human-authorized ${label} commissioning.`,
      );
      runtime.services.update(serviceId, {
        commissioningState: "commissioning",
        enabled: true,
      });
      await runtime.save();

      await runtime.serviceLifecycle.start(serviceId);
      await runtime.commissioning.transition(
        workerId,
        "active",
        `${label} passed local health and service verification.`,
      );
      runtime.services.update(serviceId, {
        commissioningState: "active",
        runtimeState: "online",
        enabled: true,
      });
      await runtime.save();

      onSuccess(`${label.toUpperCase()} COMMISSIONED — worker active, service online, localhost probe passed.`);
      await refreshReadiness();
    } catch (cause) {
      const worker = runtime.workers.get(workerId);
      if (worker?.identity.commissioningState === "commissioning") {
        try {
          await runtime.commissioning.transition(workerId, "failed", `${label} commissioning failed.`);
        } catch {
          // Preserve the original commissioning error.
        }
      }
      const service = runtime.services.get(serviceId);
      if (service?.commissioningState === "commissioning") {
        runtime.services.update(serviceId, {
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

  function hydrateFields(runtime: ReturnType<typeof getFoundryMeshRuntime>) {
    const ollama = runtime.services.get("ollama-service");
    if (ollama) {
      if (ollama.endpoint) setOllamaEndpoint(ollama.endpoint);
      if (ollama.healthPath) setOllamaHealthPath(ollama.healthPath);
      const control = ollama.metadata?.localControl;
      if (control && typeof control === "object") {
        const executable = (control as Record<string, unknown>).executable;
        if (typeof executable === "string" && executable.trim()) setOllamaExecutable(executable);
      }
    }

    const openClaw = runtime.services.get("openclaw-service");
    if (openClaw) {
      if (openClaw.endpoint) setOpenClawEndpoint(openClaw.endpoint);
      if (openClaw.healthPath) setOpenClawHealthPath(openClaw.healthPath);
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
              Verification stays non-destructive. Explicit service commissioning controls require a successful local probe before activation.
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
            <p className="mt-1 text-sm text-gray-400">Foundry-managed local process with machine-local executable binding.</p>
          </div>
          <div className="text-xs text-gray-500">Expected endpoint: localhost:11434</div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <label className="text-xs text-gray-400 lg:col-span-2">Executable
            <input value={ollamaExecutable} onChange={(event) => setOllamaExecutable(event.target.value)} placeholder="C:\\...\\ollama.exe" className="mt-1 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-emerald-700" />
          </label>
          <label className="text-xs text-gray-400">Endpoint
            <input value={ollamaEndpoint} onChange={(event) => setOllamaEndpoint(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-emerald-700" />
          </label>
          <label className="text-xs text-gray-400">Health path
            <input value={ollamaHealthPath} onChange={(event) => setOllamaHealthPath(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-emerald-700" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void bindService({ serviceId: "ollama-service", endpoint: ollamaEndpoint, healthPath: ollamaHealthPath, executable: ollamaExecutable }, setOllamaMessage)} className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700 disabled:opacity-50">Bind Ollama</button>
          <button type="button" disabled={busy} onClick={() => void probeService("ollama-service", "Ollama", setOllamaMessage)} className="rounded-lg bg-sky-900 px-4 py-2 text-sm text-sky-100 hover:bg-sky-800 disabled:opacity-50">Probe Ollama</button>
          <button type="button" disabled={busy} onClick={() => void commissionService("ollama-service", "ollama", "Ollama", setOllamaMessage)} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50">Commission Ollama</button>
        </div>
        {ollamaMessage && <div className="mt-4 rounded-lg border border-emerald-900 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">{ollamaMessage}</div>}
      </div>

      <div className="rounded-xl border border-orange-900/60 bg-gray-950 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-orange-500">Second external subsystem</div>
            <h2 className="mt-1 text-xl font-semibold text-orange-300">OpenClaw Automation Runtime</h2>
            <p className="mt-1 text-sm text-gray-400">Externally managed by the OpenClaw Scheduled Task; Foundry owns health, state, governance, and commissioning.</p>
          </div>
          <div className="text-xs text-gray-500">Expected endpoint: localhost:18789</div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <label className="text-xs text-gray-400">Endpoint
            <input value={openClawEndpoint} onChange={(event) => setOpenClawEndpoint(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-orange-700" />
          </label>
          <label className="text-xs text-gray-400">Health path
            <input value={openClawHealthPath} onChange={(event) => setOpenClawHealthPath(event.target.value)} className="mt-1 w-full rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-orange-700" />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => void bindService({ serviceId: "openclaw-service", endpoint: openClawEndpoint, healthPath: openClawHealthPath, externallyManaged: true, owner: "OpenClaw Scheduled Task" }, setOpenClawMessage)} className="rounded-lg bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700 disabled:opacity-50">Bind OpenClaw</button>
          <button type="button" disabled={busy} onClick={() => void probeService("openclaw-service", "OpenClaw", setOpenClawMessage)} className="rounded-lg bg-sky-900 px-4 py-2 text-sm text-sky-100 hover:bg-sky-800 disabled:opacity-50">Probe OpenClaw</button>
          <button type="button" disabled={busy} onClick={() => void commissionService("openclaw-service", "openclaw", "OpenClaw", setOpenClawMessage)} className="rounded-lg bg-orange-700 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50">Commission OpenClaw</button>
        </div>
        {openClawMessage && <div className="mt-4 rounded-lg border border-orange-900 bg-orange-950/30 px-4 py-3 text-sm text-orange-300">{openClawMessage}</div>}
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
