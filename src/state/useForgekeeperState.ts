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
import { getWorkspaceRepository } from "../infrastructure/persistence/createWorkspaceRepository";
import type { StorageBackend } from "../core/persistence/workspaceRepository";
import { migrateWorkspaceData } from "../core/persistence/legacyMigration";
import type {
  AppData,
  AppSettings,
  CollectionRecord,
  ConceptSpec,
  FilamentRecord,
  MaintenanceRecord,
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
  filament: seedFilament,
  printers: seedPrinters,
  maintenance: [],
  settings: { ...defaultExternalTools, ...defaultSettings },
  prototypes: seedPrototypes,
  plannedFilament: seedPlannedFilament,
  designPlanning: seedDesignPlanning,
  realmMaterials: seedRealmMaterials,
};

function hydrateData(stored: AppData | null): AppData {
  if (!stored) return seedData;
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
  const [filament, setFilament] = useState<FilamentRecord[]>(initial.filament);
  const [printers, setPrinters] = useState<PrinterRecord[]>(initial.printers);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>(initial.maintenance);
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
  const [newFilamentName, setNewFilamentName] = useState("");
  const [newPrinterName, setNewPrinterName] = useState("");
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
    filament,
    printers,
    maintenance,
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
        setFilament(restored.filament);
        setPrinters(restored.printers);
        setMaintenance(restored.maintenance);
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
  }, [isReady, repository, designProjects, stls, concepts, variants, collections, releases, productionJobs, filament, printers, maintenance, settings, prototypes, plannedFilament, designPlanning, realmMaterials]);

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
  }

  function updateDesign(id: string, patch: Partial<DesignProject>) {
    setDesignProjects((prev) => prev.map((design) => design.id === id ? { ...design, ...patch } : design));
  }

  function removeDesign(id: string) {
    const design = designProjects.find((p) => p.id === id);
    if (!design) return;
    const confirmed = window.confirm(`Remove ${design.name}? This also removes linked STL records, concept specs, production jobs, and release links.`);
    if (!confirmed) return;
    setDesignProjects((prev) => prev.filter((p) => p.id !== id));
    setStls((prev) => prev.filter((stl) => stl.designProjectId !== id));
    setConcepts((prev) => prev.filter((concept) => concept.designProjectId !== id));
    setVariants((prev) => prev.filter((variant) => variant.designProjectId !== id));
    setProductionJobs((prev) => prev.filter((job) => job.designProjectId !== id));
    setReleases((prev) => prev.map((release) => ({ ...release, designProjectIds: release.designProjectIds.filter((designProjectId) => designProjectId !== id) })));
    setCollections((prev) => prev.map((collection) => ({ ...collection, heroDesignProjectId: collection.heroDesignProjectId === id ? undefined : collection.heroDesignProjectId })));
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
    setProductionJobs((prev) => [{
      id: uid("JOB"),
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
  }

  function updateProductionJob(id: string, patch: Partial<ProductionJob>) {
    setProductionJobs((prev) => prev.map((job) => {
      if (job.id !== id) return job;
      const next = { ...job, ...patch };
      if (patch.designProjectId) {
        const design = designProjects.find((item) => item.id === patch.designProjectId);
        if (design) {
          next.estimatedPrintHours = design.estimatedPrintHours;
          next.materialGrams = design.estimatedFilamentGrams;
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

  function removeProductionJob(id: string) {
    setProductionJobs((prev) => prev.filter((job) => job.id !== id));
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
    const confirmed = window.confirm(`Deduct ${grams.toFixed(0)}g from ${spool.colorName}?`);
    if (!confirmed) return;
    setFilament((prev) => prev.map((item) => item.id === job.filamentId ? { ...item, gramsAvailable: Math.max(0, item.gramsAvailable - grams) } : item));
    setProductionJobs((prev) => prev.map((item) => item.id === id ? { ...item, materialConsumed: true } : item));
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
    if (!window.confirm(`Remove printer ${printer.name}? Related production jobs will be unassigned.`)) return;
    setPrinters((prev) => prev.filter((item) => item.id !== id));
    setProductionJobs((prev) => prev.map((job) => (job.printerId === id ? { ...job, printerId: undefined, status: job.status === "Printing" ? "Queued" : job.status } : job)));
    setMaintenance((prev) => prev.filter((entry) => entry.printerId !== id));
  }

  function addMaintenance(printerId: string) {
    setMaintenance((prev) => [{ id: uid("M"), printerId, title: "General Maintenance", performedOn: new Date().toLocaleDateString(), notes: "" }, ...prev]);
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
  function exportPrintersCsv() { downloadCsv("printers.csv", printers); }
  function exportMaintenanceCsv() { downloadCsv("maintenance.csv", maintenance); }
  function exportBackupJson() { downloadJson(`forgekeeper-backup-${Date.now()}.json`, appData); }

  function importBackupFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = migrateWorkspaceData(JSON.parse(String(reader.result || "{}")));
        if (!Array.isArray(parsed.designProjects) || !Array.isArray(parsed.productionJobs)) {
          window.alert("This does not look like a Forgekeeper backup file.");
          return;
        }
        setDesignProjects(parsed.designProjects ?? []);
        setStls(parsed.stls ?? []);
        setConcepts(parsed.concepts ?? []);
        setVariants(parsed.variants ?? []);
        setCollections(parsed.collections ?? []);
        setReleases(parsed.releases ?? []);
        setProductionJobs(parsed.productionJobs ?? []);
        setFilament(parsed.filament ?? []);
        setPrinters(parsed.printers ?? []);
        setMaintenance(parsed.maintenance ?? []);
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
      await repository.clear();
      window.location.reload();
    } catch (error) {
      console.error(error);
      window.alert("ForgeKeeper could not reset the workspace.");
    }
  }

  function completeSetup(patch: Partial<AppSettings>) {
    setSettings((prev) => ({
      ...prev,
      ...patch,
      workspaceName: patch.workspaceName?.trim() || prev.workspaceName || "Fenrir Forgeworks",
      ownerName: patch.ownerName?.trim() || prev.ownerName,
      setupCompleted: true,
    }));
  }

  return {
    view, setView, isReady, storageBackend, storageError, legacyImported,
    designProjects, stls, concepts, variants, collections, releases, productionJobs, filament, printers, maintenance, settings,
    prototypes, setPrototypes, plannedFilament, setPlannedFilament, designPlanning, setDesignPlanning, realmMaterials, setRealmMaterials,
    selectedDesignProjectId, setSelectedDesignProjectId, designTab, setDesignTab,
    newDesignName, setNewDesignName, newStlName, setNewStlName, newConceptTitle, setNewConceptTitle,
    newCollectionName, setNewCollectionName, newReleaseName, setNewReleaseName, newJobName, setNewJobName,
    newFilamentName, setNewFilamentName, newPrinterName, setNewPrinterName, searchTerm, setSearchTerm, quickAction,
    filteredDesignProjects, selectedDesignProject, designStls, designConcepts, designJobs, designVariants, designRelease, metrics, queueCounts, productionMetrics, getCostBreakdownForJob, getDesignCostGuide, getPrimaryStlForDesign, getLatestConceptForDesign, getDesignDisplayImage, getVariantDisplayImage,
    triggerQuickAction,
    addDesign, updateDesign, removeDesign,
    addStl, updateStl, markPrimaryStl, removeStl,
    addConcept, updateConcept, removeConcept,
    addVariant, updateVariant, removeVariant,
    addCollection, updateCollection, removeCollection, assignDesignToCollection, setCollectionHero,
    addRelease, updateRelease, removeRelease, addDesignToRelease, removeDesignFromRelease,
    addProductionJob, updateProductionJob, removeProductionJob, consumeFilamentForJob,
    addFilament, updateFilament, adjustFilament, removeFilament,
    addPrinter, updatePrinter, removePrinter,
    addMaintenance, updateMaintenance, removeMaintenance,
    updateSettings, completeSetup, updatePrototype, updatePlannedFilament, removePlannedFilament, movePlannedFilamentToInventory, getDefaultSlicerForPrinter, getPreferredSlicerForStl, suggestStlLibraryFolder, suggestConceptLibraryFolder, linkStlPath, setStlSuggestedFolder, openStlAsset, openExternalTool,
    exportDesignProjectsCsv, exportStlsCsv, exportConceptsCsv, exportVariantsCsv, exportCollectionsCsv, exportReleasesCsv, exportProductionJobsCsv,
    exportFilamentCsv, exportPrintersCsv, exportMaintenanceCsv, exportBackupJson, importBackupFile, resetWorkspace,
  };
}

export type ForgekeeperState = ReturnType<typeof useForgekeeperState>;
export type QueueStatus = keyof ForgekeeperState["queueCounts"];
