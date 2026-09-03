import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  desktopFoundryLinkEnabled,
  setDesktopFoundryLinkEnabled,
} from "../../foundry-link/DesktopFoundryLinkRuntime";
import type { ForgekeeperState } from "../../state/useForgekeeperState";

type LinkDevice = {
  id: string;
  name: string;
  pairedAtMs: number;
  lastSeenAtMs: number;
};

type LinkStatus = {
  running: boolean;
  port: number;
  localAddress: string;
  endpoint: string;
  pairingCode: string;
  revision: number;
  hasWorkspace: boolean;
  connectedDevices: LinkDevice[];
};

const DEFAULT_PORT = 4717;

export function FoundryLinkPanel({ state: _state }: { state: ForgekeeperState }) {
  const [status, setStatus] = useState<LinkStatus>();
  const [enabled, setEnabled] = useState(desktopFoundryLinkEnabled());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refreshStatus() {
    const next = await invoke<LinkStatus>("foundry_link_status");
    setStatus(next);
    return next;
  }

  useEffect(() => {
    void refreshStatus().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    const timer = window.setInterval(() => {
      setEnabled(desktopFoundryLinkEnabled());
      void refreshStatus().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    }, 1500);
    return () => window.clearInterval(timer);
  }, []);

  async function startLink() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      setDesktopFoundryLinkEnabled(true);
      setEnabled(true);
      const next = await invoke<LinkStatus>("foundry_link_start", { port: DEFAULT_PORT });
      setStatus(next);
      setMessage(`Foundry Link is listening on ${next.endpoint}. Workspace synchronization continues across every desktop station.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function stopLink() {
    setBusy(true);
    setError("");
    try {
      setDesktopFoundryLinkEnabled(false);
      setEnabled(false);
      const next = await invoke<LinkStatus>("foundry_link_stop");
      setStatus(next);
      setMessage("Foundry Link stopped and automatic desktop synchronization is disabled until you start it again.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function rotateCode() {
    try {
      const next = await invoke<LinkStatus>("foundry_link_rotate_pairing_code");
      setStatus(next);
      setMessage("Pairing code rotated. The previous code is no longer valid.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <section className="rounded-2xl border border-amber-800/30 bg-[linear-gradient(145deg,rgba(21,18,15,0.96),rgba(8,7,6,0.94))] p-5 shadow-forge">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-amber-500">Foundry Link</div>
          <h2 className="mt-1 text-xl font-semibold text-amber-100">Mobile roaming console</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Forgekeeper runs synchronization as a desktop runtime service, so the mobile workspace remains connected while you move between Command, Production, Materials, Design Library, Bastion, and Administration.
          </p>
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${status?.running && enabled ? "border-emerald-700/50 bg-emerald-950/30 text-emerald-200" : "border-slate-700 bg-slate-950/70 text-slate-400"}`}>
          {status?.running && enabled ? "Link online" : enabled ? "Starting" : "Link disabled"}
        </div>
      </div>

      {status?.running ? (
        <div className="mt-5 grid gap-3 md:grid-cols-[1fr_220px]">
          <div className="rounded-xl border border-slate-800 bg-black/25 p-4">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Workstation address</div>
            <div className="mt-2 break-all font-mono text-sm text-slate-200">{status.endpoint}</div>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
              <span>Revision {status.revision}</span>
              <span>{status.connectedDevices.length} paired device{status.connectedDevices.length === 1 ? "" : "s"}</span>
              <span>Port {status.port}</span>
              <span>{status.hasWorkspace ? "Workspace published" : "Waiting for first workspace publish"}</span>
            </div>
          </div>
          <div className="rounded-xl border border-amber-800/40 bg-amber-950/25 p-4 text-center">
            <div className="text-[10px] uppercase tracking-[0.2em] text-amber-500">Pairing code</div>
            <div className="mt-2 font-mono text-3xl font-bold tracking-[0.24em] text-amber-100">{status.pairingCode}</div>
            <button type="button" onClick={() => void rotateCode()} className="mt-3 rounded-lg border border-amber-800/50 px-3 py-2 text-xs font-semibold text-amber-200 hover:bg-amber-950/40">
              Rotate code
            </button>
          </div>
        </div>
      ) : null}

      {status?.connectedDevices.length ? (
        <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Paired devices</div>
          <div className="mt-3 space-y-2">
            {status.connectedDevices.map((device) => (
              <div key={device.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold text-slate-200">{device.name || device.id}</span>
                <span className="text-xs text-slate-500">Last seen {new Date(device.lastSeenAtMs).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-4 rounded-xl border border-amber-900/30 bg-amber-950/10 p-3 text-xs leading-5 text-amber-200/80">
        Private LAN / trusted overlay only. Do not port-forward Foundry Link to the public Internet. Paired devices are authenticated, but this transport is not intended as an Internet-facing service.
      </div>

      {message ? <div className="mt-3 text-sm text-emerald-300">{message}</div> : null}
      {error ? <div className="mt-3 break-words text-sm text-rose-300">{error}</div> : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {enabled ? (
          <button type="button" disabled={busy} onClick={() => void stopLink()} className="rounded-xl border border-rose-800/50 bg-rose-950/20 px-4 py-2.5 text-sm font-semibold text-rose-200 disabled:opacity-50">
            Stop Foundry Link
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => void startLink()} className="rounded-xl border border-amber-600/55 bg-amber-950/35 px-4 py-2.5 text-sm font-semibold text-amber-100 shadow-forge-inset disabled:opacity-50">
            Start Foundry Link
          </button>
        )}
      </div>
    </section>
  );
}
