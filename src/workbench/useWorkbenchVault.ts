import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { AppData } from "../types/domain";
import type { ForgekeeperState } from "../state/useForgekeeperState";
import type { FoundryAsset, WorkbenchState } from "./contracts";
import { ensureWorkbenchBootstrap } from "./bootstrap";
import { emptyWorkbenchState, WorkbenchRepository } from "./repository";

export type WorkbenchVaultRuntime = {
  ready: boolean;
  error: string;
  workbench: WorkbenchState;
  assets: FoundryAsset[];
  refresh: () => Promise<void>;
};

type SharedWorkbenchSnapshot = {
  ready: boolean;
  error: string;
  workbench: WorkbenchState;
};

let sharedSnapshot: SharedWorkbenchSnapshot = {
  ready: false,
  error: "",
  workbench: emptyWorkbenchState(),
};
let loadPromise: Promise<void> | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): SharedWorkbenchSnapshot {
  return sharedSnapshot;
}

function publish(next: SharedWorkbenchSnapshot) {
  sharedSnapshot = next;
  listeners.forEach((listener) => listener());
}

async function loadWorkbench(state: ForgekeeperState, force: boolean): Promise<void> {
  if (!state.storageReady || state.storageStatus !== "SQLite") return;
  if (!force && sharedSnapshot.ready && !sharedSnapshot.error) return;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      await ensureWorkbenchBootstrap(state as unknown as AppData);
      const repository = new WorkbenchRepository();
      await repository.initialize();
      const workbench = await repository.loadState();
      publish({ ready: true, error: "", workbench });
    } catch (cause) {
      publish({
        ...sharedSnapshot,
        ready: true,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export function invalidateWorkbenchRuntime() {
  sharedSnapshot = { ...sharedSnapshot, ready: false };
}

export function useWorkbenchVault(state: ForgekeeperState): WorkbenchVaultRuntime {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const refresh = useCallback(async () => {
    await loadWorkbench(state, true);
  }, [state]);

  useEffect(() => {
    void loadWorkbench(state, false);
  }, [state.storageReady, state.storageStatus]);

  const assets = useMemo(
    () => [...snapshot.workbench.assets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [snapshot.workbench.assets],
  );

  return {
    ready: snapshot.ready,
    error: snapshot.error,
    workbench: snapshot.workbench,
    assets,
    refresh,
  };
}
