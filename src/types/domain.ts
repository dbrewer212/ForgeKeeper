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

export type PrintTrialCriterion = {
  id: string;
  label: string;
  result: PrintTrialCriterionResult;
  observation: string;
};

export type PrintTrialRecord = {
  id: string;
  productId: string;
  conceptId: string;
  modelVerificationId: string;
  stlId?: string;
  modelPath: string;
  modelRevision: string;
  modelSha256: string;
  printerId: string;
  nozzleDiameterMm: number;
  filamentId?: string;
  materialName: string;
  materialDryState: MaterialDryState;
  slicer: string;
  slicerVersion: string;
  profileName: string;
  profileRevision: string;
  orientation: string;
  supports: string;
  partDivision: string;
  assemblyMethod: string;
  controlledVariables: string[];
  criteria: PrintTrialCriterion[];
  estimatedTimeHours?: number;
  actualTimeHours?: number;
  estimatedMaterialGrams?: number;
  actualMaterialGrams?: number;
  cleanupMinutes?: number;
  assemblyMinutes?: number;
  dimensionalResults: string;
  surfaceResult: string;
  supportRemovalResult: string;
  failureMode: string;
  evidencePaths: string[];
  status: PhysicalTestStatus;
  outcomeVerifiedByDerek: boolean;
  outcomeVerifiedAt?: string;
  startedAt?: string;
  completedAt?: string;
  notes: string;
  nextAction: string;
  createdAt: string;
  updatedAt: string;
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

export type FilamentProfile = {
  id: string;
  brand: string;
  productLine: string;
  material: FilamentMaterial;
  colorName: string;
  colorFamily: string;
  diameterMm: number;
  nominalWeightGrams: number;
  emptySpoolWeightGrams?: number;
  reorderPointGrams: number;
  defaultSpoolPrice: number;
  supplier: string;
  supplierSku: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

/** Physical spool. Legacy material fields remain as a compatibility snapshot for orders and costing. */
export type FilamentRecord = {
  id: string;
  profileId: string;
  foundrySpoolCode: string;
  brand: string;
  material: FilamentMaterial;
  colorName: string;
  colorFamily: string;
  gramsAvailable: number;
  quantityConfidence: FilamentQuantityConfidence;
  condition: FilamentSpoolCondition;
  status: FilamentSpoolStatus;
  grossWeightGrams?: number;
  estimatedPercent?: number;
  reorderPointGrams: number;
  spoolPrice: number;
  spoolWeightGrams: number;
  emptySpoolWeightGrams?: number;
  storageLocation: string;
  purchaseDate: string;
  lotNumber: string;
  dryingStatus: FilamentDryingStatus;
  dryingHistory: string;
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
  quantityConfidence: FilamentQuantityConfidence;
  reason: string;
  orderId?: string;
  reservationId?: string;
  reversesTransactionId?: string;
  reversedByTransactionId?: string;
  occurredAt: string;
  notes: string;
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
  fingerprint: string;
  filename: string;
  importedAt: string;
  profileCount: number;
  spoolCount: number;
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
  lastReconciledAt?: string;
  reconciliationMessage?: string;
  error?: string;
};

export type AuditEventType = "Backup" | "Restore" | "Integrity" | "Credential" | "Provider" | "Data Change" | "System";
export type AuditEventOutcome = "Info" | "Success" | "Warning" | "Blocked" | "Failed";
export type IntegritySeverity = "Info" | "Warning" | "Critical";
export type IntegrityFindingStatus = "Open" | "Acknowledged" | "Resolved";

export type AuditEvent = {
  id: string;
  occurredAt: string;
  type: AuditEventType;
  action: string;
  outcome: AuditEventOutcome;
  summary: string;
  subjectId?: string;
};

export type IntegrityFinding = {
  id: string;
  severity: IntegritySeverity;
  category: "Relationship" | "Asset" | "Checksum" | "Provider Job" | "Credential" | "Backup" | "Inventory";
  title: string;
  detail: string;
  subjectId?: string;
  status: IntegrityFindingStatus;
};

export type IntegrityScanRecord = {
  id: string;
  startedAt: string;
  completedAt: string;
  desktopFileChecksAvailable: boolean;
  checkedPathCount: number;
  findings: IntegrityFinding[];
};

export type CredentialHealthRecord = {
  checkedAt: string;
  filePath: string;
  readable: boolean;
  meshyConfigured: boolean;
  printpalConfigured: boolean;
  message: string;
};

export type RecoverySystemRecord = {
  auditEvents: AuditEvent[];
  lastIntegrityScan?: IntegrityScanRecord;
  credentialHealth?: CredentialHealthRecord;
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
  recovery: RecoverySystemRecord;
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
