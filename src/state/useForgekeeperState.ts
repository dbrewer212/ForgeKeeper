import { useEffect, useMemo, useState } from "react";
import { defaultSettings, seedCollections, seedConcepts, seedFilament, seedProductionJobs, seedPrinters, seedDesignProjects, seedReleases, seedStls, seedVariants } from "../data/seed";
import { seedPlannedFilament, seedDesignPlanning, seedPrototypes, seedRealmMaterials } from "../data/planningSeed";
import { directCost, getProductionJobCostBreakdown } from "../lib/cost";
import { calculateProductionMetrics, jobMaterialGrams } from "../lib/production";
import { downloadCsv } from "../lib/csv";
import { uid } from "../lib/ids";
import { downloadJson } from "../lib/storage";
import { defaultExternalTools, getToolPath, openLocalPathBestEffort, openWebUrl, slicerForPrinter } from "../lib/externalTools";
import { filenameFromPath, folderFromPath, suggestedLibraryPath } from "../lib/assetLibrary";
import { launchExternalTool } from "../lib/tauriLaunchpad";
import { getWorkspaceRepository } from "../infrastructure/persistence/createWorkspaceRepository";
import type { StorageBackend } from "../core/persistence/workspaceRepository";
import { migrateWorkspaceData } from "../core/persistence/legacyMigration";
import { createEmptyWorkspaceData, inspectWorkspaceIntegrity, isForgekeeperBackup } from "../core/domain/workspaceData";
import type {
  ActivityEvent,
  AppData,
  AppSettings,
  CollectionRecord,
  ConceptSpec,
  CostSnapshot,
  FilamentRecord,
  MaintenanceRecord,
  MaterialMovement,
  MaterialMovementType,
  ProductionBatch,
  ProductionJob,
  ProductionStatus,
  PrinterRecord,
  DesignProject,
  DesignTab,
  DesignVariant,
  QuickActionKey,
  ReleaseRecord,
  STLRecord,
  ViewKey,
} from "../types/domain";
import type { PlannedFilament, PlannedPrototype, DesignPlanningRecord, RealmMaterialReference } from "../types/planning";

const seedData: AppData = {
  designProjects: seedDesignProjects,
  stls: seedStls,
  concepts: seedConcepts,
  variants: seedVariants,
  collections: seedCollections,
  releases: seedReleases,
  productionJobs: seedProductionJobs,
  productionBatches: [],
  filament: seedFilament,
  materialMovements: [],
  printers: seedPrinters,
  maintenance: [],
  costSnapshots: [],
  activityLog: [],
  settings: { ...defaultExternalTools, ...defaultSettings },
  prototypes: seedPrototypes,
  plannedFilament: seedPlannedFilament,
  designPlanning: seedDesignPlanning,
  realmMaterials: seedRealmMaterials,
};

export function hydrateData(stored: AppData | null): AppData {
  if (!stored) return createEmptyWorkspaceData();
  return {
    designProjects: (stored.designProjects ?? seedData.designProjects).map((design) => ({
      ...design,
      designImagePath: design.designImagePath ?? "",
      conceptImagePath: design.conceptImagePath ?? "",
      supportedRealmVariants: design.supportedRealmVariants ?? [],
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
    concepts: (stored.concepts ?? seedData.concepts).map((concept) => ({
      ...concept,
      imagePath: concept.imagePath ?? concept.imageName ?? "",
      measurementImagePath: concept.measurementImagePath ?? "",
      referenceFolderPath: concept.referenceFolderPath ?? "",
      linkedStlIds: concept.linkedStlIds ?? (concept.linkedStlId ? [concept.linkedStlId] : []),
    })),
    variants: (stored.variants ?? seedData.variants).map((variant) => ({
      ...variant,
      designImagePath: variant.designImagePath ?? "",
      conceptImagePath: variant.conceptImagePath ?? "",
      priceModifier: variant.priceModifier ?? 0,
      isActive: variant.isActive ?? true,
    })),
    collections: stored.collections ?? seedData.collections,
    releases: stored.releases ?? seedData.releases,
    productionJobs: (stored.productionJobs ?? seedData.productionJobs).map((job) => ({
      ...job,
      filamentId: job.filamentId ?? (stored.filament ?? seedData.filament)[0]?.id,
      materialGrams: job.materialGrams ?? (stored.designProjects ?? seedData.designProjects).find((p) => p.id === job.designProjectId)?.estimatedFilamentGrams ?? 0,
      electricityRate: job.electricityRate ?? defaultSettings.electricityRate,
      materialConsumed: job.materialConsumed ?? false,
      unitsCompleted: job.unitsCompleted ?? (job.status === "Complete" ? job.quantity : 0),
    })),
    productionBatches: stored.productionBatches ?? [],
    filament: (stored.filament ?? seedData.filament).map((item) => ({
      ...item,
      spoolPrice: item.spoolPrice ?? 22,
      spoolWeightGrams: item.spoolWeightGrams ?? 1000,
    })),
    materialMovements: stored.materialMovements ?? [],
    printers: (stored.printers ?? seedData.printers).map((printer) => ({
      ...printer,
      watts: printer.watts ?? defaultSettings.machineWatts,
      nozzleDiameter: printer.nozzleDiameter ?? 0.4,
      supportedMaterials: printer.supportedMaterials ?? ["PLA", "PLA+", "PETG"],
      maintenanceIntervalDays: printer.maintenanceIntervalDays ?? 30,
    })),
    maintenance: stored.maintenance ?? [],
    costSnapshots: stored.costSnapshots ?? [],
    activityLog: stored.activityLog ?? [],
    settings: { ...defaultExternalTools, ...defaultSettings, ...(stored.settings ?? {}) },
    prototypes: stored.prototypes ?? seedData.prototypes,
    plannedFilament: stored.plannedFilament ?? seedData.plannedFilament,
    designPlanning: stored.designPlanning ?? seedData.designPlanning,
    realmMaterials: stored.realmMaterials ?? seedData.realmMaterials,
  };
}

function printerStatusFromJobs(printer: PrinterRecord, productionJobs: ProductionJob[], designProjects: DesignProject[]): PrinterRecord {
  if (printer.status === "Maintenance" || printer.status === "Offline") return printer;
  const active = productionJobs.find((job) => job.printerId === printer.id && job.status === "Printing");
  const design = active ? designProjects.find((p) => p.id === active.designProjectId) : undefined;
  return {
    ...printer,
    status: active ? "Printing" : "Available",
    activeJob: active ? `${design?.name ?? "Unknown design"} - ${active.name}` : "",
  };
}

function designName(designProjects: DesignProject[], id: string): string {
  return designProjects.find((p) => p.id === id)?.name ?? id;
}

export function useForgekeeperState() {
  const initial = hydrateData(null);
  const repository = getWorkspaceRepository();

  const [view, setView] = useState<ViewKey>("dashboard");
  const [isReady, setIsReady] = useState(false);
  const [storageBackend, setStorageBackend] = useState<StorageBackend>(repository.backend);
  const [storageError, setStorageError] = useState("");
  const [legacyImported, setLegacyImported] = useState(false);
  const [designProjects, setDesignProjects] = useState<DesignProject[]>(initial.designProjects);
  const [stls, setStls] = useState<STLRecord[]>(initial.stls);
  const [concepts, setConcepts] = useState<ConceptSpec[]>(initial.concepts);
  const [variants, setVariants] = useState<DesignVariant[]>(initial.variants);
  const [collections, setCollections] = useState<CollectionRecord[]>(initial.collections);
  const [releases, setReleases] = useState<ReleaseRecord[]>(initial.releases);
  const [productionJobs, setProductionJobs] = useState<ProductionJob[]>(initial.productionJobs);
  const [productionBatches, setProductionBatches] = useState<ProductionBatch[]>(initial.productionBatches);
  const [filament, setFilament] = useState<FilamentRecord[]>(initial.filament);
  const [materialMovements, setMaterialMovements] = useState<MaterialMovement[]>(initial.materialMovements);
  const [printers, setPrinters] = useState<PrinterRecord[]>(initial.printers);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>(initial.maintenance);
  const [costSnapshots, setCostSnapshots] = useState<CostSnapshot[]>(initial.costSnapshots);
  const [activityLog, setActivityLog] = useState<ActivityEvent[]>(initial.activityLog);
  const [settings, setSettings] = useState<AppSettings>(initial.settings);
  const [prototypes, setPrototypes] = useState<PlannedPrototype[]>(initial.prototypes);
  const [plannedFilament, setPlannedFilament] = useState<PlannedFilament[]>(initial.plannedFilament);
  const [designPlanning, setDesignPlanning] = useState<DesignPlanningRecord[]>(initial.designPlanning);
  const [realmMaterials, setRealmMaterials] = useState<RealmMaterialReference[]>(initial.realmMaterials);

  const [selectedDesignProjectId, setSelectedDesignProjectId] = useState(initial.designProjects[0]?.id ?? "");
  const [designTab, setDesignTab] = useState<DesignTab>("overview");
  const [newDesignName, setNewDesignName] = useState("");
  const [newStlName, setNewStlName] = useState("");
  const [newConceptTitle, setNewConceptTitle] = useState("");
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newReleaseName, setNewReleaseName] = useState("");
  const [newJobName, setNewJobName] = useState("");
  const [newBatchName, setNewBatchName] = useState("");
  const [newFilamentName, setNewFilamentName] = useState("");
  const [newPrinterName, setNewPrinterName] = useState("");
  const [newPrototypeName, setNewPrototypeName] = useState("");
  const [newPlannedFilamentName, setNewPlannedFilamentName] = useState("");
  const [newDesignPlanningName, setNewDesignPlanningName] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [quickAction, setQuickAction] = useState<QuickActionKey | null>(null);

  const appData: AppData = {
    designProjects,
    stls,
    concepts,
    variants,
    collections,
    releases,
    productionJobs,
    productionBatches,
    filament,
    materialMovements,
    printers,
    maintenance,
    costSnapshots,
    activityLog,
    settings,
    prototypes,
    plannedFilament,
    designPlanning,
    realmMaterials,
  };

  useEffect(() => {
    let active = true;

    repository.load()
      .then((result) => {
        if (!active) return;
        const restored = hydrateData(result.data);
        setDesignProjects(restored.designProjects);
        setStls(restored.stls);
        setConcepts(restored.concepts);
        setVariants(restored.variants);
        setCollections(restored.collections);
        setReleases(restored.releases);
        setProductionJobs(restored.productionJobs);
        setProductionBatches(restored.productionBatches);
        setFilament(restored.filament);
        setMaterialMovements(restored.materialMovements);
        setPrinters(restored.printers);
        setMaintenance(restored.maintenance);
        setCostSnapshots(restored.costSnapshots);
        setActivityLog(restored.activityLog);
        setSettings(restored.settings);
        setPrototypes(restored.prototypes);
        setPlannedFilament(restored.plannedFilament);
        setDesignPlanning(restored.designPlanning);
        setRealmMaterials(restored.realmMaterials);
        setSelectedDesignProjectId(restored.designProjects[0]?.id ?? "");
        setStorageBackend(result.backend);
        setLegacyImported(result.legacyImported);
        setStorageError("");
        setIsReady(true);
      })
      .catch((error) => {
        console.error("ForgeKeeper workspace failed to load", error);
        if (!active) return;
        setStorageError(error instanceof Error ? error.message : String(error));
        setIsReady(true);
      });

    return () => {
      active = false;
    };
  }, [repository]);

  useEffect(() => {
    if (!isReady) return;
    const timeout = window.setTimeout(() => {
      repository.save(appData)
        .then(() => setStorageError(""))
        .catch((error) => {
          console.error("ForgeKeeper workspace failed to save", error);
          setStorageError(error instanceof Error ? error.message : String(error));
        });
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [isReady, repository, designProjects, stls, concepts, variants, collections, releases, productionJobs, productionBatches, filament, materialMovements, printers, maintenance, costSnapshots, activityLog, settings, prototypes, plannedFilament, designPlanning, realmMaterials]);

  useEffect(() => {
    setPrinters((prev) => prev.map((printer) => printerStatusFromJobs(printer, productionJobs, designProjects)));
  }, [productionJobs, designProjects]);

  useEffect(() => {
    if (!designProjects.some((design) => design.id === selectedDesignProjectId)) {
      setSelectedDesignProjectId(designProjects[0]?.id ?? "");
    }
  }, [designProjects, selectedDesignProjectId]);

  const filteredDesignProjects = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return designProjects;
    return designProjects.filter((p) => [p.name, p.collection, p.category, p.line, p.status].join(" ").toLowerCase().includes(query));
  }, [designProjects, searchTerm]);

  const selectedDesignProject = designProjects.find((p) => p.id === selectedDesignProjectId) || designProjects[0];
  const designStls = stls.filter((s) => s.designProjectId === selectedDesignProjectId);
  const designConcepts = concepts.filter((c) => c.designProjectId === selectedDesignProjectId);
  const designJobs = productionJobs.filter((o) => o.designProjectId === selectedDesignProjectId);
  const designVariants = variants.filter((variant) => variant.designProjectId === selectedDesignProjectId);
  const designRelease = releases.find((r) => r.designProjectIds.includes(selectedDesignProjectId));

  function getPrimaryStlForDesign(designProjectId: string) {
    return stls.find((stl) => stl.designProjectId === designProjectId && stl.isPrimary) ?? stls.find((stl) => stl.designProjectId === designProjectId);
  }

  function getLatestConceptForDesign(designProjectId: string) {
    return concepts.find((concept) => concept.designProjectId === designProjectId);
  }

  function getDesignDisplayImage(design?: DesignProject) {
    if (!design) return "";
    return design.designImagePath || design.conceptImagePath || getLatestConceptForDesign(design.id)?.imagePath || getLatestConceptForDesign(design.id)?.imageName || "";
  }

  function getVariantDisplayImage(variant?: DesignVariant) {
    if (!variant) return "";
    const design = designProjects.find((item) => item.id === variant.designProjectId);
    return variant.designImagePath || variant.conceptImagePath || getDesignDisplayImage(design);
  }

  function getCostBreakdownForJob(job: ProductionJob) {
    const design = designProjects.find((p) => p.id === job.designProjectId);
    const filamentRecord = filament.find((item) => item.id === job.filamentId);
    const printer = printers.find((item) => item.id === job.printerId);
    return getProductionJobCostBreakdown(job, design, filamentRecord, printer, settings);
  }

  function getDesignCostGuide(design: DesignProject) {
    const sampleJob: ProductionJob = {
      id: "sample",
      name: "Cost preview",
      designProjectId: design.id,
      filamentId: filament[0]?.id,
      materialGrams: design.estimatedFilamentGrams,
      quantity: 1,
      targetDate: "",
      status: "Queued",
      priority: "Normal",
      printerId: printers[0]?.id,
      estimatedPrintHours: design.estimatedPrintHours,
      laborHours: 0.5,
      laborRate: settings.laborRate,
      machineWatts: printers[0]?.watts ?? settings.machineWatts,
      electricityRate: settings.electricityRate,
      packagingCost: settings.packagingCost,
      otherCost: settings.otherCost,
      notes: "",
    };
    return getProductionJobCostBreakdown(sampleJob, design, filament[0], printers[0], settings);
  }

  const metrics = useMemo(() => {
    const costs = productionJobs.reduce((sum, job) => sum + getCostBreakdownForJob(job).total, 0);
    const totalFilamentKg = filament.reduce((sum, item) => sum + item.gramsAvailable, 0) / 1000;
    return {
      designProjects: designProjects.length,
      stls: stls.length,
      concepts: concepts.length,
      variants: variants.length,
      collections: collections.length,
      releases: releases.length,
      productionJobs: productionJobs.length,
      filament: filament.length,
      printers: printers.length,
      costs,
      printing: productionJobs.filter((o) => o.status === "Printing").length,
      done: productionJobs.filter((o) => o.status === "Complete").length,
      totalFilamentKg,
    };
  }, [designProjects, stls, concepts, variants, collections, releases, productionJobs, printers, filament, settings]);

  const queueCounts = useMemo(() => ({
    Queued: productionJobs.filter((o) => o.status === "Queued").length,
    Printing: productionJobs.filter((o) => o.status === "Printing").length,
    Finishing: productionJobs.filter((o) => o.status === "Finishing").length,
    Complete: productionJobs.filter((o) => o.status === "Complete").length,
    Cancelled: productionJobs.filter((o) => o.status === "Cancelled").length,
  }), [productionJobs]);

  const productionMetrics = useMemo(() => (
    calculateProductionMetrics(productionJobs, designProjects, printers, filament, settings)
  ), [productionJobs, designProjects, printers, filament, settings]);
  const integrityIssues = useMemo(() => inspectWorkspaceIntegrity(appData), [
    designProjects, stls, concepts, variants, collections, releases, productionJobs, productionBatches,
    filament, materialMovements, printers, maintenance, costSnapshots, activityLog, settings,
    prototypes, plannedFilament, designPlanning, realmMaterials,
  ]);

  function logActivity(
    kind: ActivityEvent["kind"],
    station: ActivityEvent["station"],
    summary: string,
    recordId?: string,
  ) {
    setActivityLog((prev) => [{
      id: uid("ACT"),
      occurredAt: new Date().toISOString(),
      kind,
      station,
      summary,
      recordId,
    }, ...prev].slice(0, 500));
  }

  function triggerQuickAction(action: QuickActionKey) {
    setQuickAction(action);
    if (action === "newDesign") setView("designs");
    if (action === "newJob") { setView("production"); setDesignTab("jobs"); }
    if (action === "newFilament") setView("filament");
    if (action === "newPrinter") setView("printers");
  }

  function clearQuickAction(action: QuickActionKey) {
    if (quickAction === action) setQuickAction(null);
  }

  function addDesign() {
    if (!newDesignName.trim()) return;
    const id = uid("P");
    setDesignProjects((prev) => [{
      id,
      name: newDesignName.trim(),
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
      designImagePath: "",
      conceptImagePath: "",
      supportedRealmVariants: [],
      notes: "",
    }, ...prev]);
    setSelectedDesignProjectId(id);
    setNewDesignName("");
    clearQuickAction("newDesign");
    logActivity("create", "design-library", `Created design project ${newDesignName.trim()}.`, id);
  }

  function updateDesign(id: string, patch: Partial<DesignProject>) {
    setDesignProjects((prev) => prev.map((design) => design.id === id ? { ...design, ...patch } : design));
  }

  function removeDesign(id: string) {
    const design = designProjects.find((p) => p.id === id);
    if (!design) return;
    if (productionJobs.some((job) => job.designProjectId === id)) {
      window.alert(`${design.name} has production history and cannot be deleted. Archive the design instead.`);
      return;
    }
    const confirmed = window.confirm(`Remove ${design.name}? This also removes linked STL records, concept specs, production jobs, and release links.`);
    if (!confirmed) return;
    setDesignProjects((prev) => prev.filter((p) => p.id !== id));
    setStls((prev) => prev.filter((stl) => stl.designProjectId !== id));
    setConcepts((prev) => prev.filter((concept) => concept.designProjectId !== id));
    setVariants((prev) => prev.filter((variant) => variant.designProjectId !== id));
    setProductionJobs((prev) => prev.filter((job) => job.designProjectId !== id));
    setReleases((prev) => prev.map((release) => ({ ...release, designProjectIds: release.designProjectIds.filter((designProjectId) => designProjectId !== id) })));
    setCollections((prev) => prev.map((collection) => ({ ...collection, heroDesignProjectId: collection.heroDesignProjectId === id ? undefined : collection.heroDesignProjectId })));
    logActivity("update", "design-library", `Removed design project ${design.name}.`, id);
  }

  function addStl() {
    if (!newStlName.trim() || !selectedDesignProjectId) return;
    setStls((prev) => [{
      id: uid("STL"),
      designProjectId: selectedDesignProjectId,
      name: newStlName.trim(),
      fileName: `${newStlName.trim()}.stl`,
      filePath: "",
      folderPath: suggestedLibraryPath(settings.forgekeeperLibraryPath, selectedDesignProject?.name || "Unassigned", "stl", `v${String(designStls.length + 1).padStart(3, "0")}`),
      libraryPath: suggestedLibraryPath(settings.forgekeeperLibraryPath, selectedDesignProject?.name || "Unassigned", "stl", `v${String(designStls.length + 1).padStart(3, "0")}`),
      version: `v${designStls.length + 1}`,
      isPrimary: designStls.length === 0,
      defaultPrinterId: printers[0]?.id,
      defaultSlicer: printers[0] ? slicerForPrinter(printers[0].name) : settings.defaultSlicer,
      linkedConceptId: designConcepts[0]?.id,
      assetStatus: "Planned",
      notes: "",
    }, ...prev]);
    setNewStlName("");
  }

  function updateStl(id: string, patch: Partial<STLRecord>) {
    setStls((prev) => prev.map((stl) => stl.id === id ? { ...stl, ...patch } : stl));
  }

  function markPrimaryStl(id: string) {
    setStls((prev) => prev.map((stl) => (stl.designProjectId === selectedDesignProjectId ? { ...stl, isPrimary: stl.id === id } : stl)));
  }

  function removeStl(id: string) {
    setStls((prev) => prev.filter((stl) => stl.id !== id));
    setConcepts((prev) => prev.map((concept) => (concept.linkedStlId === id || concept.linkedStlIds?.includes(id) ? { ...concept, linkedStlId: concept.linkedStlId === id ? undefined : concept.linkedStlId, linkedStlIds: (concept.linkedStlIds ?? []).filter((stlId) => stlId !== id) } : concept)));
    setVariants((prev) => prev.map((variant) => (variant.stlId === id ? { ...variant, stlId: undefined } : variant)));
  }

  function addConcept() {
    if (!newConceptTitle.trim() || !selectedDesignProjectId) return;
    setConcepts((prev) => [{
      id: uid("CON"),
      designProjectId: selectedDesignProjectId,
      title: newConceptTitle.trim(),
      imageName: `${newConceptTitle.trim()}.png`,
      imagePath: "",
      measurementImagePath: "",
      referenceFolderPath: suggestedLibraryPath(settings.forgekeeperLibraryPath, selectedDesignProject?.name || "Unassigned", "reference"),
      measurements: "",
      description: "",
      notes: "",
      linkedStlId: designStls[0]?.id,
      linkedStlIds: designStls[0]?.id ? [designStls[0].id] : [],
    }, ...prev]);
    setNewConceptTitle("");
  }

  function updateConcept(id: string, patch: Partial<ConceptSpec>) {
    setConcepts((prev) => prev.map((concept) => (concept.id === id ? { ...concept, ...patch } : concept)));
  }

  function removeConcept(id: string) {
    setConcepts((prev) => prev.filter((concept) => concept.id !== id));
    setVariants((prev) => prev.map((variant) => (variant.conceptId === id ? { ...variant, conceptId: undefined } : variant)));
  }

  function addVariant(realm?: DesignVariant["realm"]) {
    if (!selectedDesignProject) return;
    const chosenRealm = realm ?? selectedDesignProject.supportedRealmVariants[0] ?? "Midgard";
    const existing = variants.find((variant) => variant.designProjectId === selectedDesignProject.id && variant.realm === chosenRealm);
    if (existing) {
      window.alert(`${chosenRealm} already has a variant record for this design.`);
      return;
    }
    const primaryStl = getPrimaryStlForDesign(selectedDesignProject.id);
    const latestConcept = getLatestConceptForDesign(selectedDesignProject.id);
    setVariants((prev) => [{
      id: uid("VAR"),
      designProjectId: selectedDesignProject.id,
      realm: chosenRealm,
      name: `${selectedDesignProject.name} - ${chosenRealm}`,
      designImagePath: selectedDesignProject.designImagePath,
      conceptImagePath: selectedDesignProject.conceptImagePath || latestConcept?.imageName || "",
      stlId: primaryStl?.id,
      conceptId: latestConcept?.id,
      filamentId: filament[0]?.id,
      priceModifier: 0,
      estimatedFilamentGrams: selectedDesignProject.estimatedFilamentGrams,
      estimatedPrintHours: selectedDesignProject.estimatedPrintHours,
      isActive: true,
      notes: "",
    }, ...prev]);
    if (!selectedDesignProject.supportedRealmVariants.includes(chosenRealm)) {
      updateDesign(selectedDesignProject.id, { supportedRealmVariants: [...selectedDesignProject.supportedRealmVariants, chosenRealm] });
    }
  }

  function updateVariant(id: string, patch: Partial<DesignVariant>) {
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
    setCollections((prev) => [{ id: uid("COL"), name: newCollectionName.trim(), line: "ForgeTech", description: "", heroDesignProjectId: undefined }, ...prev]);
    setNewCollectionName("");
  }

  function updateCollection(id: string, patch: Partial<CollectionRecord>) {
    const current = collections.find((collection) => collection.id === id);
    setCollections((prev) => prev.map((collection) => (collection.id === id ? { ...collection, ...patch } : collection)));
    if (current && patch.name && patch.name !== current.name) {
      setDesignProjects((prev) => prev.map((design) => design.collection === current.name ? { ...design, collection: patch.name as string } : design));
    }
  }

  function removeCollection(id: string) {
    const collection = collections.find((item) => item.id === id);
    if (!collection) return;
    if (!window.confirm(`Remove collection ${collection.name}? Design Projects will be moved to Unassigned.`)) return;
    setCollections((prev) => prev.filter((item) => item.id !== id));
    setDesignProjects((prev) => prev.map((design) => design.collection === collection.name ? { ...design, collection: "Unassigned" } : design));
  }

  function assignDesignToCollection(designProjectId: string, collectionName: string) {
    setDesignProjects((prev) => prev.map((design) => (design.id === designProjectId ? { ...design, collection: collectionName } : design)));
  }

  function setCollectionHero(collectionId: string, designProjectId: string) {
    setCollections((prev) => prev.map((collection) => (collection.id === collectionId ? { ...collection, heroDesignProjectId: designProjectId } : collection)));
  }

  function addRelease() {
    if (!newReleaseName.trim()) return;
    setReleases((prev) => [{ id: uid("REL"), name: newReleaseName.trim(), wave: "Wave 01", targetDate: "", status: "Planning", designProjectIds: selectedDesignProject ? [selectedDesignProject.id] : [], notes: "" }, ...prev]);
    setNewReleaseName("");
  }

  function updateRelease(id: string, patch: Partial<ReleaseRecord>) {
    setReleases((prev) => prev.map((release) => release.id === id ? { ...release, ...patch } : release));
  }

  function removeRelease(id: string) {
    const release = releases.find((item) => item.id === id);
    if (!release) return;
    if (!window.confirm(`Remove release ${release.name}? Design Projects will remain in the Design Library.`)) return;
    setReleases((prev) => prev.filter((item) => item.id !== id));
  }

  function addDesignToRelease(releaseId: string, designProjectId: string) {
    setReleases((prev) => prev.map((release) => (release.id === releaseId && !release.designProjectIds.includes(designProjectId) ? { ...release, designProjectIds: [...release.designProjectIds, designProjectId] } : release)));
  }

  function removeDesignFromRelease(releaseId: string, designProjectId: string) {
    setReleases((prev) => prev.map((release) => (release.id === releaseId ? { ...release, designProjectIds: release.designProjectIds.filter((id) => id !== designProjectId) } : release)));
  }

  function addProductionJob() {
    if (!newJobName.trim() || !selectedDesignProject) return;
    const id = uid("JOB");
    setProductionJobs((prev) => [{
      id,
      name: newJobName.trim(),
      designProjectId: selectedDesignProject.id,
      filamentId: filament[0]?.id,
      materialGrams: selectedDesignProject.estimatedFilamentGrams,
      quantity: 1,
      targetDate: "",
      status: "Queued",
      priority: "Normal",
      printerId: undefined,
      estimatedPrintHours: selectedDesignProject.estimatedPrintHours || 0,
      laborHours: 0.5,
      laborRate: settings.laborRate,
      machineWatts: printers[0]?.watts ?? settings.machineWatts,
      electricityRate: settings.electricityRate,
      packagingCost: settings.packagingCost,
      otherCost: settings.otherCost,
      notes: "",
      materialConsumed: false,
    }, ...prev]);
    setNewJobName("");
    clearQuickAction("newJob");
    logActivity("create", "production", `Created production job ${newJobName.trim()}.`, id);
  }

  function updateProductionJob(id: string, patch: Partial<ProductionJob>) {
    const current = productionJobs.find((job) => job.id === id);
    if (!current) return;
    const transitionPatch: Partial<ProductionJob> = { ...patch };
    if (patch.status === "Printing" && current.status !== "Printing" && !current.startedAt) {
      transitionPatch.startedAt = new Date().toISOString();
    }
    if (patch.status === "Complete" && current.status !== "Complete") {
      const completedAt = new Date().toISOString();
      const completedJob: ProductionJob = {
        ...current,
        ...transitionPatch,
        completedAt,
        unitsCompleted: transitionPatch.unitsCompleted ?? current.unitsCompleted ?? current.quantity,
        actualPrintHours: transitionPatch.actualPrintHours ?? current.actualPrintHours ?? current.estimatedPrintHours * current.quantity,
        actualMaterialGrams: transitionPatch.actualMaterialGrams ?? current.actualMaterialGrams ?? jobMaterialGrams(current, designProjects.find((item) => item.id === current.designProjectId)),
        outcome: transitionPatch.outcome ?? current.outcome ?? "Success",
      };
      const breakdown = getCostBreakdownForJob({
        ...completedJob,
        estimatedPrintHours: completedJob.actualPrintHours || completedJob.estimatedPrintHours,
        materialGrams: completedJob.actualMaterialGrams || completedJob.materialGrams,
        quantity: 1,
      });
      const snapshotId = uid("COST");
      transitionPatch.completedAt = completedAt;
      transitionPatch.unitsCompleted = completedJob.unitsCompleted;
      transitionPatch.actualPrintHours = completedJob.actualPrintHours;
      transitionPatch.actualMaterialGrams = completedJob.actualMaterialGrams;
      transitionPatch.outcome = completedJob.outcome;
      transitionPatch.costSnapshotId = snapshotId;
      setCostSnapshots((prev) => [{
        id: snapshotId,
        productionJobId: id,
        capturedAt: completedAt,
        materialCost: breakdown.material,
        electricityCost: breakdown.electricity,
        laborCost: breakdown.labor,
        finishingCost: breakdown.packaging + breakdown.other,
        totalCost: breakdown.total,
        gramsUsed: breakdown.gramsUsed,
        printHours: breakdown.printHours,
      }, ...prev.filter((item) => item.productionJobId !== id)]);
      logActivity("complete", "production", `Completed production job ${current.name}.`, id);
    }
    setProductionJobs((prev) => prev.map((job) => {
      if (job.id !== id) return job;
      const next = { ...job, ...transitionPatch };
      if (transitionPatch.designProjectId) {
        const design = designProjects.find((item) => item.id === transitionPatch.designProjectId);
        if (design) {
          next.estimatedPrintHours = design.estimatedPrintHours;
          next.materialGrams = design.estimatedFilamentGrams;
        }
      }
      if (transitionPatch.printerId) {
        const printer = printers.find((item) => item.id === transitionPatch.printerId);
        next.machineWatts = printer?.watts ?? settings.machineWatts;
        if (next.status === "Queued") next.status = "Printing";
      }
      return next;
    }));
  }

  function removeProductionJob(id: string) {
    const job = productionJobs.find((item) => item.id === id);
    if (!job) return;
    if (job.status === "Complete" || job.materialConsumed || costSnapshots.some((snapshot) => snapshot.productionJobId === id)) {
      window.alert(`${job.name} has production history and cannot be deleted. Keep it as Complete or Cancelled so reports remain accurate.`);
      return;
    }
    if (!window.confirm(`Remove production job ${job.name}?`)) return;
    setProductionJobs((prev) => prev.filter((job) => job.id !== id));
    setMaterialMovements((prev) => prev.filter((movement) => movement.productionJobId !== id));
    setCostSnapshots((prev) => prev.filter((snapshot) => snapshot.productionJobId !== id));
    logActivity("update", "production", `Removed production job ${job.name}.`, id);
  }

  function addProductionBatch() {
    if (!newBatchName.trim()) return;
    const id = uid("BATCH");
    setProductionBatches((prev) => [{
      id,
      name: newBatchName.trim(),
      status: "Planned",
      scheduledStart: "",
      notes: "",
    }, ...prev]);
    setNewBatchName("");
    logActivity("create", "production", `Created production batch ${newBatchName.trim()}.`, id);
  }

  function updateProductionBatch(id: string, patch: Partial<ProductionBatch>) {
    setProductionBatches((prev) => prev.map((batch) => {
      if (batch.id !== id) return batch;
      const next = { ...batch, ...patch };
      if (patch.status === "Complete" && !batch.completedAt) next.completedAt = new Date().toISOString();
      return next;
    }));
  }

  function removeProductionBatch(id: string) {
    const batch = productionBatches.find((item) => item.id === id);
    if (!batch) return;
    if (!window.confirm(`Remove batch ${batch.name}? Jobs will remain and become unbatched.`)) return;
    setProductionBatches((prev) => prev.filter((item) => item.id !== id));
    setProductionJobs((prev) => prev.map((job) => job.batchId === id ? { ...job, batchId: undefined } : job));
    logActivity("update", "production", `Removed production batch ${batch.name}.`, id);
  }

  function consumeFilamentForJob(id: string) {
    const job = productionJobs.find((item) => item.id === id);
    if (!job) return;
    if (job.materialConsumed) {
      window.alert("Filament has already been consumed for this job.");
      return;
    }
    if (!job.filamentId) {
      window.alert("Select a filament before consuming material.");
      return;
    }
    const design = designProjects.find((item) => item.id === job.designProjectId);
    const grams = jobMaterialGrams(job, design);
    const spool = filament.find((item) => item.id === job.filamentId);
    if (!spool) {
      window.alert("Selected filament could not be found.");
      return;
    }
    if (grams > spool.gramsAvailable) {
      window.alert(`${spool.colorName} is short ${(grams - spool.gramsAvailable).toFixed(0)}g. Add stock or select another material before consuming it.`);
      return;
    }
    const confirmed = window.confirm(`Deduct ${grams.toFixed(0)}g from ${spool.colorName}?`);
    if (!confirmed) return;
    setFilament((prev) => prev.map((item) => item.id === job.filamentId ? { ...item, gramsAvailable: Math.max(0, item.gramsAvailable - grams) } : item));
    setProductionJobs((prev) => prev.map((item) => item.id === id ? { ...item, materialConsumed: true } : item));
    setMaterialMovements((prev) => [{
      id: uid("MOVE"),
      filamentId: job.filamentId as string,
      type: "Production",
      grams: -grams,
      occurredAt: new Date().toISOString(),
      productionJobId: id,
      notes: `Consumed for ${job.name}`,
    }, ...prev]);
    logActivity("inventory", "materials", `Consumed ${grams.toFixed(0)}g of ${spool.colorName} for ${job.name}.`, job.filamentId);
  }

  function addFilament() {
    if (!newFilamentName.trim()) return;
    const id = uid("FIL");
    setFilament((prev) => [{ id, brand: "Generic", material: "PLA", colorName: newFilamentName.trim(), colorFamily: "Unknown", gramsAvailable: 1000, reorderPointGrams: 250, spoolPrice: 22, spoolWeightGrams: 1000, notes: "" }, ...prev]);
    setMaterialMovements((prev) => [{
      id: uid("MOVE"),
      filamentId: id,
      type: "Purchase",
      grams: 1000,
      occurredAt: new Date().toISOString(),
      notes: "Initial spool inventory",
    }, ...prev]);
    logActivity("inventory", "materials", `Added material spool ${newFilamentName.trim()}.`, id);
    setNewFilamentName("");
    clearQuickAction("newFilament");
  }

  function updateFilament(id: string, patch: Partial<FilamentRecord>) {
    setFilament((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function adjustFilament(id: string, delta: number, type: MaterialMovementType = "Adjustment", notes = "Manual inventory adjustment") {
    if (!Number.isFinite(delta) || delta === 0) return;
    const item = filament.find((record) => record.id === id);
    if (!item) return;
    const applied = Math.max(-item.gramsAvailable, delta);
    setFilament((prev) => prev.map((item) => (item.id === id ? { ...item, gramsAvailable: Math.max(0, item.gramsAvailable + delta) } : item)));
    setMaterialMovements((prev) => [{
      id: uid("MOVE"),
      filamentId: id,
      type,
      grams: applied,
      occurredAt: new Date().toISOString(),
      notes,
    }, ...prev]);
    logActivity("inventory", "materials", `${applied >= 0 ? "Added" : "Removed"} ${Math.abs(applied).toFixed(0)}g ${item.colorName}.`, id);
  }

  function removeFilament(id: string) {
    const item = filament.find((record) => record.id === id);
    if (!item) return;
    if (productionJobs.some((job) => job.filamentId === id) || materialMovements.some((movement) => movement.filamentId === id)) {
      window.alert(`${item.colorName} has production or movement history and cannot be deleted. Set its available grams to zero and archive it in notes instead.`);
      return;
    }
    if (!window.confirm(`Remove filament ${item.colorName}?`)) return;
    setFilament((prev) => prev.filter((record) => record.id !== id));
  }

  function addPrinter() {
    if (!newPrinterName.trim()) return;
    const id = uid("PR");
    setPrinters((prev) => [{ id, name: newPrinterName.trim(), model: newPrinterName.trim(), status: "Available", buildVolume: "", watts: settings.machineWatts, nozzleDiameter: 0.4, supportedMaterials: ["PLA", "PLA+", "PETG"], maintenanceIntervalDays: 30, activeJob: "", notes: "" }, ...prev]);
    logActivity("create", "printer-pool", `Added printer ${newPrinterName.trim()}.`, id);
    setNewPrinterName("");
    clearQuickAction("newPrinter");
  }

  function updatePrinter(id: string, patch: Partial<PrinterRecord>) {
    setPrinters((prev) => prev.map((printer) => (printer.id === id ? { ...printer, ...patch } : printer)));
  }

  function removePrinter(id: string) {
    const printer = printers.find((item) => item.id === id);
    if (!printer) return;
    if (!window.confirm(`Remove printer ${printer.name}? Related production jobs will be unassigned.`)) return;
    setPrinters((prev) => prev.filter((item) => item.id !== id));
    setProductionJobs((prev) => prev.map((job) => (job.printerId === id ? { ...job, printerId: undefined, status: job.status === "Printing" ? "Queued" : job.status } : job)));
    setMaintenance((prev) => prev.filter((entry) => entry.printerId !== id));
  }

  function addMaintenance(printerId: string) {
    const id = uid("M");
    setMaintenance((prev) => [{ id, printerId, title: "General Maintenance", performedOn: new Date().toISOString().slice(0, 10), notes: "" }, ...prev]);
    const printer = printers.find((item) => item.id === printerId);
    logActivity("maintenance", "printer-pool", `Logged maintenance for ${printer?.name ?? printerId}.`, id);
  }

  function updateMaintenance(id: string, patch: Partial<MaintenanceRecord>) {
    setMaintenance((prev) => prev.map((entry) => entry.id === id ? { ...entry, ...patch } : entry));
  }

  function removeMaintenance(id: string) {
    setMaintenance((prev) => prev.filter((entry) => entry.id !== id));
  }

  function updatePrototype(id: string, patch: Partial<PlannedPrototype>) {
    setPrototypes((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function addPrototype() {
    if (!newPrototypeName.trim()) return;
    const id = uid("PROTO");
    setPrototypes((prev) => [{
      id,
      designName: newPrototypeName.trim(),
      family: "Unassigned",
      collection: "Unassigned",
      tier: "Utility",
      status: "Active Idea",
      priority: "Medium",
      printerFit: "",
      nextStep: "Define the next concrete test.",
      notes: "",
    }, ...prev]);
    setNewPrototypeName("");
    logActivity("create", "planning", `Added prototype plan ${newPrototypeName.trim()}.`, id);
  }

  function removePrototype(id: string) {
    const prototype = prototypes.find((item) => item.id === id);
    if (!prototype) return;
    if (!window.confirm(`Remove prototype plan ${prototype.designName}?`)) return;
    setPrototypes((prev) => prev.filter((item) => item.id !== id));
  }

  function promotePrototypeToDesign(id: string) {
    const prototype = prototypes.find((item) => item.id === id);
    if (!prototype) return;
    const existing = designProjects.find((item) => item.name.toLowerCase() === prototype.designName.toLowerCase());
    if (existing) {
      setSelectedDesignProjectId(existing.id);
      setView("designs");
      return;
    }
    const designId = uid("P");
    setDesignProjects((prev) => [{
      id: designId,
      name: prototype.designName,
      tier: prototype.tier,
      line: "Foundry",
      category: prototype.family,
      collection: prototype.collection,
      status: "Prototype",
      targetPrice: 0,
      estimatedFilamentGrams: 0,
      estimatedPrintHours: 0,
      available: 0,
      reorderPoint: 0,
      designImagePath: "",
      conceptImagePath: "",
      supportedRealmVariants: [],
      notes: [prototype.nextStep, prototype.notes].filter(Boolean).join("\n"),
    }, ...prev]);
    setSelectedDesignProjectId(designId);
    setView("designs");
    logActivity("create", "design-library", `Promoted ${prototype.designName} from Planning to the Design Library.`, designId);
  }

  function updatePlannedFilament(id: string, patch: Partial<PlannedFilament>) {
    setPlannedFilament((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removePlannedFilament(id: string) {
    setPlannedFilament((prev) => prev.filter((item) => item.id !== id));
  }

  function addPlannedFilament() {
    if (!newPlannedFilamentName.trim()) return;
    const id = uid("PF");
    setPlannedFilament((prev) => [{
      id,
      name: newPlannedFilamentName.trim(),
      brand: "",
      materialFamily: "Other",
      realms: [],
      batchGroup: "",
      status: "Planned",
      priority: "Medium",
      finishDirection: "",
      notes: "",
    }, ...prev]);
    setNewPlannedFilamentName("");
    logActivity("create", "planning", `Added planned material ${newPlannedFilamentName.trim()}.`, id);
  }

  function addDesignPlanning() {
    if (!newDesignPlanningName.trim()) return;
    const id = uid("PLAN");
    setDesignPlanning((prev) => [{
      id,
      designFamily: "Unassigned",
      baseDesign: newDesignPlanningName.trim(),
      collection: "Unassigned",
      tier: "Utility",
      sharedChassis: "No",
      coreFunction: "",
      realmVariantSupport: "Optional",
      coreParts: "",
      variantParts: "",
      baseAddOns: "",
      topModuleOptions: "",
      attachmentTypes: "",
      bestPrinterFit: "",
      prototypePriority: "Medium",
      notes: "",
    }, ...prev]);
    setNewDesignPlanningName("");
    logActivity("create", "planning", `Added design architecture record ${newDesignPlanningName.trim()}.`, id);
  }

  function updateDesignPlanning(id: string, patch: Partial<DesignPlanningRecord>) {
    setDesignPlanning((prev) => prev.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function removeDesignPlanning(id: string) {
    const item = designPlanning.find((record) => record.id === id);
    if (!item) return;
    if (!window.confirm(`Remove design planning record ${item.baseDesign}?`)) return;
    setDesignPlanning((prev) => prev.filter((record) => record.id !== id));
  }

  function movePlannedFilamentToInventory(id: string) {
    const planned = plannedFilament.find((item) => item.id === id);
    if (!planned) return;
    const filamentId = uid("FIL");
    setFilament((prev) => [
      {
        id: filamentId,
        brand: planned.brand || "Generic",
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
    setMaterialMovements((prev) => [{
      id: uid("MOVE"),
      filamentId,
      type: "Purchase",
      grams: 1000,
      occurredAt: new Date().toISOString(),
      notes: `Moved from Planning: ${planned.name}`,
    }, ...prev]);
    setPlannedFilament((prev) => prev.map((item) => (item.id === id ? { ...item, status: "Active" } : item)));
    logActivity("inventory", "materials", `Moved planned material ${planned.name} into inventory.`, filamentId);
  }

  function getDefaultSlicerForPrinter(printerName?: string) {
    return slicerForPrinter(printerName) || settings.defaultSlicer || "orca";
  }

  function getPreferredSlicerForStl(stl: STLRecord) {
    const printer = printers.find((item) => item.id === stl.defaultPrinterId);
    return stl.defaultSlicer || slicerForPrinter(printer?.name || "") || settings.defaultSlicer || "orca";
  }

  function suggestStlLibraryFolder(designProjectId: string, version = "v001") {
    const design = designProjects.find((item) => item.id === designProjectId);
    return suggestedLibraryPath(settings.forgekeeperLibraryPath, design?.name || "Unassigned", "stl", version);
  }

  function suggestConceptLibraryFolder(designProjectId: string) {
    const design = designProjects.find((item) => item.id === designProjectId);
    return suggestedLibraryPath(settings.forgekeeperLibraryPath, design?.name || "Unassigned", "concept");
  }

  function linkStlPath(id: string, path: string) {
    const folder = folderFromPath(path);
    setStls((prev) => prev.map((stl) => (stl.id === id ? { ...stl, filePath: path, fileName: filenameFromPath(path), folderPath: folder || stl.folderPath, assetStatus: "Linked" } : stl)));
  }

  function setStlSuggestedFolder(id: string) {
    const stl = stls.find((item) => item.id === id);
    if (!stl) return;
    const folder = suggestStlLibraryFolder(stl.designProjectId, stl.version?.startsWith("v") ? stl.version.replace("v", "v00").slice(0, 4) : "v001");
    updateStl(id, { folderPath: folder, libraryPath: folder });
  }

  function openStlAsset(id: string, mode: "file" | "folder" | "slicer" | "blender") {
    const stl = stls.find((item) => item.id === id);
    if (!stl) return;
    const slicer = getPreferredSlicerForStl(stl);
    if (mode === "file") return openLocalPathBestEffort(stl.filePath || stl.fileName);
    if (mode === "folder") return openLocalPathBestEffort(stl.folderPath || stl.libraryPath || folderFromPath(stl.filePath));
    if (mode === "blender") {
      return launchExternalTool(getToolPath(settings, "blender"), stl.filePath, "Blender");
    }
    return launchExternalTool(
      getToolPath(settings, slicer),
      stl.filePath,
      slicer === "anycubic" ? "Anycubic Slicer Next" : "OrcaSlicer",
    );
  }

  function openExternalTool(tool: "orca" | "anycubic" | "blender" | "meshy") {
    if (tool === "meshy") return openWebUrl(settings.meshyUrl || "https://www.meshy.ai/");
    return launchExternalTool(getToolPath(settings, tool), undefined, tool === "blender" ? "Blender" : tool === "anycubic" ? "Anycubic Slicer Next" : "OrcaSlicer");
  }

  function updateSettings(patch: Partial<AppSettings>) {
    setSettings((prev) => ({ ...prev, ...patch }));
  }

  function exportDesignProjectsCsv() { downloadCsv("designProjects.csv", designProjects); }
  function exportStlsCsv() { downloadCsv("stls.csv", stls); }
  function exportConceptsCsv() { downloadCsv("concepts.csv", concepts); }
  function exportVariantsCsv() { downloadCsv("variants.csv", variants.map((variant) => ({ ...variant, designName: designName(designProjects, variant.designProjectId) }))); }
  function exportCollectionsCsv() { downloadCsv("collections.csv", collections); }
  function exportReleasesCsv() { downloadCsv("releases.csv", releases.map((r) => ({ ...r, designNames: r.designProjectIds.map((id) => designName(designProjects, id)).join(" | ") }))); }
  function exportProductionJobsCsv() { downloadCsv("productionJobs.csv", productionJobs.map((job) => {
    const breakdown = getCostBreakdownForJob(job);
    return {
      ...job,
      designName: designName(designProjects, job.designProjectId),
      materialCost: breakdown.material.toFixed(2),
      electricityCost: breakdown.electricity.toFixed(2),
      laborCost: breakdown.labor.toFixed(2),
      totalCost: breakdown.total.toFixed(2),
      suggestedPrice: breakdown.suggestedPrice.toFixed(2),
    };
  })); }
  function exportFilamentCsv() { downloadCsv("filament.csv", filament); }
  function exportMaterialMovementsCsv() { downloadCsv("material-movements.csv", materialMovements); }
  function exportPrintersCsv() { downloadCsv("printers.csv", printers); }
  function exportMaintenanceCsv() { downloadCsv("maintenance.csv", maintenance); }
  function exportProductionBatchesCsv() { downloadCsv("production-batches.csv", productionBatches); }
  function exportCostSnapshotsCsv() { downloadCsv("cost-snapshots.csv", costSnapshots); }
  function exportActivityLogCsv() { downloadCsv("activity-log.csv", activityLog); }
  function exportBackupJson() {
    downloadJson(`forgekeeper-backup-${Date.now()}.json`, {
      format: "forgekeeper-workspace",
      schemaVersion: 4,
      exportedAt: new Date().toISOString(),
      data: appData,
    });
  }

  function importBackupFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const raw = JSON.parse(String(reader.result || "{}"));
        if (!isForgekeeperBackup(raw)) {
          window.alert("This does not look like a Forgekeeper backup file.");
          return;
        }
        const parsed = hydrateData(migrateWorkspaceData(raw));
        const issues = inspectWorkspaceIntegrity(parsed);
        if (issues.length > 0) {
          window.alert(`The backup was not restored because it has ${issues.length} broken record relationship${issues.length === 1 ? "" : "s"}.`);
          return;
        }
        setDesignProjects(parsed.designProjects ?? []);
        setStls(parsed.stls ?? []);
        setConcepts(parsed.concepts ?? []);
        setVariants(parsed.variants ?? []);
        setCollections(parsed.collections ?? []);
        setReleases(parsed.releases ?? []);
        setProductionJobs(parsed.productionJobs ?? []);
        setProductionBatches(parsed.productionBatches ?? []);
        setFilament(parsed.filament ?? []);
        setMaterialMovements(parsed.materialMovements ?? []);
        setPrinters(parsed.printers ?? []);
        setMaintenance(parsed.maintenance ?? []);
        setCostSnapshots(parsed.costSnapshots ?? []);
        const importEvent: ActivityEvent = {
          id: uid("ACT"),
          occurredAt: new Date().toISOString(),
          kind: "import",
          station: "administration",
          summary: `Restored backup from ${file.name}.`,
        };
        setActivityLog([importEvent, ...(parsed.activityLog ?? [])].slice(0, 500));
        setSettings({ ...defaultExternalTools, ...defaultSettings, ...(parsed.settings ?? {}) });
        setPrototypes(parsed.prototypes ?? seedPrototypes);
        setPlannedFilament(parsed.plannedFilament ?? seedPlannedFilament);
        setDesignPlanning(parsed.designPlanning ?? seedDesignPlanning);
        setRealmMaterials(parsed.realmMaterials ?? seedRealmMaterials);
        setSelectedDesignProjectId(parsed.designProjects?.[0]?.id ?? "");
        window.alert("Forgekeeper backup restored.");
      } catch (error) {
        console.error(error);
        window.alert("Could not import that backup file.");
      }
    };
    reader.readAsText(file);
  }

  async function resetWorkspace() {
    if (!window.confirm("Reset this ForgeKeeper workspace? A fresh workspace will be empty and require setup.")) return;
    try {
      exportBackupJson();
      await repository.clear();
      window.location.reload();
    } catch (error) {
      console.error(error);
      window.alert("ForgeKeeper could not reset the workspace.");
    }
  }

  function completeSetup(
    patch: Partial<AppSettings>,
    initial?: { printerName?: string; materialName?: string; materialGrams?: number },
  ) {
    setSettings((prev) => ({
      ...prev,
      ...patch,
      workspaceName: patch.workspaceName?.trim() || prev.workspaceName || "Fenrir Forgeworks",
      ownerName: patch.ownerName?.trim() || prev.ownerName,
      setupCompleted: true,
    }));
    if (initial?.printerName?.trim() && printers.length === 0) {
      const printerId = uid("PR");
      setPrinters([{
        id: printerId,
        name: initial.printerName.trim(),
        model: initial.printerName.trim(),
        status: "Available",
        buildVolume: "",
        watts: Number(patch.machineWatts ?? settings.machineWatts),
        nozzleDiameter: 0.4,
        supportedMaterials: ["PLA", "PLA+", "PETG"],
        maintenanceIntervalDays: 30,
        activeJob: "",
        notes: "",
      }]);
    }
    if (initial?.materialName?.trim() && filament.length === 0) {
      const filamentId = uid("FIL");
      const grams = Math.max(0, Number(initial.materialGrams ?? 1000));
      setFilament([{
        id: filamentId,
        brand: "Generic",
        material: "PLA",
        colorName: initial.materialName.trim(),
        colorFamily: "Unknown",
        gramsAvailable: grams,
        reorderPointGrams: Math.min(250, grams),
        spoolPrice: 0,
        spoolWeightGrams: grams || 1000,
        notes: "",
      }]);
      setMaterialMovements([{
        id: uid("MOVE"),
        filamentId,
        type: "Purchase",
        grams,
        occurredAt: new Date().toISOString(),
        notes: "Initial setup inventory",
      }]);
    }
    logActivity("system", "administration", `Established workspace ${patch.workspaceName?.trim() || settings.workspaceName}.`);
  }

  return {
    view, setView, isReady, storageBackend, storageError, legacyImported,
    designProjects, stls, concepts, variants, collections, releases, productionJobs, productionBatches, filament, materialMovements, printers, maintenance, costSnapshots, activityLog, settings,
    prototypes, setPrototypes, plannedFilament, setPlannedFilament, designPlanning, setDesignPlanning, realmMaterials, setRealmMaterials,
    selectedDesignProjectId, setSelectedDesignProjectId, designTab, setDesignTab,
    newDesignName, setNewDesignName, newStlName, setNewStlName, newConceptTitle, setNewConceptTitle,
    newCollectionName, setNewCollectionName, newReleaseName, setNewReleaseName, newJobName, setNewJobName, newBatchName, setNewBatchName,
    newFilamentName, setNewFilamentName, newPrinterName, setNewPrinterName,
    newPrototypeName, setNewPrototypeName, newPlannedFilamentName, setNewPlannedFilamentName, newDesignPlanningName, setNewDesignPlanningName,
    searchTerm, setSearchTerm, quickAction,
    filteredDesignProjects, selectedDesignProject, designStls, designConcepts, designJobs, designVariants, designRelease, metrics, queueCounts, productionMetrics, integrityIssues, getCostBreakdownForJob, getDesignCostGuide, getPrimaryStlForDesign, getLatestConceptForDesign, getDesignDisplayImage, getVariantDisplayImage,
    triggerQuickAction,
    addDesign, updateDesign, removeDesign,
    addStl, updateStl, markPrimaryStl, removeStl,
    addConcept, updateConcept, removeConcept,
    addVariant, updateVariant, removeVariant,
    addCollection, updateCollection, removeCollection, assignDesignToCollection, setCollectionHero,
    addRelease, updateRelease, removeRelease, addDesignToRelease, removeDesignFromRelease,
    addProductionJob, updateProductionJob, removeProductionJob, consumeFilamentForJob,
    addProductionBatch, updateProductionBatch, removeProductionBatch,
    addFilament, updateFilament, adjustFilament, removeFilament,
    addPrinter, updatePrinter, removePrinter,
    addMaintenance, updateMaintenance, removeMaintenance,
    updateSettings, completeSetup,
    addPrototype, updatePrototype, removePrototype, promotePrototypeToDesign,
    addPlannedFilament, updatePlannedFilament, removePlannedFilament, movePlannedFilamentToInventory,
    addDesignPlanning, updateDesignPlanning, removeDesignPlanning,
    getDefaultSlicerForPrinter, getPreferredSlicerForStl, suggestStlLibraryFolder, suggestConceptLibraryFolder, linkStlPath, setStlSuggestedFolder, openStlAsset, openExternalTool,
    exportDesignProjectsCsv, exportStlsCsv, exportConceptsCsv, exportVariantsCsv, exportCollectionsCsv, exportReleasesCsv, exportProductionJobsCsv,
    exportFilamentCsv, exportMaterialMovementsCsv, exportPrintersCsv, exportMaintenanceCsv, exportProductionBatchesCsv, exportCostSnapshotsCsv, exportActivityLogCsv, exportBackupJson, importBackupFile, resetWorkspace,
  };
}

export type ForgekeeperState = ReturnType<typeof useForgekeeperState>;
export type QueueStatus = keyof ForgekeeperState["queueCounts"];
