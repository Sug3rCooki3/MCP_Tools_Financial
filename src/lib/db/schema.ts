import type Database from "better-sqlite3";

export function ensureSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id          TEXT PRIMARY KEY,
      title       TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS messages (
      id              TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role            TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool')),
      content         TEXT NOT NULL,
      tool_call_id    TEXT,
      tool_name       TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      position        INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
      ON messages (conversation_id, position);

    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const existing = db
    .prepare("SELECT version FROM schema_version WHERE version = 1")
    .get();
  if (!existing) {
    db.prepare("INSERT INTO schema_version (version) VALUES (1)").run();
  }

  const v2Applied = db
    .prepare("SELECT version FROM schema_version WHERE version = 2")
    .get();

  if (!v2Applied) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id            TEXT PRIMARY KEY,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS anonymous_quotas (
        session_id    TEXT PRIMARY KEY,
        message_count INTEGER NOT NULL DEFAULT 0,
        window_start  TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    // SQLite ALTER TABLE only supports ADD COLUMN
    // Guard with try/catch in case columns already exist (idempotent)
    try { db.exec("ALTER TABLE conversations ADD COLUMN user_id TEXT REFERENCES users(id)"); } catch {}
    try { db.exec("ALTER TABLE conversations ADD COLUMN guest_session_id TEXT"); } catch {}

    db.prepare("INSERT INTO schema_version (version) VALUES (2)").run();
  }
}
