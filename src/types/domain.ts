import type { PlannedFilament, PlannedPrototype, ProductPlanningRecord, RealmMaterialReference } from "./planning";

export type ProductTier = "Hero" | "Utility";
export type ProductLine = "ForgeTech" | "Foundry" | "Relics of the Nine Realms" | "Runehallow Relics";
export type ProductStatus = "Concept" | "Prototype" | "Active" | "Production" | "Archived";
export type OrderStatus = "Queued" | "Printing" | "Finishing" | "Packed" | "Shipped";
export type OrderPriority = "Low" | "Normal" | "High" | "Rush";
export type ReleaseStatus = "Planning" | "Scheduled" | "Live";
export type FilamentMaterial = "PLA" | "PLA+" | "PETG" | "ABS" | "TPU";
export type PrinterStatus = "Available" | "Printing" | "Maintenance" | "Offline";
export type ProductTab = "overview" | "stls" | "concepts" | "variants" | "orders";
export type AssetStatus = "Planned" | "Linked" | "Needs Update" | "Archived";
export type SlicerKey = "orca" | "anycubic";
export type ViewKey = "dashboard" | "canon" | "catalog" | "collections" | "releases" | "orders" | "filament" | "printers" | "planning" | "reports" | "settings";
export type QuickActionKey = "newProduct" | "newOrder" | "newFilament" | "newPrinter";
export type GenerationProvider = "meshy" | "printpal";
export type GenerationReviewStatus = "pending" | "accepted" | "rejected";
export type ProductionReferenceStatus = "Draft" | "Ready" | "Retired";
export type ProductionReferenceView = "Front" | "Left" | "Right" | "Back" | "Top" | "Three-quarter";
export type EvidenceClass = "Concept only" | "Mesh available" | "Sliced" | "Physical trial" | "Production evidence";
export type AssessmentResult = "Not Assessed" | "Pass" | "Fail";
export type VisualReviewDecision = "Pending" | "Accepted" | "Changes Required" | "Rejected";
export type ForgeabilityStatus = "Pending" | "Changes Required" | "Blocked" | "Approved";
export type PhysicalTestStatus = "Not Started" | "In Progress" | "Passed" | "Failed";
export type InspectionView = "Front" | "Left" | "Right" | "Back" | "Top" | "Three-quarter" | "Silhouette" | "Components";
export type PipelineStage = "Planning" | "Concept Approved" | "Engineering" | "Prototype" | "Print Trial" | "Production Approved" | "Released";
export type ObjectiveStatus = "Active" | "Paused" | "Complete";

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

export type Product = {
  id: string;
  name: string;
  tier: ProductTier;
  line: ProductLine;
  category: string;
  collection: string;
  status: ProductStatus;
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
  generationReferencePath?: string;
  generationReferenceId?: string;
  canonRecordId?: string;
  measurementImagePath?: string;
  referenceFolderPath?: string;
  measurements: string;
  description: string;
  notes: string;
  linkedStlId?: string;
  linkedStlIds?: string[];
};

export type ProductionReferenceChecks = {
  oneSubject: boolean;
  onePose: boolean;
  cleanBackground: boolean;
  noTextOrBorders: boolean;
  noInsetsOrCollage: boolean;
  noScaleFigure: boolean;
  noVariantLineup: boolean;
  noLooseProps: boolean;
  silhouetteReadable: boolean;
  canonIdentityPreserved: boolean;
};

export type ProductionReferenceRecord = {
  id: string;
  conceptId: string;
  sourceLibraryAssetId?: string;
  outputPath: string;
  view: ProductionReferenceView;
  subject: string;
  pose: string;
  background: "Transparent" | "Neutral Light" | "Neutral Dark";
  status: ProductionReferenceStatus;
  checks: ProductionReferenceChecks;
  notes: string;
  createdAt: string;
  verifiedAt?: string;
};

export type VerificationCheck = {
  id: string;
  label: string;
  result: AssessmentResult;
  note: string;
};

export type ModelVerificationRecord = {
  id: string;
  productId: string;
  conceptId: string;
  canonRecordId?: string;
  generationJobId?: string;
  stlId?: string;
  modelPath: string;
  modelRevision: string;
  modelSha256: string;
  evidenceClass: EvidenceClass;
  inspectionViews: Partial<Record<InspectionView, string>>;
  visualChecks: VerificationCheck[];
  meshChecks: VerificationCheck[];
  visualDecision: VisualReviewDecision;
  forgeabilityStatus: ForgeabilityStatus;
  physicalTestStatus: PhysicalTestStatus;
  risks: string[];
  requirements: string[];
  unknowns: string[];
  notes: string;
  createdAt: string;
  assessedAt?: string;
};

export type ProductVariant = {
  id: string;
  productId: string;
  realm: RealmVariant;
  name: string;
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
  filamentId?: string;
  materialGrams?: number;
  customer: string;
  contact: string;
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

export type GenerationJobRecord = {
  id: string;
  provider: GenerationProvider;
  externalJobId: string;
  productId: string;
  conceptId: string;
  sourceImagePath: string;
  productionReferenceId?: string;
  productionReferenceVerifiedAt?: string;
  sourceLibraryAssetId?: string;
  status: string;
  progress?: number;
  creditsUsed?: number;
  creditsRemaining?: number;
  expectedCredits?: number;
  authorizedCreditCeiling?: number;
  attemptNumber?: number;
  generationPurpose?: string;
  providerSelectionReason?: string;
  retryReason?: string;
  approvalSummary?: string;
  reviewStatus?: GenerationReviewStatus;
  outputUrls: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  error?: string;
};

export type ActiveObjective = {
  id: string;
  title: string;
  productId?: string;
  stage: PipelineStage;
  status: ObjectiveStatus;
  blocker: string;
  approvalNeeded: string;
  lastCompletedAction: string;
  nextAction: string;
  updatedAt: string;
};

export type ParkedIdea = {
  id: string;
  title: string;
  notes: string;
  capturedAt: string;
  sourceObjective?: ActiveObjective;
};

export type ControlCenterRecord = {
  activeObjective: ActiveObjective;
  parkedIdeas: ParkedIdea[];
};

export type CanonStatus = "Locked" | "Established Direction" | "Developing" | "Historical";
export type LibraryAssetStatus = "Authoritative" | "Historical" | "Development Candidate" | "Supporting";
export type CanonAssetRole = "Primary Authority" | "Superseded Reference" | "Development Candidate" | "Supporting Reference";

export type LibraryAssetRecord = {
  id: string;
  libraryFileId: string;
  fileId: string;
  name: string;
  libraryPath: string;
  mimeType: string;
  sizeBytes: number;
  modifiedAt: string;
  sha256: string;
  assetType: "Concept Art" | "Document" | "Model" | "Production Reference";
  status: LibraryAssetStatus;
  duplicateOfAssetId?: string;
  notes: string;
};

export type CanonAssetLink = {
  assetId: string;
  role: CanonAssetRole;
  note: string;
};

export type CanonRecord = {
  id: string;
  name: string;
  kind: "Resident" | "Creature" | "Collection" | "Philosophy";
  canonStatus: CanonStatus;
  primaryAuthority: string;
  supersededReferences: string[];
  identity: string;
  foundryRole: string;
  relationships: string[];
  characterDna: string[];
  allowedVariation: string[];
  forbiddenDrift: string[];
  symbolism: string;
  currentProductionDesign: string;
  decisionEvidence: string;
  authorityBasis: "Library Assets" | "Decision Record" | "Mixed";
  assetLinks: CanonAssetLink[];
  lastCanonChange: string;
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
  apiCredentialFilePath?: string;
  orcaSlicerPath?: string;
  anycubicSlicerPath?: string;
  blenderPath?: string;
  meshyUrl?: string;
  defaultSlicer?: "orca" | "anycubic";
};

export type AppData = {
  products: Product[];
  stls: STLRecord[];
  concepts: ConceptSpec[];
  productionReferences: ProductionReferenceRecord[];
  modelVerifications: ModelVerificationRecord[];
  variants: ProductVariant[];
  collections: CollectionRecord[];
  releases: ReleaseRecord[];
  orders: OrderRecord[];
  filament: FilamentRecord[];
  printers: PrinterRecord[];
  maintenance: MaintenanceRecord[];
  generationJobs: GenerationJobRecord[];
  controlCenter: ControlCenterRecord;
  canonRecords: CanonRecord[];
  libraryAssets: LibraryAssetRecord[];
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
