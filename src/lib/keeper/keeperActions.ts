import type { KeeperAlert } from "./keeperAlerts";

export type KeeperActionStatus = "suggested" | "needs_confirmation" | "ready" | "blocked";

export type KeeperAction = {
  id: string;
  title: string;
  description: string;
  status: KeeperActionStatus;
  section: KeeperAlert["section"];
  relatedAlertId?: string;
  relatedRecordId?: string;
};

export function getKeeperActions(alerts: KeeperAlert[]): KeeperAction[] {
  return alerts.map((alert) => ({
    id: `action-${alert.id}`,
    title: actionTitleForAlert(alert.suggestedActionId),
    description: actionDescriptionForAlert(alert),
    status: "suggested",
    section: alert.section,
    relatedAlertId: alert.id,
    relatedRecordId: alert.relatedRecordId,
  }));
}

function actionTitleForAlert(actionId?: string): string {
  switch (actionId) {
    case "set-product-price":
      return "Set product price";
    case "add-print-estimate":
      return "Add print time estimate";
    case "add-material-estimate":
      return "Add material estimate";
    case "clean-product-notes":
      return "Clean product notes";
    case "add-product-media":
      return "Attach product media";
    case "add-stl-record":
      return "Add STL record";
    case "link-variant-stl":
      return "Link variant STL";
    case "add-variant-media":
      return "Attach variant media";
    case "reorder-filament":
      return "Review filament reorder";
    case "assign-printer":
      return "Assign printer";
    case "assign-filament":
      return "Assign filament";
    default:
      return "Review item";
  }
}

function actionDescriptionForAlert(alert: KeeperAlert): string {
  return `Suggested follow-up for: ${alert.message}`;
}
