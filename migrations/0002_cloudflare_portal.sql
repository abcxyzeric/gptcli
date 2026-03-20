CREATE TABLE IF NOT EXISTS portal_state (
  user_id TEXT PRIMARY KEY,
  config_ciphertext TEXT NOT NULL,
  usage_ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS portal_auth_files (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  provider TEXT,
  type TEXT,
  size INTEGER NOT NULL DEFAULT 0,
  disabled INTEGER NOT NULL DEFAULT 0,
  runtime_only INTEGER NOT NULL DEFAULT 0,
  status TEXT,
  status_message TEXT,
  auth_index TEXT,
  modified INTEGER NOT NULL,
  content_ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_portal_auth_files_user_id
  ON portal_auth_files(user_id);

CREATE INDEX IF NOT EXISTS idx_portal_auth_files_user_id_modified
  ON portal_auth_files(user_id, modified DESC);
