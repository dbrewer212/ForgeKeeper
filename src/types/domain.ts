import type { PlannedFilament, PlannedPrototype, ProductPlanningRecord, RealmMaterialReference } from "./planning";

export type ProductTier = "Hero" | "Utility";
export type ProductLine = "ForgeTech" | "Foundry" | "Relics of the Nine Realms" | "Runehallow Relics";
export type ProductStatus = "Concept" | "Prototype" | "Active" | "Production" | "Archived";
export type OrderStatus = "Queued" | "Printing" | "Finishing" | "Packed" | "Shipped";
export type OrderPriority = "Low" | "Normal" | "High" | "Rush";
export type ReleaseStatus = "Planning" | "Scheduled" | "Live";
export type FilamentMaterial = "PLA" | "PLA+" | "PETG" | "ABS" | "ASA" | "TPU" | "Nylon" | "PC" | "Other";
export type FilamentSpoolCondition = "Sealed" | "Used" | "Empty";
export type FilamentQuantityConfidence = "Exact" | "Nominal" | "Estimated" | "Unknown";
export type FilamentSpoolStatus = "In Stock" | "In Use" | "Empty" | "Archived";
export type FilamentDryingStatus = "Unknown" | "Dry" | "Needs Drying" | "Dried";
export type MaterialTransactionType = "Opening Balance" | "Receipt" | "Measurement" | "Correction" | "Consumption" | "Waste" | "Reservation" | "Reservation Release" | "Drying" | "Archived" | "Restored" | "Reversal";
export type MaterialReservationStatus = "Active" | "Consumed" | "Released";
export type PrinterStatus = "Available" | "Printing" | "Maintenance" | "Offline";
export type ProductTab = "overview" | "stls" | "concepts" | "variants" | "orders";
export type AssetStatus = "Planned" | "Linked" | "Needs Update" | "Archived";
export type SlicerKey = "orca" | "anycubic";
export type ViewKey =
  | "dashboard"
  | "designs"
  | "planning"
  | "production"
  | "filament"
  | "printers"
  | "reports"
  | "settings"
  | "commissioning"
  // Compatibility aliases retained only for persisted pre-Workbench navigation state.
  | "canon"
  | "catalog"
  | "collections"
  | "releases"
  | "orders"
  | "recovery";
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
export type PrintTrialCriterionResult = "Pending" | "Pass" | "Fail";
export type MaterialDryState = "Unknown" | "Dry" | "Dried for Trial" | "Not Dried";
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
  background: string;
  status: ProductionReferenceStatus;
  checks: ProductionReferenceChecks;
  notes: string;
  createdAt: string;
};

export type VisualVerificationCheck = { id: string; label: string; result: AssessmentResult; notes: string };
export type MeshVerificationCheck = { id: string; label: string; result: AssessmentResult; notes: string };

export type ModelVerificationRecord = {
  id: string;
  productId: string;
  conceptId?: string;
  productionReferenceId?: string;
  modelPath: string;
  modelRevision: string;
  modelSha256: string;
  inspectionViews: Partial<Record<InspectionView, string>>;
  visualChecks: VisualVerificationCheck[];
  meshChecks: MeshVerificationCheck[];
  visualDecision: VisualReviewDecision;
  forgeabilityStatus: ForgeabilityStatus;
  physicalTestStatus: PhysicalTestStatus;
  risks: string[];
  requirements: string[];
  unknowns: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type PrintTrialCriterion = { id: string; label: string; result: PrintTrialCriterionResult; notes: string };

export type PrintTrialRecord = {
  id: string;
  productId: string;
  modelVerificationId?: string;
  modelPath: string;
  modelRevision: string;
  modelSha256: string;
  printerId?: string;
  filamentId?: string;
  materialDryState: MaterialDryState;
  slicer: string;
  slicerVersion: string;
  profileName: string;
  layerHeightMm?: number;
  nozzleMm?: number;
  infillPercent?: number;
  supportStrategy: string;
  orientation: string;
  partDivision: string;
  assemblyMethod: string;
  controlledVariables: string[];
  criteria: PrintTrialCriterion[];
  status: PhysicalTestStatus;
  dimensionalResults: string;
  surfaceResult: string;
  supportRemovalResult: string;
  failureMode: string;
  evidencePaths: string[];
  outcomeVerifiedByDerek: boolean;
  notes: string;
  nextAction: string;
  createdAt: string;
  updatedAt: string;
};

export type ProductVariant = {
  id: string;
  productId: string;
  name: string;
  realm: RealmVariant;
  sku: string;
  productImagePath: string;
  conceptImagePath: string;
  filamentId?: string;
  priceModifier: number;
  isActive: boolean;
  notes: string;
};

export type CollectionRecord = { id: string; name: string; description: string };
export type ReleaseRecord = { id: string; name: string; status: ReleaseStatus; plannedDate: string; productIds: string[]; notes: string };

export type OrderRecord = {
  id: string;
  productId: string;
  variantId?: string;
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
  estimatedPrintHours: number;
  laborHours: number;
  laborRate: number;
  machineWatts: number;
  electricityRate: number;
  packagingCost: number;
  otherCost: number;
  quotedPrice: number;
  materialConsumed?: boolean;
  notes: string;
};

export type FilamentProfile = {
  id: string;
  brand: string;
  material: FilamentMaterial;
  colorName: string;
  colorHex?: string;
  spoolSizeGrams: number;
  diameterMm: number;
  densityGPerCm3?: number;
  defaultNozzleC?: number;
  defaultBedC?: number;
  defaultCostPerKg?: number;
  vendor?: string;
  manufacturerSku?: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type FilamentRecord = {
  id: string;
  foundrySpoolCode: string;
  profileId: string;
  brand: string;
  material: FilamentMaterial;
  colorName: string;
  colorHex?: string;
  spoolSizeGrams: number;
  gramsAvailable: number;
  quantityConfidence: FilamentQuantityConfidence;
  condition: FilamentSpoolCondition;
  status: FilamentSpoolStatus;
  qrPayload: string;
  tareGrams?: number;
  grossGrams?: number;
  measuredAt?: string;
  receivedAt?: string;
  openedAt?: string;
  emptiedAt?: string;
  location?: string;
  lotCode?: string;
  purchaseDate?: string;
  purchasePrice?: number;
  vendor?: string;
  manufacturerSku?: string;
  dryingStatus: FilamentDryingStatus;
  dryingHistory: string;
  reorderPointGrams: number;
  linkedOrderIds: string[];
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type MaterialTransaction = {
  id: string;
  spoolId: string;
  profileId: string;
  type: MaterialTransactionType;
  deltaGrams: number;
  balanceAfterGrams: number;
  confidence: FilamentQuantityConfidence;
  reason: string;
  orderId?: string;
  reservationId?: string;
  reversalOfId?: string;
  notes?: string;
  occurredAt: string;
};

export type MaterialReservation = {
  id: string;
  profileId: string;
  spoolId?: string;
  orderId?: string;
  grams: number;
  status: MaterialReservationStatus;
  purpose: string;
  createdAt: string;
  resolvedAt?: string;
};

export type FilamentDryingRecord = {
  id: string;
  spoolId: string;
  temperatureC: number;
  durationHours: number;
  outcome: "Dry" | "Needs More Drying" | "Unknown";
  occurredAt: string;
  notes: string;
};

export type MaterialImportRecord = {
  id: string;
  source: string;
  receivedAt: string;
  rows: number;
  createdProfiles: number;
  createdSpools: number;
  skippedRows: number;
  notes: string;
};

export type PrinterRecord = {
  id: string;
  name: string;
  model: string;
  buildVolume: string;
  status: PrinterStatus;
  activeJob: string;
  slicer: SlicerKey;
  slicerPath?: string;
  slicerProfileName?: string;
  nozzleMm?: number;
  maxNozzleC?: number;
  maxBedC?: number;
  supportedMaterials?: FilamentMaterial[];
  connection?: string;
  capabilities?: string[];
  watts: number;
  notes: string;
};

export type MaintenanceRecord = {
  id: string;
  printerId: string;
  date: string;
  description: string;
};

export type GenerationJobRecord = {
  id: string;
  productId: string;
  conceptId?: string;
  provider: GenerationProvider;
  sourceImagePath: string;
  externalTaskId?: string;
  status: string;
  expectedCredits: number;
  creditsUsed?: number;
  outputFileName?: string;
  outputFilePath?: string;
  reviewStatus: GenerationReviewStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ObjectiveStatusLegacy = ObjectiveStatus;

export type ActiveObjective = {
  id: string;
  title: string;
  productId?: string;
  stage: PipelineStage;
  status: ObjectiveStatus;
  lastCompletedAction: string;
  nextAction: string;
  blocker: string;
  approvalNeeded: string;
  notes: string;
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

export type CanonRecord = {
  id: string;
  name: string;
  canonType: "Character" | "Species" | "Product Line" | "Collection" | "System" | "World" | "Other";
  status: "Draft" | "Locked" | "Retired";
  summary: string;
  identity: string;
  traits: string[];
  designRules: string[];
  prohibitedChanges: string[];
  foundryRole: string;
  relationships: string[];
  currentProductionDesign: string;
  decisionEvidence: string;
  authorityBasis: "Memory Canon" | "Library File" | "Decision Record" | "Mixed Evidence";
  assetLinks: string[];
  sourceRefs: string[];
  notes: string;
  updatedAt: string;
};

export type LibraryAssetType = "Concept Art" | "Production Reference" | "Model" | "Print Evidence" | "Document" | "Other";
export type LibraryAssetRecord = {
  id: string;
  name: string;
  assetType: LibraryAssetType;
  sourcePath: string;
  libraryPath: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  importedAt: string;
  modifiedAt: string;
  sourceRecordType?: string;
  sourceRecordId?: string;
  notes: string;
};

export type BackupEnvelope = {
  version: number;
  exportedAt: string;
  sha256: string;
  data: AppData;
};

export type IntegritySeverity = "Info" | "Warning" | "Error";
export type IntegrityFinding = { id: string; severity: IntegritySeverity; area: string; summary: string; detail: string; relatedId?: string };
export type IntegrityScan = { id: string; runAt: string; findings: IntegrityFinding[]; summary: { info: number; warnings: number; errors: number } };
export type CredentialHealthStatus = "Not Configured" | "Configured" | "Readable" | "Unreadable";
export type CredentialHealthRecord = { path: string; status: CredentialHealthStatus; checkedAt: string; detail: string };
export type AuditEvent = { id: string; occurredAt: string; category: "Data Change" | "Backup" | "Recovery" | "Credential" | "Integrity" | "Provider"; action: string; outcome: "Success" | "Warning" | "Failure"; detail: string; relatedId?: string };
export type RecoveryState = { lastIntegrityScan?: IntegrityScan; credentialHealth?: CredentialHealthRecord; auditEvents: AuditEvent[] };

export type AppSettings = {
  laborRate: number;
  electricityRate: number;
  machineWatts: number;
  packagingCost: number;
  otherCost: number;
  printerConnectionMode?: string;
  generationCreditsApprovedDefault?: number;
  externalTools?: Partial<Record<"orca" | "anycubic" | "blender", string>>;
  libraryPath?: string;
  providerCredentialPath?: string;
  providerCredentialStatus?: string;
};

export type AppData = {
  products: Product[];
  stls: STLRecord[];
  concepts: ConceptSpec[];
  productionReferences: ProductionReferenceRecord[];
  modelVerifications: ModelVerificationRecord[];
  printTrials: PrintTrialRecord[];
  variants: ProductVariant[];
  collections: CollectionRecord[];
  releases: ReleaseRecord[];
  orders: OrderRecord[];
  filamentProfiles: FilamentProfile[];
  filament: FilamentRecord[];
  materialTransactions: MaterialTransaction[];
  materialReservations: MaterialReservation[];
  filamentDryingRecords: FilamentDryingRecord[];
  materialImportHistory: MaterialImportRecord[];
  printers: PrinterRecord[];
  maintenance: MaintenanceRecord[];
  generationJobs: GenerationJobRecord[];
  controlCenter: ControlCenterRecord;
  canonRecords: CanonRecord[];
  libraryAssets: LibraryAssetRecord[];
  recovery: RecoveryState;
  settings: AppSettings;
  prototypes: PlannedPrototype[];
  plannedFilament: PlannedFilament[];
  productPlanning: ProductPlanningRecord[];
  realmMaterials: RealmMaterialReference[];
};
