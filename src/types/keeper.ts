export type KeeperMode = "Forge" | "Ledger" | "Launch" | "Archive" | "Focus";

export type KeeperPermissionLevel = "suggest" | "confirm" | "execute";

export type KeeperTaskStatus = "Open" | "In Progress" | "Done" | "Snoozed";

export type KeeperTask = {
  id: string;
  title: string;
  linkedRecordId?: string;
  linkedSection?: string;
  priority: "Low" | "Normal" | "High" | "Critical";
  status: KeeperTaskStatus;
  notes: string;
  createdFromAlertId?: string;
};
