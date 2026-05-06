import type Database from "better-sqlite3";
import { getDb } from "./index";

export interface Conversation {
  id: string;
  title: string;
  guest_session_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  tool_call_id: string | null;
  tool_name: string | null;
  created_at: string;
  position: number;
}

export function createConversation(
  id: string,
  title: string,
  guestSessionId?: string,
  db: Database.Database = getDb()
): Conversation {
  db.prepare(
    "INSERT INTO conversations (id, title, guest_session_id) VALUES (?, ?, ?)"
  ).run(id, title, guestSessionId ?? null);
  return getConversation(id, db)!;
}

export function getConversation(
  id: string,
  db: Database.Database = getDb()
): Conversation | null {
  const row = db
    .prepare("SELECT * FROM conversations WHERE id = ?")
    .get(id) as Conversation | undefined;
  return row ?? null;
}

export function listConversations(
  limit = 50,
  db: Database.Database = getDb()
): Conversation[] {
  return db
    .prepare("SELECT * FROM conversations ORDER BY updated_at DESC LIMIT ?")
    .all(limit) as Conversation[];
}

export function insertMessage(
  message: Omit<Message, "created_at">,
  db: Database.Database = getDb()
): void {
  db.prepare(
    `INSERT INTO messages (id, conversation_id, role, content, tool_call_id, tool_name, position)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    message.id,
    message.conversation_id,
    message.role,
    message.content,
    message.tool_call_id ?? null,
    message.tool_name ?? null,
    message.position
  );
  db.prepare(
    "UPDATE conversations SET updated_at = datetime('now') WHERE id = ?"
  ).run(message.conversation_id);
}

export function getMessages(
  conversationId: string,
  db: Database.Database = getDb()
): Message[] {
  return db
    .prepare(
      "SELECT * FROM messages WHERE conversation_id = ? ORDER BY position ASC"
    )
    .all(conversationId) as Message[];
}

export function updateConversationTitle(
  id: string,
  title: string,
  db: Database.Database = getDb()
): void {
  db.prepare(
    "UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(title, id);
}

export function deleteConversation(
  id: string,
  db: Database.Database = getDb()
): void {
  db.prepare("DELETE FROM conversations WHERE id = ?").run(id);
}
