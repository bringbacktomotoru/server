-- Initial SQL schema for tomoserver

CREATE TABLE IF NOT EXISTS players (
  uuid TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 3,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS takeover_codes (
  code TEXT PRIMARY KEY,
  uuid TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_takeover_expires ON takeover_codes(expires_at);

CREATE TABLE IF NOT EXISTS server_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS client_reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT,
  cmd INTEGER,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_created ON client_reports(created_at);
