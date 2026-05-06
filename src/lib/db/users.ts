import type Database from "better-sqlite3";
import { getDb } from "./index";

export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export function createUser(
  id: string,
  email: string,
  passwordHash: string,
  db: Database.Database = getDb()
): void {
  db.prepare(
    "INSERT INTO users (id, email, password_hash) VALUES (?, ?, ?)"
  ).run(id, email, passwordHash);
}

export function getUserByEmail(
  email: string,
  db: Database.Database = getDb()
): User | null {
  const row = db
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email) as User | undefined;
  return row ?? null;
}

export function getUserById(
  id: string,
  db: Database.Database = getDb()
): User | null {
  const row = db
    .prepare("SELECT * FROM users WHERE id = ?")
    .get(id) as User | undefined;
  return row ?? null;
}
