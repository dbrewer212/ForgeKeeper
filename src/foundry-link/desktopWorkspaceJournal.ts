import type { FoundryLinkWorkspaceEnvelope } from "./workspaceSync";

const DESKTOP_WORKSPACE_JOURNAL_KEY = "forgekeeper.foundry-link.desktop-workspace-journal.v1";

export function stageDesktopPendingWorkspace(envelope: FoundryLinkWorkspaceEnvelope): boolean {
  try {
    window.localStorage.setItem(DESKTOP_WORKSPACE_JOURNAL_KEY, JSON.stringify(envelope));
    return true;
  } catch (cause) {
    console.error("Could not persist the Foundry Link pending workspace journal:", cause);
    return false;
  }
}

export function getStagedDesktopPendingWorkspace(): FoundryLinkWorkspaceEnvelope | null {
  try {
    const raw = window.localStorage.getItem(DESKTOP_WORKSPACE_JOURNAL_KEY);
    return raw ? JSON.parse(raw) as FoundryLinkWorkspaceEnvelope : null;
  } catch {
    return null;
  }
}

export function completeDesktopPendingWorkspace(revision: number): boolean {
  try {
    const staged = getStagedDesktopPendingWorkspace();
    if (staged && staged.revision !== revision) return false;
    window.localStorage.removeItem(DESKTOP_WORKSPACE_JOURNAL_KEY);
    return true;
  } catch (cause) {
    console.error("Could not clear the Foundry Link pending workspace journal:", cause);
    return false;
  }
}

export function clearDesktopPendingWorkspaceJournalForTests(): void {
  try {
    window.localStorage.removeItem(DESKTOP_WORKSPACE_JOURNAL_KEY);
  } catch {
    // Test utility only.
  }
}
