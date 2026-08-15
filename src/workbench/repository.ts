import type Database from "@tauri-apps/plugin-sql";
import type {
  AssetRelationship,
  AssetRevision,
  FoundryAssembly,
  FoundryAsset,
  FoundryFile,
  FoundryVariant,
  InspectionResult,
  ManufacturingSpec,
  PreparationRecord,
  PrintRecord,
  WorkbenchState,
} from "./contracts";
import type { WorkbenchEvent } from "./events";

const DATABASE_URL = "sqlite:forgekeeper.db";
const WORKBENCH_SCHEMA_VERSION = 1;

let databasePromise: Promise<Database> | null = null;

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function database(): Promise<Database | null> {
  if (!isTauriRuntime()) return null;
  if (!databasePromise) {
    databasePromise = import("@tauri-apps/plugin-sql").then(async ({ default: Database }) => {
      const db = await Database.load(DATABASE_URL);
      await initializeSchema(db);
      return db;
    });
  }
  return databasePromise;
}

async function initializeSchema(db: Database): Promise<void> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS workbench_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS workbench_assets (
      asset_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      asset_type TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL,
      owning_project_id TEXT,
      collection_id TEXT,
      current_revision_id TEXT,
      canonical_asset_id TEXT,
      canonical_revision_id TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_workbench_assets_status ON workbench_assets(lifecycle_status)`,
    `CREATE INDEX IF NOT EXISTS idx_workbench_assets_project ON workbench_assets(owning_project_id)`,
    `CREATE TABLE IF NOT EXISTS workbench_files (
      file_id TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL,
      file_name TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      format TEXT NOT NULL,
      role TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      imported_at TEXT NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_workbench_files_sha256 ON workbench_files(sha256) WHERE sha256 <> ''`,
    `CREATE TABLE IF NOT EXISTS workbench_revisions (
      revision_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      parent_revision_id TEXT,
      revision_label TEXT NOT NULL,
      manufacturing_approval TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(asset_id) REFERENCES workbench_assets(asset_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_workbench_revisions_asset ON workbench_revisions(asset_id)`,
    `CREATE TABLE IF NOT EXISTS workbench_relationships (
      relationship_id TEXT PRIMARY KEY,
      relationship_type TEXT NOT NULL,
      from_asset_id TEXT NOT NULL,
      from_revision_id TEXT,
      to_asset_id TEXT NOT NULL,
      to_revision_id TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_workbench_relationships_from ON workbench_relationships(from_asset_id)`,
    `CREATE INDEX IF NOT EXISTS idx_workbench_relationships_to ON workbench_relationships(to_asset_id)`,
    `CREATE TABLE IF NOT EXISTS workbench_variants (
      variant_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      parent_asset_id TEXT NOT NULL,
      parent_revision_id TEXT NOT NULL,
      review_required INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_workbench_variants_parent ON workbench_variants(parent_asset_id)`,
    `CREATE TABLE IF NOT EXISTS workbench_assemblies (
      assembly_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      revision_id TEXT,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_workbench_assemblies_asset ON workbench_assemblies(asset_id)`,
    `CREATE TABLE IF NOT EXISTS workbench_manufacturing_specs (
      manufacturing_spec_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      revision_id TEXT NOT NULL,
      approval_state TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_workbench_specs_asset ON workbench_manufacturing_specs(asset_id, revision_id)`,
    `CREATE TABLE IF NOT EXISTS workbench_inspections (
      inspection_result_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      revision_id TEXT NOT NULL,
      engine_id TEXT NOT NULL,
      engine_version TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_workbench_inspections_revision ON workbench_inspections(asset_id, revision_id)`,
    `CREATE TABLE IF NOT EXISTS workbench_preparations (
      preparation_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      revision_id TEXT NOT NULL,
      status TEXT NOT NULL,
      printer_id TEXT,
      material_profile_id TEXT,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_workbench_preparations_asset ON workbench_preparations(asset_id, revision_id)`,
    `CREATE INDEX IF NOT EXISTS idx_workbench_preparations_status ON workbench_preparations(status)`,
    `CREATE TABLE IF NOT EXISTS workbench_print_records (
      print_record_id TEXT PRIMARY KEY,
      asset_id TEXT NOT NULL,
      revision_id TEXT NOT NULL,
      preparation_id TEXT NOT NULL,
      production_job_id TEXT NOT NULL,
      printer_id TEXT NOT NULL,
      outcome TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_workbench_print_records_asset ON workbench_print_records(asset_id, revision_id)`,
    `CREATE INDEX IF NOT EXISTS idx_workbench_print_records_job ON workbench_print_records(production_job_id)`,
    `CREATE TABLE IF NOT EXISTS workbench_events (
      event_id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      correlation_id TEXT,
      asset_id TEXT,
      revision_id TEXT,
      schema_version INTEGER NOT NULL,
      payload_json TEXT NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_workbench_events_asset ON workbench_events(asset_id, occurred_at)`,
  ];

  for (const statement of statements) await db.execute(statement);
  await db.execute(
    `INSERT INTO workbench_meta(key, value) VALUES('schema_version', $1)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [String(WORKBENCH_SCHEMA_VERSION)],
  );
}

type PayloadRow = { payload_json: string };

async function all<T>(db: Database, table: string, orderBy: string): Promise<T[]> {
  const rows = await db.select<PayloadRow[]>(`SELECT payload_json FROM ${table} ORDER BY ${orderBy}`);
  return rows.map((row) => JSON.parse(row.payload_json) as T);
}

export class WorkbenchRepository {
  async initialize(): Promise<boolean> {
    return Boolean(await database());
  }

  async loadState(): Promise<WorkbenchState> {
    const db = await database();
    if (!db) return emptyWorkbenchState();
    const [assets, files, revisions, relationships, variants, assemblies, manufacturingSpecs, inspections, preparations, printRecords] = await Promise.all([
      all<FoundryAsset>(db, "workbench_assets", "updated_at DESC"),
      all<FoundryFile>(db, "workbench_files", "imported_at DESC"),
      all<AssetRevision>(db, "workbench_revisions", "created_at DESC"),
      all<AssetRelationship>(db, "workbench_relationships", "created_at DESC"),
      all<FoundryVariant>(db, "workbench_variants", "updated_at DESC"),
      all<FoundryAssembly>(db, "workbench_assemblies", "updated_at DESC"),
      all<ManufacturingSpec>(db, "workbench_manufacturing_specs", "updated_at DESC"),
      all<InspectionResult>(db, "workbench_inspections", "created_at DESC"),
      all<PreparationRecord>(db, "workbench_preparations", "created_at DESC"),
      all<PrintRecord>(db, "workbench_print_records", "created_at DESC"),
    ]);
    return { assets, files, revisions, relationships, variants, assemblies, manufacturingSpecs, inspections, preparations, printRecords };
  }

  async upsertAsset(value: FoundryAsset): Promise<void> {
    const db = await database(); if (!db) return;
    await db.execute(`INSERT INTO workbench_assets(asset_id,name,asset_type,lifecycle_status,owning_project_id,collection_id,current_revision_id,canonical_asset_id,canonical_revision_id,payload_json,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT(asset_id) DO UPDATE SET name=excluded.name,asset_type=excluded.asset_type,lifecycle_status=excluded.lifecycle_status,owning_project_id=excluded.owning_project_id,collection_id=excluded.collection_id,current_revision_id=excluded.current_revision_id,canonical_asset_id=excluded.canonical_asset_id,canonical_revision_id=excluded.canonical_revision_id,payload_json=excluded.payload_json,updated_at=excluded.updated_at`,
      [value.assetId,value.name,value.assetType,value.lifecycleStatus,value.owningProjectId ?? null,value.collectionId ?? null,value.currentRevisionId ?? null,value.canonicalAssetId ?? null,value.canonicalRevisionId ?? null,JSON.stringify(value),value.createdAt,value.updatedAt]);
  }

  async upsertFile(value: FoundryFile): Promise<void> {
    const db = await database(); if (!db) return;
    await db.execute(`INSERT INTO workbench_files(file_id,sha256,file_name,storage_path,format,role,payload_json,imported_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(file_id) DO UPDATE SET sha256=excluded.sha256,file_name=excluded.file_name,storage_path=excluded.storage_path,format=excluded.format,role=excluded.role,payload_json=excluded.payload_json,imported_at=excluded.imported_at`,
      [value.fileId,value.sha256,value.fileName,value.storagePath,value.format,value.role,JSON.stringify(value),value.importedAt]);
  }

  async upsertRevision(value: AssetRevision): Promise<void> {
    const db = await database(); if (!db) return;
    await db.execute(`INSERT INTO workbench_revisions(revision_id,asset_id,parent_revision_id,revision_label,manufacturing_approval,payload_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(revision_id) DO UPDATE SET asset_id=excluded.asset_id,parent_revision_id=excluded.parent_revision_id,revision_label=excluded.revision_label,manufacturing_approval=excluded.manufacturing_approval,payload_json=excluded.payload_json`,
      [value.revisionId,value.assetId,value.parentRevisionId ?? null,value.revisionLabel,value.manufacturingApproval,JSON.stringify(value),value.createdAt]);
  }

  async upsertRelationship(value: AssetRelationship): Promise<void> {
    const db = await database(); if (!db) return;
    await db.execute(`INSERT INTO workbench_relationships(relationship_id,relationship_type,from_asset_id,from_revision_id,to_asset_id,to_revision_id,payload_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(relationship_id) DO UPDATE SET relationship_type=excluded.relationship_type,from_asset_id=excluded.from_asset_id,from_revision_id=excluded.from_revision_id,to_asset_id=excluded.to_asset_id,to_revision_id=excluded.to_revision_id,payload_json=excluded.payload_json`,
      [value.relationshipId,value.type,value.fromAssetId,value.fromRevisionId ?? null,value.toAssetId,value.toRevisionId ?? null,JSON.stringify(value),value.createdAt]);
  }

  async upsertVariant(value: FoundryVariant): Promise<void> {
    const db = await database(); if (!db) return;
    await db.execute(`INSERT INTO workbench_variants(variant_id,asset_id,parent_asset_id,parent_revision_id,review_required,payload_json,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(variant_id) DO UPDATE SET asset_id=excluded.asset_id,parent_asset_id=excluded.parent_asset_id,parent_revision_id=excluded.parent_revision_id,review_required=excluded.review_required,payload_json=excluded.payload_json,updated_at=excluded.updated_at`,
      [value.variantId,value.assetId,value.parentAssetId,value.parentRevisionId,value.reviewRequired ? 1 : 0,JSON.stringify(value),value.updatedAt]);
  }

  async upsertAssembly(value: FoundryAssembly): Promise<void> {
    const db = await database(); if (!db) return;
    await db.execute(`INSERT INTO workbench_assemblies(assembly_id,asset_id,revision_id,payload_json,updated_at) VALUES($1,$2,$3,$4,$5)
      ON CONFLICT(assembly_id) DO UPDATE SET asset_id=excluded.asset_id,revision_id=excluded.revision_id,payload_json=excluded.payload_json,updated_at=excluded.updated_at`,
      [value.assemblyId,value.assetId,value.revisionId ?? null,JSON.stringify(value),value.updatedAt]);
  }

  async upsertManufacturingSpec(value: ManufacturingSpec): Promise<void> {
    const db = await database(); if (!db) return;
    await db.execute(`INSERT INTO workbench_manufacturing_specs(manufacturing_spec_id,asset_id,revision_id,approval_state,payload_json,updated_at) VALUES($1,$2,$3,$4,$5,$6)
      ON CONFLICT(manufacturing_spec_id) DO UPDATE SET asset_id=excluded.asset_id,revision_id=excluded.revision_id,approval_state=excluded.approval_state,payload_json=excluded.payload_json,updated_at=excluded.updated_at`,
      [value.manufacturingSpecId,value.assetId,value.revisionId,value.approvalState,JSON.stringify(value),value.updatedAt]);
  }

  async upsertInspection(value: InspectionResult): Promise<void> {
    const db = await database(); if (!db) return;
    await db.execute(`INSERT INTO workbench_inspections(inspection_result_id,asset_id,revision_id,engine_id,engine_version,payload_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT(inspection_result_id) DO UPDATE SET payload_json=excluded.payload_json,engine_id=excluded.engine_id,engine_version=excluded.engine_version`,
      [value.inspectionResultId,value.assetId,value.revisionId,value.engineId,value.engineVersion,JSON.stringify(value),value.createdAt]);
  }

  async upsertPreparation(value: PreparationRecord): Promise<void> {
    const db = await database(); if (!db) return;
    await db.execute(`INSERT INTO workbench_preparations(preparation_id,asset_id,revision_id,status,printer_id,material_profile_id,payload_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT(preparation_id) DO UPDATE SET status=excluded.status,printer_id=excluded.printer_id,material_profile_id=excluded.material_profile_id,payload_json=excluded.payload_json`,
      [value.preparationId,value.assetId,value.revisionId,value.status,value.printerId ?? null,value.materialProfileId ?? null,JSON.stringify(value),value.createdAt]);
  }

  async upsertPrintRecord(value: PrintRecord): Promise<void> {
    const db = await database(); if (!db) return;
    await db.execute(`INSERT INTO workbench_print_records(print_record_id,asset_id,revision_id,preparation_id,production_job_id,printer_id,outcome,payload_json,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT(print_record_id) DO UPDATE SET outcome=excluded.outcome,payload_json=excluded.payload_json`,
      [value.printRecordId,value.assetId,value.revisionId,value.preparationId,value.productionJobId,value.printerId,value.outcome,JSON.stringify(value),value.createdAt]);
  }

  async appendEvent(event: WorkbenchEvent): Promise<void> {
    const db = await database(); if (!db) return;
    await db.execute(`INSERT OR IGNORE INTO workbench_events(event_id,event_type,occurred_at,actor_id,correlation_id,asset_id,revision_id,schema_version,payload_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [event.eventId,event.eventType,event.timestamp,event.actorId,event.correlationId,event.assetId ?? null,event.revisionId ?? null,event.schemaVersion,JSON.stringify(event)]);
  }

  async persistState(state: WorkbenchState): Promise<void> {
    for (const item of state.assets) await this.upsertAsset(item);
    for (const item of state.files) await this.upsertFile(item);
    for (const item of state.revisions) await this.upsertRevision(item);
    for (const item of state.relationships) await this.upsertRelationship(item);
    for (const item of state.variants) await this.upsertVariant(item);
    for (const item of state.assemblies) await this.upsertAssembly(item);
    for (const item of state.manufacturingSpecs) await this.upsertManufacturingSpec(item);
    for (const item of state.inspections) await this.upsertInspection(item);
    for (const item of state.preparations) await this.upsertPreparation(item);
    for (const item of state.printRecords) await this.upsertPrintRecord(item);
  }
}

export function emptyWorkbenchState(): WorkbenchState {
  return { assets: [], files: [], revisions: [], relationships: [], variants: [], assemblies: [], manufacturingSpecs: [], inspections: [], preparations: [], printRecords: [] };
}
