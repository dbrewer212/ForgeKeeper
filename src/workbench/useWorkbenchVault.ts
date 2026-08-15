import { useCallback, useEffect, useMemo, useState } from "react";
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

export function useWorkbenchVault(state: ForgekeeperState): WorkbenchVaultRuntime {
  const [workbench, setWorkbench] = useState<WorkbenchState>(emptyWorkbenchState());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!state.storageReady || state.storageStatus !== "SQLite") return;
    try {
      await ensureWorkbenchBootstrap(state as unknown as AppData);
      const repository = new WorkbenchRepository();
      await repository.initialize();
      setWorkbench(await repository.loadState());
      setError("");
      setReady(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setReady(true);
    }
  }, [state.storageReady, state.storageStatus]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const assets = useMemo(
    () => [...workbench.assets].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [workbench.assets],
  );

  return { ready, error, workbench, assets, refresh };
}
