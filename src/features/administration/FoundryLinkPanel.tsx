import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ForgekeeperState } from "../../state/useForgekeeperState";
import {
  commitLinkedWorkspace,
  serializeForgekeeperState,
  type FoundryLinkWorkspaceEnvelope,
} from "../../foundry-link/workspaceSync";

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

export function FoundryLinkPanel({ state }: { state: ForgekeeperState }) {
  const [status, setStatus] = useState<LinkStatus>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const stateRef = useRef(state);
  const knownRevision = useRef(0);
  const lastPublishedPayload = useRef("");
  const applyingRemote = useRef(false);
  stateRef.current = state;

  async function getStatus() {
    const next = await invoke<LinkStatus>("foundry_link_status");
    setStatus(next);
    if (!lastPublishedPayload.current && next.hasWorkspace) {
      knownRevision.current = next.revision;
    }
    return next;
  }

  async function publishCurrentWorkspace(baseRevision: number) {
    const payload = serializeForgekeeperState(stateRef.current);
    if (payload === lastPublishedPayload.current) return;
    const envelope = await invoke<FoundryLinkWorkspaceEnvelope>("foundry_link_publish_workspace", {
      payload,
      baseRevision,
    });
    knownRevision.current = envelope.revision;
    lastPublishedPayload.current = envelope.payload;
  }

  async function serviceTick() {
    if (applyingRemote.current) return;
    try {
      const currentStatus = await getStatus();
      if (!currentStatus.running) return;

      const pending = await invoke<FoundryLinkWorkspaceEnvelope | null>("foundry_link_take_pending_workspace");
      if (pending) {
        applyingRemote.current = true;
        knownRevision.current = pending.revision;
        lastPublishedPayload.current = pending.payload;
        setMessage(`Applying mobile revision ${pending.revision}…`);
        await commitLinkedWorkspace(
          stateRef.current,
          pending,
          pending.sourceDeviceId ? `paired device ${pending.sourceDeviceId}` : "paired mobile device",
        );
        return;
      }

      if (!lastPublishedPayload.current && currentStatus.hasWorkspace) {
        knownRevision.current = currentStatus.revision;
      }

      await publishCurrentWorkspace(knownRevision.current || currentStatus.revision);
      setError("");
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : String(cause);
      if (text.includes("FOUNDRY_LINK_CONFLICT")) {
        setMessage("A newer mobile revision is waiting. Desktop publication paused until it is reconciled.");
        return;
      }
      setError(text);
    }
  }

  useEffect(() => {
    void getStatus().catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
    const timer = window.setInterval(() => void serviceTick(), 1500);
    return () => window.clearInterval(timer);
  }, []);

  async function startLink() {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const next = await invoke<LinkStatus>("foundry_link_start", { port: DEFAULT_PORT });
      setStatus(next);
      knownRevision.current = next.revision;
      await publishCurrentWorkspace(next.revision);
      const refreshed = await getStatus();
      setMessage(`Foundry Link is listening on ${refreshed.endpoint}.`);
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
      const next = await invoke<LinkStatus>("foundry_link_stop");
      setStatus(next);
      lastPublishedPayload.current = "";
      knownRevision.current = next.revision;
      setMessage("Foundry Link stopped. Paired mobile sessions were revoked.");
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
            Pair Forgekeeper Mobile directly to this workstation. Workspace changes use revision checks and a recovery checkpoint before an accepted mobile revision replaces the desktop workspace.
          </p>
        </div>
        <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${status?.running ? "border-emerald-700/50 bg-emerald-950/30 text-emerald-200" : "border-slate-700 bg-slate-950/70 text-slate-400"}`}>
          {status?.running ? "Link online" : "Link offline"}
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
        Private LAN / trusted overlay only. Do not port-forward Foundry Link to the public Internet. The current transport authorizes paired devices but does not provide Internet-grade end-to-end encryption.
      </div>

      {message ? <div className="mt-3 text-sm text-emerald-300">{message}</div> : null}
      {error ? <div className="mt-3 break-words text-sm text-rose-300">{error}</div> : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {status?.running ? (
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
