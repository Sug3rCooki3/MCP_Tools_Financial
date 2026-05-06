import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { ensureSchema } from "@/lib/db/schema";
import { createUser, getUserByEmail, getUserById } from "@/lib/db/users";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  ensureSchema(db);
  return db;
}

describe("users", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("creates a user and retrieves them by email", () => {
    createUser("user_1", "test@example.com", "hash123", db);
    const user = getUserByEmail("test@example.com", db);
    expect(user).not.toBeNull();
    expect(user!.id).toBe("user_1");
    expect(user!.email).toBe("test@example.com");
    expect(user!.password_hash).toBe("hash123");
  });

  it("creates a user and retrieves them by id", () => {
    createUser("user_2", "byid@example.com", "hash456", db);
    const user = getUserById("user_2", db);
    expect(user).not.toBeNull();
    expect(user!.email).toBe("byid@example.com");
  });

  it("returns null for an unknown email", () => {
    const user = getUserByEmail("nobody@example.com", db);
    expect(user).toBeNull();
  });

  it("returns null for an unknown ID", () => {
    const user = getUserById("user_nonexistent", db);
    expect(user).toBeNull();
  });

  it("throws on duplicate email (UNIQUE constraint)", () => {
    createUser("user_a", "dup@example.com", "hash1", db);
    expect(() => createUser("user_b", "dup@example.com", "hash2", db)).toThrow();
  });
});
