import type { AppSettings, FilamentDemand, FilamentRecord, ProductionJob, PrinterLoad, PrinterRecord, DesignProject, ProductionMetrics } from "../types/domain";

const ACTIVE_STATUSES = new Set(["Queued", "Printing", "Finishing"]);

export function isActiveProductionJob(job: ProductionJob): boolean {
  return ACTIVE_STATUSES.has(job.status);
}

export function jobPrintHours(job: ProductionJob, design?: DesignProject): number {
  const quantity = Math.max(1, Number(job.quantity) || 1);
  const hoursPerUnit = Number(job.estimatedPrintHours || design?.estimatedPrintHours || 0) || 0;
  return hoursPerUnit * quantity;
}

export function jobMaterialGrams(job: ProductionJob, design?: DesignProject): number {
  const quantity = Math.max(1, Number(job.quantity) || 1);
  const gramsPerUnit = Number(job.materialGrams ?? design?.estimatedFilamentGrams ?? 0) || 0;
  return gramsPerUnit * quantity;
}

export function calculatePrinterLoads(productionJobs: ProductionJob[], designProjects: DesignProject[], printers: PrinterRecord[]): PrinterLoad[] {
  return printers.map((printer) => {
    const assignedJobs = productionJobs.filter((job) => isActiveProductionJob(job) && job.printerId === printer.id);
    const hours = assignedJobs.reduce((sum, job) => sum + jobPrintHours(job, designProjects.find((design) => design.id === job.designProjectId)), 0);
    return {
      printerId: printer.id,
      name: printer.name,
      hours,
      jobs: assignedJobs.length,
      status: printer.status,
    };
  });
}

export function calculateFilamentDemand(productionJobs: ProductionJob[], designProjects: DesignProject[], filament: FilamentRecord[]): FilamentDemand[] {
  return filament.map((spool) => {
    const neededGrams = productionJobs
      .filter((job) => isActiveProductionJob(job) && !job.materialConsumed && job.filamentId === spool.id)
      .reduce((sum, job) => sum + jobMaterialGrams(job, designProjects.find((design) => design.id === job.designProjectId)), 0);
    return {
      filamentId: spool.id,
      name: `${spool.colorName} (${spool.material})`,
      neededGrams,
      availableGrams: spool.gramsAvailable,
      shortageGrams: Math.max(0, neededGrams - spool.gramsAvailable),
    };
  });
}

export function calculateProductionMetrics(
  productionJobs: ProductionJob[],
  designProjects: DesignProject[],
  printers: PrinterRecord[],
  filament: FilamentRecord[],
  settings: AppSettings,
): ProductionMetrics {
  const activeJobs = productionJobs.filter(isActiveProductionJob);
  const printerLoads = calculatePrinterLoads(activeJobs, designProjects, printers);
  const totalQueueHours = activeJobs.reduce((sum, job) => sum + jobPrintHours(job, designProjects.find((design) => design.id === job.designProjectId)), 0);
  const assignedQueueHours = activeJobs
    .filter((job) => Boolean(job.printerId))
    .reduce((sum, job) => sum + jobPrintHours(job, designProjects.find((design) => design.id === job.designProjectId)), 0);
  const unassignedQueueHours = Math.max(0, totalQueueHours - assignedQueueHours);
  const maxPrinterLoad = printerLoads.reduce((max, load) => Math.max(max, load.hours), 0);
  const activePrinterCount = Math.max(1, printers.filter((printer) => printer.status !== "Offline" && printer.status !== "Maintenance").length);
  const balancedEstimate = totalQueueHours / activePrinterCount;
  const estimatedCompletionHours = Math.max(maxPrinterLoad, balancedEstimate);
  const productionHoursPerDay = Math.max(1, Number(settings.productionHoursPerDay || 8));
  const filamentDemand = calculateFilamentDemand(activeJobs, designProjects, filament);
  const filamentNeededGrams = filamentDemand.reduce((sum, item) => sum + item.neededGrams, 0);
  const bottleneckThreshold = productionHoursPerDay * 2;
  const bottlenecks = printerLoads.filter((load) => load.hours > bottleneckThreshold || load.status === "Maintenance" || load.status === "Offline");

  return {
    totalQueueHours,
    assignedQueueHours,
    unassignedQueueHours,
    estimatedCompletionHours,
    estimatedCompletionDays: estimatedCompletionHours / productionHoursPerDay,
    filamentNeededGrams,
    printerLoads,
    filamentDemand,
    bottlenecks,
    unassignedJobs: activeJobs.filter((job) => !job.printerId).length,
  };
}
