import type { PlannedFilament, PlannedPrototype, ProductPlanningRecord, RealmMaterialReference } from "./planning";

export type ProductPillar = "Foundry" | "Relics" | "ForgeTech" | "Reforged";
export type ProductTier = ProductPillar;
export type ProductLine = "ForgeTech" | "Foundry" | "Relics of the Nine Realms" | "Runehallow Relics";
export type ProductStatus = "Concept" | "Prototype" | "Active" | "Production" | "Archived";
export type PackageCatalogVisibility =
  | "Hidden"
  | "Preview"
  | "Commission Available"
  | "Preorder"
  | "Available"
  | "Retired";

export type ProductVisibility = "Internal" | "Concept" | "Preorder" | "Available" | "Commission Available" | "Archived";
export type DesignPackageStatus = "Planning" | "Active" | "Needs Assets" | "Ready for Catalog" | "Archived";
export type OrderStatus = "Inquiry" | "Estimate" | "Awaiting Deposit" | "Queued" | "Production" | "Finishing" | "Completed" | "Voided" | "Printing" | "Packed" | "Shipped";
export type OrderType = "Catalog Order" | "Custom Request";
export type DepositStatus = "Not Requested" | "Awaiting Deposit" | "Deposit Received" | "Paid in Full" | "Waived" | "Refunded";
export type OrderPriority = "Low" | "Normal" | "High" | "Rush";
export type ReleaseStatus = "Planning" | "Scheduled" | "Live";
export type FilamentMaterial = "PLA" | "PLA+" | "PETG" | "ABS" | "TPU";
export type PrinterStatus = "Available" | "Printing" | "Maintenance" | "Offline";
export type ProductTab = "overview" | "stls" | "concepts" | "variants" | "orders";
export type AssetStatus = "Planned" | "Linked" | "Needs Update" | "Archived";
export type SlicerKey = "orca" | "anycubic";
export type ViewKey = "dashboard" | "catalog" | "customerCatalog" | "collections" | "releases" | "orders" | "filament" | "printers" | "planning" | "reports" | "settings";
export type QuickActionKey = "newProduct" | "newOrder" | "newFilament" | "newPrinter";

export type RealmVariant =
  | "Midgard"
  | "Alfheim"
  | "Svartalfheim"
  | "Vanaheim"
  | "Asgard"
  | "Jotunheim"
  | "Muspelheim"
  | "Niflheim"
  | "Helheim";

export type DesignPackage = {
  id: string;
  catalogVisibility?: PackageCatalogVisibility;
  name: string;
  pillar: ProductPillar;
  family: string;
  status: DesignPackageStatus;
  description: string;
  lore: string;
  conceptSheetPath: string;
  promptNotes: string;
  referenceFolderPath: string;
  stlFolderPath: string;
  photoFolderPath: string;
  catalogHeroImagePath: string;
  estimatedFilamentGrams: number;
  estimatedPrintHours: number;
  cleanupMinutes: number;
  assemblyMinutes: number;
  paintingMinutes: number;
  packagingMinutes: number;
  notes: string;
};

export type Product = {
  id: string;
  name: string;
  tier: ProductTier;
  line: ProductLine;
  category: string;
  collection: string;
  designPackageId?: string;
  status: ProductStatus;
  visibility: ProductVisibility;
  targetPrice: number;
  estimatedFilamentGrams: number;
  estimatedPrintHours: number;
  available: number;
  reorderPoint: number;
  productImagePath: string;
  conceptImagePath: string;
  supportedRealmVariants: RealmVariant[];
  notes: string;
};

export type STLRecord = {
  id: string;
  productId: string;
  name: string;
  fileName: string;
  filePath?: string;
  folderPath?: string;
  libraryPath?: string;
  version: string;
  isPrimary: boolean;
  defaultPrinterId?: string;
  defaultSlicer?: SlicerKey;
  linkedConceptId?: string;
  assetStatus?: AssetStatus;
  notes: string;
};

export type ConceptSpec = {
  id: string;
  productId: string;
  title: string;
  imageName: string;
  imagePath?: string;
  measurementImagePath?: string;
  referenceFolderPath?: string;
  measurements: string;
  description: string;
  notes: string;
  linkedStlId?: string;
  linkedStlIds?: string[];
};

export type ProductVariant = {
  id: string;
  productId: string;
  realm: RealmVariant;
  name: string;
  variantCode?: string;
  productImagePath: string;
  conceptImagePath: string;
  stlId?: string;
  conceptId?: string;
  filamentId?: string;
  priceModifier: number;
  estimatedFilamentGrams?: number;
  estimatedPrintHours?: number;
  isActive: boolean;
  notes: string;
};

export type CollectionRecord = {
  id: string;
  name: string;
  line: ProductLine;
  description: string;
  heroProductId?: string;
};

export type ReleaseRecord = {
  id: string;
  name: string;
  wave: string;
  targetDate: string;
  status: ReleaseStatus;
  productIds: string[];
  notes: string;
};

export type OrderRecord = {
  id: string;
  productId: string;
  designPackageId?: string;
  designPackageName?: string;
  designPackageCode?: string;
  selectedVariantId?: string;
  selectedVariantName?: string;
  selectedVariantCode?: string;
  packageVersionSnapshot?: string;
  packageSnapshot?: string;
  filamentId?: string;
  materialGrams?: number;
  customer: string;
  contact: string;
  customerEmail?: string;
  customerPhone?: string;
  orderType: OrderType;
  requestSource: "Admin" | "Customer Catalog" | "Event" | "Manual";
  depositRequired: boolean;
  depositAmount: number;
  depositPaid: boolean;
  depositStatus: DepositStatus;
  quantity: number;
  dueDate: string;
  status: OrderStatus;
  priority: OrderPriority;
  paid: boolean;
  tracking: string;
  printerId?: string;
  materialConsumed?: boolean;
  estimatedPrintHours: number;
  laborHours: number;
  laborRate: number;
  machineWatts: number;
  electricityRate: number;
  packagingCost: number;
  otherCost: number;
  quotedPrice: number;
  notes: string;
};

export type FilamentRecord = {
  id: string;
  brand: string;
  material: FilamentMaterial;
  colorName: string;
  colorFamily: string;
  gramsAvailable: number;
  reorderPointGrams: number;
  spoolPrice: number;
  spoolWeightGrams: number;
  notes: string;
};

export type PrinterRecord = {
  id: string;
  name: string;
  model: string;
  status: PrinterStatus;
  buildVolume: string;
  watts: number;
  activeJob: string;
  notes: string;
};

export type MaintenanceRecord = {
  id: string;
  printerId: string;
  title: string;
  performedOn: string;
  notes: string;
};

export type AppSettings = {
  laborRate: number;
  electricityRate: number;
  machineWatts: number;
  packagingCost: number;
  otherCost: number;
  materialMarkupPercent: number;
  targetMarginPercent: number;
  assetRootPath: string;
  productionHoursPerDay: number;
  forgekeeperLibraryPath?: string;
  orcaSlicerPath?: string;
  anycubicSlicerPath?: string;
  blenderPath?: string;
  meshyUrl?: string;
  defaultSlicer?: "orca" | "anycubic";
};

export type AppData = {
  products: Product[];
  designPackages: DesignPackage[];
  stls: STLRecord[];
  concepts: ConceptSpec[];
  variants: ProductVariant[];
  collections: CollectionRecord[];
  releases: ReleaseRecord[];
  orders: OrderRecord[];
  filament: FilamentRecord[];
  printers: PrinterRecord[];
  maintenance: MaintenanceRecord[];
  settings: AppSettings;
  prototypes: PlannedPrototype[];
  plannedFilament: PlannedFilament[];
  productPlanning: ProductPlanningRecord[];
  realmMaterials: RealmMaterialReference[];
};


export type PrinterLoad = {
  printerId: string;
  name: string;
  hours: number;
  jobs: number;
  status: PrinterStatus;
};

export type FilamentDemand = {
  filamentId: string;
  name: string;
  neededGrams: number;
  availableGrams: number;
  shortageGrams: number;
};

export type ProductionMetrics = {
  totalQueueHours: number;
  assignedQueueHours: number;
  unassignedQueueHours: number;
  estimatedCompletionHours: number;
  estimatedCompletionDays: number;
  filamentNeededGrams: number;
  printerLoads: PrinterLoad[];
  filamentDemand: FilamentDemand[];
  bottlenecks: PrinterLoad[];
  unassignedOrders: number;
};
