import { useEffect, useMemo, useState } from "react";
import { defaultControlCenter, defaultSettings, seedCanonRecords, seedCollections, seedConcepts, seedFilament, seedLibraryAssets, seedOrders, seedPrinters, seedProducts, seedReleases, seedStls, seedVariants } from "../data/seed";
import { seedPlannedFilament, seedProductPlanning, seedPrototypes, seedRealmMaterials } from "../data/planningSeed";
import { directCost, getOrderCostBreakdown } from "../lib/cost";
import { calculateProductionMetrics, orderMaterialGrams } from "../lib/production";
import { downloadCsv } from "../lib/csv";
import { uid } from "../lib/ids";
import { clearStoredData, downloadJson, loadStoredData, saveStoredData } from "../lib/storage";
import { defaultExternalTools, getToolPath, openLocalPathBestEffort, openWebUrl, slicerForPrinter } from "../lib/externalTools";
import { filenameFromPath, folderFromPath, suggestedLibraryPath } from "../lib/assetLibrary";
import { emptyProductionReferenceChecks, productionReferenceReady, referenceChecksPassed } from "../lib/productionReferences";
import { canApproveForgeability, checksAllPass, defaultMeshChecks, defaultVisualChecks, requiredViewsPresent } from "../lib/modelVerification";
import { defaultPrintTrialCriteria, printTrialCanFail, printTrialCanPass, printTrialReadyToStart } from "../lib/printTrials";
import type {
  AppData,
  AppSettings,
  CanonRecord,
  CollectionRecord,
  ConceptSpec,
  ControlCenterRecord,
  FilamentRecord,
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
  variants: seedVariants,
  collections: seedCollections,
  releases: seedReleases,
  orders: seedOrders,
  filament: seedFilament,
  printers: seedPrinters,
  maintenance: [],
  generationJobs: [],
  controlCenter: defaultControlCenter,
  canonRecords: seedCanonRecords,
  libraryAssets: seedLibraryAssets,
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

function hydrateData(): AppData {
  const stored = loadStoredData();
  if (!stored) return seedData;
  const concepts = hydrateConcepts(stored.concepts ?? seedData.concepts);
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
    variants: (stored.variants ?? seedData.variants).map((variant) => ({
      ...variant,
      productImagePath: variant.productImagePath ?? "",
      conceptImagePath: variant.conceptImagePath ?? "",
      priceModifier: variant.priceModifier ?? 0,
      isActive: variant.isActive ?? true,
    })),
    collections: stored.collections ?? seedData.collections,
    releases: stored.releases ?? seedData.releases,
    orders: (stored.orders ?? seedData.orders).map((order) => ({
      ...order,
      filamentId: order.filamentId ?? (stored.filament ?? seedData.filament)[0]?.id,
      materialGrams: order.materialGrams ?? (stored.products ?? seedData.products).find((p) => p.id === order.productId)?.estimatedFilamentGrams ?? 0,
      electricityRate: order.electricityRate ?? defaultSettings.electricityRate,
      materialConsumed: order.materialConsumed ?? false,
    })),
    filament: (stored.filament ?? seedData.filament).map((item) => ({
      ...item,
      spoolPrice: item.spoolPrice ?? 22,
      spoolWeightGrams: item.spoolWeightGrams ?? 1000,
    })),
    printers: (stored.printers ?? seedData.printers).map((printer) => ({
      ...printer,
      watts: printer.watts ?? defaultSettings.machineWatts,
    })),
    maintenance: stored.maintenance ?? [],
    generationJobs: stored.generationJobs ?? [],
    controlCenter: stored.controlCenter ? {
      activeObjective: { ...defaultControlCenter.activeObjective, ...stored.controlCenter.activeObjective },
      parkedIdeas: (stored.controlCenter.parkedIdeas ?? []).map((idea) => ({ ...idea })),
    } : defaultControlCenter,
    canonRecords: hydrateCanonRecords(stored.canonRecords),
    libraryAssets: mergeLibraryAssets(stored.libraryAssets),
    settings: { ...defaultExternalTools, ...defaultSettings, ...(stored.settings ?? {}) },
    prototypes: stored.prototypes ?? seedData.prototypes,
    plannedFilament: stored.plannedFilament ?? seedData.plannedFilament,
    productPlanning: stored.productPlanning ?? seedData.productPlanning,
    realmMaterials: stored.realmMaterials ?? seedData.realmMaterials,
  };
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
  const [filament, setFilament] = useState<FilamentRecord[]>(initial.filament);
  const [printers, setPrinters] = useState<PrinterRecord[]>(initial.printers);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>(initial.maintenance);
  const [generationJobs, setGenerationJobs] = useState<GenerationJobRecord[]>(initial.generationJobs);
  const [controlCenter, setControlCenter] = useState<ControlCenterRecord>(initial.controlCenter);
  const [canonRecords, setCanonRecords] = useState(initial.canonRecords);
  const [libraryAssets, setLibraryAssets] = useState(initial.libraryAssets);
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
    filament,
    printers,
    maintenance,
    generationJobs,
    controlCenter,
    canonRecords,
    libraryAssets,
    settings,
    prototypes,
    plannedFilament,
    productPlanning,
    realmMaterials,
  };

  useEffect(() => {
    saveStoredData(appData);
  }, [products, stls, concepts, productionReferences, modelVerifications, printTrials, variants, collections, releases, orders, filament, printers, maintenance, generationJobs, controlCenter, canonRecords, libraryAssets, settings, prototypes, plannedFilament, productPlanning, realmMaterials]);

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
    const totalFilamentKg = filament.reduce((sum, item) => sum + item.gramsAvailable, 0) / 1000;
    return {
      products: products.length,
      stls: stls.length,
      concepts: concepts.length,
      variants: variants.length,
      collections: collections.length,
      releases: releases.length,
      orders: orders.length,
      filament: filament.length,
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
    const confirmed = window.confirm(`Deduct ${grams.toFixed(0)}g from ${spool.colorName}?`);
    if (!confirmed) return;
    setFilament((prev) => prev.map((item) => item.id === order.filamentId ? { ...item, gramsAvailable: Math.max(0, item.gramsAvailable - grams) } : item));
    setOrders((prev) => prev.map((item) => item.id === id ? { ...item, materialConsumed: true } : item));
  }

  function addFilament() {
    if (!newFilamentName.trim()) return;
    setFilament((prev) => [{ id: uid("FIL"), brand: "Generic", material: "PLA", colorName: newFilamentName.trim(), colorFamily: "Unknown", gramsAvailable: 1000, reorderPointGrams: 250, spoolPrice: 22, spoolWeightGrams: 1000, notes: "" }, ...prev]);
    setNewFilamentName("");
    clearQuickAction("newFilament");
  }

  function updateFilament(id: string, patch: Partial<FilamentRecord>) {
    setFilament((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function adjustFilament(id: string, delta: number) {
    setFilament((prev) => prev.map((item) => (item.id === id ? { ...item, gramsAvailable: Math.max(0, item.gramsAvailable + delta) } : item)));
  }

  function removeFilament(id: string) {
    const item = filament.find((record) => record.id === id);
    if (!item) return;
    if (!window.confirm(`Remove filament ${item.colorName}?`)) return;
    setFilament((prev) => prev.filter((record) => record.id !== id));
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
    const timestamp = new Date().toISOString();
    const record: GenerationJobRecord = { ...job, id: uid("GEN"), createdAt: timestamp, updatedAt: timestamp };
    setGenerationJobs((previous) => [record, ...previous]);
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
    setFilament((prev) => [
      {
        id: uid("FIL"),
        brand: planned.brand || "Amolen",
        material: "PLA",
        colorName: planned.name,
        colorFamily: planned.materialFamily,
        gramsAvailable: 1000,
        reorderPointGrams: 250,
        spoolPrice: 22,
        spoolWeightGrams: 1000,
        notes: `${planned.batchGroup}. ${planned.finishDirection} ${planned.notes}`,
      },
      ...prev,
    ]);
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
  function exportFilamentCsv() { downloadCsv("filament.csv", filament); }
  function exportPrintersCsv() { downloadCsv("printers.csv", printers); }
  function exportMaintenanceCsv() { downloadCsv("maintenance.csv", maintenance); }
  function exportBackupJson() { downloadJson(`forgekeeper-backup-${Date.now()}.json`, appData); }

  function importBackupFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || "{}")) as Partial<AppData>;
        if (!parsed.products || !parsed.orders || !parsed.filament || !parsed.printers) {
          window.alert("This does not look like a Forgekeeper backup file.");
          return;
        }
        setProducts(parsed.products ?? []);
        setStls(parsed.stls ?? []);
        const importedConcepts = hydrateConcepts(parsed.concepts ?? []);
        setConcepts(importedConcepts);
        setProductionReferences(hydrateProductionReferences(importedConcepts, parsed.productionReferences));
        setModelVerifications(hydrateModelVerifications(parsed.modelVerifications));
        setVariants(parsed.variants ?? []);
        setCollections(parsed.collections ?? []);
        setReleases(parsed.releases ?? []);
        setOrders(parsed.orders ?? []);
        setFilament(parsed.filament ?? []);
        setPrinters(parsed.printers ?? []);
        setMaintenance(parsed.maintenance ?? []);
        setGenerationJobs(parsed.generationJobs ?? []);
        setControlCenter(parsed.controlCenter ?? defaultControlCenter);
        setCanonRecords(hydrateCanonRecords(parsed.canonRecords));
        setLibraryAssets(mergeLibraryAssets(parsed.libraryAssets));
        setSettings({ ...defaultExternalTools, ...defaultSettings, ...(parsed.settings ?? {}) });
        setPrototypes(parsed.prototypes ?? seedPrototypes);
        setPlannedFilament(parsed.plannedFilament ?? seedPlannedFilament);
        setProductPlanning(parsed.productPlanning ?? seedProductPlanning);
        setRealmMaterials(parsed.realmMaterials ?? seedRealmMaterials);
        setSelectedProductId(parsed.products?.[0]?.id ?? "");
        window.alert("Forgekeeper backup restored.");
      } catch (error) {
        console.error(error);
        window.alert("Could not import that backup file.");
      }
    };
    reader.readAsText(file);
  }

  function resetWorkspace() {
    if (!window.confirm("Reset workspace to starter data? This clears local Forgekeeper data.")) return;
    clearStoredData();
    window.location.reload();
  }

  return {
    view, setView,
    products, stls, concepts, productionReferences, modelVerifications, printTrials, variants, collections, releases, orders, filament, printers, maintenance, generationJobs, controlCenter, canonRecords, libraryAssets, settings,
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
    addFilament, updateFilament, adjustFilament, removeFilament,
    addPrinter, updatePrinter, removePrinter,
    addMaintenance, updateMaintenance, removeMaintenance,
    recordGenerationJob, updateGenerationJob, linkGeneratedStl,
    updateActiveObjective, addParkedIdea, promoteParkedIdea,
    updateSettings, updatePrototype, updatePlannedFilament, removePlannedFilament, movePlannedFilamentToInventory, getDefaultSlicerForPrinter, getPreferredSlicerForStl, suggestStlLibraryFolder, suggestConceptLibraryFolder, linkStlPath, setStlSuggestedFolder, openStlAsset, openExternalTool,
    exportProductsCsv, exportStlsCsv, exportConceptsCsv, exportVariantsCsv, exportCollectionsCsv, exportReleasesCsv, exportOrdersCsv,
    exportFilamentCsv, exportPrintersCsv, exportMaintenanceCsv, exportBackupJson, importBackupFile, resetWorkspace,
  };
}

export type ForgekeeperState = ReturnType<typeof useForgekeeperState>;
export type QueueStatus = keyof ForgekeeperState["queueCounts"];
