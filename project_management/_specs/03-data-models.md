# Data Models

## SQLite Schema

File: `src/lib/db/schema.ts`

The schema is created on first startup via `ensureSchema(db)`. Migrations are applied sequentially using a `schema_version` table.

---

### Table: `conversations`

Stores one row per chat session.

```sql
CREATE TABLE IF NOT EXISTS conversations (
  id               TEXT PRIMARY KEY,          -- e.g. "conv_<uuid>"
  title            TEXT NOT NULL DEFAULT '',  -- auto-generated from first user message
  user_id          TEXT REFERENCES users(id), -- NULL for anonymous; set after migration
  guest_session_id TEXT,                      -- anonymous cookie value; cleared after migration
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
```

> `user_id` and `guest_session_id` are added in the **v2 migration** (spec 10). The base v1 schema does not include them.

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

### Table: `users` _(added in v2 migration — spec 10)_

```sql
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,  -- e.g. "user_<uuid>"
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,     -- bcrypt hash (cost 12)
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

---

### Table: `anonymous_quotas` _(added in v2 migration — spec 10)_

Tracks message count per anonymous session within a 24-hour rolling window.

```sql
CREATE TABLE IF NOT EXISTS anonymous_quotas (
  session_id    TEXT PRIMARY KEY,
  message_count INTEGER NOT NULL DEFAULT 0,
  window_start  TEXT NOT NULL DEFAULT (datetime('now'))  -- reset when > 24h old
);
```

The window resets lazily on read — no cron job required.

---

## TypeScript Types

File: `src/lib/db/conversations.ts`

```typescript
export interface Conversation {
  id: string;
  title: string;
  user_id: string | null;          // null = anonymous; set after session migration
  guest_session_id: string | null; // anonymous cookie value; null after migration
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
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
// Create a new conversation.
// guestSessionId: pass the anonymous cookie value for anonymous users; omit for authenticated.
// Required so migrate-session can find and transfer conversations via WHERE guest_session_id = ?
function createConversation(id: string, title: string, guestSessionId?: string): Conversation

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

---

## DB Operations — Users (`src/lib/db/users.ts`) _(spec 10)_

```typescript
// Create a new user (id = "user_<uuid>", passwordHash = bcrypt output)
function createUser(id: string, email: string, passwordHash: string): User

// Look up a user by email — used by Auth.js Credentials provider
function getUserByEmail(email: string, db?: Database.Database): User | null

// Look up a user by ID — used to verify session ownership
function getUserById(id: string, db?: Database.Database): User | null
```

All three accept an optional `db` parameter (defaulting to `getDb()`) for testability with in-memory SQLite, following the same pattern as `src/lib/db/conversations.ts`.
