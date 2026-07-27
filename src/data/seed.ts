import type { AppSettings, CollectionRecord, ConceptSpec, FilamentRecord, OrderRecord, PrinterRecord, Product, ProductVariant, ReleaseRecord, STLRecord } from "../types/domain";

export const defaultSettings: AppSettings = {
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

export const seedProducts: Product[] = [
  {
    id: "P1",
    name: "Controller Stand",
    tier: "Hero",
    line: "ForgeTech",
    category: "Controller Stand",
    collection: "ForgeTech Lane",
    status: "Active",
    targetPrice: 29.99,
    estimatedFilamentGrams: 110,
    estimatedPrintHours: 6.5,
    available: 24,
    reorderPoint: 10,
    productImagePath: "/assets/products/controller-stand.png",
    conceptImagePath: "/assets/concepts/controller-stand-concept.png",
    supportedRealmVariants: ["Midgard", "Svartalfheim", "Asgard"],
    notes: "Primary hero product",
  },
  {
    id: "P2",
    name: "Cable Organizer",
    tier: "Utility",
    line: "ForgeTech",
    category: "Cable Organizer",
    collection: "ForgeTech Lane",
    status: "Active",
    targetPrice: 12,
    estimatedFilamentGrams: 22,
    estimatedPrintHours: 1.4,
    available: 52,
    reorderPoint: 20,
    productImagePath: "/assets/products/cable-organizer.png",
    conceptImagePath: "/assets/concepts/cable-organizer-concept.png",
    supportedRealmVariants: [],
    notes: "Utility fast print",
  },
];

export const seedStls: STLRecord[] = [
  { id: "STL-P1-PRIMARY", productId: "P1", name: "Controller Stand Primary STL", fileName: "assets/stls/controller-stand/controller-stand-v1.stl", version: "v1", isPrimary: true, notes: "Primary production file." },
  { id: "STL-P2-PRIMARY", productId: "P2", name: "Cable Organizer Primary STL", fileName: "assets/stls/cable-organizer/cable-organizer-v1.stl", version: "v1", isPrimary: true, notes: "Fast utility print." },
];

export const seedConcepts: ConceptSpec[] = [
  {
    id: "CON-P1-PRIMARY",
    productId: "P1",
    title: "Controller Stand Concept Spec",
    imageName: "/assets/concepts/controller-stand-concept.png",
    measurements: "Track overall footprint, controller cradle width, cable pass-through, and base height.",
    description: "ForgeTech hero item with optional realm styling. Use this spec for listing content and variant planning.",
    notes: "Concept drives STL association and future variant image planning.",
    linkedStlId: "STL-P1-PRIMARY",
  },
  {
    id: "CON-P2-PRIMARY",
    productId: "P2",
    title: "Cable Organizer Concept Spec",
    imageName: "/assets/concepts/cable-organizer-concept.png",
    measurements: "Track channel width, adhesive/contact surface, and cable clearance.",
    description: "ForgeTech utility item with simple production notes and no realm variants by default.",
    notes: "Keep simple and repeatable.",
    linkedStlId: "STL-P2-PRIMARY",
  },
];


export const seedVariants: ProductVariant[] = [
  {
    id: "VAR-P1-MIDGARD",
    productId: "P1",
    realm: "Midgard",
    name: "Controller Stand - Midgard",
    productImagePath: "/assets/products/controller-stand.png",
    conceptImagePath: "/assets/concepts/controller-stand-concept.png",
    stlId: "STL-P1-PRIMARY",
    conceptId: "CON-P1-PRIMARY",
    filamentId: "F2",
    priceModifier: 4,
    estimatedFilamentGrams: 118,
    estimatedPrintHours: 6.8,
    isActive: true,
    notes: "Earth-forged baseline realm variant. Use as the neutral product listing example.",
  },
  {
    id: "VAR-P1-SVARTALFHEIM",
    productId: "P1",
    realm: "Svartalfheim",
    name: "Controller Stand - Svartalfheim",
    productImagePath: "/assets/products/controller-stand.png",
    conceptImagePath: "/assets/concepts/controller-stand-concept.png",
    stlId: "STL-P1-PRIMARY",
    conceptId: "CON-P1-PRIMARY",
    filamentId: "F1",
    priceModifier: 6,
    estimatedFilamentGrams: 122,
    estimatedPrintHours: 7.1,
    isActive: true,
    notes: "Dwarven-tech treatment: darker finish, forged plates, refined industrial accents.",
  },
];

export const seedCollections: CollectionRecord[] = [
  { id: "C1", name: "ForgeTech Lane", line: "ForgeTech", description: "Core desk line", heroProductId: "P1" },
];

export const seedReleases: ReleaseRecord[] = [
  { id: "R1", name: "Wave 01 Deskworks", wave: "Wave 01", targetDate: "2025-06-01", status: "Scheduled", productIds: ["P2"], notes: "Utility launch" },
];

export const seedOrders: OrderRecord[] = [
  { id: "ORD-1001", productId: "P1", filamentId: "F1", materialGrams: 110, customer: "Rune Workshop", contact: "", quantity: 2, dueDate: "May 26, 2026", status: "Printing", priority: "High", paid: true, tracking: "", printerId: "PR1", estimatedPrintHours: 6.5, laborHours: 1, laborRate: 18, machineWatts: 280, electricityRate: 0.203, packagingCost: 1.25, otherCost: 0.5, quotedPrice: 64, notes: "Batch for featured display.", materialConsumed: false },
  { id: "ORD-1002", productId: "P2", filamentId: "F2", materialGrams: 22, customer: "Shelf & Steel", contact: "", quantity: 4, dueDate: "May 28, 2026", status: "Queued", priority: "Normal", paid: false, tracking: "", printerId: undefined, estimatedPrintHours: 1.4, laborHours: 0.5, laborRate: 18, machineWatts: 250, electricityRate: 0.203, packagingCost: 1.25, otherCost: 0.5, quotedPrice: 48, notes: "Utility reorder.", materialConsumed: false },
];

export const seedFilament: FilamentRecord[] = [
  { id: "F1", brand: "Polymaker", material: "PLA+", colorName: "Obsidian Black", colorFamily: "Black", gramsAvailable: 860, reorderPointGrams: 250, spoolPrice: 24.99, spoolWeightGrams: 1000, notes: "Main base color" },
  { id: "F2", brand: "Overture", material: "PLA", colorName: "Gunmetal Gray", colorFamily: "Gray", gramsAvailable: 520, reorderPointGrams: 200, spoolPrice: 22.99, spoolWeightGrams: 1000, notes: "Tech accent color" },
  { id: "F3", brand: "Elegoo", material: "PLA", colorName: "Bone White", colorFamily: "White", gramsAvailable: 340, reorderPointGrams: 150, spoolPrice: 18.99, spoolWeightGrams: 1000, notes: "Paint-ready base" },
];

export const seedPrinters: PrinterRecord[] = [
  { id: "PR1", name: "Neptune 4 Max", model: "Elegoo Neptune 4 Max", status: "Printing", buildVolume: "420 x 420 x 480", watts: 280, activeJob: "Controller Stand", notes: "Large format" },
  { id: "PR2", name: "Kobra 3 Combo", model: "Anycubic Kobra 3 Combo", status: "Available", buildVolume: "250 x 250 x 260", watts: 220, activeJob: "", notes: "Fast support printer" },
];
