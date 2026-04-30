# Data Models

## SQLite Schema

File: `src/lib/db/schema.ts`

The schema is created on first startup via `ensureSchema(db)`. Migrations are applied sequentially using a `schema_version` table.

---

### Table: `conversations`

Stores one row per chat session.

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,          -- e.g. "conv_01J..." (ulid or crypto.randomUUID())
  title       TEXT NOT NULL DEFAULT '',  -- auto-generated from first user message (first 60 chars)
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

### Table: `messages`

Stores user and assistant text messages. The schema includes `tool_call_id` and `tool_name` columns reserved for future use — do not populate them in v1 (see v1 persistence rule at the bottom of this file).

```sql
CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool')),
  content         TEXT NOT NULL,          -- message text or tool result JSON string
  tool_call_id    TEXT,                   -- set when role = 'tool'
  tool_name       TEXT,                   -- set when role = 'tool', for display
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  position        INTEGER NOT NULL        -- ordering index within the conversation
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
  ON messages (conversation_id, position);
```

---

### Table: `schema_version`

Tracks applied migrations.

```sql
CREATE TABLE IF NOT EXISTS schema_version (
  version    INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

## TypeScript Types

File: `src/lib/db/conversations.ts`

```typescript
export interface Conversation {
  id: string;
  title: string;
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
```

---

## DB Operations (`src/lib/db/conversations.ts`)

```typescript
// Create a new conversation
function createConversation(id: string, title: string): Conversation

// Get conversation by ID (returns null if not found)
function getConversation(id: string): Conversation | null

// List all conversations, newest first (for a sidebar/history list)
function listConversations(limit?: number): Conversation[]

// Persist a single message.
// Caller supplies position: use getMessages(conversationId).length as the next index.
function insertMessage(message: Omit<Message, "created_at">): void

// Get all messages for a conversation, ordered by position
function getMessages(conversationId: string): Message[]

// Update conversation title
function updateConversationTitle(id: string, title: string): void

// Delete a conversation and all its messages (CASCADE handles messages)
function deleteConversation(id: string): void
```

---

## Message ID Generation

Use `crypto.randomUUID()` (available in Node.js 20+ and all modern browsers). No external library needed.

```typescript
const id = `msg_${crypto.randomUUID()}`;
const convId = `conv_${crypto.randomUUID()}`;
```

---

## Context Window → OpenAI Message Format

When building the context window for an API call, `Message[]` rows from SQLite are mapped to OpenAI's format:

```typescript
type OpenAIMessage =
  | { role: "system";    content: string }
  | { role: "user";      content: string }
  | { role: "assistant"; content: string; tool_calls?: OpenAI.ChatCompletionMessageToolCall[] }
  | { role: "tool";      content: string; tool_call_id: string }
```

> **v1 persistence rule:** Only `role: "user"` and `role: "assistant"` text messages are saved to the DB. Tool call rounds (the assistant `tool_calls` message and the corresponding `role: "tool"` result messages) are ephemeral — they exist only in memory during a single request and are discarded after the final answer is produced. This keeps the DB simple and avoids replaying tool calls on reload.
>
> The `tool_call_id` and `tool_name` columns in the `messages` table exist to support future persistence of tool results (e.g. for audit logs). Do not populate them in v1.

---

## Data Directory

```
data/
  finance-chat.db   ← SQLite file (created automatically)
```

Add `data/` to `.gitignore`. The `data/` directory must exist before the app starts (or the startup code creates it):

```typescript
import { mkdirSync } from "fs";
mkdirSync("data", { recursive: true });
```
