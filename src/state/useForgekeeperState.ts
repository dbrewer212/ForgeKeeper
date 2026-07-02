import { useEffect, useMemo, useState } from "react";
import { defaultSettings, seedCollections, seedConcepts, seedDesignPackages, seedFilament, seedOrders, seedPrinters, seedProducts, seedReleases, seedStls, seedVariants } from "../data/seed";
import { seedPlannedFilament, seedProductPlanning, seedPrototypes, seedRealmMaterials } from "../data/planningSeed";
import { directCost, getOrderCostBreakdown } from "../lib/cost";
import { calculateProductionMetrics, orderMaterialGrams } from "../lib/production";
import { downloadCsv } from "../lib/csv";
import { uid } from "../lib/ids";
import { clearStoredData, downloadJson, loadStoredData, saveStoredData } from "../lib/storage";
import { defaultExternalTools, getToolPath, openLocalPathBestEffort, openWebUrl, slicerForPrinter } from "../lib/externalTools";
import { filenameFromPath, folderFromPath, suggestedLibraryPath } from "../lib/assetLibrary";
import type {
  AppData,
  AppSettings,
  CollectionRecord,
  ConceptSpec,
  DesignPackage,
  FilamentRecord,
  MaintenanceRecord,
  OrderRecord,
  OrderStatus,
  PrinterRecord,
  Product,
  ProductTab,
  ProductVariant,
  QuickActionKey,
  ReleaseRecord,
  STLRecord,
  ViewKey,
} from "../types/domain";
import type { PlannedFilament, PlannedPrototype, ProductPlanningRecord, RealmMaterialReference } from "../types/planning";
import { useBatchState } from "./batchState";

import JSZip from "jszip";

type ParsedDesignPackageZip = {
  packageName: string;
  packageCode?: string;
  pillar: Product["tier"];
  family: string;
  description: string;
  catalogDescription: string;
  notes: string;
  conceptFile?: { name: string; dataUrl: string };
  dataSheetFile?: { name: string; dataUrl: string };
  stlFile?: { name: string };
  threeMfFile?: { name: string };
  productionImages: Array<{ name: string; dataUrl: string }>;
  variantImages: Array<{ name: string; dataUrl: string }>;
  textFiles: Array<{ name: string; text: string }>;
};

function fieldFromText(text: string, labels: string[]) {
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^\\s*${escaped}\\s*[:=]\\s*(.+?)\\s*$`, "im");
    const match = text.match(regex);
    if (match?.[1]) return match[1].trim();
  }

  return "";
}

function inferPillarFromText(value: string): Product["tier"] {
  const lower = value.toLowerCase();
  if (lower.includes("relic") || lower.includes("coin") || lower.includes("realm")) return "Relics";
  if (lower.includes("tech") || lower.includes("stand") || lower.includes("dock")) return "ForgeTech";
  if (lower.includes("resilience") || lower.includes("memorial") || lower.includes("reforged")) return "Reforged";
  return "Foundry";
}

function inferFamilyFromText(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("goblin")) return "Forge Goblins";
  if (lower.includes("wyrm")) return "Wyrmslings";
  if (lower.includes("mimic")) return "Mimics";
  if (lower.includes("coin")) return "Coins";
  if (lower.includes("resilience")) return "Resilience Collection";
  if (lower.includes("stand")) return "ForgeTech Stands";
  return "Unassigned";
}

function cleanPackageNameFromFileName(fileName: string) {
  return fileName
    .replace(/\.zip$/i, "")
    .replace(/_DesignPackage$/i, "")
    .replace(/_Design_Package$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
}

function displayNameFromFile(path: string) {
  const file = path.split("/").pop() ?? path;
  return file
    .replace(/\.[^.]+$/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b(concept|variant|catalog|display|image|meshy|output|generate|generation)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function dataUrlFromZipFile(file: JSZip.JSZipObject, mimeType: string) {
  const base64 = await file.async("base64");
  return `data:${mimeType};base64,${base64}`;
}

async function parseDesignPackageZip(file: File): Promise<ParsedDesignPackageZip> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files).filter((entry) => !entry.dir);

  const imageEntries = entries.filter((entry) => /\.(png|jpe?g|webp)$/i.test(entry.name));
  const textEntries = entries.filter((entry) => /\.(txt|md|json)$/i.test(entry.name));
  const pdfEntries = entries.filter((entry) => /\.pdf$/i.test(entry.name));
  const stlEntry = entries.find((entry) => /\.stl$/i.test(entry.name));
  const threeMfEntry = entries.find((entry) => /\.3mf$/i.test(entry.name));

  const textFiles = await Promise.all(
    textEntries.map(async (entry) => ({
      name: entry.name,
      text: await entry.async("text"),
    })),
  );

  let manifestData: Record<string, any> = {};
  const jsonManifest = textFiles.find((entry) => /manifest/i.test(entry.name) && /\.json$/i.test(entry.name));
  if (jsonManifest) {
    try {
      manifestData = JSON.parse(jsonManifest.text);
    } catch {
      manifestData = {};
    }
  }

  const combinedText = textFiles.map((entry) => `# ${entry.name}\n${entry.text}`).join("\n\n");

  const conceptCandidates = imageEntries.filter((entry) => /concept|sheet|display|catalog|cover/i.test(entry.name));
  const conceptEntry = conceptCandidates[0] ?? imageEntries[0];
  const catalogEntry = imageEntries.find((entry) => /catalog|display|cover/i.test(entry.name)) ?? conceptEntry;

  const variantEntries = imageEntries.filter((entry) => entry.name !== catalogEntry?.name && !/production|print|photo|final/i.test(entry.name));
  const productionImageEntries = imageEntries.filter((entry) => /production|print|photo|final/i.test(entry.name));

  const imageToData = async (entry: JSZip.JSZipObject) => {
    const ext = entry.name.toLowerCase().split(".").pop();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
    return { name: entry.name, dataUrl: await dataUrlFromZipFile(entry, mime) };
  };

  const conceptFile = conceptEntry ? await imageToData(conceptEntry) : undefined;
  const dataSheetEntry = pdfEntries.find((entry) => /datasheet|data_sheet|package.*sheet|spec/i.test(entry.name)) ?? pdfEntries[0];
  const dataSheetFile = dataSheetEntry
    ? { name: dataSheetEntry.name, dataUrl: await dataUrlFromZipFile(dataSheetEntry, "application/pdf") }
    : undefined;

  const zipName = cleanPackageNameFromFileName(file.name);
  const packageName =
    manifestData.packageName ||
    manifestData.name ||
    fieldFromText(combinedText, ["Package Name", "Package"]) ||
    zipName;

  const pillarText =
    manifestData.pillar ||
    fieldFromText(combinedText, ["Pillar"]) ||
    packageName ||
    file.name;

  const familyText =
    manifestData.family ||
    fieldFromText(combinedText, ["Family"]) ||
    packageName ||
    file.name;

  const pillar = inferPillarFromText(String(pillarText));
  const family = String(manifestData.family || fieldFromText(combinedText, ["Family"]) || inferFamilyFromText(String(familyText)));

  const description =
    manifestData.description ||
    manifestData.packageDescription ||
    fieldFromText(combinedText, ["Package Description", "Description"]) ||
    `${packageName} imported from Design Package ZIP.`;

  const catalogDescription =
    manifestData.catalogDescription ||
    fieldFromText(combinedText, ["Catalog Description"]) ||
    description;

  const notes = [
    `Imported from ZIP: ${file.name}`,
    dataSheetFile ? `Data sheet: ${dataSheetFile.name}` : "",
    stlEntry ? `STL: ${stlEntry.name}` : "",
    threeMfEntry ? `3MF: ${threeMfEntry.name}` : "",
    "",
    combinedText.trim(),
  ]
    .filter(Boolean)
    .join("\n");

  return {
    packageName: String(packageName),
    packageCode: manifestData.packageCode || fieldFromText(combinedText, ["Package Code", "Code"]),
    pillar,
    family,
    description: String(description),
    catalogDescription: String(catalogDescription),
    notes,
    conceptFile,
    dataSheetFile,
    stlFile: stlEntry ? { name: stlEntry.name } : undefined,
    threeMfFile: threeMfEntry ? { name: threeMfEntry.name } : undefined,
    productionImages: await Promise.all(productionImageEntries.map(imageToData)),
    variantImages: await Promise.all(variantEntries.map(imageToData)),
    textFiles,
  };
}


const seedData: AppData = {
  products: seedProducts,
  designPackages: seedDesignPackages,
  stls: seedStls,
  concepts: seedConcepts,
  variants: seedVariants,
  collections: seedCollections,
  releases: seedReleases,
  orders: seedOrders,
  filament: seedFilament,
  printers: seedPrinters,
  maintenance: [],
  settings: { ...defaultExternalTools, ...defaultSettings },
  prototypes: seedPrototypes,
  plannedFilament: seedPlannedFilament,
  productPlanning: seedProductPlanning,
  realmMaterials: seedRealmMaterials,
};

function normalizeProductTier(tier: unknown): Product["tier"] {
  if (tier === "Foundry" || tier === "Relics" || tier === "ForgeTech" || tier === "Reforged") {
    return tier;
  }

  return "ForgeTech";
}

function normalizeDesignPackageStatus(status: unknown): DesignPackage["status"] {
  if (
    status === "Planning" ||
    status === "Concept Ready" ||
    status === "Modeling" ||
    status === "STL Ready" ||
    status === "Print Tested" ||
    status === "Catalog Ready" ||
    status === "Archived"
  ) {
    return status;
  }

  if (status === "Active") return "Modeling";
  if (status === "Needs Assets") return "Concept Ready";
  if (status === "Ready for Catalog") return "Catalog Ready";

  return "Planning";
}




function normalizeProductVisibility(visibility: unknown, status?: Product["status"]): Product["visibility"] {
  if (
    visibility === "Internal" ||
    visibility === "Concept" ||
    visibility === "Preorder" ||
    visibility === "Available" ||
    visibility === "Commission Available" ||
    visibility === "Archived"
  ) {
    return visibility;
  }

  if (status === "Archived") return "Archived";
  if (status === "Concept") return "Concept";
  return "Commission Available";
}

function normalizePlanningTier(tier: unknown): PlannedPrototype["tier"] {
  if (tier === "Foundry" || tier === "Relics" || tier === "ForgeTech" || tier === "Reforged") {
    return tier;
  }

  return "ForgeTech";
}

const defaultPackageFamilies: Array<{ pillar: Product["tier"]; family: string }> = [
  { pillar: "Foundry", family: "Forge Goblins" },
  { pillar: "Foundry", family: "Wyrmslings" },
  { pillar: "Foundry", family: "Mimics" },
  { pillar: "Foundry", family: "Mystery Boxes" },
  { pillar: "Foundry", family: "Dice" },
  { pillar: "Relics", family: "Nine Realms Coins" },
  { pillar: "Relics", family: "Forge Coins" },
  { pillar: "Relics", family: "Altars" },
  { pillar: "Relics", family: "Realm Artifacts" },
  { pillar: "ForgeTech", family: "Headset Stands" },
  { pillar: "ForgeTech", family: "Controller Stands" },
  { pillar: "ForgeTech", family: "Desk Accessories" },
  { pillar: "Reforged", family: "Resilience Collection" },
  { pillar: "Reforged", family: "Memorial Pieces" },
  { pillar: "Reforged", family: "Restoration Series" },
];

function codePart(value: string, fallback: string) {
  const clean = value.toUpperCase().replace(/[^A-Z0-9\s-]/g, "").trim();
  if (!clean) return fallback;

  const words = clean.split(/[\s-]+/).filter(Boolean);
  if (words.length >= 2) {
    return words.map((word) => word[0]).join("").slice(0, 3).padEnd(3, "X");
  }

  return clean.slice(0, 3).padEnd(3, "X");
}

function suggestedPackageCode(pillar: Product["tier"], family: string, name: string) {
  const pillarCode: Record<Product["tier"], string> = {
    Foundry: "FND",
    Relics: "REL",
    ForgeTech: "FGT",
    Reforged: "RFG",
  };

  return `${pillarCode[pillar]}-${codePart(family, "GEN")}-${codePart(name, "PKG")}`;
}

function titleFromFileName(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function fileReference(file: File) {
  const maybeRelative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return maybeRelative || file.name;
}

function rootFolderNameFromFiles(files: File[]) {
  const firstRef = files[0] ? fileReference(files[0]) : "Design Package";
  const firstPart = firstRef.split("/").filter(Boolean)[0] || firstRef;
  return titleFromFileName(firstPart);
}

function fileExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

function isImageFile(fileName: string) {
  return ["png", "jpg", "jpeg", "webp", "gif"].includes(fileExtension(fileName));
}

function isModelFile(fileName: string) {
  return ["stl", "3mf", "obj", "blend"].includes(fileExtension(fileName));
}

function isTextFile(fileName: string) {
  return ["txt", "md", "json"].includes(fileExtension(fileName));
}

function productLineForPillar(pillar: Product["tier"]): Product["line"] {
  if (pillar === "Foundry") return "Foundry";
  if (pillar === "ForgeTech") return "ForgeTech";
  if (pillar === "Relics") return "Relics of the Nine Realms";
  return "Runehallow Relics";
}

function packageStatusFromImport(hasConcept: boolean, hasModel: boolean, hasCatalogImage: boolean): DesignPackage["status"] {
  if (hasModel && hasCatalogImage) return "STL Ready";
  if (hasConcept) return "Concept Ready";
  return "Planning";
}

type PackageImportManifest = {
  packageName?: string;
  name?: string;
  packageCode?: string;
  code?: string;
  pillar?: Product["tier"] | string;
  family?: string;
  status?: DesignPackage["status"] | string;
  description?: string;
  lore?: string;
  promptNotes?: string;
  generationNotes?: string;
  catalog?: {
    displayImage?: string;
    description?: string;
  };
  estimates?: {
    estimatedFilamentGrams?: number;
    estimatedPrintHours?: number;
    cleanupMinutes?: number;
    assemblyMinutes?: number;
    paintingMinutes?: number;
    packagingMinutes?: number;
  };
  variants?: Array<{
    name?: string;
    code?: string;
    image?: string;
    notes?: string;
  }>;
};

function safeNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function findFileByManifestPath(files: File[], manifestPath?: string) {
  if (!manifestPath) return undefined;
  const normalized = manifestPath.replace(/\\/g, "/").toLowerCase();
  return files.find((file) => fileReference(file).replace(/\\/g, "/").toLowerCase().endsWith(normalized));
}

function inferRealmVariantFromName(name: string): ProductVariant["realm"] {
  const lower = name.toLowerCase();
  if (lower.includes("alfheim")) return "Alfheim";
  if (lower.includes("svartalfheim") || lower.includes("svart")) return "Svartalfheim";
  if (lower.includes("vanaheim")) return "Vanaheim";
  if (lower.includes("asgard")) return "Asgard";
  if (lower.includes("jotunheim") || lower.includes("jotun")) return "Jotunheim";
  if (lower.includes("muspelheim") || lower.includes("muspel")) return "Muspelheim";
  if (lower.includes("niflheim") || lower.includes("nifl")) return "Niflheim";
  if (lower.includes("helheim") || lower.includes("hel")) return "Helheim";
  return "Midgard";
}

async function readPackageManifest(files: File[]): Promise<PackageImportManifest | undefined> {
  const manifestFile = files.find((file) => {
    const ref = fileReference(file).toLowerCase();
    return ref.endsWith("package_manifest.json") || ref.endsWith("manifest.json");
  });

  if (!manifestFile) return undefined;

  try {
    return JSON.parse(await manifestFile.text()) as PackageImportManifest;
  } catch {
    return undefined;
  }
}

function hydrateData(): AppData {
  const stored = loadStoredData();
  if (!stored) return seedData;
  return {
    designPackages: (stored.designPackages ?? seedData.designPackages ?? []).map((pkg) => ({
      ...pkg,
      pillar: normalizeProductTier(pkg.pillar),
      status: normalizeDesignPackageStatus(pkg.status),
      family: pkg.family ?? "Unassigned",
      packageCode: pkg.packageCode || suggestedPackageCode(normalizeProductTier(pkg.pillar), pkg.family ?? "Unassigned", pkg.name ?? "Package"),
      description: pkg.description ?? "",
      lore: pkg.lore ?? "",
      conceptSheetPath: pkg.conceptSheetPath ?? "",
      promptNotes: pkg.promptNotes ?? "",
      referenceFolderPath: pkg.referenceFolderPath ?? "",
      stlFolderPath: pkg.stlFolderPath ?? "",
      photoFolderPath: pkg.photoFolderPath ?? "",
      catalogDisplayImagePath: pkg.catalogDisplayImagePath ?? pkg.catalogHeroImagePath ?? "",
      catalogHeroImagePath: pkg.catalogHeroImagePath ?? pkg.catalogDisplayImagePath ?? "",
      estimatedFilamentGrams: pkg.estimatedFilamentGrams ?? 0,
      estimatedPrintHours: pkg.estimatedPrintHours ?? 0,
      cleanupMinutes: pkg.cleanupMinutes ?? 0,
      assemblyMinutes: pkg.assemblyMinutes ?? 0,
      paintingMinutes: pkg.paintingMinutes ?? 0,
      packagingMinutes: pkg.packagingMinutes ?? 0,
      notes: pkg.notes ?? "",
    })),
    products: (stored.products ?? seedData.products).map((product) => ({
      ...product,
      tier: normalizeProductTier(product.tier),
      visibility: normalizeProductVisibility((product as Partial<Product>).visibility, product.status),
      productImagePath: product.productImagePath ?? "",
      conceptImagePath: product.conceptImagePath ?? "",
      designPackageId: product.designPackageId ?? undefined,
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
    concepts: (stored.concepts ?? seedData.concepts).map((concept) => ({
      ...concept,
      imagePath: concept.imagePath ?? concept.imageName ?? "",
      measurementImagePath: concept.measurementImagePath ?? "",
      referenceFolderPath: concept.referenceFolderPath ?? "",
      linkedStlIds: concept.linkedStlIds ?? (concept.linkedStlId ? [concept.linkedStlId] : []),
    })),
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
      customerEmail: order.customerEmail ?? "",
      customerPhone: order.customerPhone ?? "",
      orderType: order.orderType ?? "Catalog Order",
      requestSource: order.requestSource ?? "Admin",
      depositRequired: order.depositRequired ?? true,
      depositAmount: order.depositAmount ?? 25,
      depositPaid: order.depositPaid ?? order.paid ?? false,
      depositStatus: order.depositStatus ?? (order.paid ? "Paid in Full" : "Awaiting Deposit"),
      status: order.status ?? "Inquiry",
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
    prototypes: (stored.prototypes ?? seedData.prototypes).map((prototype) => ({
      ...prototype,
      tier: normalizePlanningTier(prototype.tier),
    })),
    plannedFilament: stored.plannedFilament ?? seedData.plannedFilament,
    productPlanning: (stored.productPlanning ?? seedData.productPlanning).map((plan) => ({
      ...plan,
      tier: normalizePlanningTier(plan.tier),
    })),
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
  const initial = useMemo(() => hydrateData(), []);

  const [view, setView] = useState<ViewKey>("dashboard");
  const [products, setProducts] = useState<Product[]>(initial.products);
  const [designPackages, setDesignPackages] = useState<DesignPackage[]>(initial.designPackages);
  const [stls, setStls] = useState<STLRecord[]>(initial.stls);
  const [concepts, setConcepts] = useState<ConceptSpec[]>(initial.concepts);
  const [variants, setVariants] = useState<ProductVariant[]>(initial.variants);
  const [collections, setCollections] = useState<CollectionRecord[]>(initial.collections);
  const [releases, setReleases] = useState<ReleaseRecord[]>(initial.releases);
  const [orders, setOrders] = useState<OrderRecord[]>(initial.orders);
  const [filament, setFilament] = useState<FilamentRecord[]>(initial.filament);
  const [printers, setPrinters] = useState<PrinterRecord[]>(initial.printers);
  const [maintenance, setMaintenance] = useState<MaintenanceRecord[]>(initial.maintenance);
  const [settings, setSettings] = useState<AppSettings>(initial.settings);
  const { batches, setBatches } = useBatchState();
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
    designPackages,
    stls,
    concepts,
    variants,
    collections,
    releases,
    orders,
    filament,
    printers,
    maintenance,
    settings,
    prototypes,
    plannedFilament,
    productPlanning,
    realmMaterials,
  };

  useEffect(() => {
    saveStoredData(appData);
  }, [products, designPackages, stls, concepts, variants, collections, releases, orders, filament, printers, maintenance, settings, prototypes, plannedFilament, productPlanning, realmMaterials]);

  useEffect(() => {
    setPrinters((prev) => prev.map((printer) => printerStatusFromOrders(printer, orders, products)));
  }, [orders, products]);

  useEffect(() => {
    if (!products.some((product) => product.id === selectedProductId)) {
      setSelectedProductId(products[0]?.id ?? "");
    }
  }, [products, selectedProductId]);

  const packageNameById = useMemo(() => new Map(designPackages.map((pkg) => [pkg.id, pkg.name])), [designPackages]);

  const packageFamilyOptions = useMemo(() => {
    const options = new Map<string, { pillar: Product["tier"]; family: string }>();

    for (const item of defaultPackageFamilies) {
      options.set(`${item.pillar}:${item.family}`, item);
    }

    for (const pkg of designPackages) {
      if (pkg.family?.trim()) {
        options.set(`${pkg.pillar}:${pkg.family.trim()}`, { pillar: pkg.pillar, family: pkg.family.trim() });
      }
    }

    for (const product of products) {
      const family = product.collection || product.category;
      if (family?.trim()) {
        options.set(`${product.tier}:${family.trim()}`, { pillar: product.tier, family: family.trim() });
      }
    }

    return Array.from(options.values()).sort((a, b) => a.pillar.localeCompare(b.pillar) || a.family.localeCompare(b.family));
  }, [designPackages, products]);

  const filteredProducts = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return products;
    return products.filter((p) => [p.name, p.collection, p.category, p.line, p.status, p.tier, p.visibility, p.designPackageId ? packageNameById.get(p.designPackageId) : ""].join(" ").toLowerCase().includes(query));
  }, [products, searchTerm, packageNameById]);

  const selectedProduct = products.find((p) => p.id === selectedProductId) || products[0];
  const productStls = stls.filter((s) => s.productId === selectedProductId);
  const productConcepts = concepts.filter((c) => c.productId === selectedProductId);
  const productOrders = orders.filter((o) => o.productId === selectedProductId);
  const productVariants = variants.filter((variant) => variant.productId === selectedProductId);
  const productRelease = releases.find((r) => r.productIds.includes(selectedProductId));

  function getDesignPackageForProduct(product?: Product) {
    return product?.designPackageId ? designPackages.find((pkg) => pkg.id === product.designPackageId) : undefined;
  }

  const selectedDesignPackage = getDesignPackageForProduct(selectedProduct);

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
    const packageForProduct = getDesignPackageForProduct(product);
    const sampleOrder: OrderRecord = {
      id: "sample",
      productId: product.id,
      filamentId: filament[0]?.id,
      materialGrams: packageForProduct?.estimatedFilamentGrams || product.estimatedFilamentGrams,
      customer: "Pricing Preview",
      contact: "",
      customerEmail: "",
      customerPhone: "",
      orderType: "Catalog Order",
      requestSource: "Admin",
      depositRequired: true,
      depositAmount: 25,
      depositPaid: false,
      depositStatus: "Awaiting Deposit",
      quantity: 1,
      dueDate: "",
      status: "Queued",
      priority: "Normal",
      paid: false,
      tracking: "",
      printerId: printers[0]?.id,
      estimatedPrintHours: packageForProduct?.estimatedPrintHours || product.estimatedPrintHours,
      laborHours: packageForProduct ? ((packageForProduct.cleanupMinutes + packageForProduct.assemblyMinutes + packageForProduct.paintingMinutes + packageForProduct.packagingMinutes) / 60) : 0.5,
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
  
  const importDesignPackageZip = async (file: File) => {
    const parsed = await parseDesignPackageZip(file);
    const id = `pkg-${Date.now()}`;
    const productId = `prod-${Date.now() + 1}`;
    const packageCode = parsed.packageCode || suggestedPackageCode(parsed.pillar, parsed.family, parsed.packageName);

    const nextPackage: DesignPackage = {
      id,
      name: parsed.packageName,
      packageCode,
      catalogVisibility: "Hidden",
      pillar: parsed.pillar,
      family: parsed.family,
      status: parsed.stlFile || parsed.threeMfFile ? "STL Ready" : "Concept Ready",
      description: parsed.description,
      lore: "",
      conceptSheetPath: parsed.conceptFile?.dataUrl ?? "",
      promptNotes: parsed.notes,
      referenceFolderPath: parsed.dataSheetFile?.dataUrl ?? "",
      stlFolderPath: parsed.stlFile?.name ?? parsed.threeMfFile?.name ?? "",
      photoFolderPath: parsed.productionImages.map((image) => image.name).join("\\n"),
      catalogDisplayImagePath: parsed.conceptFile?.dataUrl ?? "",
      catalogHeroImagePath: parsed.conceptFile?.dataUrl ?? "",
      estimatedFilamentGrams: 0,
      estimatedPrintHours: 0,
      cleanupMinutes: 0,
      assemblyMinutes: 0,
      paintingMinutes: 0,
      packagingMinutes: 0,
      notes: parsed.notes,
    };

    const nextProduct: Product = {
      id: productId,
      name: parsed.packageName,
      sku: packageCode,
      line: parsed.family,
      tier: parsed.pillar,
      status: parsed.stlFile || parsed.threeMfFile ? "Ready" : "Concept",
      visibility: "Internal",
      designPackageId: id,
      collection: parsed.family,
      category: parsed.family,
      available: 0,
      reorderPoint: 0,
      targetPrice: 0,
      estimatedFilamentGrams: 0,
      estimatedPrintHours: 0,
      productImagePath: parsed.conceptFile?.dataUrl ?? "",
      conceptImagePath: parsed.conceptFile?.dataUrl ?? "",
      supportedRealmVariants: [],
      realmVariants: [],
      tags: ["Design Package", parsed.family, parsed.pillar],
      galleryImages: parsed.productionImages.map((image) => image.dataUrl),
      description: parsed.catalogDescription,
      internalNotes: parsed.notes,
      notes: parsed.notes,
    } as Product;

    const variantSources = parsed.variantImages.length
      ? parsed.variantImages
      : parsed.conceptFile
        ? [parsed.conceptFile]
        : [];

    const nextVariants: ProductVariant[] = variantSources.map((image, index) => {
      const name = displayNameFromFile(image.name) || (index === 0 ? "Standard" : `Variant ${index + 1}`);
      return {
    createDesignPackageFromZip,
    importDesignPackageZip,
        id: `variant-${Date.now()}-${index}`,
        productId,
        name,
        variantCode: `${packageCode}-${String(index + 1).padStart(2, "0")}`,
        realm: name,
        imagePath: image.dataUrl,
        notes: index === 0 ? "Default concept variant imported from Design Package." : "Variant image imported from Design Package.",
      } as ProductVariant;
    });

    setDesignPackages((prev) => [nextPackage, ...prev]);
    setProducts((prev) => [nextProduct, ...prev]);
    if (nextVariants.length) {
      setVariants((prev) => [...nextVariants, ...prev]);
    }

    if (parsed.stlFile) {
      const stlRecord: STLRecord = {
        id: `stl-${Date.now()}`,
        productId,
        fileName: parsed.stlFile.name,
        filePath: parsed.stlFile.name,
        version: "v1.0",
        status: "Imported",
        notes: "Imported from Design Package ZIP.",
      } as STLRecord;
      setStls((prev) => [stlRecord, ...prev]);
    }

    setSelectedDesignPackageId(id);
    setSelectedProductId(productId);
  };

  const createDesignPackageFromZip = async (file: File) => {
    await importDesignPackageZip(file);
  };


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

  function addDesignPackage(sourceProduct?: Product) {
    const baseProduct = sourceProduct ?? selectedProduct;
    const id = uid("PKG");
    const name = baseProduct?.name ? `${baseProduct.name} Package` : "New Design Package";
    const family = baseProduct?.collection || baseProduct?.category || "Unassigned";

    const pillar = baseProduct?.tier ?? "Foundry";

    const nextPackage: DesignPackage = {
      id,
      name,
      packageCode: suggestedPackageCode(pillar, family, name),
      pillar,
      family,
      status: "Planning",
      description: baseProduct?.notes ?? "",
      lore: "",
      conceptSheetPath: baseProduct?.conceptImagePath ?? "",
      promptNotes: "",
      referenceFolderPath: suggestedLibraryPath(settings.forgekeeperLibraryPath, name, "reference"),
      stlFolderPath: suggestedLibraryPath(settings.forgekeeperLibraryPath, name, "stl"),
      photoFolderPath: suggestedLibraryPath(settings.forgekeeperLibraryPath, name, "photos"),
      catalogDisplayImagePath: baseProduct?.productImagePath ?? "",
      catalogHeroImagePath: baseProduct?.productImagePath ?? "",
      estimatedFilamentGrams: baseProduct?.estimatedFilamentGrams ?? 0,
      estimatedPrintHours: baseProduct?.estimatedPrintHours ?? 0,
      cleanupMinutes: 0,
      assemblyMinutes: 0,
      paintingMinutes: 0,
      packagingMinutes: 5,
      notes: "",
    };

    setDesignPackages((prev) => [nextPackage, ...prev]);
    if (baseProduct) {
      updateProduct(baseProduct.id, { designPackageId: id });
    }
    return id;
  }




  async function importDesignPackageFolder(fileList: FileList | null, sourceProduct?: Product) {
    const files = Array.from(fileList ?? []);
    if (files.length === 0) return;

    const manifest = await readPackageManifest(files);
    const folderPackageName = rootFolderNameFromFiles(files);
    const packageName = manifest?.packageName || manifest?.name || folderPackageName;
    const pillar = normalizeProductTier(manifest?.pillar ?? sourceProduct?.tier ?? "Foundry");
    const family = manifest?.family || sourceProduct?.collection || sourceProduct?.category || defaultPackageFamilies.find((item) => item.pillar === pillar)?.family || "Unassigned";
    const packageId = uid("PKG");
    const productId = sourceProduct?.id ?? uid("P");
    const folderRefs = files.map(fileReference);
    const imageFiles = files.filter((file) => isImageFile(file.name));
    const modelFiles = files.filter((file) => isModelFile(file.name));
    const textFiles = files.filter((file) => isTextFile(file.name));
    const manifestDisplayFile = findFileByManifestPath(files, manifest?.catalog?.displayImage);
    const conceptFile = imageFiles.find((file) => fileReference(file).toLowerCase().includes("concept")) ?? imageFiles[0];
    const catalogFile = manifestDisplayFile ?? imageFiles.find((file) => {
      const ref = fileReference(file).toLowerCase();
      return ref.includes("catalog") || ref.includes("display") || ref.includes("preview") || ref.includes("cover");
    }) ?? conceptFile;
    const variantFiles = imageFiles.filter((file) => {
      const ref = fileReference(file).toLowerCase();
      return ref.includes("variant") || ref.includes("variants") || ref.includes("realm") || ref.includes("style");
    });
    const promptFiles = textFiles.filter((file) => {
      const ref = fileReference(file).toLowerCase();
      return ref.includes("prompt") || ref.includes("note") || ref.includes("readme") || ref.includes("manifest");
    });
    const folderRoot = folderRefs[0]?.split("/")[0] || packageName;
    const packageCode = manifest?.packageCode || manifest?.code || suggestedPackageCode(pillar, family, packageName);
    const importedAt = new Date().toLocaleString();
    const estimatedFilamentGrams = safeNumber(manifest?.estimates?.estimatedFilamentGrams, sourceProduct?.estimatedFilamentGrams ?? 0);
    const estimatedPrintHours = safeNumber(manifest?.estimates?.estimatedPrintHours, sourceProduct?.estimatedPrintHours ?? 0);
    const cleanupMinutes = safeNumber(manifest?.estimates?.cleanupMinutes, 0);
    const assemblyMinutes = safeNumber(manifest?.estimates?.assemblyMinutes, 0);
    const paintingMinutes = safeNumber(manifest?.estimates?.paintingMinutes, 0);
    const packagingMinutes = safeNumber(manifest?.estimates?.packagingMinutes, 0);
    const hasManifestVariants = Boolean(manifest?.variants?.length);
    const validationLines = [
      `Imported from package folder: ${folderRoot}`,
      `Imported at: ${importedAt}`,
      `Manifest: ${manifest ? "Detected" : "Not detected"}`,
      `Concept image: ${conceptFile ? fileReference(conceptFile) : "Missing"}`,
      `Package display image: ${catalogFile ? fileReference(catalogFile) : "Missing"}`,
      `Variant definitions: ${manifest?.variants?.length ?? 0}`,
      `Variant image candidates: ${variantFiles.length}`,
      `Model files: ${modelFiles.length}`,
      `Prompt/note files: ${promptFiles.length}`,
    ];

    const nextPackage: DesignPackage = {
      id: packageId,
      name: packageName,
      packageCode,
      pillar,
      family,
      status: normalizeDesignPackageStatus(manifest?.status) !== "Planning"
        ? normalizeDesignPackageStatus(manifest?.status)
        : packageStatusFromImport(Boolean(conceptFile), modelFiles.length > 0, Boolean(catalogFile)),
      description: manifest?.catalog?.description || manifest?.description || `${packageName} design package imported from folder. Review catalog copy before customer-facing use.`,
      lore: manifest?.lore || "",
      conceptSheetPath: conceptFile ? fileReference(conceptFile) : "",
      promptNotes: [
        manifest?.promptNotes || manifest?.generationNotes || "",
        promptFiles.length > 0 ? `Prompt/note files:\n${promptFiles.map((file) => `- ${fileReference(file)}`).join("\n")}` : "",
      ].filter(Boolean).join("\n\n"),
      referenceFolderPath: folderRoot,
      stlFolderPath: modelFiles.length > 0 ? folderRoot : "",
      photoFolderPath: folderRoot,
      catalogDisplayImagePath: catalogFile ? fileReference(catalogFile) : "",
      catalogHeroImagePath: catalogFile ? fileReference(catalogFile) : "",
      estimatedFilamentGrams,
      estimatedPrintHours,
      cleanupMinutes,
      assemblyMinutes,
      paintingMinutes,
      packagingMinutes,
      notes: validationLines.join("\n"),
    };

    setDesignPackages((prev) => [nextPackage, ...prev]);

    if (sourceProduct) {
      setProducts((prev) => prev.map((product) => product.id === sourceProduct.id ? {
        ...product,
        designPackageId: packageId,
        tier: pillar,
        collection: family,
        category: product.category || family,
        estimatedFilamentGrams: product.estimatedFilamentGrams || estimatedFilamentGrams,
        estimatedPrintHours: product.estimatedPrintHours || estimatedPrintHours,
        productImagePath: product.productImagePath || (catalogFile ? fileReference(catalogFile) : ""),
        conceptImagePath: product.conceptImagePath || (conceptFile ? fileReference(conceptFile) : ""),
      } : product));
    } else {
      setProducts((prev) => [{
        id: productId,
        name: packageName,
        tier: pillar,
        line: productLineForPillar(pillar),
        category: family,
        collection: family,
        designPackageId: packageId,
        status: "Concept",
        visibility: "Concept",
        targetPrice: 0,
        estimatedFilamentGrams,
        estimatedPrintHours,
        available: 0,
        reorderPoint: 5,
        productImagePath: catalogFile ? fileReference(catalogFile) : "",
        conceptImagePath: conceptFile ? fileReference(conceptFile) : "",
        supportedRealmVariants: [],
        notes: "Created from Design Package folder import.",
      }, ...prev]);
      setSelectedProductId(productId);
    }

    if (conceptFile) {
      const conceptId = uid("CON");
      setConcepts((prev) => [{
        id: conceptId,
        productId,
        title: `${packageName} Concept Sheet`,
        imageName: conceptFile.name,
        imagePath: fileReference(conceptFile),
        measurementImagePath: "",
        referenceFolderPath: folderRoot,
        measurements: "",
        description: `${packageName} concept imported from package folder.`,
        notes: variantFiles.length > 0 ? `Variant image candidates:\n${variantFiles.map((file) => `- ${fileReference(file)}`).join("\n")}` : "",
        linkedStlId: undefined,
        linkedStlIds: [],
      }, ...prev]);
    }

    if (modelFiles.length > 0) {
      setStls((prev) => [
        ...modelFiles.map((file, index): STLRecord => ({
          id: uid("STL"),
          productId,
          name: titleFromFileName(file.name),
          fileName: file.name,
          filePath: fileReference(file),
          folderPath: folderRoot,
          libraryPath: folderRoot,
          version: `v${index + 1}`,
          isPrimary: index === 0,
          defaultPrinterId: printers[0]?.id,
          defaultSlicer: printers[0] ? slicerForPrinter(printers[0].name) : settings.defaultSlicer,
          linkedConceptId: undefined,
          assetStatus: "Linked",
          notes: "Imported from Design Package folder.",
        })),
        ...prev,
      ]);
    }

    const manifestVariantFiles = (manifest?.variants ?? []).map((variant) => ({
      name: variant.name || variant.code || "Variant",
      code: variant.code,
      notes: variant.notes || "Imported from package manifest.",
      file: findFileByManifestPath(files, variant.image),
    }));

    const folderVariantFiles = variantFiles.map((file) => ({
      name: titleFromFileName(file.name),
      code: undefined,
      notes: "Imported from package variant image folder.",
      file,
    }));

    const importedVariants = [...manifestVariantFiles, ...folderVariantFiles].filter((variant, index, arr) => {
      const key = `${variant.name}:${variant.file ? fileReference(variant.file) : ""}`;
      return arr.findIndex((item) => `${item.name}:${item.file ? fileReference(item.file) : ""}` === key) === index;
    });

    if (importedVariants.length > 0) {
      setVariants((prev) => [
        ...importedVariants.map((variant): ProductVariant => ({
          id: uid("VAR"),
          productId,
          realm: inferRealmVariantFromName(variant.name),
          name: variant.name,
          productImagePath: variant.file ? fileReference(variant.file) : (catalogFile ? fileReference(catalogFile) : ""),
          conceptImagePath: variant.file ? fileReference(variant.file) : (conceptFile ? fileReference(conceptFile) : ""),
          stlId: undefined,
          conceptId: undefined,
          filamentId: filament[0]?.id,
          priceModifier: 0,
          estimatedFilamentGrams,
          estimatedPrintHours,
          isActive: true,
          notes: [variant.code ? `Variant code: ${variant.code}` : "", variant.notes].filter(Boolean).join("\n"),
        })),
        ...prev,
      ]);
    } else if (catalogFile || conceptFile || hasManifestVariants) {
      setVariants((prev) => [{
        id: uid("VAR"),
        productId,
        realm: "Midgard",
        name: `${packageName} Standard`,
        productImagePath: catalogFile ? fileReference(catalogFile) : "",
        conceptImagePath: conceptFile ? fileReference(conceptFile) : "",
        stlId: undefined,
        conceptId: undefined,
        filamentId: filament[0]?.id,
        priceModifier: 0,
        estimatedFilamentGrams,
        estimatedPrintHours,
        isActive: true,
        notes: "Default variant created from Design Package folder import.",
      }, ...prev]);
    }

    window.alert(`Imported ${packageName} package. Review package readiness and catalog details before publishing.`);
  }

  function updateDesignPackage(id: string, patch: Partial<DesignPackage>) {
    setDesignPackages((prev) => prev.map((pkg) => (pkg.id === id ? { ...pkg, ...patch } : pkg)));
  }

  function removeDesignPackage(id: string) {
    const pkg = designPackages.find((item) => item.id === id);
    if (!pkg) return;
    if (!window.confirm(`Remove design package ${pkg.name}? Products will remain but lose this package link.`)) return;
    setDesignPackages((prev) => prev.filter((item) => item.id !== id));
    setProducts((prev) => prev.map((product) => (product.designPackageId === id ? { ...product, designPackageId: undefined } : product)));
  }

  function addProduct() {
    if (!newProductName.trim()) return;
    const id = uid("P");
    setProducts((prev) => [{
      id,
      name: newProductName.trim(),
      tier: "ForgeTech",
      line: "ForgeTech",
      category: "Accessory",
      collection: collections[0]?.name || "Unassigned",
      designPackageId: designPackages[0]?.id,
      status: "Concept",
      visibility: "Concept",
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
    setVariants((prev) => prev.map((variant) => (variant.conceptId === id ? { ...variant, conceptId: undefined } : variant)));
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
      customerEmail: "",
      customerPhone: "",
      orderType: "Catalog Order",
      requestSource: "Admin",
      depositRequired: true,
      depositAmount: 25,
      depositPaid: false,
      depositStatus: "Awaiting Deposit",
      quantity: 1,
      dueDate: "",
      status: "Inquiry",
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

  function createCustomerCatalogRequest(input: {
    productId?: string;
    customer: string;
    customerEmail: string;
    customerPhone: string;
    contact: string;
    orderType: OrderRecord["orderType"];
    quantity: number;
    notes: string;
  }) {
    const fallbackProduct = products.find((product) => product.visibility === "Available" || product.visibility === "Commission Available" || product.visibility === "Preorder") ?? products[0];
    const product = products.find((item) => item.id === input.productId) ?? fallbackProduct;

    if (!product) {
      window.alert("No product is available to attach this request to yet.");
      return;
    }

    if (!input.customer.trim()) {
      window.alert("Customer name is required.");
      return;
    }

    if (!input.customerEmail.trim() && !input.customerPhone.trim()) {
      window.alert("Add at least one contact method: email or phone.");
      return;
    }

    const isCustom = input.orderType === "Custom Request";
    const packageForProduct = getDesignPackageForProduct(product);

    setOrders((prev) => [{
      id: uid("REQ"),
      productId: product.id,
      filamentId: filament[0]?.id,
      materialGrams: packageForProduct?.estimatedFilamentGrams || product.estimatedFilamentGrams,
      customer: input.customer.trim(),
      contact: input.contact.trim(),
      customerEmail: input.customerEmail.trim(),
      customerPhone: input.customerPhone.trim(),
      orderType: input.orderType,
      requestSource: "Customer Catalog",
      depositRequired: true,
      depositAmount: 25,
      depositPaid: false,
      depositStatus: "Awaiting Deposit",
      quantity: Math.max(1, input.quantity || 1),
      dueDate: "",
      status: "Inquiry",
      priority: isCustom ? "High" : "Normal",
      paid: false,
      tracking: "",
      printerId: undefined,
      estimatedPrintHours: packageForProduct?.estimatedPrintHours || product.estimatedPrintHours || 0,
      laborHours: isCustom ? 1 : packageForProduct ? ((packageForProduct.cleanupMinutes + packageForProduct.assemblyMinutes + packageForProduct.paintingMinutes + packageForProduct.packagingMinutes) / 60) : 0.5,
      laborRate: settings.laborRate,
      machineWatts: printers[0]?.watts ?? settings.machineWatts,
      electricityRate: settings.electricityRate,
      packagingCost: settings.packagingCost,
      otherCost: settings.otherCost,
      quotedPrice: product.targetPrice || 0,
      notes: input.notes.trim(),
      materialConsumed: false,
    }, ...prev]);

    setView("orders");
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
      if (patch.depositPaid !== undefined) {
        next.depositStatus = patch.depositPaid ? "Deposit Received" : "Awaiting Deposit";
      }
      if (patch.paid !== undefined && patch.paid) {
        next.depositPaid = true;
        next.depositStatus = "Paid in Full";
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

  function exportProductsCsv() {
    downloadCsv("forgekeeper-products.csv", products.map((product) => ({
      ...product,
      designPackageName: getDesignPackageForProduct(product)?.name ?? "",
      designPackageFamily: getDesignPackageForProduct(product)?.family ?? "",
      primaryStl: getPrimaryStlForProduct(product.id)?.name ?? "",
      primaryStlFile: getPrimaryStlForProduct(product.id)?.filePath || getPrimaryStlForProduct(product.id)?.fileName || "",
      latestConcept: getLatestConceptForProduct(product.id)?.title ?? "",
      orderCount: orders.filter((order) => order.productId === product.id).length,
      variantCount: variants.filter((variant) => variant.productId === product.id).length,
      readyForCustomerCatalog: ["Available", "Commission Available", "Preorder"].includes(product.visibility) ? "Yes" : "No",
    })));
  }
  function exportStlsCsv() { downloadCsv("stls.csv", stls); }
  function exportConceptsCsv() { downloadCsv("concepts.csv", concepts); }
  function exportVariantsCsv() { downloadCsv("variants.csv", variants.map((variant) => ({ ...variant, productName: productName(products, variant.productId) }))); }
  function exportCollectionsCsv() { downloadCsv("collections.csv", collections); }
  function exportReleasesCsv() { downloadCsv("releases.csv", releases.map((r) => ({ ...r, productNames: r.productIds.map((id) => productName(products, id)).join(" | ") }))); }
  function exportOrdersCsv() {
    downloadCsv("forgekeeper-orders-trace.csv", orders.map((order) => {
      const breakdown = getCostBreakdownForOrder(order);
      const product = products.find((item) => item.id === order.productId);
      return {
        id: order.id,
        productId: order.productId,
        productName: product?.name ?? order.productId,
        productPillar: product?.tier ?? "",
        productVisibility: product?.visibility ?? "",
        designPackageName: getDesignPackageForProduct(product)?.name ?? "",
        designPackageFamily: getDesignPackageForProduct(product)?.family ?? "",
        customer: order.customer,
        customerEmail: order.customerEmail ?? "",
        customerPhone: order.customerPhone ?? "",
        preferredContact: order.contact ?? "",
        orderType: order.orderType,
        requestSource: order.requestSource,
        status: order.status,
        priority: order.priority,
        depositRequired: order.depositRequired ? "Yes" : "No",
        depositAmount: order.depositAmount.toFixed(2),
        depositPaid: order.depositPaid ? "Yes" : "No",
        depositStatus: order.depositStatus,
        paidInFull: order.paid ? "Yes" : "No",
        quantity: order.quantity,
        quotedPrice: order.quotedPrice.toFixed(2),
        dueDate: order.dueDate,
        tracking: order.tracking,
        filamentId: order.filamentId ?? "",
        materialGrams: order.materialGrams ?? "",
        materialConsumed: order.materialConsumed ? "Yes" : "No",
        estimatedPrintHours: order.estimatedPrintHours,
        laborHours: order.laborHours,
        materialCost: breakdown.material.toFixed(2),
        electricityCost: breakdown.electricity.toFixed(2),
        laborCost: breakdown.labor.toFixed(2),
        totalCost: breakdown.total.toFixed(2),
        suggestedPrice: breakdown.suggestedPrice.toFixed(2),
        profit: breakdown.profit.toFixed(2),
        marginPercent: breakdown.marginPercent.toFixed(1),
        notes: order.notes,
      };
    }));
  }
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
        setDesignPackages(parsed.designPackages ?? seedDesignPackages);
        setStls(parsed.stls ?? []);
        setConcepts(parsed.concepts ?? []);
        setVariants(parsed.variants ?? []);
        setCollections(parsed.collections ?? []);
        setReleases(parsed.releases ?? []);
        setOrders(parsed.orders ?? []);
        setFilament(parsed.filament ?? []);
        setPrinters(parsed.printers ?? []);
        setMaintenance(parsed.maintenance ?? []);
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
    products, designPackages, packageFamilyOptions, stls, concepts, variants, collections, releases, orders, filament, printers, maintenance, settings,
    prototypes, setPrototypes, plannedFilament, setPlannedFilament, productPlanning, setProductPlanning, realmMaterials, setRealmMaterials,
    batches, setBatches,
    selectedProductId, setSelectedProductId, productTab, setProductTab,
    newProductName, setNewProductName, newStlName, setNewStlName, newConceptTitle, setNewConceptTitle,
    newCollectionName, setNewCollectionName, newReleaseName, setNewReleaseName, newOrderCustomer, setNewOrderCustomer,
    newFilamentName, setNewFilamentName, newPrinterName, setNewPrinterName, searchTerm, setSearchTerm, quickAction,
    filteredProducts, selectedProduct, selectedDesignPackage, productStls, productConcepts, productOrders, productVariants, productRelease, metrics, queueCounts, productionMetrics, getCostBreakdownForOrder, getProductCostGuide, getPrimaryStlForProduct, getLatestConceptForProduct, getProductDisplayImage, getVariantDisplayImage,
    triggerQuickAction,
    addDesignPackage, importDesignPackageZip, importDesignPackageFolder, updateDesignPackage, removeDesignPackage,
    addProduct, updateProduct, removeProduct,
    addStl, updateStl, markPrimaryStl, removeStl,
    addConcept, updateConcept, removeConcept,
    addVariant, updateVariant, removeVariant,
    addCollection, updateCollection, removeCollection, assignProductToCollection, setCollectionHero,
    addRelease, updateRelease, removeRelease, addProductToRelease, removeProductFromRelease,
    addOrder, createCustomerCatalogRequest, updateOrder, removeOrder, consumeFilamentForOrder,
    addFilament, updateFilament, adjustFilament, removeFilament,
    addPrinter, updatePrinter, removePrinter,
    addMaintenance, updateMaintenance, removeMaintenance,
    updateSettings, updatePrototype, updatePlannedFilament, removePlannedFilament, movePlannedFilamentToInventory, getDefaultSlicerForPrinter, getPreferredSlicerForStl, suggestStlLibraryFolder, suggestConceptLibraryFolder, linkStlPath, setStlSuggestedFolder, openStlAsset, openExternalTool,
    exportProductsCsv, exportStlsCsv, exportConceptsCsv, exportVariantsCsv, exportCollectionsCsv, exportReleasesCsv, exportOrdersCsv,
    exportFilamentCsv, exportPrintersCsv, exportMaintenanceCsv, exportBackupJson, importBackupFile, resetWorkspace,
  };
}

export type ForgekeeperState = ReturnType<typeof useForgekeeperState>;
export type QueueStatus = keyof ForgekeeperState["queueCounts"];
