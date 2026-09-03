import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { sha256Text } from "../lib/recovery";
import type { ForgekeeperState } from "../state/useForgekeeperState";
import {
  commitLinkedWorkspace,
  serializeForgekeeperState,
  type FoundryLinkWorkspaceEnvelope,
} from "../foundry-link/workspaceSync";

const CONFIG_KEY = "forgekeeper.foundry-link.mobile.v1";

type PairResponse = {
  token: string;
  deviceId: string;
  revision: number;
};

type LinkConfig = {
  endpoint: string;
  token: string;
  deviceId: string;
  revision: number;
  lastSyncedHash: string;
};

type LinkState = "unpaired" | "pairing" | "synced" | "offline" | "conflict" | "error";

function loadConfig(): LinkConfig | null {
  try {
    const raw = window.localStorage.getItem(CONFIG_KEY);
    return raw ? (JSON.parse(raw) as LinkConfig) : null;
  } catch {
    return null;
  }
}

function saveConfig(config: LinkConfig | null) {
  if (!config) {
    window.localStorage.removeItem(CONFIG_KEY);
    return;
  }
  window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function FoundryLinkMobilePanel({ state }: { state: ForgekeeperState }) {
  const initial = loadConfig();
  const [endpoint, setEndpoint] = useState(initial?.endpoint ?? "");
  const [pairingCode, setPairingCode] = useState("");
  const [linkState, setLinkState] = useState<LinkState>(initial?.token ? "offline" : "unpaired");
  const [message, setMessage] = useState(initial?.token ? "Reconnecting to the workstation…" : "");
  const [error, setError] = useState("");
  const [conflictRemote, setConflictRemote] = useState<FoundryLinkWorkspaceEnvelope | null>(null);
  const [expanded, setExpanded] = useState(!initial?.token);
  const stateRef = useRef(state);
  const configRef = useRef<LinkConfig | null>(initial);
  const busyRef = useRef(false);
  stateRef.current = state;

  function commitConfig(config: LinkConfig | null) {
    configRef.current = config;
    saveConfig(config);
  }

  async function pair() {
    if (!endpoint.trim() || pairingCode.trim().length !== 6) {
      setError("Enter the workstation Foundry Link address and six-digit pairing code.");
      return;
    }

    setLinkState("pairing");
    setError("");
    setMessage("Pairing with the workstation…");
    busyRef.current = true;
    try {
      const pairResponse = await invoke<PairResponse>("foundry_link_remote_pair", {
        endpoint: endpoint.trim(),
        code: pairingCode.trim(),
        deviceName: "Forgekeeper Mobile",
      });
      const config: LinkConfig = {
        endpoint: endpoint.trim().replace(/\/$/, ""),
        token: pairResponse.token,
        deviceId: pairResponse.deviceId,
        revision: pairResponse.revision,
        lastSyncedHash: "",
      };
      commitConfig(config);
      setPairingCode("");
      setMessage("Paired. Loading the workstation workspace…");
      await synchronizeOnce(true);
    } catch (cause) {
      setLinkState("error");
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      busyRef.current = false;
    }
  }

  async function synchronizeOnce(initialPair = false) {
    if (busyRef.current && !initialPair) return;
    const config = configRef.current;
    if (!config?.token) return;

    busyRef.current = true;
    try {
      const remote = await invoke<FoundryLinkWorkspaceEnvelope>("foundry_link_remote_get_workspace", {
        endpoint: config.endpoint,
        token: config.token,
      });
      const localPayload = serializeForgekeeperState(stateRef.current);
      const [localHash, remoteHash] = await Promise.all([
        sha256Text(localPayload),
        sha256Text(remote.payload),
      ]);
      const baselineHash = config.lastSyncedHash;

      if (!baselineHash) {
        if (localHash === remoteHash) {
          const next = { ...config, revision: remote.revision, lastSyncedHash: remoteHash };
          commitConfig(next);
          setLinkState("synced");
          setMessage(`Synced with workstation revision ${remote.revision}.`);
          setExpanded(false);
          return;
        }

        const next = { ...config, revision: remote.revision, lastSyncedHash: remoteHash };
        commitConfig(next);
        setMessage("Using the workstation as the initial Foundry authority…");
        await commitLinkedWorkspace(stateRef.current, remote, "workstation initial sync");
        return;
      }

      if (remote.revision > config.revision) {
        if (localHash !== baselineHash) {
          setConflictRemote(remote);
          setLinkState("conflict");
          setExpanded(true);
          setMessage("Both the workstation and this phone changed since the last sync.");
          return;
        }

        const next = { ...config, revision: remote.revision, lastSyncedHash: remoteHash };
        commitConfig(next);
        setMessage(`Applying workstation revision ${remote.revision}…`);
        await commitLinkedWorkspace(stateRef.current, remote, "workstation sync");
        return;
      }

      if (remote.revision === config.revision) {
        if (remoteHash !== baselineHash && localHash !== baselineHash) {
          setConflictRemote(remote);
          setLinkState("conflict");
          setExpanded(true);
          setMessage("Workspace content diverged at the same revision. Manual choice required.");
          return;
        }

        if (localHash !== baselineHash) {
          const pushed = await invoke<FoundryLinkWorkspaceEnvelope>("foundry_link_remote_push_workspace", {
            endpoint: config.endpoint,
            token: config.token,
            baseRevision: config.revision,
            payload: localPayload,
            force: false,
          });
          const nextHash = await sha256Text(pushed.payload);
          commitConfig({ ...config, revision: pushed.revision, lastSyncedHash: nextHash });
          setLinkState("synced");
          setError("");
          setMessage(`Mobile changes sent as workstation revision ${pushed.revision}.`);
          return;
        }

        if (remoteHash !== baselineHash) {
          const next = { ...config, revision: remote.revision, lastSyncedHash: remoteHash };
          commitConfig(next);
          setMessage("Applying workstation content update…");
          await commitLinkedWorkspace(stateRef.current, remote, "workstation sync");
          return;
        }

        setLinkState("synced");
        setError("");
        setMessage(`Synced with workstation revision ${remote.revision}.`);
        return;
      }

      setLinkState("offline");
      setMessage("The workstation Link session restarted. Re-pair this phone to establish a fresh revision baseline.");
      setExpanded(true);
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : String(cause);
      if (text.includes("FOUNDRY_LINK_CONFLICT")) {
        try {
          const configNow = configRef.current;
          if (configNow) {
            const remote = await invoke<FoundryLinkWorkspaceEnvelope>("foundry_link_remote_get_workspace", {
              endpoint: configNow.endpoint,
              token: configNow.token,
            });
            setConflictRemote(remote);
          }
        } catch {
          // Preserve the original conflict message if the refresh also fails.
        }
        setLinkState("conflict");
        setExpanded(true);
        setMessage("A newer workstation revision arrived before the mobile change could be accepted.");
        return;
      }
      if (/401|Unknown Foundry Link device token/i.test(text)) {
        commitConfig(null);
        setLinkState("unpaired");
        setExpanded(true);
        setMessage("The workstation no longer recognizes this pairing. Enter its new pairing code.");
        return;
      }
      setLinkState("offline");
      setError(text);
      setMessage("Working from the phone's local SQLite workspace. Sync will retry when the workstation is reachable.");
    } finally {
      busyRef.current = false;
    }
  }

  useEffect(() => {
    if (configRef.current?.token) void synchronizeOnce();
    const timer = window.setInterval(() => void synchronizeOnce(), 2500);
    return () => window.clearInterval(timer);
  }, []);

  function disconnect() {
    commitConfig(null);
    setConflictRemote(null);
    setLinkState("unpaired");
    setExpanded(true);
    setMessage("This phone forgot its Foundry Link token. Start a new pairing from the workstation when needed.");
    setError("");
  }

  async function useWorkstationCopy() {
    const config = configRef.current;
    if (!config || !conflictRemote) return;
    busyRef.current = true;
    try {
      const remoteHash = await sha256Text(conflictRemote.payload);
      commitConfig({ ...config, revision: conflictRemote.revision, lastSyncedHash: remoteHash });
      setMessage(`Accepting workstation revision ${conflictRemote.revision}…`);
      await commitLinkedWorkspace(stateRef.current, conflictRemote, "explicit conflict resolution: workstation copy");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      busyRef.current = false;
    }
  }

  async function useMobileCopy() {
    const config = configRef.current;
    if (!config || !conflictRemote) return;
    const confirmed = window.confirm("Replace the newer workstation workspace with the current mobile workspace? The workstation will create a recovery checkpoint before applying it.");
    if (!confirmed) return;
    busyRef.current = true;
    try {
      const payload = serializeForgekeeperState(stateRef.current);
      const pushed = await invoke<FoundryLinkWorkspaceEnvelope>("foundry_link_remote_push_workspace", {
        endpoint: config.endpoint,
        token: config.token,
        baseRevision: conflictRemote.revision,
        payload,
        force: true,
      });
      const nextHash = await sha256Text(pushed.payload);
      commitConfig({ ...config, revision: pushed.revision, lastSyncedHash: nextHash });
      setConflictRemote(null);
      setLinkState("synced");
      setExpanded(false);
      setMessage(`Mobile workspace accepted as revision ${pushed.revision}.`);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      busyRef.current = false;
    }
  }

  const badgeClass = linkState === "synced"
    ? "border-emerald-700/45 bg-emerald-950/30 text-emerald-200"
    : linkState === "conflict"
      ? "border-rose-700/50 bg-rose-950/35 text-rose-200"
      : linkState === "offline"
        ? "border-amber-700/45 bg-amber-950/30 text-amber-200"
        : "border-slate-700 bg-slate-950/70 text-slate-400";

  return (
    <section className="mb-3 rounded-2xl border border-amber-900/35 bg-[linear-gradient(145deg,rgba(21,18,15,0.92),rgba(8,7,6,0.92))] p-4 shadow-forge">
      <button type="button" onClick={() => setExpanded((value) => !value)} className="flex w-full items-start justify-between gap-3 text-left">
        <div className="min-w-0">
          <div className="text-[9px] uppercase tracking-[0.24em] text-amber-500">Foundry Link</div>
          <div className="mt-1 text-sm font-semibold text-amber-100">
            {configRef.current?.token ? configRef.current.endpoint : "Pair with workstation"}
          </div>
          {message ? <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{message}</div> : null}
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${badgeClass}`}>
          {linkState === "pairing" ? "Pairing" : linkState === "unpaired" ? "Unpaired" : linkState}
        </span>
      </button>

      {expanded ? (
        <div className="mt-4 border-t border-slate-800/80 pt-4">
          {!configRef.current?.token ? (
            <div className="space-y-3">
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Workstation address</span>
                <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} placeholder="http://192.168.1.50:4717" className="mt-1 w-full rounded-xl border border-slate-700 bg-black/30 px-3 py-3 text-sm text-slate-100 placeholder:text-slate-600" />
              </label>
              <label className="block">
                <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Pairing code</span>
                <input value={pairingCode} onChange={(event) => setPairingCode(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" placeholder="000000" className="mt-1 w-full rounded-xl border border-slate-700 bg-black/30 px-3 py-3 font-mono text-lg tracking-[0.2em] text-slate-100 placeholder:text-slate-700" />
              </label>
              <button type="button" disabled={linkState === "pairing"} onClick={() => void pair()} className="min-h-[48px] w-full rounded-xl border border-amber-600/55 bg-amber-950/35 px-4 text-sm font-semibold text-amber-100 disabled:opacity-50">
                Pair Mobile Foundry
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-slate-800 bg-black/20 p-3">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Revision</div>
                  <div className="mt-1 text-lg font-semibold text-slate-200">{configRef.current.revision}</div>
                </div>
                <div className="rounded-xl border border-slate-800 bg-black/20 p-3">
                  <div className="text-[9px] uppercase tracking-[0.18em] text-slate-500">Device</div>
                  <div className="mt-1 truncate text-xs font-semibold text-slate-300">{configRef.current.deviceId}</div>
                </div>
              </div>

              {linkState === "conflict" && conflictRemote ? (
                <div className="rounded-xl border border-rose-700/40 bg-rose-950/25 p-3">
                  <div className="text-sm font-semibold text-rose-100">Workspace conflict</div>
                  <p className="mt-1 text-xs leading-5 text-rose-200/70">The workstation is on revision {conflictRemote.revision}, while this phone also has unsynced changes. Choose which complete workspace becomes authoritative.</p>
                  <div className="mt-3 grid gap-2">
                    <button type="button" onClick={() => void useWorkstationCopy()} className="min-h-[46px] rounded-xl border border-slate-700 bg-slate-900/80 px-3 text-sm font-semibold text-slate-200">Use workstation copy</button>
                    <button type="button" onClick={() => void useMobileCopy()} className="min-h-[46px] rounded-xl border border-rose-700/50 bg-rose-950/40 px-3 text-sm font-semibold text-rose-100">Replace with mobile copy</button>
                  </div>
                </div>
              ) : null}

              <button type="button" onClick={() => void synchronizeOnce()} className="min-h-[46px] w-full rounded-xl border border-amber-800/50 bg-amber-950/20 px-3 text-sm font-semibold text-amber-200">Sync now</button>
              <button type="button" onClick={disconnect} className="min-h-[46px] w-full rounded-xl border border-slate-700 px-3 text-sm font-semibold text-slate-400">Forget pairing on this phone</button>
            </div>
          )}

          <div className="mt-3 text-[11px] leading-5 text-slate-600">Foundry Link accepts private LAN or trusted overlay-network IPs only. Offline edits remain in this phone's native workspace until the workstation reconnects.</div>
          {error ? <div className="mt-3 break-words text-xs leading-5 text-rose-300">{error}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
