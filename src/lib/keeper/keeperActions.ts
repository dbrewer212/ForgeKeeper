import type { KeeperAlert } from "./keeperAlerts";

export type KeeperActionType =
  | "open-record"
  | "review-record"
  | "add-media"
  | "set-price"
  | "assign-printer"
  | "reorder-filament";

export type KeeperAction = {
  id: string;
  alertId: string;
  type: KeeperActionType;
  title: string;
  description: string;
  priority: "Low" | "Normal" | "High" | "Critical";
  targetView?: string;
  targetId?: string;
};

function priorityFromAlert(type: KeeperAlert["severity"]): KeeperAction["priority"] {
  if (type === "critical") return "Critical";
  if (type === "warning") return "High";
  if (type === "opportunity") return "Normal";
  return "Low";
}

export function getKeeperActions(alerts: KeeperAlert[]): KeeperAction[] {
  return alerts.map((alert) => {
    const priority = priorityFromAlert(alert.severity);

    if (alert.suggestedActionId === "set-design-price") {
      return {
        id: `action-${alert.id}`,
        alertId: alert.id,
        type: "set-price",
        title: "Review project costing",
        description: "Open the related design project and set its cost assumptions so production reporting becomes useful.",
        priority,
        targetView: alert.section,
        targetId: alert.relatedRecordId,
      };
    }

    if (alert.suggestedActionId === "add-design-media") {
      return {
        id: `action-${alert.id}`,
        alertId: alert.id,
        type: "add-media",
        title: "Add design media",
        description: "Attach a concept image, design render, or prototype photo so the project is visually trackable.",
        priority,
        targetView: alert.section,
        targetId: alert.relatedRecordId,
      };
    }

    if (alert.suggestedActionId === "clean-design-notes") {
      return {
        id: `action-${alert.id}`,
        alertId: alert.id,
        type: "review-record",
        title: "Clean design notes",
        description: "Add internal notes, production context, or readiness details for this design record.",
        priority,
        targetView: alert.section,
        targetId: alert.relatedRecordId,
      };
    }

    if (alert.suggestedActionId === "reorder-filament") {
      return {
        id: `action-${alert.id}`,
        alertId: alert.id,
        type: "reorder-filament",
        title: "Review filament reorder",
        description: "Check current stock, pending production jobs, and whether this material should be moved to the shopping list.",
        priority,
        targetView: alert.section,
        targetId: alert.relatedRecordId,
      };
    }

    if (alert.suggestedActionId === "assign-printer") {
      return {
        id: `action-${alert.id}`,
        alertId: alert.id,
        type: "assign-printer",
        title: "Assign printer",
        description: "Open Production and assign a printer so workload forecasting can calculate correctly.",
        priority,
        targetView: alert.section,
        targetId: alert.relatedRecordId,
      };
    }

    return {
      id: `action-${alert.id}`,
      alertId: alert.id,
      type: "review-record",
      title: "Review alert",
      description: alert.message,
      priority,
      targetView: alert.section,
      targetId: alert.relatedRecordId,
    };
  });
}
