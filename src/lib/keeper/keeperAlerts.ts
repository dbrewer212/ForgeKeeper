export type KeeperAlertSeverity = "info" | "warning" | "critical" | "opportunity";

export type KeeperAlert = {
  id: string;
  severity: KeeperAlertSeverity;
  title: string;
  message: string;
  section: "designs" | "production" | "filament" | "printers" | "planning" | "reports" | "settings";
  relatedRecordId?: string;
  suggestedActionId?: string;
};

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function getKeeperAlerts(state: any): KeeperAlert[] {
  const alerts: KeeperAlert[] = [];

  const designProjects = Array.isArray(state?.designProjects) ? state.designProjects : [];
  const stls = Array.isArray(state?.stls) ? state.stls : [];
  const concepts = Array.isArray(state?.concepts) ? state.concepts : [];
  const variants = Array.isArray(state?.variants) ? state.variants : [];
  const productionJobs = Array.isArray(state?.productionJobs) ? state.productionJobs : [];
  const filament = Array.isArray(state?.filament) ? state.filament : [];

  for (const design of designProjects) {
    const designProjectId = design.id;
    const designName = design.name ?? "Unnamed design";
    const designStls = stls.filter((stl: any) => stl.designProjectId === designProjectId);
    const designConcepts = concepts.filter((concept: any) => concept.designProjectId === designProjectId);

    if (!design.targetPrice || Number(design.targetPrice) <= 0) {
      alerts.push({
        id: `design-price-${designProjectId}`,
        severity: "warning",
        title: "Missing design price",
        message: `${designName} does not have a target price set.`,
        section: "designs",
        relatedRecordId: designProjectId,
        suggestedActionId: "set-design-price",
      });
    }

    if (!design.estimatedPrintHours || Number(design.estimatedPrintHours) <= 0) {
      alerts.push({
        id: `design-print-hours-${designProjectId}`,
        severity: "warning",
        title: "Missing print time estimate",
        message: `${designName} does not have an estimated print time.`,
        section: "designs",
        relatedRecordId: designProjectId,
        suggestedActionId: "add-print-estimate",
      });
    }

    if (!design.estimatedFilamentGrams || Number(design.estimatedFilamentGrams) <= 0) {
      alerts.push({
        id: `design-material-${designProjectId}`,
        severity: "warning",
        title: "Missing filament usage estimate",
        message: `${designName} does not have a filament gram estimate.`,
        section: "designs",
        relatedRecordId: designProjectId,
        suggestedActionId: "add-material-estimate",
      });
    }

    if (!hasText(design.notes)) {
      alerts.push({
        id: `design-notes-${designProjectId}`,
        severity: "info",
        title: "Missing design notes",
        message: `${designName} has no internal notes or description yet.`,
        section: "designs",
        relatedRecordId: designProjectId,
        suggestedActionId: "clean-design-notes",
      });
    }

    if (!hasText(design.designImagePath) && !hasText(design.conceptImagePath) && designConcepts.length === 0) {
      alerts.push({
        id: `design-media-${designProjectId}`,
        severity: "info",
        title: "Missing design media",
        message: `${designName} has no design image, concept image, or concept spec attached.`,
        section: "designs",
        relatedRecordId: designProjectId,
        suggestedActionId: "add-design-media",
      });
    }

    if (designStls.length === 0) {
      alerts.push({
        id: `design-stl-${designProjectId}`,
        severity: "warning",
        title: "Missing STL record",
        message: `${designName} has no STL file record attached.`,
        section: "designs",
        relatedRecordId: designProjectId,
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
        section: "designs",
        relatedRecordId: variant.id,
        suggestedActionId: "link-variant-stl",
      });
    }

    if (!hasText(variant.designImagePath) && !hasText(variant.conceptImagePath)) {
      alerts.push({
        id: `variant-media-${variant.id}`,
        severity: "info",
        title: "Variant missing media",
        message: `${variantName} does not have variant-specific media assigned.`,
        section: "designs",
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

  for (const job of productionJobs) {
    if (!job.printerId && !["Complete", "Cancelled"].includes(job.status)) {
      alerts.push({
        id: `job-printer-${job.id}`,
        severity: "warning",
        title: "Production Job needs printer assignment",
        message: `${job.name ?? job.id} is not assigned to a printer.`,
        section: "production",
        relatedRecordId: job.id,
        suggestedActionId: "assign-printer",
      });
    }

    if (!job.filamentId && !["Complete", "Cancelled"].includes(job.status)) {
      alerts.push({
        id: `job-filament-${job.id}`,
        severity: "warning",
        title: "Production Job needs filament assignment",
        message: `${job.name ?? job.id} is not assigned to a filament spool/material.`,
        section: "production",
        relatedRecordId: job.id,
        suggestedActionId: "assign-filament",
      });
    }
  }

  return alerts;
}
