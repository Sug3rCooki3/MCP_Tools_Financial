import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { ensureSchema } from "@/lib/db/schema";
import { checkAndIncrementQuota, deleteQuota } from "@/lib/auth/quota";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  ensureSchema(db);
  return db;
}

describe("checkAndIncrementQuota", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    delete process.env.ANON_MESSAGE_LIMIT;
  });

  afterEach(() => {
    db.close();
  });

  it("allows the first message and creates a quota row", () => {
    const result = checkAndIncrementQuota("session-1", db);
    expect(result).toBe(true);
    const row = db
      .prepare("SELECT * FROM anonymous_quotas WHERE session_id = ?")
      .get("session-1") as { message_count: number } | undefined;
    expect(row).not.toBeUndefined();
    expect(row!.message_count).toBe(1);
  });

  it("allows messages up to the limit", () => {
    process.env.ANON_MESSAGE_LIMIT = "3";
    expect(checkAndIncrementQuota("session-2", db)).toBe(true); // 1
    expect(checkAndIncrementQuota("session-2", db)).toBe(true); // 2
    expect(checkAndIncrementQuota("session-2", db)).toBe(true); // 3
  });

  it("blocks the message at exactly the limit", () => {
    process.env.ANON_MESSAGE_LIMIT = "2";
    checkAndIncrementQuota("session-3", db); // 1
    checkAndIncrementQuota("session-3", db); // 2
    const result = checkAndIncrementQuota("session-3", db); // exceeds limit
    expect(result).toBe(false);
  });

  it("resets the count after the 24h window has expired", () => {
    process.env.ANON_MESSAGE_LIMIT = "2";
    // Seed with a row whose window_start is 25 hours in the past
    const oldStart = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    db.prepare(
      "INSERT INTO anonymous_quotas (session_id, message_count, window_start) VALUES (?, 2, ?)"
    ).run("session-4", oldStart);

    const result = checkAndIncrementQuota("session-4", db);
    expect(result).toBe(true);

    const row = db
      .prepare("SELECT message_count FROM anonymous_quotas WHERE session_id = ?")
      .get("session-4") as { message_count: number };
    expect(row.message_count).toBe(1); // reset to 1
  });

  it("does not reset the count before 24h has elapsed", () => {
    process.env.ANON_MESSAGE_LIMIT = "2";
    // Seed with a row whose window_start is 23 hours in the past
    const recentStart = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    db.prepare(
      "INSERT INTO anonymous_quotas (session_id, message_count, window_start) VALUES (?, 2, ?)"
    ).run("session-5", recentStart);

    const result = checkAndIncrementQuota("session-5", db);
    expect(result).toBe(false); // window not yet expired, still blocked
  });
});

describe("deleteQuota", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("deletes the quota row for the given session", () => {
    checkAndIncrementQuota("session-del", db);
    deleteQuota("session-del", db);
    const row = db
      .prepare("SELECT * FROM anonymous_quotas WHERE session_id = ?")
      .get("session-del");
    expect(row).toBeUndefined();
  });

  it("does nothing when the session does not exist", () => {
    expect(() => deleteQuota("nonexistent", db)).not.toThrow();
  });
});
