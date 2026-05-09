export type KeeperAlertSeverity = "info" | "warning" | "critical" | "opportunity";

export type KeeperAlert = {
  id: string;
  severity: KeeperAlertSeverity;
  title: string;
  message: string;
  section: "catalog" | "orders" | "filament" | "printers" | "planning" | "reports" | "settings";
  relatedRecordId?: string;
  suggestedActionId?: string;
};

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function getKeeperAlerts(state: any): KeeperAlert[] {
  const alerts: KeeperAlert[] = [];

  const products = Array.isArray(state?.products) ? state.products : [];
  const stls = Array.isArray(state?.stls) ? state.stls : [];
  const concepts = Array.isArray(state?.concepts) ? state.concepts : [];
  const variants = Array.isArray(state?.variants) ? state.variants : [];
  const orders = Array.isArray(state?.orders) ? state.orders : [];
  const filament = Array.isArray(state?.filament) ? state.filament : [];

  for (const product of products) {
    const productId = product.id;
    const productName = product.name ?? "Unnamed product";
    const productStls = stls.filter((stl: any) => stl.productId === productId);
    const productConcepts = concepts.filter((concept: any) => concept.productId === productId);

    if (!product.targetPrice || Number(product.targetPrice) <= 0) {
      alerts.push({
        id: `product-price-${productId}`,
        severity: "warning",
        title: "Missing product price",
        message: `${productName} does not have a target price set.`,
        section: "catalog",
        relatedRecordId: productId,
        suggestedActionId: "set-product-price",
      });
    }

    if (!product.estimatedPrintHours || Number(product.estimatedPrintHours) <= 0) {
      alerts.push({
        id: `product-print-hours-${productId}`,
        severity: "warning",
        title: "Missing print time estimate",
        message: `${productName} does not have an estimated print time.`,
        section: "catalog",
        relatedRecordId: productId,
        suggestedActionId: "add-print-estimate",
      });
    }

    if (!product.estimatedFilamentGrams || Number(product.estimatedFilamentGrams) <= 0) {
      alerts.push({
        id: `product-material-${productId}`,
        severity: "warning",
        title: "Missing filament usage estimate",
        message: `${productName} does not have a filament gram estimate.`,
        section: "catalog",
        relatedRecordId: productId,
        suggestedActionId: "add-material-estimate",
      });
    }

    if (!hasText(product.notes)) {
      alerts.push({
        id: `product-notes-${productId}`,
        severity: "info",
        title: "Missing product notes",
        message: `${productName} has no internal notes or description yet.`,
        section: "catalog",
        relatedRecordId: productId,
        suggestedActionId: "clean-product-notes",
      });
    }

    if (!hasText(product.productImagePath) && !hasText(product.conceptImagePath) && productConcepts.length === 0) {
      alerts.push({
        id: `product-media-${productId}`,
        severity: "info",
        title: "Missing product media",
        message: `${productName} has no product image, concept image, or concept spec attached.`,
        section: "catalog",
        relatedRecordId: productId,
        suggestedActionId: "add-product-media",
      });
    }

    if (productStls.length === 0) {
      alerts.push({
        id: `product-stl-${productId}`,
        severity: "warning",
        title: "Missing STL record",
        message: `${productName} has no STL file record attached.`,
        section: "catalog",
        relatedRecordId: productId,
        suggestedActionId: "add-stl-record",
      });
    }
  }

  for (const variant of variants) {
    const variantName = variant.name ?? `${variant.realm ?? "Variant"}`;
    if (!variant.stlId) {
      alerts.push({
        id: `variant-stl-${variant.id}`,
        severity: "info",
        title: "Variant missing STL link",
        message: `${variantName} does not have a linked STL record.`,
        section: "catalog",
        relatedRecordId: variant.id,
        suggestedActionId: "link-variant-stl",
      });
    }

    if (!hasText(variant.productImagePath) && !hasText(variant.conceptImagePath)) {
      alerts.push({
        id: `variant-media-${variant.id}`,
        severity: "info",
        title: "Variant missing media",
        message: `${variantName} does not have variant-specific media assigned.`,
        section: "catalog",
        relatedRecordId: variant.id,
        suggestedActionId: "add-variant-media",
      });
    }
  }

  for (const item of filament) {
    const gramsAvailable = Number(item.gramsAvailable ?? 0);
    const reorderPoint = Number(item.reorderPointGrams ?? 0);
    if (gramsAvailable <= reorderPoint) {
      alerts.push({
        id: `filament-low-${item.id}`,
        severity: gramsAvailable <= 0 ? "critical" : "warning",
        title: "Filament below reorder threshold",
        message: `${item.colorName ?? "Filament"} has ${gramsAvailable}g available and should be reviewed.`,
        section: "filament",
        relatedRecordId: item.id,
        suggestedActionId: "reorder-filament",
      });
    }
  }

  for (const order of orders) {
    if (!order.printerId && order.status !== "Shipped") {
      alerts.push({
        id: `order-printer-${order.id}`,
        severity: "warning",
        title: "Order needs printer assignment",
        message: `${order.customer ?? order.id} is not assigned to a printer.`,
        section: "orders",
        relatedRecordId: order.id,
        suggestedActionId: "assign-printer",
      });
    }

    if (!order.filamentId && order.status !== "Shipped") {
      alerts.push({
        id: `order-filament-${order.id}`,
        severity: "warning",
        title: "Order needs filament assignment",
        message: `${order.customer ?? order.id} is not assigned to a filament spool/material.`,
        section: "orders",
        relatedRecordId: order.id,
        suggestedActionId: "assign-filament",
      });
    }
  }

  return alerts;
}
