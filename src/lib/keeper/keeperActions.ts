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

function priorityFromAlert(type: KeeperAlert["type"]): KeeperAction["priority"] {
  if (type === "critical") return "Critical";
  if (type === "warning") return "High";
  if (type === "opportunity") return "Normal";
  return "Low";
}

export function getKeeperActions(alerts: KeeperAlert[]): KeeperAction[] {
  return alerts.map((alert) => {
    const priority = priorityFromAlert(alert.type);

    if (alert.id.startsWith("price-")) {
      return {
        id: `action-${alert.id}`,
        alertId: alert.id,
        type: "set-price",
        title: "Review product pricing",
        description: "Open the related product and set a target price so cost/profit reporting becomes useful.",
        priority,
        targetView: "catalog",
        targetId: alert.id.replace("price-", ""),
      };
    }

    if (alert.id.startsWith("image-")) {
      return {
        id: `action-${alert.id}`,
        alertId: alert.id,
        type: "add-media",
        title: "Add product media",
        description: "Attach a concept image, product render, or prototype photo so the product is visually trackable.",
        priority,
        targetView: "catalog",
        targetId: alert.id.replace("image-", ""),
      };
    }

    if (alert.id.startsWith("notes-")) {
      return {
        id: `action-${alert.id}`,
        alertId: alert.id,
        type: "review-record",
        title: "Clean product notes",
        description: "Add internal notes, production context, or launch details for this product record.",
        priority,
        targetView: "catalog",
        targetId: alert.id.replace("notes-", ""),
      };
    }

    if (alert.id.startsWith("filament-")) {
      return {
        id: `action-${alert.id}`,
        alertId: alert.id,
        type: "reorder-filament",
        title: "Review filament reorder",
        description: "Check current stock, pending orders, and whether this material should be moved to the shopping list.",
        priority,
        targetView: "filament",
        targetId: alert.id.replace("filament-", ""),
      };
    }

    if (alert.id.startsWith("printer-")) {
      return {
        id: `action-${alert.id}`,
        alertId: alert.id,
        type: "assign-printer",
        title: "Assign printer",
        description: "Open the order board and assign a printer so production intelligence can calculate workload correctly.",
        priority,
        targetView: "orders",
        targetId: alert.id.replace("printer-", ""),
      };
    }

    return {
      id: `action-${alert.id}`,
      alertId: alert.id,
      type: "review-record",
      title: "Review alert",
      description: alert.message,
      priority,
    };
  });
}
