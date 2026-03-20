CREATE TABLE IF NOT EXISTS portal_oauth_sessions (
  state TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  status TEXT,
  payload_ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_portal_oauth_sessions_user_id
  ON portal_oauth_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_portal_oauth_sessions_provider
  ON portal_oauth_sessions(user_id, provider);
