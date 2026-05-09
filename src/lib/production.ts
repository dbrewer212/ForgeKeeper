import type { AppSettings, FilamentDemand, FilamentRecord, OrderRecord, PrinterLoad, PrinterRecord, Product, ProductionMetrics } from "../types/domain";

const ACTIVE_STATUSES = new Set(["Queued", "Printing", "Finishing", "Packed"]);

export function isActiveProductionOrder(order: OrderRecord): boolean {
  return ACTIVE_STATUSES.has(order.status);
}

export function orderPrintHours(order: OrderRecord, product?: Product): number {
  const quantity = Math.max(1, Number(order.quantity) || 1);
  const hoursPerUnit = Number(order.estimatedPrintHours || product?.estimatedPrintHours || 0) || 0;
  return hoursPerUnit * quantity;
}

export function orderMaterialGrams(order: OrderRecord, product?: Product): number {
  const quantity = Math.max(1, Number(order.quantity) || 1);
  const gramsPerUnit = Number(order.materialGrams ?? product?.estimatedFilamentGrams ?? 0) || 0;
  return gramsPerUnit * quantity;
}

export function calculatePrinterLoads(orders: OrderRecord[], products: Product[], printers: PrinterRecord[]): PrinterLoad[] {
  return printers.map((printer) => {
    const assignedOrders = orders.filter((order) => isActiveProductionOrder(order) && order.printerId === printer.id);
    const hours = assignedOrders.reduce((sum, order) => sum + orderPrintHours(order, products.find((product) => product.id === order.productId)), 0);
    return {
      printerId: printer.id,
      name: printer.name,
      hours,
      jobs: assignedOrders.length,
      status: printer.status,
    };
  });
}

export function calculateFilamentDemand(orders: OrderRecord[], products: Product[], filament: FilamentRecord[]): FilamentDemand[] {
  return filament.map((spool) => {
    const neededGrams = orders
      .filter((order) => isActiveProductionOrder(order) && !order.materialConsumed && order.filamentId === spool.id)
      .reduce((sum, order) => sum + orderMaterialGrams(order, products.find((product) => product.id === order.productId)), 0);
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
  orders: OrderRecord[],
  products: Product[],
  printers: PrinterRecord[],
  filament: FilamentRecord[],
  settings: AppSettings,
): ProductionMetrics {
  const activeOrders = orders.filter(isActiveProductionOrder);
  const printerLoads = calculatePrinterLoads(activeOrders, products, printers);
  const totalQueueHours = activeOrders.reduce((sum, order) => sum + orderPrintHours(order, products.find((product) => product.id === order.productId)), 0);
  const assignedQueueHours = activeOrders
    .filter((order) => Boolean(order.printerId))
    .reduce((sum, order) => sum + orderPrintHours(order, products.find((product) => product.id === order.productId)), 0);
  const unassignedQueueHours = Math.max(0, totalQueueHours - assignedQueueHours);
  const maxPrinterLoad = printerLoads.reduce((max, load) => Math.max(max, load.hours), 0);
  const activePrinterCount = Math.max(1, printers.filter((printer) => printer.status !== "Offline" && printer.status !== "Maintenance").length);
  const balancedEstimate = totalQueueHours / activePrinterCount;
  const estimatedCompletionHours = Math.max(maxPrinterLoad, balancedEstimate);
  const productionHoursPerDay = Math.max(1, Number(settings.productionHoursPerDay || 8));
  const filamentDemand = calculateFilamentDemand(activeOrders, products, filament);
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
    unassignedOrders: activeOrders.filter((order) => !order.printerId).length,
  };
}
