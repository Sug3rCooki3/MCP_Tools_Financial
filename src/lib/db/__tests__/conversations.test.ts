import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { ensureSchema } from "@/lib/db/schema";
import {
  createConversation,
  getConversation,
  insertMessage,
  getMessages,
  deleteConversation,
} from "@/lib/db/conversations";

function createTestDb(): Database.Database {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  ensureSchema(db);
  return db;
}

describe("conversations DB", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it("creates and retrieves a conversation", () => {
    createConversation("conv-1", "Test chat", db);
    const conv = getConversation("conv-1", db);
    expect(conv).not.toBeNull();
    expect(conv!.title).toBe("Test chat");
  });

  it("inserts and retrieves messages in order", () => {
    createConversation("conv-2", "", db);
    insertMessage(
      {
        id: "msg-1",
        conversation_id: "conv-2",
        role: "user",
        content: "Hello",
        tool_call_id: null,
        tool_name: null,
        position: 0,
      },
      db
    );
    insertMessage(
      {
        id: "msg-2",
        conversation_id: "conv-2",
        role: "assistant",
        content: "Hi there",
        tool_call_id: null,
        tool_name: null,
        position: 1,
      },
      db
    );
    const msgs = getMessages("conv-2", db);
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("user");
    expect(msgs[1].role).toBe("assistant");
  });

  it("deletes conversation and cascades to messages", () => {
    createConversation("conv-3", "", db);
    insertMessage(
      {
        id: "msg-3",
        conversation_id: "conv-3",
        role: "user",
        content: "test",
        tool_call_id: null,
        tool_name: null,
        position: 0,
      },
      db
    );
    deleteConversation("conv-3", db);
    expect(getConversation("conv-3", db)).toBeNull();
    expect(getMessages("conv-3", db)).toHaveLength(0);
  });
});
