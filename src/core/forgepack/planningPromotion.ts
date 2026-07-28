import type {
  ActivityEvent,
  AppData,
  ConceptSpec,
  DesignProject,
  ForgepackAsset,
  ForgepackImportRecord,
  STLRecord,
} from "../../types/domain";
import type { PlannedPrototype } from "../../types/planning";

type AssetContext = {
  asset: ForgepackAsset;
  packet: ForgepackImportRecord;
};

export type PlanningPromotionResult = {
  data: AppData;
  designProjectId: string;
  createdDesignProject: boolean;
  rekeyedDesignProject: boolean;
  linkedConcepts: number;
  linkedModels: number;
  packetCount: number;
};

type SyncOptions = {
  createIfMissing?: boolean;
  recordActivity?: boolean;
  occurredAt?: string;
};

const managedNotesStart = "--- Foundry Intake History ---";

function newestFirst(a: ForgepackImportRecord, b: ForgepackImportRecord): number {
  return Date.parse(b.importedAt || b.provenance.createdAt) - Date.parse(a.importedAt || a.provenance.createdAt);
}

function packetsForPrototype(data: AppData, prototype: PlannedPrototype): ForgepackImportRecord[] {
  const normalizedName = prototype.designName.trim().toLowerCase();
  return data.intakePackets
    .filter((packet) => packet.productId === prototype.id || packet.productName.trim().toLowerCase() === normalizedName)
    .sort(newestFirst);
}

function latestAssets(packets: ForgepackImportRecord[]): AssetContext[] {
  const seen = new Set<string>();
  const assets: AssetContext[] = [];
  for (const packet of packets) {
    for (const asset of packet.assets) {
      const key = asset.id || `${asset.kind}:${asset.archivePath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      assets.push({ asset, packet });
    }
  }
  return assets;
}

function packetDetails(packet: ForgepackImportRecord): string {
  const product = packet.product;
  const lines = [
    `${packet.packetId} · ${packet.stage} · ${packet.conceptRevision}`,
    product?.purpose ? `Purpose: ${product.purpose}` : "",
    product?.measurements ? `Measurements: ${product.measurements}` : "",
    `Canon gate: ${packet.canonGate.status}${packet.canonGate.summary ? ` — ${packet.canonGate.summary}` : ""}`,
    `Forgeability: ${packet.forgeability.status}${packet.forgeability.summary ? ` — ${packet.forgeability.summary}` : ""}`,
    `Physical trial: ${packet.pipeline.physicalTestStatus}`,
    packet.pipeline.nextGate ? `Next gate: ${packet.pipeline.nextGate}` : "",
    packet.pipeline.nextAction ? `Next action: ${packet.pipeline.nextAction}` : "",
    packet.pipeline.blockedBy.length ? `Blocked by: ${packet.pipeline.blockedBy.join("; ")}` : "",
    packet.forgeability.risks.length ? `Risks:\n- ${packet.forgeability.risks.join("\n- ")}` : "",
    packet.forgeability.requirements.length ? `Requirements:\n- ${packet.forgeability.requirements.join("\n- ")}` : "",
    packet.forgeability.unknowns.length ? `Unknowns:\n- ${packet.forgeability.unknowns.join("\n- ")}` : "",
    packet.provenance.notes ? `Provenance: ${packet.provenance.notes}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

function withManagedPacketNotes(existingNotes: string, prototype: PlannedPrototype, packets: ForgepackImportRecord[]): string {
  const existingWithoutManaged = existingNotes.split(managedNotesStart)[0].trim();
  const planningNotes = [prototype.nextStep, prototype.notes].filter(Boolean).join("\n").trim();
  const manualSections = Array.from(new Set([existingWithoutManaged, planningNotes].filter(Boolean)));
  if (!packets.length) return manualSections.join("\n\n");
  return [
    ...manualSections,
    managedNotesStart,
    packets.map(packetDetails).join("\n\n"),
  ].filter(Boolean).join("\n\n");
}

function rekeyRelationships(data: AppData, oldId: string, designId: string): void {
  if (oldId === designId) return;
  data.stls = data.stls.map((item) => item.designProjectId === oldId ? { ...item, designProjectId: designId } : item);
  data.concepts = data.concepts.map((item) => item.designProjectId === oldId ? { ...item, designProjectId: designId } : item);
  data.variants = data.variants.map((item) => item.designProjectId === oldId ? { ...item, designProjectId: designId } : item);
  data.productionJobs = data.productionJobs.map((item) => item.designProjectId === oldId ? { ...item, designProjectId: designId } : item);
  data.collections = data.collections.map((item) => item.heroDesignProjectId === oldId ? { ...item, heroDesignProjectId: designId } : item);
  data.activityLog = data.activityLog.map((item) => item.recordId === oldId ? { ...item, recordId: designId } : item);
  data.releases = data.releases.map((item) => ({
    ...item,
    designProjectIds: Array.from(new Set(item.designProjectIds.map((id) => id === oldId ? designId : id))),
  }));
}

function upsertConcept(data: AppData, concept: ConceptSpec): void {
  const index = data.concepts.findIndex((item) => item.id === concept.id || (
    Boolean(concept.imagePath) && item.designProjectId === concept.designProjectId && item.imagePath === concept.imagePath
  ));
  if (index >= 0) data.concepts[index] = { ...data.concepts[index], ...concept, id: data.concepts[index].id };
  else data.concepts.unshift(concept);
}

function upsertStl(data: AppData, stl: STLRecord): string {
  const index = data.stls.findIndex((item) => item.id === stl.id || (
    Boolean(stl.filePath) && item.designProjectId === stl.designProjectId && item.filePath === stl.filePath
  ));
  if (index >= 0) {
    const existingId = data.stls[index].id;
    data.stls[index] = { ...data.stls[index], ...stl, id: existingId };
    return existingId;
  }
  data.stls.unshift(stl);
  return stl.id;
}

export function syncPlanningProductToDesign(
  data: AppData,
  prototypeId: string,
  options: SyncOptions = {},
): PlanningPromotionResult | null {
  const prototype = data.prototypes.find((item) => item.id === prototypeId);
  if (!prototype) return null;

  const normalizedName = prototype.designName.trim().toLowerCase();
  const existingById = data.designProjects.find((item) => item.id === prototype.id);
  const existingByName = data.designProjects.find((item) => item.name.trim().toLowerCase() === normalizedName);
  const previous = existingById ?? existingByName;
  if (!previous && options.createIfMissing === false) return null;

  const next: AppData = {
    ...data,
    designProjects: data.designProjects.map((item) => ({ ...item })),
    stls: data.stls.map((item) => ({ ...item })),
    concepts: data.concepts.map((item) => ({ ...item, linkedStlIds: [...(item.linkedStlIds ?? [])] })),
    variants: data.variants.map((item) => ({ ...item })),
    collections: data.collections.map((item) => ({ ...item })),
    releases: data.releases.map((item) => ({ ...item, designProjectIds: [...item.designProjectIds] })),
    productionJobs: data.productionJobs.map((item) => ({ ...item })),
    activityLog: [...data.activityLog],
  };

  const packets = packetsForPrototype(next, prototype);
  const latestPacket = packets[0];
  const assetContexts = latestAssets(packets);
  const primaryConcept = assetContexts.find(({ asset }) => asset.kind === "concept-image" && asset.primary)
    ?? assetContexts.find(({ asset }) => asset.kind === "concept-image");
  const designId = prototype.id;
  const oldDesignId = previous?.id ?? designId;
  rekeyRelationships(next, oldDesignId, designId);

  const design: DesignProject = {
    id: designId,
    name: latestPacket?.productName ?? prototype.designName,
    tier: latestPacket?.product?.tier ?? previous?.tier ?? prototype.tier,
    line: latestPacket?.product?.line ?? previous?.line ?? "Foundry",
    category: latestPacket?.product?.category ?? previous?.category ?? prototype.family,
    collection: latestPacket?.product?.collection ?? previous?.collection ?? prototype.collection,
    status: previous?.status ?? "Prototype",
    targetPrice: previous?.targetPrice ?? 0,
    estimatedFilamentGrams: previous?.estimatedFilamentGrams ?? 0,
    estimatedPrintHours: previous?.estimatedPrintHours ?? 0,
    available: previous?.available ?? 0,
    reorderPoint: previous?.reorderPoint ?? 0,
    designImagePath: previous?.designImagePath ?? "",
    conceptImagePath: primaryConcept?.asset.importedPath ?? previous?.conceptImagePath ?? "",
    supportedRealmVariants: previous?.supportedRealmVariants ?? [],
    notes: withManagedPacketNotes(previous?.notes ?? "", prototype, packets),
  };

  next.designProjects = [
    design,
    ...next.designProjects.filter((item) => item.id !== oldDesignId && item.id !== designId),
  ];

  const modelContexts = assetContexts.filter(({ asset }) => asset.kind === "stl" || asset.kind === "3mf");
  const modelIds: string[] = [];
  for (const { asset, packet } of modelContexts) {
    modelIds.push(upsertStl(next, {
      id: `STL-${designId}-${asset.id}`,
      designProjectId: designId,
      name: asset.label,
      fileName: asset.archivePath.split("/").pop() ?? asset.label,
      filePath: asset.importedPath,
      folderPath: packet.assetRoot,
      libraryPath: asset.importedPath,
      version: asset.version,
      isPrimary: asset.primary || modelContexts.length === 1,
      assetStatus: "Linked",
      notes: packet.forgeability.summary,
    }));
  }

  const conceptContexts = assetContexts.filter(({ asset }) => asset.kind === "concept-image");
  for (const { asset, packet } of conceptContexts) {
    const measurement = packet.assets.find((item) => item.kind === "measurement-image" && item.primary)
      ?? packet.assets.find((item) => item.kind === "measurement-image");
    upsertConcept(next, {
      id: `CON-${designId}-${asset.id}`,
      designProjectId: designId,
      title: `${asset.label} ${asset.version}`,
      imageName: asset.archivePath.split("/").pop() ?? asset.label,
      imagePath: asset.importedPath,
      measurementImagePath: measurement?.importedPath ?? "",
      referenceFolderPath: packet.assetRoot,
      measurements: packet.product?.measurements ?? "",
      description: packet.product?.purpose ?? prototype.notes,
      notes: packetDetails(packet),
      linkedStlIds: modelIds,
    });
  }

  const createdDesignProject = !previous;
  const rekeyedDesignProject = Boolean(previous && previous.id !== designId);
  if (options.recordActivity !== false) {
    const occurredAt = options.occurredAt ?? new Date().toISOString();
    const action = createdDesignProject
      ? `Promoted ${prototype.designName} from Planning with its complete Foundry packet history.`
      : `Synchronized ${prototype.designName} Design Library record with its complete Foundry packet history.`;
    const event: ActivityEvent = {
      id: `ACT-PROMOTE-${designId}-${occurredAt}`,
      occurredAt,
      kind: createdDesignProject ? "create" : "update",
      station: "design-library",
      summary: action,
      recordId: designId,
    };
    next.activityLog = [event, ...next.activityLog].slice(0, 500);
  }

  return {
    data: next,
    designProjectId: designId,
    createdDesignProject,
    rekeyedDesignProject,
    linkedConcepts: conceptContexts.length,
    linkedModels: modelContexts.length,
    packetCount: packets.length,
  };
}
