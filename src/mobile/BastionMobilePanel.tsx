import { useEffect, useMemo, useState } from "react";
import { buildBastionAlerts } from "../bastion/alertBus";
import type { FoundryRemoteCommandResult } from "../foundry-link/remoteCommands";
import {
  getMobileRemoteCommandResults,
  getPendingRemoteCommands,
  queueRemoteApproval,
  queueRemoteTool,
} from "../foundry-link/remoteCommands";
import type { WatcherSystemSnapshot } from "../mesh/localServiceAdapters";
import type { ServiceDescriptor } from "../mesh/serviceRegistry";
import type { RegisteredWorker, SystemHealth } from "../mesh/types";
import type { ForgekeeperState } from "../state/useForgekeeperState";

const LINK_CONFIG_KEY = "forgekeeper.foundry-link.mobile.v1";
const COMMAND_LABELS_KEY = "forgekeeper.bastion-mobile.command-labels.v1";

type MobileLinkConfig = {
  endpoint: string;
  token: string;
  deviceId: string;
  revision: number;
};

type BastionMobileSnapshot = {
  sampledAt: string;
  health: SystemHealth;
  safeMode: boolean;
  workers: RegisteredWorker[];
  services: ServiceDescriptor[];
  resources: unknown[];
  pendingApprovals: number;
  telemetry?: WatcherSystemSnapshot;
};

function loadLinkConfig(): MobileLinkConfig | null {
  try {
    const raw = window.localStorage.getItem(LINK_CONFIG_KEY);
    return raw ? JSON.parse(raw) as MobileLinkConfig : null;
  } catch {
    return null;
  }
}

function readLabels(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(COMMAND_LABELS_KEY);
    return raw ? JSON.parse(raw) as Record<string, string> : {};
  } catch {
    return {};
  }
}

function rememberLabel(commandId: string, label: string) {
  const labels = readLabels();
  labels[commandId] = label;
  const retained = Object.fromEntries(Object.entries(labels).slice(-80));
  window.localStorage.setItem(COMMAND_LABELS_KEY, JSON.stringify(retained));
}

function isSnapshot(value: unknown): value is BastionMobileSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BastionMobileSnapshot>;
  return Boolean(candidate.health && Array.isArray(candidate.services) && Array.isArray(candidate.workers));
}

function percent(used?: number, total?: number): number | undefined {
  if (typeof used !== "number" || typeof total !== "number" || total <= 0) return undefined;
  return Math.max(0, Math.min(100, used / total * 100));
}

function toneForHealth(state?: string): string {
  if (state === "critical" || state === "safe-mode") return "border-rose-700/45 bg-rose-950/30 text-rose-200";
  if (state === "degraded") return "border-amber-700/45 bg-amber-950/30 text-amber-200";
  return "border-emerald-700/40 bg-emerald-950/25 text-emerald-200";
}

function toneForAlert(severity: string): string {
  if (severity === "emergency" || severity === "critical") return "border-rose-800/55 bg-rose-950/25 text-rose-100";
  if (severity === "approval") return "border-amber-700/50 bg-amber-950/30 text-amber-100";
  if (severity === "attention") return "border-orange-800/45 bg-orange-950/20 text-orange-100";
  return "border-slate-800 bg-black/20 text-slate-300";
}

export function BastionMobilePanel({ state }: { state: ForgekeeperState }) {
  const [expanded, setExpanded] = useState(false);
  const [paired, setPaired] = useState(Boolean(loadLinkConfig()?.token));
  const [results, setResults] = useState<FoundryRemoteCommandResult[]>(() => getMobileRemoteCommandResults());
  const [pendingCount, setPendingCount] = useState(() => getPendingRemoteCommands().length);
  const [message, setMessage] = useState("");
  const [handledApprovals, setHandledApprovals] = useState<Set<string>>(() => new Set());

  const snapshot = useMemo(() => {
    for (const result of results) {
      if (result.state === "completed" && isSnapshot(result.result)) return result.result;
    }
    return undefined;
  }, [results]);

  const approvalResults = useMemo(
    () => results.filter((result) => result.state === "approval-required" && result.approvalId && !handledApprovals.has(result.approvalId)),
    [handledApprovals, results],
  );

  const alerts = useMemo(() => buildBastionAlerts(state, snapshot), [state, snapshot]);
  const labels = readLabels();
  const telemetry = snapshot?.telemetry;
  const memoryPercent = percent(telemetry?.usedMemoryBytes, telemetry?.totalMemoryBytes);
  const degradedServices = snapshot?.services.filter((service) => service.runtimeState === "degraded" || service.runtimeState === "failed").length ?? 0;

  function refreshLocalState() {
    setPaired(Boolean(loadLinkConfig()?.token));
    setResults(getMobileRemoteCommandResults());
    setPendingCount(getPendingRemoteCommands().length);
  }

  function request(label: string, toolName: string, payload: unknown = {}, reason?: string) {
    if (!loadLinkConfig()?.token) {
      setMessage("Pair this phone with Foundry Link before sending Bastion commands.");
      return;
    }
    const command = queueRemoteTool(toolName, payload, reason ?? `${label} requested from Bastion Mobile.`);
    rememberLabel(command.id, label);
    setPendingCount(getPendingRemoteCommands().length);
    setMessage(`${label} queued for the workstation.`);
  }

  function refreshSnapshot() {
    const alreadyQueued = getPendingRemoteCommands().some((command) => command.toolName === "bastion.mobile_snapshot");
    if (!alreadyQueued) request("Refresh Bastion state", "bastion.mobile_snapshot");
  }

  function decideApproval(approvalId: string, approve: boolean) {
    const command = queueRemoteApproval(
      approvalId,
      approve,
      approve ? "Approved from Bastion Mobile." : "Rejected from Bastion Mobile.",
    );
    rememberLabel(command.id, approve ? "Approve request" : "Reject request");
    setHandledApprovals((current) => new Set([...current, approvalId]));
    setPendingCount(getPendingRemoteCommands().length);
    setMessage(approve ? "Approval queued for workstation execution." : "Rejection queued for the workstation.");
  }

  useEffect(() => {
    refreshLocalState();
    const localTimer = window.setInterval(refreshLocalState, 1000);
    const snapshotTimer = window.setInterval(() => {
      if (loadLinkConfig()?.token) refreshSnapshot();
    }, 15000);
    const initialTimer = window.setTimeout(() => {
      if (loadLinkConfig()?.token) refreshSnapshot();
    }, 1200);
    return () => {
      window.clearInterval(localTimer);
      window.clearInterval(snapshotTimer);
      window.clearTimeout(initialTimer);
    };
  }, []);

  const launchTargets = [
    { label: "Anycubic Slicer", path: state.settings?.anycubicSlicerPath ?? "AnycubicSlicerNext.exe" },
    { label: "OrcaSlicer", path: state.settings?.orcaSlicerPath ?? "OrcaSlicer.exe" },
    { label: "Blender", path: state.settings?.blenderPath ?? "blender.exe" },
  ];

  return (
    <section className="mb-3 rounded-2xl border border-[#61451f]/60 bg-[linear-gradient(145deg,rgba(24,20,15,0.96),rgba(9,9,8,0.96))] p-4 shadow-forge">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.26em] text-amber-500">Bastion Mobile</div>
          <div className="mt-1 text-base font-semibold text-amber-100">Roaming supervisory console</div>
          <div className="mt-1 text-xs leading-5 text-slate-500">
            {paired
              ? snapshot ? `${snapshot.health.state.toUpperCase()} · ${degradedServices} degraded · ${snapshot.pendingApprovals} approvals` : "Paired · awaiting first workstation snapshot"
              : "Pair Foundry Link to enable workstation control"}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${paired ? toneForHealth(snapshot?.health.state) : "border-slate-700 bg-slate-950/70 text-slate-500"}`}>
            {paired ? snapshot?.health.state ?? "Linked" : "Offline"}
          </span>
          {pendingCount > 0 ? <span className="text-[9px] uppercase tracking-[0.14em] text-amber-500">{pendingCount} queued</span> : null}
        </div>
      </button>

      {expanded ? (
        <div className="mt-4 space-y-4 border-t border-slate-800/80 pt-4">
          {!paired ? (
            <div className="rounded-xl border border-amber-800/35 bg-amber-950/20 p-3 text-xs leading-5 text-amber-100/75">
              Bastion control stays disabled until this device has an authenticated Foundry Link pairing.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="CPU" value={typeof telemetry?.cpuUsagePercent === "number" ? `${telemetry.cpuUsagePercent.toFixed(0)}%` : "—"} />
                <Metric label="RAM" value={memoryPercent !== undefined ? `${memoryPercent.toFixed(0)}%` : "—"} />
                <Metric label="Services" value={snapshot ? `${snapshot.services.filter((service) => service.runtimeState === "online").length}/${snapshot.services.length}` : "—"} />
                <Metric label="Approvals" value={String(snapshot?.pendingApprovals ?? approvalResults.length)} />
              </div>

              {snapshot ? (
                <div className={`rounded-xl border p-3 ${toneForHealth(snapshot.health.state)}`}>
                  <div className="text-[10px] uppercase tracking-[0.18em] opacity-70">Foundry health</div>
                  <div className="mt-1 text-sm font-semibold uppercase">{snapshot.health.state}</div>
                  <div className="mt-1 text-xs leading-5 opacity-80">{snapshot.health.summary}</div>
                </div>
              ) : null}

              {alerts.length > 0 ? (
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Alert Bus</div>
                    <div className="text-[9px] uppercase tracking-[0.14em] text-slate-600">{alerts.length} active</div>
                  </div>
                  <div className="space-y-2">
                    {alerts.slice(0, 6).map((alert) => (
                      <div key={alert.id} className={`rounded-xl border p-3 ${toneForAlert(alert.severity)}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[9px] uppercase tracking-[0.16em] opacity-60">{alert.source} · {alert.severity}</div>
                            <div className="mt-1 text-sm font-semibold">{alert.title}</div>
                          </div>
                          <span className="shrink-0 rounded-full border border-current/20 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] opacity-70">{alert.delivery}</span>
                        </div>
                        <div className="mt-1 text-[11px] leading-5 opacity-70">{alert.message}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {approvalResults.length > 0 ? (
                <div>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-300">Approval required</div>
                  <div className="space-y-2">
                    {approvalResults.slice(0, 4).map((result) => (
                      <div key={result.commandId} className="rounded-xl border border-rose-800/45 bg-rose-950/20 p-3">
                        <div className="text-sm font-semibold text-rose-100">{labels[result.commandId] ?? "Governed workstation action"}</div>
                        <div className="mt-1 text-[11px] leading-5 text-rose-200/65">Bastion requires explicit operator authority before this action can execute.</div>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => decideApproval(result.approvalId!, false)} className="min-h-[46px] rounded-xl border border-slate-700 bg-slate-900/80 text-sm font-semibold text-slate-300">Reject</button>
                          <button type="button" onClick={() => decideApproval(result.approvalId!, true)} className="min-h-[46px] rounded-xl border border-amber-700/55 bg-amber-950/35 text-sm font-semibold text-amber-100">Approve</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Supervisory controls</div>
                <div className="grid grid-cols-2 gap-2">
                  <Control label="Refresh state" onClick={refreshSnapshot} />
                  <Control label="Enter Safe Mode" danger onClick={() => request("Enter Safe Mode", "mesh.enter_safe_mode", { reason: "Protective Safe Mode requested by Foundry owner from Bastion Mobile." })} />
                  <Control label="Exit Safe Mode" onClick={() => request("Exit Safe Mode", "mesh.exit_safe_mode")} />
                  <Control label="Probe all services" onClick={() => snapshot?.services.forEach((service) => request(`Probe ${service.name}`, "system.service.probe", { serviceId: service.id }))} />
                </div>
              </div>

              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Launch Bay</div>
                <div className="grid grid-cols-3 gap-2">
                  {launchTargets.map((target) => (
                    <button key={target.label} type="button" onClick={() => request(`Launch ${target.label}`, "workstation.launch_tool", { toolPath: target.path })} className="min-h-[56px] rounded-xl border border-[#5a4325] bg-[#191713] px-2 text-xs font-semibold text-amber-100 active:scale-[0.97]">
                      {target.label}
                    </button>
                  ))}
                </div>
              </div>

              {snapshot?.services.length ? (
                <div>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Foundry services</div>
                  <div className="space-y-2">
                    {snapshot.services.map((service) => (
                      <div key={service.id} className="rounded-xl border border-slate-800 bg-black/20 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-200">{service.name}</div>
                            <div className="mt-0.5 text-[10px] uppercase tracking-[0.15em] text-slate-500">{service.commissioningState} · {service.runtimeState}</div>
                          </div>
                          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${service.runtimeState === "online" ? "bg-emerald-500" : service.runtimeState === "degraded" || service.runtimeState === "failed" ? "bg-rose-500" : "bg-slate-600"}`} />
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-1.5">
                          <MiniControl label="Probe" onClick={() => request(`Probe ${service.name}`, "system.service.probe", { serviceId: service.id })} />
                          <MiniControl label={service.runtimeState === "online" ? "Restart" : "Start"} onClick={() => request(`${service.runtimeState === "online" ? "Restart" : "Start"} ${service.name}`, service.runtimeState === "online" ? "system.service.restart" : "system.service.start", { serviceId: service.id })} />
                          <MiniControl label="Stop" danger onClick={() => request(`Stop ${service.name}`, "system.service.stop", { serviceId: service.id })} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Recent remote activity</div>
                <div className="space-y-1.5">
                  {results.slice(0, 6).map((result) => (
                    <div key={result.commandId} className="flex items-start justify-between gap-3 rounded-lg border border-slate-800/80 bg-black/20 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-slate-300">{labels[result.commandId] ?? result.commandId}</div>
                        {result.error ? <div className="mt-0.5 line-clamp-2 text-[10px] text-rose-300/80">{result.error}</div> : null}
                      </div>
                      <span className={`shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em] ${result.state === "completed" ? "text-emerald-400" : result.state === "approval-required" ? "text-amber-400" : "text-rose-400"}`}>{result.state}</span>
                    </div>
                  ))}
                  {results.length === 0 ? <div className="text-xs text-slate-600">No remote Bastion actions have completed yet.</div> : null}
                </div>
              </div>
            </>
          )}

          {message ? <div className="text-[11px] leading-5 text-slate-500">{message}</div> : null}
          <div className="text-[10px] leading-5 text-slate-600">Remote commands expire after five minutes. Durable Foundry records continue to use normal conflict-aware synchronization; control-plane traffic does not overwrite the workspace.</div>
        </div>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-black/20 p-3">
      <div className="text-[9px] uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-amber-100">{value}</div>
    </div>
  );
}

function Control({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`min-h-[54px] rounded-xl border px-3 text-sm font-semibold active:scale-[0.97] ${danger ? "border-rose-800/55 bg-rose-950/25 text-rose-200" : "border-slate-700 bg-slate-900/70 text-slate-200"}`}>
      {label}
    </button>
  );
}

function MiniControl({ label, onClick, danger = false }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`min-h-[40px] rounded-lg border px-2 text-[11px] font-semibold active:scale-[0.97] ${danger ? "border-rose-900/55 bg-rose-950/20 text-rose-300" : "border-slate-700 bg-slate-900/70 text-slate-300"}`}>
      {label}
    </button>
  );
}
