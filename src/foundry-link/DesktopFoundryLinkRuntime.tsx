import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ForgekeeperState } from "../state/useForgekeeperState";
import {
  completeDesktopRemoteCommand,
  desktopRemoteCommandExecutionStarted,
  getJournaledDesktopRemoteCommandResult,
  getStagedDesktopRemoteCommands,
  markDesktopRemoteCommandExecutionStarted,
  rememberDesktopRemoteCommandResult,
  stageDesktopRemoteCommands,
} from "./desktopCommandJournal";
import {
  completeDesktopPendingWorkspace,
  getStagedDesktopPendingWorkspace,
  stageDesktopPendingWorkspace,
} from "./desktopWorkspaceJournal";
import {
  processRemoteCommand,
  sortRemoteCommandsForExecution,
  type FoundryRemoteCommand,
  type FoundryRemoteCommandResult,
} from "./remoteCommands";
import {
  commitLinkedWorkspace,
  serializeForgekeeperState,
  type FoundryLinkWorkspaceEnvelope,
} from "./workspaceSync";

const DEFAULT_PORT = 4717;
export const DESKTOP_LINK_ENABLED_KEY = "forgekeeper.foundry-link.desktop.enabled.v1";
export const DESKTOP_LINK_SETTING_EVENT = "forgekeeper:foundry-link-setting-changed";

type LinkStatus = {
  running: boolean;
  revision: number;
  hasWorkspace: boolean;
};

export function desktopFoundryLinkEnabled(): boolean {
  try {
    const stored = window.localStorage.getItem(DESKTOP_LINK_ENABLED_KEY);
    return stored === null ? true : stored === "true";
  } catch {
    return true;
  }
}

export function setDesktopFoundryLinkEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(DESKTOP_LINK_ENABLED_KEY, String(enabled));
  } catch {
    // The runtime can still honor the current session through the event below.
  }
  window.dispatchEvent(new CustomEvent(DESKTOP_LINK_SETTING_EVENT, { detail: { enabled } }));
}

function journalFailureResult(command: FoundryRemoteCommand): FoundryRemoteCommandResult {
  return {
    commandId: command.id,
    requestingDeviceId: command.requestingDeviceId ?? "unknown-device",
    correlationId: command.correlationId,
    completedAtMs: Date.now(),
    state: "failed",
    error: "Bastion Host could not persist the remote command journal, so the command was not executed.",
  };
}

export function DesktopFoundryLinkRuntime({ state }: { state: ForgekeeperState }) {
  const stateRef = useRef(state);
  const knownRevision = useRef(0);
  const lastPublishedPayload = useRef("");
  const applyingRemote = useRef(false);
  const tickInFlight = useRef(false);
  const enabledRef = useRef(desktopFoundryLinkEnabled());
  stateRef.current = state;

  async function publishCurrentWorkspace(baseRevision: number) {
    const payload = await serializeForgekeeperState(stateRef.current);
    if (payload === lastPublishedPayload.current) return;
    const envelope = await invoke<FoundryLinkWorkspaceEnvelope>("foundry_link_publish_workspace", {
      payload,
      baseRevision,
    });
    knownRevision.current = envelope.revision;
    lastPublishedPayload.current = envelope.payload;
  }

  async function ensureRunning(): Promise<LinkStatus | null> {
    if (!enabledRef.current) return null;
    let status = await invoke<LinkStatus>("foundry_link_status");
    if (!status.running) {
      status = await invoke<LinkStatus>("foundry_link_start", { port: DEFAULT_PORT });
      knownRevision.current = status.revision;
      lastPublishedPayload.current = "";
    }
    return status;
  }

  async function publishJournalFailure(commands: FoundryRemoteCommand[]) {
    for (const command of commands) {
      try {
        await invoke("foundry_link_publish_command_result", { result: journalFailureResult(command) });
      } catch (cause) {
        console.error(`Foundry Link could not publish the journal failure for ${command.id}:`, cause);
      }
    }
  }

  async function serviceRemoteCommands() {
    const fetched = await invoke<FoundryRemoteCommand[]>("foundry_link_take_pending_commands");
    if (fetched.length && !stageDesktopRemoteCommands(fetched)) {
      await publishJournalFailure(fetched);
      return;
    }

    for (const command of sortRemoteCommandsForExecution(getStagedDesktopRemoteCommands())) {
      try {
        let result = getJournaledDesktopRemoteCommandResult(command.id);
        if (!result) {
          if (desktopRemoteCommandExecutionStarted(command.id)) {
            console.error(`Foundry Link command ${command.id} has an uncertain prior execution outcome and will not be re-executed automatically.`);
            continue;
          }
          if (!markDesktopRemoteCommandExecutionStarted(command.id)) {
            console.error(`Foundry Link could not persist the execution-start tombstone for ${command.id}; command was not executed.`);
            continue;
          }

          result = await processRemoteCommand(command);
          if (!rememberDesktopRemoteCommandResult(result)) {
            console.error(`Foundry Link executed ${command.id} but could not persist its result journal before publication.`);
          }
        }

        await invoke("foundry_link_publish_command_result", { result });
        if (!completeDesktopRemoteCommand(command.id)) {
          console.error(`Foundry Link published ${command.id} but could not clear its desktop command journal entry.`);
        }
      } catch (cause) {
        console.error(`Foundry Link command ${command.id} remains journaled for retry:`, cause);
      }
    }
  }

  async function servicePendingWorkspace(): Promise<boolean> {
    let pending = getStagedDesktopPendingWorkspace();
    if (!pending) {
      const fetched = await invoke<FoundryLinkWorkspaceEnvelope | null>("foundry_link_take_pending_workspace");
      if (!fetched) return false;
      if (!stageDesktopPendingWorkspace(fetched)) {
        console.error(`Foundry Link accepted workspace revision ${fetched.revision} but could not stage it for durable desktop apply. Local workspace publication is paused until the journal is writable.`);
        throw new Error(`Foundry Link could not persist pending workspace revision ${fetched.revision}; stale local state will not be published over it.`);
      }
      pending = fetched;
    }

    applyingRemote.current = true;
    knownRevision.current = pending.revision;
    try {
      await commitLinkedWorkspace(
        stateRef.current,
        pending,
        pending.sourceDeviceId ? `paired device ${pending.sourceDeviceId}` : "paired mobile device",
      );
      lastPublishedPayload.current = pending.payload;
      if (!completeDesktopPendingWorkspace(pending.revision)) {
        console.error(`Foundry Link applied workspace revision ${pending.revision} but could not clear its pending workspace journal entry.`);
      }
      return true;
    } catch (cause) {
      // Keep the durable pending workspace staged. The next tick retries this exact
      // revision before any local workspace publication is allowed.
      console.error(`Foundry Link workspace revision ${pending.revision} remains staged for apply retry:`, cause);
      throw cause;
    }
  }

  async function serviceTick() {
    if (tickInFlight.current || applyingRemote.current || !stateRef.current.storageReady) return;
    tickInFlight.current = true;
    try {
      const status = await ensureRunning();
      if (!status) return;

      await serviceRemoteCommands();
      if (await servicePendingWorkspace()) return;

      if (!lastPublishedPayload.current && status.hasWorkspace) {
        knownRevision.current = status.revision;
      }

      await publishCurrentWorkspace(knownRevision.current || status.revision);
    } catch (cause) {
      const text = cause instanceof Error ? cause.message : String(cause);
      if (!text.includes("FOUNDRY_LINK_CONFLICT")) {
        console.error("Foundry Link desktop runtime tick failed:", cause);
      }
    } finally {
      applyingRemote.current = false;
      tickInFlight.current = false;
    }
  }

  useEffect(() => {
    const onSettingChanged = (event: Event) => {
      const custom = event as CustomEvent<{ enabled?: boolean }>;
      enabledRef.current = custom.detail?.enabled ?? desktopFoundryLinkEnabled();
      if (enabledRef.current) void serviceTick();
    };

    window.addEventListener(DESKTOP_LINK_SETTING_EVENT, onSettingChanged);
    void serviceTick();
    const timer = window.setInterval(() => void serviceTick(), 1500);
    return () => {
      window.removeEventListener(DESKTOP_LINK_SETTING_EVENT, onSettingChanged);
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
