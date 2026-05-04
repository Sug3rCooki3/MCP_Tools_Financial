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
}
