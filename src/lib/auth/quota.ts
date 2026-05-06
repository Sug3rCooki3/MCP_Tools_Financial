import type Database from "better-sqlite3";
import { getDb } from "@/lib/db";
import { getAnonMessageLimit } from "@/lib/config/env";

export function checkAndIncrementQuota(
  sessionId: string,
  db: Database.Database = getDb()
): boolean {
  const WINDOW_HOURS = 24;
  const limit = getAnonMessageLimit();

  const row = db
    .prepare("SELECT message_count, window_start FROM anonymous_quotas WHERE session_id = ?")
    .get(sessionId) as { message_count: number; window_start: string } | undefined;

  const now = new Date();

  if (row) {
    const windowStart = new Date(row.window_start);
    const hoursSince = (now.getTime() - windowStart.getTime()) / (1000 * 60 * 60);

    if (hoursSince >= WINDOW_HOURS) {
      // Window expired — reset
      db.prepare(
        "UPDATE anonymous_quotas SET message_count = 1, window_start = ? WHERE session_id = ?"
      ).run(now.toISOString(), sessionId);
      return true;
    }

    if (row.message_count >= limit) return false;

    db.prepare(
      "UPDATE anonymous_quotas SET message_count = message_count + 1 WHERE session_id = ?"
    ).run(sessionId);
    return true;
  }

  // First message — create row
  db.prepare(
    "INSERT INTO anonymous_quotas (session_id, message_count, window_start) VALUES (?, 1, ?)"
  ).run(sessionId, now.toISOString());
  return true;
}

// Called by migrate-session after ownership transfer
export function deleteQuota(
  sessionId: string,
  db: Database.Database = getDb()
): void {
  db.prepare("DELETE FROM anonymous_quotas WHERE session_id = ?").run(sessionId);
}
