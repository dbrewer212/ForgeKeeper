PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspace_state (
  workspace_id TEXT PRIMARY KEY NOT NULL,
  schema_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS migration_log (
  migration_key TEXT PRIMARY KEY NOT NULL,
  source_name TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS design_projects (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_state(workspace_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS production_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  design_project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  priority TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_state(workspace_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS material_spools (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  material TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_state(workspace_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS printers (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_state(workspace_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_production_jobs_design
  ON production_jobs(workspace_id, design_project_id);
CREATE INDEX IF NOT EXISTS idx_production_jobs_status
  ON production_jobs(workspace_id, status);
