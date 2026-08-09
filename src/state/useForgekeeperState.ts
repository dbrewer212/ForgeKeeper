import { useEffect, useMemo, useRef, useState } from "react";
import { defaultControlCenter, defaultSettings, seedCanonRecords, seedCollections, seedConcepts, seedFilament, seedFilamentProfiles, seedLibraryAssets, seedOrders, seedPrinters, seedProducts, seedReleases, seedStls, seedVariants } from "../data/seed";
import { seedPlannedFilament, seedProductPlanning, seedPrototypes, seedRealmMaterials } from "../data/planningSeed";
import { directCost, getOrderCostBreakdown } from "../lib/cost";
import { calculateProductionMetrics, orderMaterialGrams } from "../lib/production";
import { downloadCsv } from "../lib/csv";
import { uid } from "../lib/ids";
import { clearNativeStoredData, clearStoredData, downloadJson, isTauriRuntime, loadNativeStoredData, loadStoredData, saveNativeStoredData, saveStoredData } from "../lib/storage";
import { defaultExternalTools, getToolPath, openLocalPathBestEffort, openWebUrl, slicerForPrinter } from "../lib/externalTools";
import { filenameFromPath, folderFromPath, suggestedLibraryPath } from "../lib/assetLibrary";
import { emptyProductionReferenceChecks, productionReferenceReady, referenceChecksPassed } from "../lib/productionReferences";
import { canApproveForgeability, checksAllPass, defaultMeshChecks, defaultVisualChecks, requiredViewsPresent } from "../lib/modelVerification";
import { defaultPrintTrialCriteria, printTrialCanFail, printTrialCanPass, printTrialReadyToStart } from "../lib/printTrials";
import { getGenerationStatus } from "../lib/generationProviders";
import {
  cleanLegacyOrderAndVariantLinks,
  createPhysicalSpools,
  filamentProfileIdentity,
  migrateFilamentInventory,
  parseFilamentCsv,
  profileFromCsv,
  confidenceFromCsv,
  conditionFromCsv,
  type FilamentSpoolDraft,
} from "../lib/filamentInventory";
import {
  collectInspectablePaths,
  collectStructuralFindings,
  createAuditEvent,
  createBackupEnvelope,
  createIntegrityScan,
  credentialHealthRecord,
  inspectCredentialFile,
  inspectLocalPaths,
  loadRecoveryCheckpoints,
  removeRecoveryCheckpoint,
  saveRecoveryCheckpoint,
  verifyBackupEnvelope,
  type RecoveryCheckpoint,
} from "../lib/recovery";
import type {
  AppData,
  AppSettings,
  CanonRecord,
  CollectionRecord,
  ConceptSpec,
  ControlCenterRecord,
  FilamentRecord,
  FilamentProfile,
  GenerationJobRecord,
  LibraryAssetRecord,
  MaintenanceRecord,
  ModelVerificationRecord,
  OrderRecord,
  OrderStatus,
  PrinterRecord,
  ProductionReferenceRecord,
  PrintTrialRecord,
  Product,
  ProductTab,
  ProductVariant,
  QuickActionKey,
  ReleaseRecord,
  STLRecord,
  ViewKey,
} from "../types/domain";
import type { PlannedFilament, PlannedPrototype, ProductPlanningRecord, RealmMaterialReference } from "../types/planning";

const seedData: AppData = {
  products: seedProducts,
  stls: seedStls,
  concepts: seedConcepts,
  productionReferences: [],
  modelVerifications: [],
  printTrials: [],
  variants: seedVariants.map((variant) => ({ ...variant, filamentId: undefined })),
  collections: seedCollections,
  releases: seedReleases,
  orders: seedOrders,
  filamentProfiles: seedFilamentProfiles,
  filament: seedFilament,
  printers: seedPrinters,
  maintenance: [],
  generationJobs: [],
  controlCenter: defaultControlCenter,
  canonRecords: seedCanonRecords,
  libraryAssets: seedLibraryAssets,
  recovery: { auditEvents: [] },
  settings: { ...defaultExternalTools, ...defaultSettings },
  prototypes: seedPrototypes,
  plannedFilament: seedPlannedFilament,
  productPlanning: seedProductPlanning,
  realmMaterials: seedRealmMaterials,
};

function hydrateCanonRecords(records?: CanonRecord[]): CanonRecord[] {
  return (records ?? seedCanonRecords).map((record) => {
    const seed = seedCanonRecords.find((candidate) => candidate.id === record.id);
    return {
      ...seed,
      ...record,
      foundryRole: record.foundryRole ?? seed?.foundryRole ?? "Not yet recorded.",
      relationships: record.relationships ?? seed?.relationships ?? [],
      currentProductionDesign: record.currentProductionDesign ?? seed?.currentProductionDesign ?? "Not yet recorded.",
      decisionEvidence: record.decisionEvidence ?? seed?.decisionEvidence ?? "No explicit decision evidence recorded.",
      authorityBasis: record.authorityBasis ?? seed?.authorityBasis ?? "Decision Record",
      assetLinks: record.assetLinks ?? seed?.assetLinks ?? [],
    };
  });
}

function mergeLibraryAssets(assets?: LibraryAssetRecord[]): LibraryAssetRecord[] {
  return [
    ...seedLibraryAssets.map((seed) => ({
      ...(assets ?? []).find((asset) => asset.id === seed.id),
      ...seed,
    })),
    ...(assets ?? []).filter((asset) => !seedLibraryAssets.some((seed) => seed.id === asset.id)),
  ];
}

function hydratePrinters(printers?: PrinterRecord[]): PrinterRecord[] {
  const restored = printers ?? seedPrinters;
  const kobraS1Max = seedPrinters.find((printer) => printer.id === "PR-KOBRA-S1-MAX-COMBO");
  const hasKobraS1Max = restored.some((printer) => {
    const identity = `${printer.name} ${printer.model}`.toLowerCase();
    return printer.id === kobraS1Max?.id || identity.includes("kobra s1 max");
  });
  const complete = !hasKobraS1Max && kobraS1Max ? [...restored, kobraS1Max] : restored;
  return complete.map((printer) => ({
    ...printer,
    watts: printer.watts ?? defaultSettings.machineWatts,
  }));
}

function hydrateConcepts(concepts: ConceptSpec[]): ConceptSpec[] {
  return concepts.map((concept) => ({
    ...concept,
    imagePath: concept.imagePath ?? concept.imageName ?? "",
    generationReferencePath: concept.generationReferencePath ?? "",
    generationReferenceId: concept.generationReferenceId ?? (concept.generationReferencePath ? `REF-MIGRATED-${concept.id}` : undefined),
    measurementImagePath: concept.measurementImagePath ?? "",
    referenceFolderPath: concept.referenceFolderPath ?? "",
    linkedStlIds: concept.linkedStlIds ?? (concept.linkedStlId ? [concept.linkedStlId] : []),
  }));
}

function hydrateProductionReferences(concepts: ConceptSpec[], references?: ProductionReferenceRecord[]): ProductionReferenceRecord[] {
  const retained = (references ?? []).map((reference) => {
    const normalized = { ...reference, checks: { ...emptyProductionReferenceChecks, ...(reference.checks ?? {}) } };
    const remainsReady = productionReferenceReady(normalized);
    return { ...normalized, status: remainsReady ? "Ready" as const : normalized.status === "Retired" ? "Retired" as const : "Draft" as const };
  });
  const migrated = concepts
    .filter((concept) => concept.generationReferencePath && !retained.some((reference) => reference.conceptId === concept.id))
    .map((concept): ProductionReferenceRecord => ({
      id: `REF-MIGRATED-${concept.id}`,
      conceptId: concept.id,
      outputPath: concept.generationReferencePath ?? "",
      view: "Three-quarter",
      subject: concept.title,
      pose: "Needs verification",
      background: "Neutral Light",
      status: "Draft",
      checks: { ...emptyProductionReferenceChecks },
      notes: "Migrated from an earlier unverified generator-safe path. Complete the Production Reference Builder before use.",
      createdAt: "",
    }));
  return [...retained, ...migrated];
}

function hydrateModelVerifications(records?: ModelVerificationRecord[]): ModelVerificationRecord[] {
  return (records ?? []).map((record) => ({
    ...record,
    modelPath: record.modelPath ?? "",
    modelRevision: record.modelRevision ?? "v001",
    modelSha256: record.modelSha256 ?? "",
    inspectionViews: record.inspectionViews ?? {},
    visualChecks: record.visualChecks?.length ? record.visualChecks : defaultVisualChecks(),
    meshChecks: record.meshChecks?.length ? record.meshChecks : defaultMeshChecks(),
    visualDecision: record.visualDecision ?? "Pending",
    forgeabilityStatus: record.forgeabilityStatus ?? "Pending",
    physicalTestStatus: record.physicalTestStatus ?? "Not Started",
    risks: record.risks ?? [],
    requirements: record.requirements ?? [],
    unknowns: record.unknowns ?? [],
    notes: record.notes ?? "",
  }));
}

function hydratePrintTrials(records?: PrintTrialRecord[]): PrintTrialRecord[] {
  return (records ?? []).map((record) => ({
    ...record,
    materialDryState: record.materialDryState ?? "Unknown",
    slicerVersion: record.slicerVersion ?? "",
    partDivision: record.partDivision ?? "",
    assemblyMethod: record.assemblyMethod ?? "",
    controlledVariables: record.controlledVariables ?? [],
    criteria: record.criteria?.length ? record.criteria : defaultPrintTrialCriteria(),
    dimensionalResults: record.dimensionalResults ?? "",
    surfaceResult: record.surfaceResult ?? "",
    supportRemovalResult: record.supportRemovalResult ?? "",
    failureMode: record.failureMode ?? "",
    evidencePaths: record.evidencePaths ?? [],
    outcomeVerifiedByDerek: record.outcomeVerifiedByDerek ?? false,
    notes: record.notes ?? "",
    nextAction: record.nextAction ?? "",
    updatedAt: record.updatedAt ?? record.createdAt ?? "",
  }));
}

function hydrateDataFrom(stored: Partial<AppData> | null): AppData {
  if (!stored) return seedData;
  const concepts = hydrateConcepts(stored.concepts ?? seedData.concepts);
  const inventory = migrateFilamentInventory(stored.filament ?? seedData.filament, stored.filamentProfiles ?? seedData.filamentProfiles);
  const validSpoolIds = new Set(inventory.spools.map((spool) => spool.id));
  const invalidSpoolLinks = [
    ...(stored.orders ?? seedData.orders).map((order) => order.filamentId),
    ...(stored.variants ?? seedData.variants).map((variant) => variant.filamentId),
  ].filter((id): id is string => Boolean(id) && !validSpoolIds.has(id!));
  const cleanedLinks = cleanLegacyOrderAndVariantLinks(
    stored.orders ?? seedData.orders,
    stored.variants ?? seedData.variants,
    [...inventory.removedPlaceholderSpoolIds, ...invalidSpoolLinks],
  );
  return {
    products: (stored.products ?? seedData.products).map((product) => ({
      ...product,
      productImagePath: product.productImagePath ?? "",
      conceptImagePath: product.conceptImagePath ?? "",
      supportedRealmVariants: product.supportedRealmVariants ?? [],
    })),
    stls: (stored.stls ?? seedData.stls).map((stl) => ({
      ...stl,
      filePath: stl.filePath ?? stl.fileName ?? "",
      folderPath: stl.folderPath ?? folderFromPath(stl.filePath ?? stl.fileName ?? ""),
      libraryPath: stl.libraryPath ?? "",
      defaultPrinterId: stl.defaultPrinterId ?? undefined,
      defaultSlicer: stl.defaultSlicer ?? undefined,
      linkedConceptId: stl.linkedConceptId ?? undefined,
      assetStatus: stl.assetStatus ?? (stl.fileName || stl.filePath ? "Linked" : "Planned"),
    })),
    concepts,
    productionReferences: hydrateProductionReferences(concepts, stored.productionReferences),
    modelVerifications: hydrateModelVerifications(stored.modelVerifications),
    printTrials: hydratePrintTrials(stored.printTrials),
    variants: cleanedLinks.variants.map((variant) => ({
      ...variant,
      productImagePath: variant.productImagePath ?? "",
      conceptImagePath: variant.conceptImagePath ?? "",
      priceModifier: variant.priceModifier ?? 0,
      isActive: variant.isActive ?? true,
    })),
    collections: stored.collections ?? seedData.collections,
    releases: stored.releases ?? seedData.releases,
    orders: cleanedLinks.orders.map((order) => ({
      ...order,
      filamentId: order.filamentId,
      materialGrams: order.materialGrams ?? (stored.products ?? seedData.products).find((p) => p.id === order.productId)?.estimatedFilamentGrams ?? 0,
      electricityRate: order.electricityRate ?? defaultSettings.electricityRate,
      materialConsumed: order.materialConsumed ?? false,
    })),
    filamentProfiles: inventory.profiles,
    filament: inventory.spools,
    printers: hydratePrinters(stored.printers),
    maintenance: stored.maintenance ?? [],
    generationJobs: stored.generationJobs ?? [],
    controlCenter: stored.controlCenter ? {
      activeObjective: { ...defaultControlCenter.activeObjective, ...stored.controlCenter.activeObjective },
      parkedIdeas: (stored.controlCenter.parkedIdeas ?? []).map((idea) => ({ ...idea })),
    } : defaultControlCenter,
    canonRecords: hydrateCanonRecords(stored.canonRecords),
    libraryAssets: mergeLibraryAssets(stored.libraryAssets),
    recovery: {
      auditEvents: stored.recovery?.auditEvents ?? [],
      lastIntegrityScan: stored.recovery?.lastIntegrityScan,
      credentialHealth: stored.recovery?.credentialHealth,
    },
    settings: { ...defaultExternalTools, ...defaultSettings, ...(stored.settings ?? {}) },
    prototypes: stored.prototypes ?? seedData.prototypes,
    plannedFilament: stored.plannedFilament ?? seedData.plannedFilament,
    productPlanning: stored.productPlanning ?? seedData.productPlanning,
    realmMaterials: stored.realmMaterials ?? seedData.realmMaterials,
  };
}

function hydrateData(): AppData {
  return hydrateDataFrom(loadStoredData());
}

function printerStatusFromOrders(printer: PrinterRecord, orders: OrderRecord[], products: Product[]): PrinterRecord {
  if (printer.status === "Maintenance" || printer.status === "Offline") return printer;
  const active = orders.find((order) => order.printerId === printer.id && order.status === "Printing");
  const product = active ? products.find((p) => p.id === active.productId) : undefined;
  return {
    ...printer,
    status: active ? "Printing" : "Available",
    activeJob: active ? `${product?.name ?? "Unknown Product"} - ${active.customer}` : "",
  };
}

function productName(products: Product[], id: string): string {
  return products.find((p) => p.id === id)?.name ?? id;
}

export function useForgekeeperState() {
  const initial = hydrateData();

  const [view, setView] = useState<ViewKey>("dashboard");
  const [products, setProducts] = useState<Product[]>(initial.products);
  const [stls, setStls] = useState<STLRecord[]>(initial.stls);
  const [concepts, setConcepts] = useState<ConceptSpec[]>(initial.concepts);
  const [productionReferences, setProductionReferences] = useState<ProductionReferenceRecord[]>(initial.productionReferences);
  const [modelVerifications, setModelVerifications] = useState<ModelVerificationRecord[]>(initial.modelVerifications);
  const [printTrials, setPrintTrials] = useState<PrintTrialRecord[]>(initial.printTrials);
  const [variants, setVariants] = useState<ProductVariant[]>(initial.variants);
  const [collections, setCollections] = useState<CollectionRecord[]>(initial.collections);
  const [releases, setReleases] = useState<ReleaseRecord[]>(initial.releases);
  const [orders, setOrders] = useState<OrderRecord[]>(initial.orders);
  const [filamentProfiles, setFilamentProfiles] = useState<FilamentProfile[]>(initial.filamentProfiles);
  const [filament, setFilament] = useState<FilamentRecord[]>(initial.filament);
  const [printers, setPrinters] = useState<PrinterRecord[]>(initial.printers);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>(initial.maintenance);
  const [generationJobs, setGenerationJobs] = useState<GenerationJobRecord[]>(initial.generationJobs);
  const [controlCenter, setControlCenter] = useState<ControlCenterRecord>(initial.controlCenter);
  const [canonRecords, setCanonRecords] = useState(initial.canonRecords);
  const [libraryAssets, setLibraryAssets] = useState(initial.libraryAssets);
  const [recovery, setRecovery] = useState(initial.recovery);
  const [recoveryCheckpoints, setRecoveryCheckpoints] = useState<RecoveryCheckpoint[]>(loadRecoveryCheckpoints());
  const [settings, setSettings] = useState<AppSettings>(initial.settings);
  const [prototypes, setPrototypes] = useState<PlannedPrototype[]>(initial.prototypes);
  const [plannedFilament, setPlannedFilament] = useState<PlannedFilament[]>(initial.plannedFilament);
  const [productPlanning, setProductPlanning] = useState<ProductPlanningRecord[]>(initial.productPlanning);
  const [realmMaterials, setRealmMaterials] = useState<RealmMaterialReference[]>(initial.realmMaterials);

  const [selectedProductId, setSelectedProductId] = useState(initial.products[0]?.id ?? "");
  const [productTab, setProductTab] = useState<ProductTab>("overview");
  const [newProductName, setNewProductName] = useState("");
  const [newStlName, setNewStlName] = useState("");
  const [newConceptTitle, setNewConceptTitle] = useState("");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newReleaseName, setNewReleaseName] = useState("");
  const [newOrderCustomer, setNewOrderCustomer] = useState("");
  const [newFilamentName, setNewFilamentName] = useState("");
  const [newPrinterName, setNewPrinterName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [quickAction, setQuickAction] = useState<QuickActionKey | null>(null);
  const [storageReady, setStorageReady] = useState(!isTauriRuntime());
  const [storageStatus, setStorageStatus] = useState<"Loading" | "SQLite" | "Browser fallback" | "Error">(isTauriRuntime() ? "Loading" : "Browser fallback");

  const appData: AppData = {
    products,
    stls,
    concepts,
    productionReferences,
    modelVerifications,
    printTrials,
    variants,
    collections,
    releases,
    orders,
    filamentProfiles,
    filament,
    printers,
    maintenance,
    generationJobs,
    controlCenter,
    canonRecords,
    libraryAssets,
    recovery,
    settings,
    prototypes,
    plannedFilament,
    productPlanning,
    realmMaterials,
  };

  const nativeStorageStarted = useRef(false);
  useEffect(() => {
    if (nativeStorageStarted.current || !isTauriRuntime()) return;
    nativeStorageStarted.current = true;
    void loadNativeStoredData()
      .then(async (nativeData) => {
        if (nativeData) replaceWorkspaceData(hydrateDataFrom(nativeData));
        else await saveNativeStoredData(appData);
        clearStoredData();
        setStorageStatus("SQLite");
        setStorageReady(true);
      })
      .catch((error) => {
        console.error("Forgekeeper SQLite initialization failed", error);
        setStorageStatus("Error");
        setStorageReady(true);
      });
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    if (!isTauriRuntime() || storageStatus === "Error") {
      saveStoredData(appData);
      return;
    }
    const timer = window.setTimeout(() => {
      void saveNativeStoredData(appData).catch((error) => {
        console.error("Forgekeeper SQLite save failed", error);
        setStorageStatus("Error");
        saveStoredData(appData);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [storageReady, storageStatus, products, stls, concepts, productionReferences, modelVerifications, printTrials, variants, collections, releases, orders, filamentProfiles, filament, printers, maintenance, generationJobs, controlCenter, canonRecords, libraryAssets, recovery, settings, prototypes, plannedFilament, productPlanning, realmMaterials]);

  const automaticCheckpointStarted = useRef(false);
  const lastAutomaticCheckpointAt = useRef(Date.now());
  useEffect(() => {
    if (!storageReady || automaticCheckpointStarted.current) return;
    automaticCheckpointStarted.current = true;
    void saveRecoveryCheckpoint(appData, "Automatic session-start checkpoint")
      .then(() => {
        lastAutomaticCheckpointAt.current = Date.now();
        setRecoveryCheckpoints(loadRecoveryCheckpoints());
      })
      .catch((error) => console.warn("Forgekeeper automatic checkpoint failed", error));
  }, [storageReady]);

  useEffect(() => {
    if (Date.now() - lastAutomaticCheckpointAt.current < 15 * 60 * 1000) return;
    const timer = window.setTimeout(() => {
      void saveRecoveryCheckpoint(appData, "Automatic 15-minute activity checkpoint")
        .then(() => {
          lastAutomaticCheckpointAt.current = Date.now();
          setRecoveryCheckpoints(loadRecoveryCheckpoints());
        })
        .catch((error) => console.warn("Forgekeeper timed checkpoint failed", error));
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [products, stls, concepts, productionReferences, modelVerifications, printTrials, variants, collections, releases, orders, filamentProfiles, filament, printers, maintenance, generationJobs, controlCenter, canonRecords, libraryAssets, recovery, settings, prototypes, plannedFilament, productPlanning, realmMaterials]);

  useEffect(() => {
    setPrinters((prev) => prev.map((printer) => printerStatusFromOrders(printer, orders, products)));
  }, [orders, products]);

  useEffect(() => {
    if (!products.some((product) => product.id === selectedProductId)) {
      setSelectedProductId(products[0]?.id ?? "");
    }
  }, [products, selectedProductId]);

  const filteredProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return products;
    return products.filter((p) => [p.name, p.collection, p.category, p.line, p.status].join(" ").toLowerCase().includes(query));
  }, [products, searchTerm]);

  const selectedProduct = products.find((p) => p.id === selectedProductId) || products[0];
  const productStls = stls.filter((s) => s.productId === selectedProductId);
  const productConcepts = concepts.filter((c) => c.productId === selectedProductId);
  const productOrders = orders.filter((o) => o.productId === selectedProductId);
  const productVariants = variants.filter((variant) => variant.productId === selectedProductId);
  const productRelease = releases.find((r) => r.productIds.includes(selectedProductId));

  function getPrimaryStlForProduct(productId: string) {
    return stls.find((stl) => stl.productId === productId && stl.isPrimary) ?? stls.find((stl) => stl.productId === productId);
  }

  function getLatestConceptForProduct(productId: string) {
    return concepts.find((concept) => concept.productId === productId);
  }

  function getProductDisplayImage(product?: Product) {
    if (!product) return "";
    return product.productImagePath || product.conceptImagePath || getLatestConceptForProduct(product.id)?.imagePath || getLatestConceptForProduct(product.id)?.imageName || "";
  }

  function getVariantDisplayImage(variant?: ProductVariant) {
    if (!variant) return "";
    const product = products.find((item) => item.id === variant.productId);
    return variant.productImagePath || variant.conceptImagePath || getProductDisplayImage(product);
  }

  function getCostBreakdownForOrder(order: OrderRecord) {
    const product = products.find((p) => p.id === order.productId);
    const filamentRecord = filament.find((item) => item.id === order.filamentId);
    const printer = printers.find((item) => item.id === order.printerId);
    return getOrderCostBreakdown(order, product, filamentRecord, printer, settings);
  }

  function getProductCostGuide(product: Product) {
    const sampleOrder: OrderRecord = {
      id: "sample",
      productId: product.id,
      filamentId: filament[0]?.id,
      materialGrams: product.estimatedFilamentGrams,
      customer: "Pricing Preview",
      contact: "",
      quantity: 1,
      dueDate: "",
      status: "Queued",
      priority: "Normal",
      paid: false,
      tracking: "",
      printerId: printers[0]?.id,
      estimatedPrintHours: product.estimatedPrintHours,
      laborHours: 0.5,
      laborRate: settings.laborRate,
      machineWatts: printers[0]?.watts ?? settings.machineWatts,
      electricityRate: settings.electricityRate,
      packagingCost: settings.packagingCost,
      otherCost: settings.otherCost,
      quotedPrice: product.targetPrice,
      notes: "",
    };
    return getOrderCostBreakdown(sampleOrder, product, filament[0], printers[0], settings);
  }

  const metrics = useMemo(() => {
    const revenue = orders.reduce((sum, order) => sum + order.quotedPrice, 0);
    const costs = orders.reduce((sum, order) => sum + getCostBreakdownForOrder(order).total, 0);
    const inventorySpools = filament.filter((item) => item.status !== "Archived");
    const totalFilamentKg = inventorySpools.filter((item) => item.quantityConfidence !== "Unknown").reduce((sum, item) => sum + item.gramsAvailable, 0) / 1000;
    return {
      products: products.length,
      stls: stls.length,
      concepts: concepts.length,
      variants: variants.length,
      collections: collections.length,
      releases: releases.length,
      orders: orders.length,
      filament: inventorySpools.length,
      printers: printers.length,
      revenue,
      costs,
      profit: revenue - costs,
      paid: orders.filter((o) => o.paid).length,
      printing: orders.filter((o) => o.status === "Printing").length,
      done: orders.filter((o) => o.status === "Shipped" || o.status === "Packed").length,
      totalFilamentKg,
    };
  }, [products, stls, concepts, variants, collections, releases, orders, printers, filament, settings]);

  const queueCounts = useMemo(() => ({
    Queued: orders.filter((o) => o.status === "Queued").length,
    Printing: orders.filter((o) => o.status === "Printing").length,
    Finishing: orders.filter((o) => o.status === "Finishing").length,
    Packed: orders.filter((o) => o.status === "Packed").length,
    Shipped: orders.filter((o) => o.status === "Shipped").length,
  }), [orders]);

  const productionMetrics = useMemo(() => (
    calculateProductionMetrics(orders, products, printers, filament, settings)
  ), [orders, products, printers, filament, settings]);

  function triggerQuickAction(action: QuickActionKey) {
    setQuickAction(action);
    if (action === "newProduct") setView("catalog");
    if (action === "newOrder") { setView("orders"); setProductTab("orders"); }
    if (action === "newFilament") setView("filament");
    if (action === "newPrinter") setView("printers");
  }

  function clearQuickAction(action: QuickActionKey) {
    if (quickAction === action) setQuickAction(null);
  }

  function addProduct() {
    if (!newProductName.trim()) return;
    const id = uid("P");
    setProducts((prev) => [{
      id,
      name: newProductName.trim(),
      tier: "Hero",
      line: "ForgeTech",
      category: "Accessory",
      collection: collections[0]?.name || "Unassigned",
      status: "Concept",
      targetPrice: 0,
      estimatedFilamentGrams: 0,
      estimatedPrintHours: 0,
      available: 0,
      reorderPoint: 5,
      productImagePath: "",
      conceptImagePath: "",
      supportedRealmVariants: [],
      notes: "",
    }, ...prev]);
    setSelectedProductId(id);
    setNewProductName("");
    clearQuickAction("newProduct");
  }

  function updateProduct(id: string, patch: Partial<Product>) {
    setProducts((prev) => prev.map((product) => product.id === id ? { ...product, ...patch } : product));
  }

  function removeProduct(id: string) {
    const product = products.find((p) => p.id === id);
    if (!product) return;
    const confirmed = window.confirm(`Remove ${product.name}? This also removes linked STL records, concept specs, orders, and release links.`);
    if (!confirmed) return;
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setStls((prev) => prev.filter((stl) => stl.productId !== id));
    setConcepts((prev) => prev.filter((concept) => concept.productId !== id));
    const removedConceptIds = new Set(concepts.filter((concept) => concept.productId === id).map((concept) => concept.id));
    setProductionReferences((prev) => prev.filter((reference) => !removedConceptIds.has(reference.conceptId)));
    setModelVerifications((prev) => prev.filter((verification) => verification.productId !== id));
    setVariants((prev) => prev.filter((variant) => variant.productId !== id));
    setOrders((prev) => prev.filter((order) => order.productId !== id));
    setReleases((prev) => prev.map((release) => ({ ...release, productIds: release.productIds.filter((productId) => productId !== id) })));
    setCollections((prev) => prev.map((collection) => ({ ...collection, heroProductId: collection.heroProductId === id ? undefined : collection.heroProductId })));
  }

  function addStl() {
    if (!newStlName.trim() || !selectedProductId) return;
    setStls((prev) => [{
      id: uid("STL"),
      productId: selectedProductId,
      name: newStlName.trim(),
      fileName: `${newStlName.trim()}.stl`,
      filePath: "",
      folderPath: suggestedLibraryPath(settings.forgekeeperLibraryPath, selectedProduct?.name || "Unassigned", "stl", `v${String(productStls.length + 1).padStart(3, "0")}`),
      libraryPath: suggestedLibraryPath(settings.forgekeeperLibraryPath, selectedProduct?.name || "Unassigned", "stl", `v${String(productStls.length + 1).padStart(3, "0")}`),
      version: `v${productStls.length + 1}`,
      isPrimary: productStls.length === 0,
      defaultPrinterId: printers[0]?.id,
      defaultSlicer: printers[0] ? slicerForPrinter(printers[0].name) : settings.defaultSlicer,
      linkedConceptId: productConcepts[0]?.id,
      assetStatus: "Planned",
      notes: "",
    }, ...prev]);
    setNewStlName("");
  }

  function updateStl(id: string, patch: Partial<STLRecord>) {
    setStls((prev) => prev.map((stl) => stl.id === id ? { ...stl, ...patch } : stl));
  }

  function markPrimaryStl(id: string) {
    setStls((prev) => prev.map((stl) => (stl.productId === selectedProductId ? { ...stl, isPrimary: stl.id === id } : stl)));
  }

  function removeStl(id: string) {
    setStls((prev) => prev.filter((stl) => stl.id !== id));
    setConcepts((prev) => prev.map((concept) => (concept.linkedStlId === id || concept.linkedStlIds?.includes(id) ? { ...concept, linkedStlId: concept.linkedStlId === id ? undefined : concept.linkedStlId, linkedStlIds: (concept.linkedStlIds ?? []).filter((stlId) => stlId !== id) } : concept)));
    setVariants((prev) => prev.map((variant) => (variant.stlId === id ? { ...variant, stlId: undefined } : variant)));
    setModelVerifications((prev) => prev.map((verification) => verification.stlId === id ? { ...verification, stlId: undefined, forgeabilityStatus: "Pending" } : verification));
  }

  function addConcept() {
    if (!newConceptTitle.trim() || !selectedProductId) return;
    setConcepts((prev) => [{
      id: uid("CON"),
      productId: selectedProductId,
      title: newConceptTitle.trim(),
      imageName: `${newConceptTitle.trim()}.png`,
      imagePath: "",
      measurementImagePath: "",
      referenceFolderPath: suggestedLibraryPath(settings.forgekeeperLibraryPath, selectedProduct?.name || "Unassigned", "reference"),
      measurements: "",
      description: "",
      notes: "",
      linkedStlId: productStls[0]?.id,
      linkedStlIds: productStls[0]?.id ? [productStls[0].id] : [],
    }, ...prev]);
    setNewConceptTitle("");
  }

  function updateConcept(id: string, patch: Partial<ConceptSpec>) {
    setConcepts((prev) => prev.map((concept) => (concept.id === id ? { ...concept, ...patch } : concept)));
  }

  function removeConcept(id: string) {
    setConcepts((prev) => prev.filter((concept) => concept.id !== id));
    setProductionReferences((prev) => prev.filter((reference) => reference.conceptId !== id));
    setModelVerifications((prev) => prev.filter((verification) => verification.conceptId !== id));
    setVariants((prev) => prev.map((variant) => (variant.conceptId === id ? { ...variant, conceptId: undefined } : variant)));
  }

  function addProductionReference(conceptId: string) {
    const concept = concepts.find((item) => item.id === conceptId);
    if (!concept) return;
    const timestamp = new Date().toISOString();
    setProductionReferences((prev) => [{
      id: uid("REF"),
      conceptId,
      outputPath: "",
      view: "Three-quarter",
      subject: concept.title,
      pose: "",
      background: "Neutral Light",
      status: "Draft",
      checks: { ...emptyProductionReferenceChecks },
      notes: "",
      createdAt: timestamp,
    }, ...prev]);
  }

  function updateProductionReference(id: string, patch: Partial<ProductionReferenceRecord>) {
    setProductionReferences((prev) => prev.map((reference) => {
      if (reference.id !== id) return reference;
      const materialChange = Object.keys(patch).some((key) => key !== "status");
      const status = patch.status ?? (reference.status === "Ready" && materialChange ? "Draft" : reference.status);
      return { ...reference, ...patch, status, verifiedAt: status === "Ready" ? reference.verifiedAt : undefined };
    }));
  }

  function markProductionReferenceReady(id: string) {
    const reference = productionReferences.find((item) => item.id === id);
    const concept = reference ? concepts.find((item) => item.id === reference.conceptId) : undefined;
    const outputPath = reference?.outputPath.trim() ?? "";
    const canonicalPaths = [concept?.imagePath, concept?.imageName].filter(Boolean).map((path) => String(path).trim().toLowerCase());
    if (!reference || !/\.(png|jpe?g|webp)$/i.test(outputPath) || canonicalPaths.includes(outputPath.toLowerCase()) || !reference.subject.trim() || !reference.pose.trim() || !referenceChecksPassed(reference)) return false;
    const timestamp = new Date().toISOString();
    setProductionReferences((prev) => prev.map((item) => item.id === id ? { ...item, status: "Ready", verifiedAt: timestamp } : item));
    setConcepts((prev) => prev.map((concept) => concept.id === reference.conceptId ? { ...concept, generationReferenceId: id, generationReferencePath: reference.outputPath } : concept));
    return true;
  }

  function setPrimaryProductionReference(conceptId: string, referenceId: string) {
    const reference = productionReferences.find((item) => item.id === referenceId && item.conceptId === conceptId && item.status === "Ready");
    if (!reference) return;
    setConcepts((prev) => prev.map((concept) => concept.id === conceptId ? { ...concept, generationReferenceId: referenceId, generationReferencePath: reference.outputPath } : concept));
  }

  function removeProductionReference(id: string) {
    const reference = productionReferences.find((item) => item.id === id);
    if (!reference) return;
    setProductionReferences((prev) => prev.filter((item) => item.id !== id));
    setConcepts((prev) => prev.map((concept) => concept.generationReferenceId === id ? { ...concept, generationReferenceId: undefined, generationReferencePath: "" } : concept));
  }

  function addModelVerification(generationJobId: string) {
    const existing = modelVerifications.find((verification) => verification.generationJobId === generationJobId);
    if (existing) return existing.id;
    const job = generationJobs.find((item) => item.id === generationJobId);
    const concept = job ? concepts.find((item) => item.id === job.conceptId) : undefined;
    if (!job || !concept) return "";
    const linkedStl = stls.find((stl) => stl.linkedConceptId === concept.id && stl.notes.includes(job.externalJobId));
    const id = uid("VERIFY");
    const timestamp = new Date().toISOString();
    const record: ModelVerificationRecord = {
      id,
      productId: job.productId,
      conceptId: concept.id,
      canonRecordId: concept.canonRecordId,
      generationJobId: job.id,
      stlId: linkedStl?.id,
      modelPath: linkedStl?.filePath ?? "",
      modelRevision: linkedStl?.version ?? "v001",
      modelSha256: "",
      evidenceClass: linkedStl?.filePath ? "Mesh available" : "Concept only",
      inspectionViews: {},
      visualChecks: defaultVisualChecks(),
      meshChecks: defaultMeshChecks(),
      visualDecision: "Pending",
      forgeabilityStatus: "Pending",
      physicalTestStatus: "Not Started",
      risks: [],
      requirements: [],
      unknowns: linkedStl?.filePath ? [] : ["Actual STL/3MF geometry has not been linked to this verification."],
      notes: "",
      createdAt: timestamp,
    };
    setModelVerifications((prev) => [record, ...prev]);
    return id;
  }

  function updateModelVerification(id: string, patch: Partial<ModelVerificationRecord>) {
    const changesModelIdentity = ["modelPath", "modelRevision", "modelSha256"].some((key) => key in patch);
    setModelVerifications((prev) => prev.map((verification) => verification.id === id ? { ...verification, ...patch, ...(changesModelIdentity ? { physicalTestStatus: "Not Started" as const } : {}) } : verification));
  }

  function setModelVisualDecision(id: string, decision: ModelVerificationRecord["visualDecision"]) {
    const verification = modelVerifications.find((item) => item.id === id);
    if (!verification || (decision === "Accepted" && (!checksAllPass(verification.visualChecks) || !requiredViewsPresent(verification)))) return false;
    setModelVerifications((prev) => prev.map((item) => item.id === id ? { ...item, visualDecision: decision, assessedAt: new Date().toISOString() } : item));
    if (verification.generationJobId) {
      const reviewStatus = decision === "Accepted" ? "accepted" : decision === "Pending" ? "pending" : "rejected";
      setGenerationJobs((previous) => previous.map((job) => job.id === verification.generationJobId ? {
        ...job,
        reviewStatus,
        error: reviewStatus === "rejected" ? `Model Verification: ${decision}. ${verification.notes}`.trim() : undefined,
        updatedAt: new Date().toISOString(),
      } : job));
    }
    return true;
  }

  function setModelForgeabilityStatus(id: string, status: ModelVerificationRecord["forgeabilityStatus"]) {
    const verification = modelVerifications.find((item) => item.id === id);
    if (!verification || (status === "Approved" && !canApproveForgeability(verification))) return false;
    setModelVerifications((prev) => prev.map((item) => item.id === id ? { ...item, forgeabilityStatus: status, assessedAt: new Date().toISOString() } : item));
    return true;
  }

  function addPrintTrial(modelVerificationId: string) {
    const verification = modelVerifications.find((item) => item.id === modelVerificationId);
    if (!verification) return "";
    const stl = stls.find((item) => item.id === verification.stlId);
    const printerId = stl?.defaultPrinterId ?? "";
    const printer = printers.find((item) => item.id === printerId);
    const slicer = stl?.defaultSlicer === "anycubic" ? "Anycubic Slicer Next" : stl?.defaultSlicer === "orca" ? "OrcaSlicer" : "";
    const timestamp = new Date().toISOString();
    const record: PrintTrialRecord = {
      id: uid("TRIAL"), productId: verification.productId, conceptId: verification.conceptId, modelVerificationId: verification.id,
      stlId: verification.stlId, modelPath: verification.modelPath, modelRevision: verification.modelRevision, modelSha256: verification.modelSha256,
      printerId, nozzleDiameterMm: 0.4, filamentId: undefined, materialName: "", materialDryState: "Unknown", slicer,
      slicerVersion: "", profileName: "", profileRevision: "", orientation: "", supports: "", partDivision: "", assemblyMethod: "",
      controlledVariables: [], criteria: defaultPrintTrialCriteria(), estimatedTimeHours: undefined, actualTimeHours: undefined,
      estimatedMaterialGrams: undefined, actualMaterialGrams: undefined, cleanupMinutes: undefined, assemblyMinutes: undefined,
      dimensionalResults: "", surfaceResult: "", supportRemovalResult: "", failureMode: "", evidencePaths: [], status: "Not Started",
      outcomeVerifiedByDerek: false, notes: printer ? `Initial route: ${printer.name}.` : "", nextAction: "Complete the controlled trial setup.",
      createdAt: timestamp, updatedAt: timestamp,
    };
    setPrintTrials((prev) => [record, ...prev]);
    return record.id;
  }

  function updatePrintTrial(id: string, patch: Partial<PrintTrialRecord>) {
    const setupKeys = ["modelPath", "modelRevision", "modelSha256", "printerId", "nozzleDiameterMm", "filamentId", "materialName", "materialDryState", "slicer", "slicerVersion", "profileName", "profileRevision", "orientation", "supports", "partDivision", "assemblyMethod", "controlledVariables", "criteria"];
    const existing = printTrials.find((trial) => trial.id === id);
    const invalidatesOutcome = Boolean(existing && (existing.status === "Passed" || existing.status === "Failed") && Object.keys(patch).some((key) => setupKeys.includes(key)));
    setPrintTrials((prev) => prev.map((trial) => {
      if (trial.id !== id) return trial;
      return {
        ...trial,
        ...patch,
        ...(invalidatesOutcome ? { status: "In Progress" as const, outcomeVerifiedByDerek: false, outcomeVerifiedAt: undefined, completedAt: undefined } : {}),
        updatedAt: new Date().toISOString(),
      };
    }));
    if (invalidatesOutcome && existing) {
      setModelVerifications((prev) => prev.map((item) => item.id === existing.modelVerificationId ? { ...item, physicalTestStatus: "Not Started" } : item));
    }
  }

  function setPrintTrialStatus(id: string, status: PrintTrialRecord["status"]) {
    const trial = printTrials.find((item) => item.id === id);
    if (!trial) return false;
    const verification = modelVerifications.find((item) => item.id === trial.modelVerificationId);
    const exactRevision = Boolean(verification && verification.modelPath === trial.modelPath && verification.modelRevision === trial.modelRevision && verification.modelSha256.toLowerCase() === trial.modelSha256.toLowerCase());
    if (status === "In Progress" && !printTrialReadyToStart(trial)) return false;
    if ((status === "In Progress" || status === "Passed") && !exactRevision) return false;
    if (status === "Passed" && !printTrialCanPass(trial)) return false;
    if (status === "Failed" && !printTrialCanFail(trial)) return false;
    const timestamp = new Date().toISOString();
    setPrintTrials((prev) => prev.map((item) => item.id === id ? {
      ...item, status,
      startedAt: status === "Not Started" ? undefined : item.startedAt ?? timestamp,
      completedAt: status === "Passed" || status === "Failed" ? timestamp : undefined,
      outcomeVerifiedByDerek: status === "Not Started" ? false : item.outcomeVerifiedByDerek,
      outcomeVerifiedAt: status === "Passed" || status === "Failed" ? timestamp : undefined,
      updatedAt: timestamp,
    } : item));
    if (exactRevision) setModelVerifications((prev) => prev.map((item) => item.id === trial.modelVerificationId ? { ...item, physicalTestStatus: status } : item));
    return true;
  }

  function removePrintTrial(id: string) {
    const trial = printTrials.find((item) => item.id === id);
    setPrintTrials((prev) => prev.filter((item) => item.id !== id));
    if (trial) {
      const remaining = printTrials.filter((item) => item.id !== id && item.modelVerificationId === trial.modelVerificationId);
      const physicalTestStatus = remaining.some((item) => item.status === "Passed") ? "Passed" : remaining.some((item) => item.status === "In Progress") ? "In Progress" : remaining.some((item) => item.status === "Failed") ? "Failed" : "Not Started";
      setModelVerifications((prev) => prev.map((item) => item.id === trial.modelVerificationId ? { ...item, physicalTestStatus } : item));
    }
  }

  function addVariant(realm?: ProductVariant["realm"]) {
    if (!selectedProduct) return;
    const chosenRealm = realm ?? selectedProduct.supportedRealmVariants[0] ?? "Midgard";
    const existing = variants.find((variant) => variant.productId === selectedProduct.id && variant.realm === chosenRealm);
    if (existing) {
      window.alert(`${chosenRealm} already has a variant record for this product.`);
      return;
    }
    const primaryStl = getPrimaryStlForProduct(selectedProduct.id);
    const latestConcept = getLatestConceptForProduct(selectedProduct.id);
    setVariants((prev) => [{
      id: uid("VAR"),
      productId: selectedProduct.id,
      realm: chosenRealm,
      name: `${selectedProduct.name} - ${chosenRealm}`,
      productImagePath: selectedProduct.productImagePath,
      conceptImagePath: selectedProduct.conceptImagePath || latestConcept?.imageName || "",
      stlId: primaryStl?.id,
      conceptId: latestConcept?.id,
      filamentId: filament[0]?.id,
      priceModifier: 0,
      estimatedFilamentGrams: selectedProduct.estimatedFilamentGrams,
      estimatedPrintHours: selectedProduct.estimatedPrintHours,
      isActive: true,
      notes: "",
    }, ...prev]);
    if (!selectedProduct.supportedRealmVariants.includes(chosenRealm)) {
      updateProduct(selectedProduct.id, { supportedRealmVariants: [...selectedProduct.supportedRealmVariants, chosenRealm] });
    }
  }

  function updateVariant(id: string, patch: Partial<ProductVariant>) {
    setVariants((prev) => prev.map((variant) => (variant.id === id ? { ...variant, ...patch } : variant)));
  }

  function removeVariant(id: string) {
    const variant = variants.find((item) => item.id === id);
    if (!variant) return;
    if (!window.confirm(`Remove ${variant.name}?`)) return;
    setVariants((prev) => prev.filter((item) => item.id !== id));
  }

  function addCollection() {
    if (!newCollectionName.trim()) return;
    setCollections((prev) => [{ id: uid("COL"), name: newCollectionName.trim(), line: "ForgeTech", description: "", heroProductId: undefined }, ...prev]);
    setNewCollectionName("");
  }

  function updateCollection(id: string, patch: Partial<CollectionRecord>) {
    const current = collections.find((collection) => collection.id === id);
    setCollections((prev) => prev.map((collection) => (collection.id === id ? { ...collection, ...patch } : collection)));
    if (current && patch.name && patch.name !== current.name) {
      setProducts((prev) => prev.map((product) => product.collection === current.name ? { ...product, collection: patch.name as string } : product));
    }
  }

  function removeCollection(id: string) {
    const collection = collections.find((item) => item.id === id);
    if (!collection) return;
    if (!window.confirm(`Remove collection ${collection.name}? Products will be moved to Unassigned.`)) return;
    setCollections((prev) => prev.filter((item) => item.id !== id));
    setProducts((prev) => prev.map((product) => product.collection === collection.name ? { ...product, collection: "Unassigned" } : product));
  }

  function assignProductToCollection(productId: string, collectionName: string) {
    setProducts((prev) => prev.map((product) => (product.id === productId ? { ...product, collection: collectionName } : product)));
  }

  function setCollectionHero(collectionId: string, productId: string) {
    setCollections((prev) => prev.map((collection) => (collection.id === collectionId ? { ...collection, heroProductId: productId } : collection)));
  }

  function addRelease() {
    if (!newReleaseName.trim()) return;
    setReleases((prev) => [{ id: uid("REL"), name: newReleaseName.trim(), wave: "Wave 01", targetDate: "", status: "Planning", productIds: selectedProduct ? [selectedProduct.id] : [], notes: "" }, ...prev]);
    setNewReleaseName("");
  }

  function updateRelease(id: string, patch: Partial<ReleaseRecord>) {
    setReleases((prev) => prev.map((release) => release.id === id ? { ...release, ...patch } : release));
  }

  function removeRelease(id: string) {
    const release = releases.find((item) => item.id === id);
    if (!release) return;
    if (!window.confirm(`Remove release ${release.name}? Products will remain in the catalog.`)) return;
    setReleases((prev) => prev.filter((item) => item.id !== id));
  }

  function addProductToRelease(releaseId: string, productId: string) {
    setReleases((prev) => prev.map((release) => (release.id === releaseId && !release.productIds.includes(productId) ? { ...release, productIds: [...release.productIds, productId] } : release)));
  }

  function removeProductFromRelease(releaseId: string, productId: string) {
    setReleases((prev) => prev.map((release) => (release.id === releaseId ? { ...release, productIds: release.productIds.filter((id) => id !== productId) } : release)));
  }

  function addOrder() {
    if (!newOrderCustomer.trim() || !selectedProduct) return;
    setOrders((prev) => [{
      id: uid("ORD"),
      productId: selectedProduct.id,
      filamentId: filament[0]?.id,
      materialGrams: selectedProduct.estimatedFilamentGrams,
      customer: newOrderCustomer.trim(),
      contact: "",
      quantity: 1,
      dueDate: "",
      status: "Queued",
      priority: "Normal",
      paid: false,
      tracking: "",
      printerId: undefined,
      estimatedPrintHours: selectedProduct.estimatedPrintHours || 0,
      laborHours: 0.5,
      laborRate: settings.laborRate,
      machineWatts: printers[0]?.watts ?? settings.machineWatts,
      electricityRate: settings.electricityRate,
      packagingCost: settings.packagingCost,
      otherCost: settings.otherCost,
      quotedPrice: selectedProduct.targetPrice || 0,
      notes: "",
      materialConsumed: false,
    }, ...prev]);
    setNewOrderCustomer("");
    clearQuickAction("newOrder");
  }

  function updateOrder(id: string, patch: Partial<OrderRecord>) {
    setOrders((prev) => prev.map((order) => {
      if (order.id !== id) return order;
      const next = { ...order, ...patch };
      if (patch.productId) {
        const product = products.find((item) => item.id === patch.productId);
        if (product) {
          next.estimatedPrintHours = product.estimatedPrintHours;
          next.materialGrams = product.estimatedFilamentGrams;
          if (!next.quotedPrice) next.quotedPrice = product.targetPrice;
        }
      }
      if (patch.printerId) {
        const printer = printers.find((item) => item.id === patch.printerId);
        next.machineWatts = printer?.watts ?? settings.machineWatts;
        if (next.status === "Queued") next.status = "Printing";
      }
      return next;
    }));
  }

  function removeOrder(id: string) {
    setOrders((prev) => prev.filter((order) => order.id !== id));
  }

  function consumeFilamentForOrder(id: string) {
    const order = orders.find((item) => item.id === id);
    if (!order) return;
    if (order.materialConsumed) {
      window.alert("Filament has already been consumed for this order.");
      return;
    }
    if (!order.filamentId) {
      window.alert("Select a filament before consuming material.");
      return;
    }
    const product = products.find((item) => item.id === order.productId);
    const grams = orderMaterialGrams(order, product);
    const spool = filament.find((item) => item.id === order.filamentId);
    if (!spool) {
      window.alert("Selected filament could not be found.");
      return;
    }
    if (spool.quantityConfidence === "Unknown") {
      window.alert("This spool's remaining quantity is unknown. Measure or estimate it before assigning consumption.");
      return;
    }
    if (spool.gramsAvailable < grams) {
      window.alert(`${spool.foundrySpoolCode} has ${spool.gramsAvailable.toFixed(0)}g recorded, but this order requires ${grams.toFixed(0)}g.`);
      return;
    }
    const confirmed = window.confirm(`Deduct ${grams.toFixed(0)}g from ${spool.colorName}?`);
    if (!confirmed) return;
    setFilament((prev) => prev.map((item) => item.id === order.filamentId ? { ...item, gramsAvailable: Math.max(0, item.gramsAvailable - grams) } : item));
    setOrders((prev) => prev.map((item) => item.id === id ? { ...item, materialConsumed: true } : item));
  }

  function addFilament() {
    if (!newFilamentName.trim()) return;
    const now = new Date().toISOString();
    const profile: FilamentProfile = {
      id: uid("FP"), brand: "Unknown", productLine: "", material: "PLA", colorName: newFilamentName.trim(), colorFamily: "Unknown",
      diameterMm: 1.75, nominalWeightGrams: 1000, reorderPointGrams: 250, defaultSpoolPrice: 0, notes: "", createdAt: now, updatedAt: now,
    };
    const spools = createPhysicalSpools(profile, [{ condition: "Sealed", quantityConfidence: "Nominal", gramsAvailable: 1000 }], filament);
    setFilamentProfiles((previous) => [profile, ...previous]);
    setFilament((previous) => [...spools, ...previous]);
    setNewFilamentName("");
    clearQuickAction("newFilament");
  }

  function addFilamentProfile(input: Omit<FilamentProfile, "id" | "createdAt" | "updatedAt">): FilamentProfile {
    const now = new Date().toISOString();
    const profile: FilamentProfile = { ...input, id: uid("FP"), createdAt: now, updatedAt: now };
    setFilamentProfiles((previous) => [profile, ...previous]);
    return profile;
  }

  function updateFilamentProfile(id: string, patch: Partial<FilamentProfile>) {
    setFilamentProfiles((previous) => previous.map((profile) => profile.id === id ? { ...profile, ...patch, updatedAt: new Date().toISOString() } : profile));
    setFilament((previous) => previous.map((spool) => {
      if (spool.profileId !== id) return spool;
      const profile = filamentProfiles.find((item) => item.id === id);
      const next = profile ? { ...profile, ...patch } : undefined;
      if (!next) return spool;
      return {
        ...spool,
        brand: next.brand,
        material: next.material,
        colorName: next.colorName,
        colorFamily: next.colorFamily,
        reorderPointGrams: next.reorderPointGrams,
        spoolWeightGrams: next.nominalWeightGrams,
        emptySpoolWeightGrams: next.emptySpoolWeightGrams,
        updatedAt: new Date().toISOString(),
      };
    }));
  }

  function removeFilamentProfile(id: string) {
    const profile = filamentProfiles.find((item) => item.id === id);
    if (!profile) return;
    if (filament.some((spool) => spool.profileId === id)) {
      window.alert("This profile still has physical spools. Remove or reassign those spools first.");
      return;
    }
    if (!window.confirm(`Remove filament profile ${profile.brand} ${profile.colorName}?`)) return;
    setFilamentProfiles((previous) => previous.filter((item) => item.id !== id));
  }

  function receiveFilamentBatch(profileId: string, drafts: FilamentSpoolDraft[], profileOverride?: FilamentProfile): FilamentRecord[] {
    const profile = filamentProfiles.find((item) => item.id === profileId) ?? (profileOverride?.id === profileId ? profileOverride : undefined);
    if (!profile || !drafts.length) return [];
    const created = createPhysicalSpools(profile, drafts, filament);
    setFilament((previous) => [...created, ...previous]);
    appendAudit("Data Change", "Receive filament", "Success", `${created.length} physical spool${created.length === 1 ? "" : "s"} received under ${profile.brand} ${profile.colorName}.`, profile.id);
    return created;
  }

  function importFilamentCensusCsv(text: string) {
    const rows = parseFilamentCsv(text);
    const workingProfiles = [...filamentProfiles];
    const draftsByProfile = new Map<string, FilamentSpoolDraft[]>();
    let spoolCount = 0;
    rows.forEach((row) => {
      const proposed = profileFromCsv(row);
      const identity = filamentProfileIdentity(proposed);
      let profile = workingProfiles.find((candidate) => filamentProfileIdentity(candidate) === identity);
      if (!profile) {
        const now = new Date().toISOString();
        profile = { ...proposed, id: uid("FP"), createdAt: now, updatedAt: now };
        workingProfiles.push(profile);
      }
      const quantity = Math.max(1, Math.floor(Number(row.quantity) || 1));
      const condition = conditionFromCsv(row.condition);
      const gross = row.grossWeightGrams ? Number(row.grossWeightGrams) : undefined;
      const percent = row.estimatedPercent ? Number(row.estimatedPercent) : undefined;
      const confidence = row.quantityConfidence
        ? confidenceFromCsv(row.quantityConfidence)
        : condition === "Sealed" ? "Nominal" : condition === "Empty" || gross !== undefined || row.remainingGrams ? "Exact" : percent !== undefined ? "Estimated" : "Unknown";
      let remaining = Number(row.remainingGrams);
      if (!Number.isFinite(remaining)) {
        if (condition === "Sealed") remaining = profile.nominalWeightGrams;
        else if (condition === "Empty") remaining = 0;
        else if (gross !== undefined && profile.emptySpoolWeightGrams !== undefined) remaining = Math.max(0, gross - profile.emptySpoolWeightGrams);
        else if (percent !== undefined) remaining = Math.max(0, profile.nominalWeightGrams * percent / 100);
        else remaining = 0;
      }
      const batch = draftsByProfile.get(profile.id) ?? [];
      for (let index = 0; index < quantity; index += 1) batch.push({
        condition,
        quantityConfidence: confidence,
        gramsAvailable: remaining,
        grossWeightGrams: gross,
        estimatedPercent: percent,
        spoolPrice: row.spoolPrice ? Number(row.spoolPrice) : undefined,
        storageLocation: row.storageLocation,
        purchaseDate: row.purchaseDate,
        lotNumber: row.lotNumber,
        notes: row.notes,
      });
      draftsByProfile.set(profile.id, batch);
      spoolCount += quantity;
    });
    const createdProfiles = workingProfiles.filter((profile) => !filamentProfiles.some((existing) => existing.id === profile.id));
    const createdSpools: FilamentRecord[] = [];
    draftsByProfile.forEach((drafts, profileId) => {
      const profile = workingProfiles.find((item) => item.id === profileId)!;
      createdSpools.push(...createPhysicalSpools(profile, drafts, [...filament, ...createdSpools]));
    });
    setFilamentProfiles(workingProfiles);
    setFilament((previous) => [...createdSpools, ...previous]);
    appendAudit("Data Change", "Import filament census", "Success", `${createdProfiles.length} profiles and ${spoolCount} physical spools imported from CSV.`);
    return { profiles: createdProfiles.length, spools: spoolCount };
  }

  function updateFilament(id: string, patch: Partial<FilamentRecord>) {
    setFilament((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch, updatedAt: new Date().toISOString() } : item)));
  }

  function adjustFilament(id: string, delta: number) {
    setFilament((prev) => prev.map((item) => (item.id === id ? { ...item, gramsAvailable: Math.max(0, item.gramsAvailable + delta), quantityConfidence: "Exact", condition: item.gramsAvailable + delta <= 0 ? "Empty" : "Used", status: item.gramsAvailable + delta <= 0 ? "Empty" : item.status, updatedAt: new Date().toISOString() } : item)));
  }

  function removeFilament(id: string) {
    const item = filament.find((record) => record.id === id);
    if (!item) return;
    if (!window.confirm(`Remove filament ${item.colorName}?`)) return;
    setFilament((prev) => prev.filter((record) => record.id !== id));
    setOrders((previous) => previous.map((order) => order.filamentId === id ? { ...order, filamentId: undefined } : order));
    setVariants((previous) => previous.map((variant) => variant.filamentId === id ? { ...variant, filamentId: undefined } : variant));
  }

  async function printFilamentLabels(ids?: string[]) {
    const selected = filament.filter((spool) => !ids || ids.includes(spool.id));
    if (!selected.length) return;
    const { default: QRCode } = await import("qrcode");
    const labels = await Promise.all(selected.map(async (spool) => {
      const profile = filamentProfiles.find((item) => item.id === spool.profileId);
      return {
        spool,
        profile,
        qr: await QRCode.toDataURL(`forgekeeper://filament/${spool.id}`, { margin: 1, width: 180 }),
      };
    }));
    const popup = window.open("", "_blank", "width=900,height=700");
    if (!popup) {
      window.alert("Allow pop-ups for Forgekeeper to print spool labels.");
      return;
    }
    const escapeHtml = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]!));
    popup.document.write(`<!doctype html><html><head><title>Forgekeeper spool labels</title><style>
      @page{size:auto;margin:8mm}body{font-family:Arial,sans-serif;margin:0;display:grid;grid-template-columns:repeat(3,1fr);gap:8mm}
      .label{border:1px solid #111;border-radius:8px;padding:10px;break-inside:avoid;text-align:center}.code{font-size:16px;font-weight:700}.name{font-size:12px;margin:4px 0}.meta{font-size:10px;color:#333}img{width:38mm;height:38mm}
    </style></head><body>${labels.map(({ spool, profile, qr }) => `<section class="label"><div class="code">${escapeHtml(spool.foundrySpoolCode)}</div><div class="name">${escapeHtml(profile?.brand ?? spool.brand)} ${escapeHtml(profile?.productLine ?? "")}<br>${escapeHtml(profile?.material ?? spool.material)} · ${escapeHtml(profile?.colorName ?? spool.colorName)}</div><img src="${qr}" alt="${escapeHtml(spool.foundrySpoolCode)} QR"><div class="meta">${escapeHtml(spool.quantityConfidence)} · ${spool.quantityConfidence === "Unknown" ? "remainder unknown" : `${Math.round(spool.gramsAvailable)}g`}</div></section>`).join("")}</body></html>`);
    popup.document.close();
    popup.focus();
    window.setTimeout(() => popup.print(), 250);
  }

  function addPrinter() {
    if (!newPrinterName.trim()) return;
    setPrinters((prev) => [{ id: uid("PR"), name: newPrinterName.trim(), model: newPrinterName.trim(), status: "Available", buildVolume: "", watts: settings.machineWatts, activeJob: "", notes: "" }, ...prev]);
    setNewPrinterName("");
    clearQuickAction("newPrinter");
  }

  function updatePrinter(id: string, patch: Partial<PrinterRecord>) {
    setPrinters((prev) => prev.map((printer) => (printer.id === id ? { ...printer, ...patch } : printer)));
  }

  function removePrinter(id: string) {
    const printer = printers.find((item) => item.id === id);
    if (!printer) return;
    if (!window.confirm(`Remove printer ${printer.name}? Related orders will be unassigned.`)) return;
    setPrinters((prev) => prev.filter((item) => item.id !== id));
    setOrders((prev) => prev.map((order) => (order.printerId === id ? { ...order, printerId: undefined, status: order.status === "Printing" ? "Queued" : order.status } : order)));
    setMaintenance((prev) => prev.filter((entry) => entry.printerId !== id));
  }

  function addMaintenance(printerId: string) {
    setMaintenance((prev) => [{ id: uid("M"), printerId, title: "General Maintenance", performedOn: new Date().toLocaleDateString(), notes: "" }, ...prev]);
  }

  function updateMaintenance(id: string, patch: Partial<MaintenanceRecord>) {
    setMaintenance((prev) => prev.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  }

  function recordGenerationJob(job: Omit<GenerationJobRecord, "id" | "createdAt" | "updatedAt">) {
    const duplicate = generationJobs.find((item) => item.provider === job.provider && item.externalJobId === job.externalJobId);
    if (duplicate) {
      setRecovery((previous) => ({
        ...previous,
        auditEvents: [createAuditEvent("Provider", "Block duplicate provider job", "Blocked", `${job.provider}:${job.externalJobId} already exists as ${duplicate.id}.`, duplicate.id), ...previous.auditEvents].slice(0, 300),
      }));
      return duplicate;
    }
    const timestamp = new Date().toISOString();
    const record: GenerationJobRecord = { ...job, id: uid("GEN"), createdAt: timestamp, updatedAt: timestamp };
    setGenerationJobs((previous) => [record, ...previous]);
    setRecovery((previous) => ({
      ...previous,
      auditEvents: [createAuditEvent("Provider", "Record provider job", "Success", `${job.provider}:${job.externalJobId} recorded once.`, record.id), ...previous.auditEvents].slice(0, 300),
    }));
    return record;
  }

  function updateGenerationJob(id: string, patch: Partial<GenerationJobRecord>) {
    setGenerationJobs((previous) => previous.map((job) => job.id === id ? { ...job, ...patch, updatedAt: new Date().toISOString() } : job));
  }

  function updateActiveObjective(patch: Partial<ControlCenterRecord["activeObjective"]>) {
    setControlCenter((previous) => ({
      ...previous,
      activeObjective: {
        ...previous.activeObjective,
        ...patch,
        updatedAt: new Date().toISOString(),
      },
    }));
  }

  function addParkedIdea(title: string, notes: string) {
    if (!title.trim()) return;
    setControlCenter((previous) => ({
      ...previous,
      parkedIdeas: [{
        id: uid("IDEA"),
        title: title.trim(),
        notes: notes.trim(),
        capturedAt: new Date().toISOString(),
      }, ...previous.parkedIdeas],
    }));
  }

  function promoteParkedIdea(id: string) {
    const idea = controlCenter.parkedIdeas.find((item) => item.id === id);
    if (!idea) return;
    const confirmed = window.confirm(`Make “${idea.title}” the active objective? The current objective will be returned to the parked drawer.`);
    if (!confirmed) return;
    const timestamp = new Date().toISOString();
    setControlCenter((previous) => ({
      activeObjective: idea.sourceObjective ? {
        ...idea.sourceObjective,
        status: "Active",
        updatedAt: timestamp,
      } : {
        id: uid("OBJ"),
        title: idea.title,
        stage: "Planning",
        status: "Active",
        blocker: "None",
        approvalNeeded: "Define the next real gate.",
        lastCompletedAction: "Promoted from the idea drawer.",
        nextAction: idea.notes || "Define the intended outcome and next concrete action.",
        updatedAt: timestamp,
      },
      parkedIdeas: [{
        id: uid("IDEA"),
        title: previous.activeObjective.title,
        notes: `Paused at ${previous.activeObjective.stage}. Next action: ${previous.activeObjective.nextAction}`,
        capturedAt: timestamp,
        sourceObjective: { ...previous.activeObjective, status: "Paused", updatedAt: timestamp },
      }, ...previous.parkedIdeas.filter((item) => item.id !== id)],
    }));
  }

  function linkGeneratedStl(jobId: string, filePath: string) {
    const job = generationJobs.find((item) => item.id === jobId);
    const concept = job ? concepts.find((item) => item.id === job.conceptId) : undefined;
    if (!job || !concept) return;
    const stlId = uid("STL");
    const hasPrimary = stls.some((item) => item.productId === job.productId && item.isPrimary);
    const record: STLRecord = {
      id: stlId,
      productId: job.productId,
      name: `${concept.title} · ${job.provider === "printpal" ? "PrintPal" : "Meshy"}`,
      fileName: filenameFromPath(filePath),
      filePath,
      folderPath: folderFromPath(filePath),
      libraryPath: folderFromPath(filePath),
      version: "v001",
      isPrimary: !hasPrimary,
      linkedConceptId: concept.id,
      assetStatus: "Linked",
      notes: `Generated through ${job.provider}. External job: ${job.externalJobId}. Geometry and print validation are still required.`,
    };
    setStls((previous) => [record, ...previous]);
    setConcepts((previous) => previous.map((item) => item.id === concept.id ? {
      ...item,
      linkedStlId: item.linkedStlId || stlId,
      linkedStlIds: Array.from(new Set([...(item.linkedStlIds || []), stlId])),
    } : item));
    setModelVerifications((previous) => previous.map((verification) => verification.generationJobId === jobId ? {
      ...verification,
      stlId,
      modelPath: filePath,
      modelRevision: record.version,
      evidenceClass: "Mesh available",
      forgeabilityStatus: "Pending",
      unknowns: verification.unknowns.filter((unknown) => !unknown.includes("Actual STL/3MF geometry")),
    } : verification));
  }

  function removeMaintenance(id: string) {
    setMaintenance((prev) => prev.filter((entry) => entry.id !== id));
  }

  function updatePrototype(id: string, patch: Partial<PlannedPrototype>) {
    setPrototypes((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function updatePlannedFilament(id: string, patch: Partial<PlannedFilament>) {
    setPlannedFilament((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removePlannedFilament(id: string) {
    setPlannedFilament((prev) => prev.filter((item) => item.id !== id));
  }

  function movePlannedFilamentToInventory(id: string) {
    const planned = plannedFilament.find((item) => item.id === id);
    if (!planned) return;
    const profile = addFilamentProfile({
      brand: planned.brand || "Amolen", productLine: planned.batchGroup, material: "PLA", colorName: planned.name,
      colorFamily: planned.materialFamily, diameterMm: 1.75, nominalWeightGrams: 1000, reorderPointGrams: 250,
      defaultSpoolPrice: 22, notes: `${planned.finishDirection} ${planned.notes}`,
    });
    const created = createPhysicalSpools(profile, [{ condition: "Sealed", quantityConfidence: "Nominal", gramsAvailable: 1000 }], filament);
    setFilament((previous) => [...created, ...previous]);
    setPlannedFilament((prev) => prev.map((item) => (item.id === id ? { ...item, status: "Active" } : item)));
  }

  function getDefaultSlicerForPrinter(printerName?: string) {
    return slicerForPrinter(printerName) || settings.defaultSlicer || "orca";
  }

  function getPreferredSlicerForStl(stl: STLRecord) {
    const printer = printers.find((item) => item.id === stl.defaultPrinterId);
    return stl.defaultSlicer || slicerForPrinter(printer?.name || "") || settings.defaultSlicer || "orca";
  }

  function suggestStlLibraryFolder(productId: string, version = "v001") {
    const product = products.find((item) => item.id === productId);
    return suggestedLibraryPath(settings.forgekeeperLibraryPath, product?.name || "Unassigned", "stl", version);
  }

  function suggestConceptLibraryFolder(productId: string) {
    const product = products.find((item) => item.id === productId);
    return suggestedLibraryPath(settings.forgekeeperLibraryPath, product?.name || "Unassigned", "concept");
  }

  function linkStlPath(id: string, path: string) {
    const folder = folderFromPath(path);
    setStls((prev) => prev.map((stl) => (stl.id === id ? { ...stl, filePath: path, fileName: filenameFromPath(path), folderPath: folder || stl.folderPath, assetStatus: "Linked" } : stl)));
  }

  function setStlSuggestedFolder(id: string) {
    const stl = stls.find((item) => item.id === id);
    if (!stl) return;
    const folder = suggestStlLibraryFolder(stl.productId, stl.version?.startsWith("v") ? stl.version.replace("v", "v00").slice(0, 4) : "v001");
    updateStl(id, { folderPath: folder, libraryPath: folder });
  }

  function openStlAsset(id: string, mode: "file" | "folder" | "slicer" | "blender") {
    const stl = stls.find((item) => item.id === id);
    if (!stl) return;
    const slicer = getPreferredSlicerForStl(stl);
    if (mode === "file") return openLocalPathBestEffort(stl.filePath || stl.fileName);
    if (mode === "folder") return openLocalPathBestEffort(stl.folderPath || stl.libraryPath || folderFromPath(stl.filePath));
    if (mode === "blender") {
      window.alert(`Blender path:\n${settings.blenderPath || "Not configured"}\n\nLinked STL:\n${stl.filePath || "No STL linked yet."}`);
      return;
    }
    window.alert(`${slicer === "anycubic" ? "Anycubic Slicer Next" : "OrcaSlicer"} path:\n${getToolPath(settings, slicer)}\n\nLinked STL:\n${stl.filePath || "No STL linked yet."}\n\nDirect launch with file arguments will be enabled in the next Tauri shell-permissions pass.`);
  }

  function openExternalTool(tool: "orca" | "anycubic" | "blender" | "meshy") {
    if (tool === "meshy") return openWebUrl(settings.meshyUrl || "https://www.meshy.ai/");
    return openLocalPathBestEffort(getToolPath(settings, tool));
  }

  function updateSettings(patch: Partial<AppSettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  function exportProductsCsv() { downloadCsv("products.csv", products); }
  function exportStlsCsv() { downloadCsv("stls.csv", stls); }
  function exportConceptsCsv() { downloadCsv("concepts.csv", concepts); }
  function exportVariantsCsv() { downloadCsv("variants.csv", variants.map((variant) => ({ ...variant, productName: productName(products, variant.productId) }))); }
  function exportCollectionsCsv() { downloadCsv("collections.csv", collections); }
  function exportReleasesCsv() { downloadCsv("releases.csv", releases.map((r) => ({ ...r, productNames: r.productIds.map((id) => productName(products, id)).join(" | ") }))); }
  function exportOrdersCsv() { downloadCsv("orders.csv", orders.map((order) => {
    const breakdown = getCostBreakdownForOrder(order);
    return {
      ...order,
      productName: productName(products, order.productId),
      materialCost: breakdown.material.toFixed(2),
      electricityCost: breakdown.electricity.toFixed(2),
      laborCost: breakdown.labor.toFixed(2),
      totalCost: breakdown.total.toFixed(2),
      suggestedPrice: breakdown.suggestedPrice.toFixed(2),
      profit: breakdown.profit.toFixed(2),
      marginPercent: breakdown.marginPercent.toFixed(1),
    };
  })); }
  function exportFilamentCsv() { downloadCsv("filament-physical-spools.csv", filament.map((spool) => {
    const profile = filamentProfiles.find((item) => item.id === spool.profileId);
    return { ...spool, productLine: profile?.productLine ?? "", diameterMm: profile?.diameterMm ?? 1.75, nominalWeightGrams: profile?.nominalWeightGrams ?? spool.spoolWeightGrams };
  })); }
  function exportPrintersCsv() { downloadCsv("printers.csv", printers); }
  function exportMaintenanceCsv() { downloadCsv("maintenance.csv", maintenance); }
  function appendAudit(type: Parameters<typeof createAuditEvent>[0], action: string, outcome: Parameters<typeof createAuditEvent>[2], summary: string, subjectId?: string) {
    setRecovery((previous) => ({ ...previous, auditEvents: [createAuditEvent(type, action, outcome, summary, subjectId), ...previous.auditEvents].slice(0, 300) }));
  }

  function replaceWorkspaceData(next: AppData) {
    setProducts(next.products);
    setStls(next.stls);
    setConcepts(next.concepts);
    setProductionReferences(next.productionReferences);
    setModelVerifications(next.modelVerifications);
    setPrintTrials(next.printTrials);
    setVariants(next.variants);
    setCollections(next.collections);
    setReleases(next.releases);
    setOrders(next.orders);
    setFilamentProfiles(next.filamentProfiles);
    setFilament(next.filament);
    setPrinters(next.printers);
    setMaintenance(next.maintenance);
    setGenerationJobs(next.generationJobs);
    setControlCenter(next.controlCenter);
    setCanonRecords(next.canonRecords);
    setLibraryAssets(next.libraryAssets);
    setRecovery(next.recovery);
    setSettings(next.settings);
    setPrototypes(next.prototypes);
    setPlannedFilament(next.plannedFilament);
    setProductPlanning(next.productPlanning);
    setRealmMaterials(next.realmMaterials);
    setSelectedProductId(next.products[0]?.id ?? "");
  }

  function applyRestoredData(parsed: Partial<AppData>, restoreSummary: string) {
    const hydrated = hydrateDataFrom(parsed);
    replaceWorkspaceData(hydrated);
    setRecovery({
      auditEvents: [createAuditEvent("Restore", "Restore workspace", "Success", restoreSummary), ...hydrated.recovery.auditEvents].slice(0, 300),
      lastIntegrityScan: hydrated.recovery.lastIntegrityScan,
      credentialHealth: hydrated.recovery.credentialHealth,
    });
  }

  async function createManualCheckpoint(reason = "Manual recovery checkpoint") {
    try {
      const checkpoint = await saveRecoveryCheckpoint(appData, reason);
      setRecoveryCheckpoints(loadRecoveryCheckpoints());
      appendAudit("Backup", "Create recovery checkpoint", "Success", `${checkpoint.id} created with SHA-256 ${checkpoint.checksum.slice(0, 12)}…`, checkpoint.id);
      return checkpoint;
    } catch (error) {
      appendAudit("Backup", "Create recovery checkpoint", "Failed", String(error));
      return null;
    }
  }

  async function exportBackupJson() {
    try {
      const envelope = await createBackupEnvelope(appData, "Portable export");
      downloadJson(`forgekeeper-backup-${Date.now()}.json`, envelope);
      appendAudit("Backup", "Export verified backup", "Success", `Portable schema ${envelope.schemaVersion} backup created with SHA-256 ${envelope.checksum.slice(0, 12)}…`);
    } catch (error) {
      appendAudit("Backup", "Export verified backup", "Failed", String(error));
      window.alert("Forgekeeper could not create the verified backup.");
    }
  }

  async function importBackupFile(file: File) {
    try {
      const verification = await verifyBackupEnvelope(JSON.parse(await file.text()));
      if (!verification.valid) {
        appendAudit("Restore", "Reject backup import", "Blocked", verification.message);
        window.alert(verification.message);
        return;
      }
      const source = verification.envelope?.data ?? verification.legacyData;
      if (!source) return;
      const confirmed = window.confirm(`${verification.message}\n\nRestore this backup? Forgekeeper will first preserve the current workspace as a recovery checkpoint.`);
      if (!confirmed) return;
      await saveRecoveryCheckpoint(appData, "Automatic checkpoint before backup import");
      setRecoveryCheckpoints(loadRecoveryCheckpoints());
      applyRestoredData(source, `${file.name} restored. ${verification.message}`);
      window.alert("Forgekeeper backup restored.");
    } catch (error) {
      console.error(error);
      appendAudit("Restore", "Import backup", "Failed", String(error));
      window.alert("Could not import that backup file.");
    }
  }

  async function restoreRecoveryCheckpoint(id: string) {
    const checkpoint = recoveryCheckpoints.find((item) => item.id === id);
    if (!checkpoint) return false;
    const verification = await verifyBackupEnvelope(checkpoint.envelope);
    if (!verification.valid || !verification.envelope) {
      appendAudit("Restore", "Reject recovery checkpoint", "Blocked", verification.message, id);
      return false;
    }
    if (!window.confirm(`Restore checkpoint from ${new Date(checkpoint.createdAt).toLocaleString()}? The current workspace will be preserved first.`)) return false;
    await saveRecoveryCheckpoint(appData, "Automatic checkpoint before rollback");
    setRecoveryCheckpoints(loadRecoveryCheckpoints());
    applyRestoredData(verification.envelope.data, `Rolled back to ${checkpoint.id}; checksum verified.`);
    return true;
  }

  function deleteRecoveryCheckpoint(id: string) {
    if (!window.confirm("Delete this local recovery checkpoint? Portable exports are unaffected.")) return;
    removeRecoveryCheckpoint(id);
    setRecoveryCheckpoints(loadRecoveryCheckpoints());
    appendAudit("Backup", "Delete recovery checkpoint", "Warning", `${id} deleted by explicit approval.`, id);
  }

  async function runIntegrityScan() {
    const startedAt = new Date().toISOString();
    try {
      const structural = collectStructuralFindings(appData);
      const paths = collectInspectablePaths(appData);
      const inspected = await inspectLocalPaths(paths);
      const scan = createIntegrityScan(appData, structural, inspected, startedAt);
      const critical = scan.findings.filter((item) => item.severity === "Critical").length;
      setRecovery((previous) => ({
        ...previous,
        lastIntegrityScan: scan,
        auditEvents: [createAuditEvent("Integrity", "Run integrity scan", critical ? "Warning" : "Success", `${scan.findings.length} findings; ${critical} critical. Desktop path checks ${scan.desktopFileChecksAvailable ? "completed" : "not available"}.`, scan.id), ...previous.auditEvents].slice(0, 300),
      }));
      return scan;
    } catch (error) {
      appendAudit("Integrity", "Run integrity scan", "Failed", String(error));
      return null;
    }
  }

  async function checkCredentialHealth() {
    const filePath = settings.apiCredentialFilePath?.trim() ?? "";
    if (!filePath) {
      const record = credentialHealthRecord(null, "");
      record.message = "No local credential file is configured.";
      setRecovery((previous) => ({ ...previous, credentialHealth: record, auditEvents: [createAuditEvent("Credential", "Inspect credential health", "Warning", record.message), ...previous.auditEvents].slice(0, 300) }));
      return record;
    }
    try {
      const record = credentialHealthRecord(await inspectCredentialFile(filePath), filePath);
      setRecovery((previous) => ({ ...previous, credentialHealth: record, auditEvents: [createAuditEvent("Credential", "Inspect credential health", record.readable ? "Success" : "Warning", record.message), ...previous.auditEvents].slice(0, 300) }));
      return record;
    } catch (error) {
      const record = { ...credentialHealthRecord(null, filePath), message: String(error) };
      setRecovery((previous) => ({ ...previous, credentialHealth: record, auditEvents: [createAuditEvent("Credential", "Inspect credential health", "Failed", record.message), ...previous.auditEvents].slice(0, 300) }));
      return record;
    }
  }

  async function reconcileProviderJobs() {
    const apiFilePath = settings.apiCredentialFilePath?.trim() ?? "";
    if (!apiFilePath) {
      appendAudit("Provider", "Reconcile provider jobs", "Blocked", "No local credential file is configured.");
      return { checked: 0, failed: 0, message: "Link the local credential file before reconciliation." };
    }
    const seen = new Set<string>();
    const duplicates = generationJobs.filter((job) => {
      const key = `${job.provider}:${job.externalJobId}`;
      if (seen.has(key)) return true;
      seen.add(key);
      return false;
    });
    if (duplicates.length) {
      appendAudit("Provider", "Reconcile provider jobs", "Blocked", `${duplicates.length} duplicate external job identities must be resolved first.`);
      return { checked: 0, failed: duplicates.length, message: "Duplicate external job identities blocked reconciliation." };
    }
    const terminal = /complete|completed|succeed|failed|cancel|expired/i;
    const candidates = generationJobs.filter((job) => job.externalJobId && !terminal.test(job.status));
    let failed = 0;
    const updates = new Map<string, Partial<GenerationJobRecord>>();
    for (const job of candidates) {
      try {
        const status = await getGenerationStatus(apiFilePath, job.provider, job.externalJobId);
        updates.set(job.id, { status: status.status, progress: status.progress ?? undefined, creditsUsed: status.creditsUsed ?? job.creditsUsed, outputUrls: status.outputUrls, error: status.error ?? undefined, lastReconciledAt: new Date().toISOString(), reconciliationMessage: "Matched by provider and external job ID; no new job submitted." });
      } catch (error) {
        failed += 1;
        updates.set(job.id, { lastReconciledAt: new Date().toISOString(), reconciliationMessage: String(error) });
      }
    }
    setGenerationJobs((previous) => previous.map((job) => updates.has(job.id) ? { ...job, ...updates.get(job.id), updatedAt: new Date().toISOString() } : job));
    appendAudit("Provider", "Reconcile provider jobs", failed ? "Warning" : "Success", `${candidates.length} existing jobs checked by external ID; ${failed} could not be refreshed. No job was submitted.`);
    return { checked: candidates.length, failed, message: `Checked ${candidates.length} existing jobs. No new job was submitted.` };
  }

  async function resetWorkspace() {
    if (!window.confirm("Reset workspace to starter data? Forgekeeper will preserve a recovery checkpoint first, then clear local workspace data.")) return;
    const checkpoint = await createManualCheckpoint("Automatic checkpoint before workspace reset");
    if (!checkpoint) {
      window.alert("Reset blocked because the recovery checkpoint could not be created.");
      return;
    }
    await clearNativeStoredData();
    window.location.reload();
  }

  return {
    view, setView,
    products, stls, concepts, productionReferences, modelVerifications, printTrials, variants, collections, releases, orders, filamentProfiles, filament, printers, maintenance, generationJobs, controlCenter, canonRecords, libraryAssets, recovery, recoveryCheckpoints, settings, storageReady, storageStatus,
    prototypes, setPrototypes, plannedFilament, setPlannedFilament, productPlanning, setProductPlanning, realmMaterials, setRealmMaterials,
    selectedProductId, setSelectedProductId, productTab, setProductTab,
    newProductName, setNewProductName, newStlName, setNewStlName, newConceptTitle, setNewConceptTitle,
    newCollectionName, setNewCollectionName, newReleaseName, setNewReleaseName, newOrderCustomer, setNewOrderCustomer,
    newFilamentName, setNewFilamentName, newPrinterName, setNewPrinterName, searchTerm, setSearchTerm, quickAction,
    filteredProducts, selectedProduct, productStls, productConcepts, productOrders, productVariants, productRelease, metrics, queueCounts, productionMetrics, getCostBreakdownForOrder, getProductCostGuide, getPrimaryStlForProduct, getLatestConceptForProduct, getProductDisplayImage, getVariantDisplayImage,
    triggerQuickAction,
    addProduct, updateProduct, removeProduct,
    addStl, updateStl, markPrimaryStl, removeStl,
    addConcept, updateConcept, removeConcept,
    addProductionReference, updateProductionReference, markProductionReferenceReady, setPrimaryProductionReference, removeProductionReference,
    addModelVerification, updateModelVerification, setModelVisualDecision, setModelForgeabilityStatus,
    addPrintTrial, updatePrintTrial, setPrintTrialStatus, removePrintTrial,
    addVariant, updateVariant, removeVariant,
    addCollection, updateCollection, removeCollection, assignProductToCollection, setCollectionHero,
    addRelease, updateRelease, removeRelease, addProductToRelease, removeProductFromRelease,
    addOrder, updateOrder, removeOrder, consumeFilamentForOrder,
    addFilament, addFilamentProfile, updateFilamentProfile, removeFilamentProfile, receiveFilamentBatch, importFilamentCensusCsv, updateFilament, adjustFilament, removeFilament, printFilamentLabels,
    addPrinter, updatePrinter, removePrinter,
    addMaintenance, updateMaintenance, removeMaintenance,
    recordGenerationJob, updateGenerationJob, linkGeneratedStl,
    updateActiveObjective, addParkedIdea, promoteParkedIdea,
    updateSettings, updatePrototype, updatePlannedFilament, removePlannedFilament, movePlannedFilamentToInventory, getDefaultSlicerForPrinter, getPreferredSlicerForStl, suggestStlLibraryFolder, suggestConceptLibraryFolder, linkStlPath, setStlSuggestedFolder, openStlAsset, openExternalTool,
    exportProductsCsv, exportStlsCsv, exportConceptsCsv, exportVariantsCsv, exportCollectionsCsv, exportReleasesCsv, exportOrdersCsv,
    exportFilamentCsv, exportPrintersCsv, exportMaintenanceCsv, exportBackupJson, importBackupFile, resetWorkspace,
    createManualCheckpoint, restoreRecoveryCheckpoint, deleteRecoveryCheckpoint, runIntegrityScan, checkCredentialHealth, reconcileProviderJobs,
  };
}

export type ForgekeeperState = ReturnType<typeof useForgekeeperState>;
export type QueueStatus = keyof ForgekeeperState["queueCounts"];
