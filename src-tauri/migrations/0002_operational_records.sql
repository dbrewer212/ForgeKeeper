PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS production_batches (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_state(workspace_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS material_movements (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  filament_id TEXT NOT NULL,
  production_job_id TEXT,
  movement_type TEXT NOT NULL,
  grams REAL NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_state(workspace_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS cost_snapshots (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  production_job_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  total_cost REAL NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_state(workspace_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity_events (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  station TEXT NOT NULL,
  kind TEXT NOT NULL,
  summary TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_state(workspace_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_batches_status
  ON production_batches(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_movements_filament
  ON material_movements(workspace_id, filament_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_movements_job
  ON material_movements(workspace_id, production_job_id);
CREATE INDEX IF NOT EXISTS idx_cost_snapshots_job
  ON cost_snapshots(workspace_id, production_job_id);
CREATE INDEX IF NOT EXISTS idx_activity_time
  ON activity_events(workspace_id, occurred_at);
