PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS intake_packets (
  packet_id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  stage TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspace_state(workspace_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_intake_product
  ON intake_packets(workspace_id, product_id, imported_at);
CREATE INDEX IF NOT EXISTS idx_intake_stage
  ON intake_packets(workspace_id, stage);
