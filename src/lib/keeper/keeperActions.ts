import type { KeeperAlert, KeeperAlertSeverity } from "./keeperAlerts";

export type KeeperActionType =
  | "open-record"
  | "review-record"
  | "add-media"
  | "set-price"
  | "assign-printer"
  | "assign-filament"
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

function priorityFromAlert(severity: KeeperAlertSeverity): KeeperAction["priority"] {
  if (severity === "critical") return "Critical";
  if (severity === "warning") return "High";
  if (severity === "opportunity") return "Normal";
  return "Low";
}

export function getKeeperActions(alerts: KeeperAlert[]): KeeperAction[] {
  return alerts.map((alert) => {
    const priority = priorityFromAlert(alert.severity);
    const suggested = alert.suggestedActionId;

    if (suggested === "set-product-price") {
      return action(alert, priority, "set-price", "Review product pricing", "Open the related product and set a target price so cost/profit reporting becomes useful.", "catalog");
    }

    if (suggested === "add-product-media" || suggested === "add-variant-media") {
      return action(alert, priority, "add-media", "Add product media", "Attach a concept image, product render, or prototype photo so the product is visually trackable.", "catalog");
    }

    if (suggested === "clean-product-notes") {
      return action(alert, priority, "review-record", "Clean product notes", "Add internal notes, production context, or launch details for this product record.", "catalog");
    }

    if (suggested === "reorder-filament") {
      return action(alert, priority, "reorder-filament", "Review filament reorder", "Check current stock, pending orders, and whether this material should be moved to the shopping list.", "filament");
    }

    if (suggested === "assign-printer") {
      return action(alert, priority, "assign-printer", "Assign printer", "Open the order board and assign a printer so production intelligence can calculate workload correctly.", "orders");
    }

    if (suggested === "assign-filament") {
      return action(alert, priority, "assign-filament", "Assign filament", "Open the order board and assign the material needed for this production job.", "orders");
    }

    return action(alert, priority, "review-record", alert.title, alert.message, alert.section);
  });
}

function action(
  alert: KeeperAlert,
  priority: KeeperAction["priority"],
  type: KeeperActionType,
  title: string,
  description: string,
  targetView?: string,
): KeeperAction {
  return {
    id: `action-${alert.id}`,
    alertId: alert.id,
    type,
    title,
    description,
    priority,
    targetView,
    targetId: alert.relatedRecordId,
  };
}
