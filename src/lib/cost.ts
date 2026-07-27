import type { AppSettings, FilamentRecord, OrderRecord, PrinterRecord, Product } from "../types/domain";

export type CostBreakdown = {
  material: number;
  electricity: number;
  labor: number;
  packaging: number;
  other: number;
  total: number;
  suggestedPrice: number;
  quotedPrice: number;
  profit: number;
  marginPercent: number;
  gramsUsed: number;
  printHours: number;
  costPerGram: number;
};

export const fallbackSettings: AppSettings = {
  workspaceName: "Fenrir Forgeworks",
  ownerName: "",
  setupCompleted: false,
  laborRate: 18,
  electricityRate: 0.203,
  machineWatts: 250,
  packagingCost: 1.25,
  otherCost: 0.5,
  materialMarkupPercent: 10,
  targetMarginPercent: 50,
  assetRootPath: "FenrirForgeworks/assets",
  productionHoursPerDay: 8,
};

export function filamentCostPerGram(filament?: FilamentRecord): number {
  if (!filament || filament.spoolPrice <= 0 || filament.spoolWeightGrams <= 0) return 0;
  return filament.spoolPrice / filament.spoolWeightGrams;
}

export function suggestedPriceFromCost(totalCost: number, targetMarginPercent: number): number {
  const margin = Math.max(0, Math.min(95, targetMarginPercent)) / 100;
  if (margin <= 0) return totalCost;
  return totalCost / (1 - margin);
}

export function getOrderCostBreakdown(
  order: OrderRecord,
  product?: Product,
  filament?: FilamentRecord,
  printer?: PrinterRecord,
  settings: AppSettings = fallbackSettings,
): CostBreakdown {
  const quantity = Math.max(1, Number(order.quantity) || 1);
  const gramsPerUnit = Number(order.materialGrams ?? product?.estimatedFilamentGrams ?? 0) || 0;
  const gramsUsed = gramsPerUnit * quantity;
  const costPerGram = filamentCostPerGram(filament);
  const material = gramsUsed * costPerGram;

  const printHoursPerUnit = Number(order.estimatedPrintHours || product?.estimatedPrintHours || 0) || 0;
  const printHours = printHoursPerUnit * quantity;
  const watts = Number(order.machineWatts || printer?.watts || settings.machineWatts || 0) || 0;
  const electricityRate = Number(order.electricityRate || settings.electricityRate || 0) || 0;
  const electricity = (watts / 1000) * printHours * electricityRate;

  const laborHours = Number(order.laborHours || 0) || 0;
  const laborRate = Number(order.laborRate || settings.laborRate || 0) || 0;
  const labor = laborHours * laborRate;

  const packaging = Number(order.packagingCost ?? settings.packagingCost ?? 0) || 0;
  const other = Number(order.otherCost ?? settings.otherCost ?? 0) || 0;
  const total = material + electricity + labor + packaging + other;
  const suggestedPrice = suggestedPriceFromCost(total, settings.targetMarginPercent);
  const quotedPrice = Number(order.quotedPrice || 0) || 0;
  const profit = quotedPrice - total;
  const marginPercent = quotedPrice > 0 ? (profit / quotedPrice) * 100 : 0;

  return {
    material,
    electricity,
    labor,
    packaging,
    other,
    total,
    suggestedPrice,
    quotedPrice,
    profit,
    marginPercent,
    gramsUsed,
    printHours,
    costPerGram,
  };
}

export function directCost(
  order: OrderRecord,
  product?: Product,
  settings: AppSettings = fallbackSettings,
  filament?: FilamentRecord,
  printer?: PrinterRecord,
): number {
  return getOrderCostBreakdown(order, product, filament, printer, settings).total;
}
