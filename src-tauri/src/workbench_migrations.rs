use tauri_plugin_sql::{Migration, MigrationKind};

// This is the exact migration that ForgeKeeper originally registered as SQLx migration 1.
// It must remain byte-for-byte stable so existing databases validate their historical ledger.
const HISTORICAL_WORKSPACE_SCHEMA_V1: &str = "CREATE TABLE IF NOT EXISTS workspace_state (id INTEGER PRIMARY KEY CHECK (id = 1), schema_version INTEGER NOT NULL, payload TEXT NOT NULL, updated_at TEXT NOT NULL);";

const WORKBENCH_SCHEMA_V1: &str = r#"
CREATE TABLE IF NOT EXISTS workbench_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workbench_assets (
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
);
CREATE INDEX IF NOT EXISTS idx_workbench_assets_status ON workbench_assets(lifecycle_status);
CREATE INDEX IF NOT EXISTS idx_workbench_assets_project ON workbench_assets(owning_project_id);

CREATE TABLE IF NOT EXISTS workbench_files (
  file_id TEXT PRIMARY KEY,
  sha256 TEXT NOT NULL,
  file_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  format TEXT NOT NULL,
  role TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  imported_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_workbench_files_sha256 ON workbench_files(sha256) WHERE sha256 <> '';

CREATE TABLE IF NOT EXISTS workbench_revisions (
  revision_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  parent_revision_id TEXT,
  revision_label TEXT NOT NULL,
  manufacturing_approval TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(asset_id) REFERENCES workbench_assets(asset_id)
);
CREATE INDEX IF NOT EXISTS idx_workbench_revisions_asset ON workbench_revisions(asset_id);

CREATE TABLE IF NOT EXISTS workbench_relationships (
  relationship_id TEXT PRIMARY KEY,
  relationship_type TEXT NOT NULL,
  from_asset_id TEXT NOT NULL,
  from_revision_id TEXT,
  to_asset_id TEXT NOT NULL,
  to_revision_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workbench_relationships_from ON workbench_relationships(from_asset_id);
CREATE INDEX IF NOT EXISTS idx_workbench_relationships_to ON workbench_relationships(to_asset_id);

CREATE TABLE IF NOT EXISTS workbench_variants (
  variant_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  parent_asset_id TEXT NOT NULL,
  parent_revision_id TEXT NOT NULL,
  review_required INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workbench_variants_parent ON workbench_variants(parent_asset_id);

CREATE TABLE IF NOT EXISTS workbench_assemblies (
  assembly_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  revision_id TEXT,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workbench_assemblies_asset ON workbench_assemblies(asset_id);

CREATE TABLE IF NOT EXISTS workbench_manufacturing_specs (
  manufacturing_spec_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  approval_state TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workbench_specs_asset ON workbench_manufacturing_specs(asset_id, revision_id);

CREATE TABLE IF NOT EXISTS workbench_inspections (
  inspection_result_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  engine_id TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workbench_inspections_revision ON workbench_inspections(asset_id, revision_id);

CREATE TABLE IF NOT EXISTS workbench_preparations (
  preparation_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  status TEXT NOT NULL,
  printer_id TEXT,
  material_profile_id TEXT,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workbench_preparations_asset ON workbench_preparations(asset_id, revision_id);
CREATE INDEX IF NOT EXISTS idx_workbench_preparations_status ON workbench_preparations(status);

CREATE TABLE IF NOT EXISTS workbench_print_records (
  print_record_id TEXT PRIMARY KEY,
  asset_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  preparation_id TEXT NOT NULL,
  production_job_id TEXT NOT NULL,
  printer_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workbench_print_records_asset ON workbench_print_records(asset_id, revision_id);
CREATE INDEX IF NOT EXISTS idx_workbench_print_records_job ON workbench_print_records(production_job_id);

CREATE TABLE IF NOT EXISTS workbench_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  correlation_id TEXT,
  asset_id TEXT,
  revision_id TEXT,
  schema_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_workbench_events_asset ON workbench_events(asset_id, occurred_at);

INSERT INTO workbench_meta(key, value) VALUES('schema_version', '1')
ON CONFLICT(key) DO NOTHING;
"#;

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_workspace_state",
            sql: HISTORICAL_WORKSPACE_SCHEMA_V1,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "create_workbench_domain_schema",
            sql: WORKBENCH_SCHEMA_V1,
            kind: MigrationKind::Up,
        },
    ]
}
