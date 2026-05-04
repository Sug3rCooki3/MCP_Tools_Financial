import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import { ensureSchema } from "@/lib/db/schema";
import {
  createConversation,
  getConversation,
  insertMessage,
  getMessages,
  deleteConversation,
  listConversations,
  updateConversationTitle,
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

  it("lists conversations newest first", () => {
    createConversation("conv-a", "Alpha", db);
    createConversation("conv-b", "Beta", db);
    // Insert a message in conv-a to bump its updated_at after conv-b was created
    insertMessage(
      { id: "msg-a", conversation_id: "conv-a", role: "user", content: "hi", tool_call_id: null, tool_name: null, position: 0 },
      db
    );
    const list = listConversations(10, db);
    expect(list[0].id).toBe("conv-a");
    expect(list[1].id).toBe("conv-b");
  });

  it("updates conversation title", () => {
    createConversation("conv-c", "Old title", db);
    updateConversationTitle("conv-c", "New title", db);
    const conv = getConversation("conv-c", db);
    expect(conv!.title).toBe("New title");
  });

  it("message ids use msg_ prefix", () => {
    createConversation("conv-d", "", db);
    insertMessage(
      { id: "msg_abc-123", conversation_id: "conv-d", role: "user", content: "hello", tool_call_id: null, tool_name: null, position: 0 },
      db
    );
    const msgs = getMessages("conv-d", db);
    expect(msgs[0].id).toMatch(/^msg_/);
  });
});
