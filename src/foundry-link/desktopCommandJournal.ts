import type { FoundryRemoteCommand, FoundryRemoteCommandResult } from "./remoteCommands";

const DESKTOP_COMMAND_JOURNAL_KEY = "forgekeeper.foundry-link.desktop-command-journal.v1";
const MAX_JOURNALED_COMMANDS = 256;

type DesktopCommandJournal = {
  commands: FoundryRemoteCommand[];
  results: Record<string, FoundryRemoteCommandResult>;
};

const EMPTY_JOURNAL: DesktopCommandJournal = { commands: [], results: {} };

function readJournal(): DesktopCommandJournal {
  try {
    const raw = window.localStorage.getItem(DESKTOP_COMMAND_JOURNAL_KEY);
    if (!raw) return { ...EMPTY_JOURNAL, results: {} };
    const parsed = JSON.parse(raw) as Partial<DesktopCommandJournal>;
    return {
      commands: Array.isArray(parsed.commands) ? parsed.commands : [],
      results: parsed.results && typeof parsed.results === "object" ? parsed.results : {},
    };
  } catch {
    return { ...EMPTY_JOURNAL, results: {} };
  }
}

function writeJournal(journal: DesktopCommandJournal): boolean {
  try {
    window.localStorage.setItem(DESKTOP_COMMAND_JOURNAL_KEY, JSON.stringify(journal));
    return true;
  } catch (cause) {
    console.error("Could not persist the Foundry Link desktop command journal:", cause);
    return false;
  }
}

export function stageDesktopRemoteCommands(incoming: FoundryRemoteCommand[]): boolean {
  if (!incoming.length) return true;
  const journal = readJournal();
  const merged = new Map(journal.commands.map((command) => [command.id, command]));
  for (const command of incoming) merged.set(command.id, command);
  journal.commands = [...merged.values()]
    .sort((left, right) => (left.sequence ?? Number.MAX_SAFE_INTEGER) - (right.sequence ?? Number.MAX_SAFE_INTEGER))
    .slice(-MAX_JOURNALED_COMMANDS);
  return writeJournal(journal);
}

export function getStagedDesktopRemoteCommands(): FoundryRemoteCommand[] {
  return readJournal().commands;
}

export function getJournaledDesktopRemoteCommandResult(commandId: string): FoundryRemoteCommandResult | undefined {
  return readJournal().results[commandId];
}

export function rememberDesktopRemoteCommandResult(result: FoundryRemoteCommandResult): boolean {
  const journal = readJournal();
  journal.results[result.commandId] = result;
  return writeJournal(journal);
}

export function completeDesktopRemoteCommand(commandId: string): boolean {
  const journal = readJournal();
  journal.commands = journal.commands.filter((command) => command.id !== commandId);
  delete journal.results[commandId];
  return writeJournal(journal);
}

export function clearDesktopRemoteCommandJournalForTests(): void {
  try {
    window.localStorage.removeItem(DESKTOP_COMMAND_JOURNAL_KEY);
  } catch {
    // Test utility only.
  }
}
