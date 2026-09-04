import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ForgekeeperState } from "../state/useForgekeeperState";
import { processRemoteCommand, type FoundryRemoteCommand } from "./remoteCommands";
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

  async function serviceTick() {
    if (tickInFlight.current || applyingRemote.current || !stateRef.current.storageReady) return;
    tickInFlight.current = true;
    try {
      const status = await ensureRunning();
      if (!status) return;

      const commands = await invoke<FoundryRemoteCommand[]>("foundry_link_take_pending_commands");
      for (const command of commands.sort((left, right) => (left.sequence ?? 0) - (right.sequence ?? 0))) {
        const result = await processRemoteCommand(command);
        await invoke("foundry_link_publish_command_result", { result });
      }

      const pending = await invoke<FoundryLinkWorkspaceEnvelope | null>("foundry_link_take_pending_workspace");
      if (pending) {
        applyingRemote.current = true;
        knownRevision.current = pending.revision;
        lastPublishedPayload.current = pending.payload;
        await commitLinkedWorkspace(
          stateRef.current,
          pending,
          pending.sourceDeviceId ? `paired device ${pending.sourceDeviceId}` : "paired mobile device",
        );
        return;
      }

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
