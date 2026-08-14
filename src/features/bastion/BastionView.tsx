import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getFoundryMeshRuntime } from "../../mesh";
import type { StewardBrief } from "../../mesh/productionSteward";
import type { WatcherSystemSnapshot } from "../../mesh/localServiceAdapters";
import type { RegisteredWorker } from "../../mesh/types";
import type { ServiceDescriptor } from "../../mesh/serviceRegistry";

type LaunchGroup = "stream" | "maker" | "system";

type LaunchTarget = {
  id: string;
  label: string;
  target: string;
  group: LaunchGroup;
  enabled: boolean;
};

type StartupStatus = {
  enabled: boolean;
  command?: string;
};

type BastionSnapshot = {
  safeMode: boolean;
  healthState: string;
  healthSummary: string;
  services: ServiceDescriptor[];
  workers: RegisteredWorker[];
  steward?: StewardBrief;
  telemetry?: WatcherSystemSnapshot;
  approvals: number;
  bastionCommissioningState?: string;
  bastionRuntimeState?: string;
};

const GROUP_LABELS: Record<LaunchGroup, string> = {
  stream: "Streaming",
  maker: "Maker",
  system: "System",
};

function defaultLaunchTargets(state: any): LaunchTarget[] {
  return [
    { id: "obs", label: "OBS Studio", target: "C:\\Program Files\\obs-studio\\bin\\64bit\\obs64.exe", group: "stream", enabled: true },
    { id: "discord", label: "Discord", target: "Discord.exe", group: "stream", enabled: true },
    { id: "terminal", label: "Terminal", target: "wt.exe", group: "system", enabled: true },
    { id: "explorer", label: "Explorer", target: "explorer.exe", group: "system", enabled: true },
    { id: "orca", label: "OrcaSlicer", target: state.settings?.orcaSlicerPath ?? "OrcaSlicer.exe", group: "maker", enabled: true },
    { id: "anycubic", label: "Anycubic Slicer", target: state.settings?.anycubicSlicerPath ?? "AnycubicSlicerNext.exe", group: "maker", enabled: true },
    { id: "blender", label: "Blender", target: state.settings?.blenderPath ?? "blender.exe", group: "maker", enabled: true },
    { id: "meshy", label: "Meshy", target: state.settings?.meshyUrl ?? "https://www.meshy.ai/", group: "maker", enabled: true },
  ];
}

function percent(used?: number, total?: number): number | undefined {
  if (!used || !total || total <= 0) return undefined;
  return Math.max(0, Math.min(100, (used / total) * 100));
}

function gib(bytes?: number): string {
  if (typeof bytes !== "number") return "—";
  return `${(bytes / 1073741824).toFixed(bytes > 10737418240 ? 0 : 1)} GiB`;
}

function healthTone(state: string) {
  if (state === "safe-mode" || state === "critical") return "border-red-700/70 bg-red-950/40 text-red-200";
  if (state === "degraded") return "border-amber-700/70 bg-amber-950/40 text-amber-200";
  if (state === "busy") return "border-sky-800/70 bg-sky-950/30 text-sky-200";
  return "border-emerald-800/70 bg-emerald-950/30 text-emerald-200";
}

export function BastionView({ state, onExit }: { state: any; onExit: () => void }) {
  const [snapshot, setSnapshot] = useState<BastionSnapshot>();
  const [startup, setStartup] = useState<StartupStatus>({ enabled: false });
  const [launchTargets, setLaunchTargets] = useState<LaunchTarget[]>(() => defaultLaunchTargets(state));
  const [editLaunchers, setEditLaunchers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  async function refresh() {
    setError(undefined);
    try {
      const runtime = getFoundryMeshRuntime();
      await runtime.initialize();

      const service = runtime.services.get("bastion-service");
      const stored = service?.metadata?.bastion;
      if (stored && typeof stored === "object") {
        const candidates = (stored as Record<string, unknown>).launchTargets;
        if (Array.isArray(candidates) && candidates.length > 0) {
          setLaunchTargets(candidates.filter(isLaunchTarget));
        }
      }

      const [steward, telemetry, startupStatus] = await Promise.all([
        runtime.productionSteward.inspect().catch(() => undefined),
        invoke<WatcherSystemSnapshot>("watcher_system_snapshot").catch(() => undefined),
        invoke<StartupStatus>("bastion_startup_status").catch(() => ({ enabled: false })),
      ]);

      const health = runtime.getSystemHealth();
      setSnapshot({
        safeMode: runtime.isSafeMode(),
        healthState: health.state,
        healthSummary: health.summary,
        services: runtime.services.list(),
        workers: runtime.workers.list(),
        steward,
        telemetry,
        approvals: runtime.approvals.list().length,
        bastionCommissioningState: service?.commissioningState,
        bastionRuntimeState: service?.runtimeState,
      });
      setStartup(startupStatus);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(id);
  }, []);

  const activeServices = useMemo(
    () => snapshot?.services.filter((service) => service.commissioningState === "active" && service.runtimeState === "online").length ?? 0,
    [snapshot],
  );
  const degradedServices = useMemo(
    () => snapshot?.services.filter((service) => service.runtimeState === "degraded" || service.runtimeState === "failed").length ?? 0,
    [snapshot],
  );

  async function launch(target: LaunchTarget) {
    if (!target.target.trim()) {
      setError(`${target.label} does not have a launch target yet.`);
      return;
    }
    setError(undefined);
    setMessage(undefined);
    try {
      if (/^https?:\/\//i.test(target.target)) {
        window.open(target.target, "_blank", "noopener,noreferrer");
      } else {
        await invoke("launch_external_tool", { toolPath: target.target, assetPath: null });
      }
      setMessage(`${target.label} launch requested.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function saveLaunchers() {
    setBusy(true);
    setError(undefined);
    try {
      const runtime = getFoundryMeshRuntime();
      await runtime.initialize();
      const service = runtime.services.get("bastion-service");
      if (!service) throw new Error("Bastion service descriptor is missing.");
      const existing = service.metadata?.bastion;
      runtime.services.update("bastion-service", {
        metadata: {
          ...service.metadata,
          bastion: {
            ...(existing && typeof existing === "object" ? existing as Record<string, unknown> : {}),
            launchTargets,
          },
        },
      });
      await runtime.save();
      setEditLaunchers(false);
      setMessage("Bastion quick-launch configuration saved.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function toggleStartup() {
    setBusy(true);
    setError(undefined);
    try {
      const next = !startup.enabled;
      const status = await invoke<StartupStatus>("bastion_set_startup", { enabled: next });
      setStartup(status);
      setMessage(next ? "Bastion will open at Windows sign-in." : "Bastion startup entry removed.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function toggleSafeMode() {
    setBusy(true);
    setError(undefined);
    try {
      const runtime = getFoundryMeshRuntime();
      await runtime.initialize();
      if (runtime.isSafeMode()) {
        runtime.exitSafeMode();
        setMessage("Safe Mode exited by Foundry owner.");
      } else {
        runtime.enterSafeMode("Human-authorized emergency Safe Mode from Bastion.");
        setMessage("SAFE MODE ENTERED — autonomous execution admission is paused.");
      }
      await runtime.save();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function commissionBastion() {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    const runtime = getFoundryMeshRuntime();
    try {
      await runtime.initialize();
      await invoke<StartupStatus>("bastion_startup_status");
      const domain = runtime.services.get("foundry-domain");
      if (domain?.commissioningState !== "active" || domain.runtimeState !== "online") {
        throw new Error("Foundry Domain Services must be active before Bastion can be commissioned.");
      }

      await runtime.commissioning.transition("bastion", "commissioning", "Human-authorized Bastion commissioning.");
      runtime.services.update("bastion-service", {
        commissioningState: "commissioning",
        enabled: true,
        adapterRequired: false,
        metadata: {
          ...runtime.services.get("bastion-service")?.metadata,
          executionModel: "foundry-native-touch-surface",
        },
      });
      await runtime.save();

      await runtime.commissioning.transition("bastion", "active", "Bastion touch supervisory surface passed native readiness verification.");
      runtime.services.update("bastion-service", { commissioningState: "active", runtimeState: "online", enabled: true, adapterRequired: false });
      await runtime.save();

      setMessage("BASTION COMMISSIONED — native touch supervisory surface ACTIVE.");
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  const telemetry = snapshot?.telemetry;
  const memoryPercent = percent(telemetry?.usedMemoryBytes, telemetry?.totalMemoryBytes);
  const disk = telemetry?.disks?.[0];
  const diskUsed = disk ? disk.totalBytes - disk.freeBytes : undefined;
  const diskPercent = percent(diskUsed, disk?.totalBytes);
  const steward = snapshot?.steward;

  return (
    <div className="min-h-screen bg-[#0b0d0e] text-stone-100 selection:bg-amber-700/50">
      <div className="mx-auto min-h-screen w-full max-w-[920px] bg-[radial-gradient(circle_at_top,_rgba(180,105,34,0.13),_transparent_32%)] px-3 pb-10 pt-3 sm:px-5">
        <header className="sticky top-0 z-20 rounded-2xl border border-[#624421]/70 bg-[#111416]/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-600">Fenrir Forgeworks · Foundry System Spine</div>
              <h1 className="mt-1 text-3xl font-semibold tracking-tight text-amber-200">BASTION</h1>
              <p className="mt-1 text-sm text-stone-400">Touch supervisory surface · operator authority remains human.</p>
            </div>
            <div className={`rounded-xl border px-3 py-2 text-right ${healthTone(snapshot?.healthState ?? "degraded")}`}>
              <div className="text-[10px] uppercase tracking-[0.2em] opacity-70">System state</div>
              <div className="mt-0.5 text-sm font-bold uppercase">{snapshot?.healthState ?? "Loading"}</div>
            </div>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-black/60">
            <div className={`h-full transition-all ${snapshot?.safeMode ? "w-full bg-red-600" : degradedServices ? "w-2/3 bg-amber-500" : "w-full bg-amber-600"}`} />
          </div>
        </header>

        {error && <div className="mt-3 rounded-xl border border-red-800/70 bg-red-950/50 p-4 text-sm text-red-200">{error}</div>}
        {message && <div className="mt-3 rounded-xl border border-amber-800/60 bg-amber-950/25 p-4 text-sm text-amber-200">{message}</div>}

        <section className="mt-4 grid grid-cols-2 gap-3">
          <ResourceTile label="CPU" value={typeof telemetry?.cpuUsagePercent === "number" ? `${telemetry.cpuUsagePercent.toFixed(0)}%` : "—"} detail={`${telemetry?.processCount ?? "—"} processes`} level={telemetry?.cpuUsagePercent} />
          <ResourceTile label="RAM" value={memoryPercent !== undefined ? `${memoryPercent.toFixed(0)}%` : "—"} detail={`${gib(telemetry?.usedMemoryBytes)} / ${gib(telemetry?.totalMemoryBytes)}`} level={memoryPercent} />
          <ResourceTile label="Storage" value={diskPercent !== undefined ? `${diskPercent.toFixed(0)}%` : "—"} detail={disk ? `${disk.name} · ${gib(disk.freeBytes)} free` : "No disk sample"} level={diskPercent} />
          <ResourceTile label="GPU" value={telemetry?.gpu?.name ? "ONLINE" : "PENDING"} detail={telemetry?.gpu?.name ?? "AMD telemetry provider boundary"} />
        </section>

        <Panel title="Foundry Workers" subtitle={`${activeServices}/${snapshot?.services.length ?? 0} services active`}>
          <div className="grid grid-cols-2 gap-2">
            {snapshot?.services.map((service) => (
              <div key={service.id} className="rounded-xl border border-stone-800 bg-black/25 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-stone-100">{service.name.replace(" Local Inference", "").replace(" Automation Runtime", "").replace(" Workspace", "").replace(" Monitoring", "")}</div>
                    <div className="mt-1 text-[11px] uppercase tracking-wide text-stone-500">{service.commissioningState}</div>
                  </div>
                  <span className={`mt-1 h-3 w-3 shrink-0 rounded-full ${service.runtimeState === "online" ? "bg-emerald-500" : service.runtimeState === "degraded" ? "bg-amber-500" : "bg-stone-700"}`} />
                </div>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Current Activity" subtitle={steward ? `Production Steward · ${steward.mode.toUpperCase()}` : "Production context"}>
          <div className="rounded-xl border border-stone-800 bg-black/25 p-4">
            <div className="text-[11px] uppercase tracking-[0.18em] text-amber-600">Smallest meaningful action</div>
            <div className="mt-1 text-lg font-semibold text-amber-100">{steward?.smallestMeaningfulAction ?? "No active production session."}</div>
            {steward?.blocker && <div className="mt-3 rounded-lg border border-amber-800/60 bg-amber-950/30 p-3 text-sm text-amber-200">Blocked: {steward.blocker}</div>}
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <Metric label="Parked thoughts" value={String(steward?.parkedThoughtCount ?? 0)} />
              <Metric label="Completion ready" value={steward?.completionReady ? "YES" : "NO"} />
            </div>
          </div>
        </Panel>

        <Panel title="Attention Required" subtitle="Faults, approvals, and operator action">
          <div className="grid grid-cols-3 gap-2">
            <Metric label="Approvals" value={String(snapshot?.approvals ?? 0)} />
            <Metric label="Degraded" value={String(degradedServices)} />
            <Metric label="Safe Mode" value={snapshot?.safeMode ? "ON" : "OFF"} />
          </div>
          <div className="mt-3 rounded-xl border border-stone-800 bg-black/25 p-3 text-sm text-stone-400">
            {snapshot?.healthSummary ?? "Reading Foundry health..."}
          </div>
        </Panel>

        <Panel
          title="Quick Launch"
          subtitle="Streaming, maker, and system access without hunting through Windows"
          action={
            <button type="button" onClick={() => setEditLaunchers((value) => !value)} className="min-h-[48px] rounded-xl border border-stone-700 bg-stone-900 px-4 text-sm font-medium text-stone-200 active:scale-[0.98]">
              {editLaunchers ? "Done" : "Edit"}
            </button>
          }
        >
          {editLaunchers ? (
            <div className="space-y-3">
              {launchTargets.map((target, index) => (
                <div key={target.id} className="rounded-xl border border-stone-800 bg-black/25 p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
                    <input value={target.label} onChange={(event) => setLaunchTargets((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))} className="min-h-[50px] rounded-lg border border-stone-700 bg-[#111416] px-3 text-base outline-none focus:border-amber-600" />
                    <select value={target.group} onChange={(event) => setLaunchTargets((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, group: event.target.value as LaunchGroup } : item))} className="min-h-[50px] rounded-lg border border-stone-700 bg-[#111416] px-3 outline-none focus:border-amber-600">
                      <option value="stream">Streaming</option>
                      <option value="maker">Maker</option>
                      <option value="system">System</option>
                    </select>
                  </div>
                  <input value={target.target} onChange={(event) => setLaunchTargets((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, target: event.target.value } : item))} placeholder="Executable path, command, or https:// URL" className="mt-2 min-h-[50px] w-full rounded-lg border border-stone-700 bg-[#111416] px-3 text-sm outline-none focus:border-amber-600" />
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setLaunchTargets((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: !item.enabled } : item))} className="min-h-[48px] flex-1 rounded-lg bg-stone-800 px-3 text-sm active:scale-[0.98]">{target.enabled ? "Enabled" : "Disabled"}</button>
                    <button type="button" onClick={() => setLaunchTargets((items) => items.filter((_, itemIndex) => itemIndex !== index))} className="min-h-[48px] rounded-lg border border-red-900 bg-red-950/40 px-4 text-sm text-red-300 active:scale-[0.98]">Remove</button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => setLaunchTargets((items) => [...items, { id: `launch-${Date.now()}`, label: "New Shortcut", target: "", group: "stream", enabled: true }])} className="min-h-[54px] w-full rounded-xl border border-dashed border-stone-600 bg-stone-900/60 text-sm font-medium text-stone-300 active:scale-[0.99]">+ Add Quick Launch</button>
              <button type="button" disabled={busy} onClick={() => void saveLaunchers()} className="min-h-[58px] w-full rounded-xl bg-amber-700 text-base font-semibold text-white active:scale-[0.99] disabled:opacity-50">Save Launch Bay</button>
            </div>
          ) : (
            <div className="space-y-4">
              {(["stream", "maker", "system"] as LaunchGroup[]).map((group) => {
                const items = launchTargets.filter((target) => target.group === group && target.enabled);
                if (items.length === 0) return null;
                return (
                  <div key={group}>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{GROUP_LABELS[group]}</div>
                    <div className="grid grid-cols-2 gap-2">
                      {items.map((target) => (
                        <button key={target.id} type="button" onClick={() => void launch(target)} className="min-h-[68px] rounded-xl border border-[#5e4526] bg-gradient-to-b from-[#24201a] to-[#151719] px-3 text-left shadow-lg active:scale-[0.97]">
                          <div className="text-base font-semibold text-amber-100">{target.label}</div>
                          <div className="mt-1 truncate text-[11px] text-stone-500">{target.target}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel title="System Controls" subtitle="Human-authorized supervisory actions">
          <div className="grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => void refresh()} className="min-h-[62px] rounded-xl border border-stone-700 bg-stone-900 text-sm font-semibold active:scale-[0.97] disabled:opacity-50">Refresh State</button>
            <button type="button" onClick={onExit} className="min-h-[62px] rounded-xl border border-stone-700 bg-stone-900 text-sm font-semibold active:scale-[0.97]">Forgekeeper</button>
            <button type="button" disabled={busy} onClick={() => void toggleSafeMode()} className={`min-h-[62px] rounded-xl border text-sm font-bold active:scale-[0.97] disabled:opacity-50 ${snapshot?.safeMode ? "border-emerald-800 bg-emerald-950/40 text-emerald-200" : "border-red-900 bg-red-950/35 text-red-300"}`}>
              {snapshot?.safeMode ? "Exit Safe Mode" : "Enter Safe Mode"}
            </button>
            <button type="button" disabled={busy} onClick={() => void toggleStartup()} className={`min-h-[62px] rounded-xl border text-sm font-semibold active:scale-[0.97] disabled:opacity-50 ${startup.enabled ? "border-amber-700 bg-amber-950/30 text-amber-200" : "border-stone-700 bg-stone-900 text-stone-300"}`}>
              Startup: {startup.enabled ? "ON" : "OFF"}
            </button>
          </div>
        </Panel>

        <Panel title="Bastion Commissioning" subtitle="The surface remains staged until the real native control plane passes readiness">
          <div className="flex items-center justify-between rounded-xl border border-stone-800 bg-black/25 p-4">
            <div>
              <div className="text-sm text-stone-400">Commissioning state</div>
              <div className="mt-1 text-lg font-semibold uppercase text-amber-200">{snapshot?.bastionCommissioningState ?? "loading"}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-stone-400">Runtime</div>
              <div className="mt-1 text-lg font-semibold uppercase text-stone-200">{snapshot?.bastionRuntimeState ?? "loading"}</div>
            </div>
          </div>
          {snapshot?.bastionCommissioningState !== "active" && (
            <button type="button" disabled={busy} onClick={() => void commissionBastion()} className="mt-3 min-h-[64px] w-full rounded-xl bg-amber-700 text-base font-bold text-white shadow-xl active:scale-[0.98] disabled:opacity-50">
              Commission Bastion
            </button>
          )}
        </Panel>

        <footer className="mt-6 text-center text-[10px] uppercase tracking-[0.22em] text-stone-600">
          Built by the Foundry · touch targets sized for deliberate operation
        </footer>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-[#493821] bg-gradient-to-b from-[#17191a] to-[#101213] p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-amber-100">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-stone-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function ResourceTile({ label, value, detail, level }: { label: string; value: string; detail: string; level?: number }) {
  return (
    <div className="rounded-2xl border border-[#493821] bg-gradient-to-b from-[#1a1c1d] to-[#101213] p-4 shadow-xl">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-amber-100">{value}</div>
      <div className="mt-1 truncate text-[11px] text-stone-500">{detail}</div>
      {typeof level === "number" && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-black/70">
          <div className="h-full rounded-full bg-amber-600 transition-all" style={{ width: `${Math.max(2, Math.min(100, level))}%` }} />
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-stone-800 bg-black/25 p-3">
      <div className="text-[10px] uppercase tracking-[0.16em] text-stone-500">{label}</div>
      <div className="mt-1 text-base font-semibold text-stone-100">{value}</div>
    </div>
  );
}

function isLaunchTarget(value: unknown): value is LaunchTarget {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === "string"
    && typeof candidate.label === "string"
    && typeof candidate.target === "string"
    && (candidate.group === "stream" || candidate.group === "maker" || candidate.group === "system")
    && typeof candidate.enabled === "boolean";
}
