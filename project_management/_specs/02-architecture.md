# Architecture

## Request Lifecycle — High Level

```
Browser
  │
  │  POST /api/chat  { messages: [...], conversationId? }
  ▼
Next.js Route Handler  (src/app/api/chat/route.ts)
  │
  ├─ 1. Origin check (CSRF guard)
  ├─ 2. Parse + validate request body (Zod)
  ├─ 3. Load or create conversation (SQLite)
  ├─ 4. Persist user message to DB
  ├─ 5. Build context window (trim old messages)
  ├─ 6. Build system prompt
  ├─ 7. Resolve tool schemas from ToolRegistry
  ├─ 8. Enter orchestrator loop (GPT tool-call rounds)
  │     └─ Each round:
  │         a. Call OpenAI Chat Completions (non-streaming — full response per round)
  │         b. If tool_calls present → execute tools → feed results back
  │         c. If no tool_calls → final text response
  ├─ 9. Stream final response to browser (SSE / ReadableStream)
  └─10. Persist assistant message to DB
```

---

## Orchestrator Loop (`src/lib/chat/orchestrator.ts`)

The orchestrator implements the multi-round tool-call pattern. It is **not streaming** internally — it collects full responses per round and only the final text is streamed to the client.

```
for (step = 0; step < MAX_TOOL_ROUNDS; step++) {
  response = await openai.chat.completions.create({ messages, tools })

  if (response has no tool_calls) {
    return response.choices[0].message.content  // done
  }

  execute all tool_calls in parallel
  append assistant message + tool results to messages
  // loop again with updated messages
}

throw Error("Exceeded tool-call safety limit")
```

**Key rules:**
- `MAX_TOOL_ROUNDS` (default `6`) — defined in `src/lib/chat/chat-config.ts`; prevents infinite loops
- All tool calls in a round execute in parallel (`Promise.all`)
- Tool errors are caught per-tool and returned as an error result — they do not crash the loop
- Uses OpenAI message format: `role: "tool"` with `tool_call_id`

**OpenAI message format for tool results:**
```typescript
{
  role: "tool",
  tool_call_id: "call_abc123",
  content: "{ \"price\": 189.42, \"change\": \"+1.2%\" }"
}
```

---

## Context Window (`src/lib/chat/context-window.ts`)

Before each request, the conversation history is trimmed to stay within budget:

All constants are defined in `src/lib/chat/chat-config.ts`.

| Constant | Default |
|---|---|
| `MAX_CONTEXT_MESSAGES` | 40 |
| `MAX_CONTEXT_CHARACTERS` | 80,000 |
| `WARN_CONTEXT_MESSAGES` | 32 |
| `WARN_CONTEXT_CHARACTERS` | 64,000 |

Trimming rules:
1. Slice oldest messages until message count ≤ `MAX_CONTEXT_MESSAGES`
2. Slice oldest messages until total chars ≤ `MAX_CONTEXT_CHARACTERS`
3. Always keep at least the most recent message
4. After trimming, ensure the window starts with a `user` message (OpenAI requirement)

---

## Streaming Response

Two files handle the streaming path:

- **`src/lib/chat/stream-pipeline.ts`** — Staged request handler. Orchestrates the full request: runs validation, calls the orchestrator, then hands off to `stream-execution.ts`.
- **`src/lib/chat/stream-execution.ts`** — SSE response builder. Constructs the `ReadableStream` and formats each SSE chunk.

The route handler calls into `stream-pipeline.ts`. The client uses `fetch` with `response.body.getReader()` to consume chunks as they arrive.

**SSE event format:**
```
data: {"type":"delta","content":"The current price"}\n\n
data: {"type":"delta","content":" of AAPL is"}\n\n
data: {"type":"done","conversationId":"conv_123"}\n\n
data: [DONE]\n\n
```

**Error event:**
```
data: {"type":"error","message":"Rate limit exceeded. Please try again."}\n\n
```

The client hook (`src/hooks/useChatStream.ts`) accumulates delta content into the displayed message in real time.

> **Note:** The orchestrator runs tool calls before streaming. The stream only delivers the final GPT text response. Tool call activity is not streamed in v1 — the UI shows a loading state until the first delta arrives.

---

## Provider Policy (`src/lib/chat/provider-policy.ts`)

All OpenAI calls go through a resilience wrapper:

```
retryAttempts: OPENAI_RETRY_ATTEMPTS  (default 2)
retryDelayMs:  OPENAI_RETRY_DELAY_MS  (default 1000)
timeoutMs:     OPENAI_TIMEOUT_MS      (default 30000)
model:         OPENAI_MODEL           (default "gpt-4o")
```

All four are env vars accessed via typed accessors in `src/lib/config/env.ts` (see Configuration section below).

**Transient errors that trigger retry:**
- HTTP 429 (rate limit)
- HTTP 500, 502, 503
- Network / fetch failure
- Timeout

**Non-transient errors (no retry):**
- HTTP 401 (bad API key)
- HTTP 404 (model not found)
- Zod validation errors

---

## Database (`src/lib/db/`)

SQLite via `better-sqlite3`. A single file at `data/finance-chat.db` (path configurable via `DB_PATH` env var). See **[03-data-models.md](03-data-models.md)** for the full schema (`conversations`, `messages`, `schema_version` tables).

The DB singleton is initialized once at startup:

```typescript
// src/lib/db/index.ts
import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { ensureSchema } from "./schema";
import { getDbPath } from "../config/env";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    const dbPath = getDbPath();
    const dir = dirname(dbPath);
    if (dir && dir !== ".") mkdirSync(dir, { recursive: true }); // creates data/ on first run
    db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    ensureSchema(db);
  }
  return db;
}
```

---

## System Prompt Assembly (`src/lib/chat/system-prompt.ts`)

The system prompt is assembled from:
1. **Base identity** — loaded from `config/prompts.json` (the app name, persona description). See **[06-prompts-and-config.md](06-prompts-and-config.md)** for field definitions.
2. **Financial domain directive** — hardcoded section defining the assistant's scope and limitations
3. **Tool manifest** — a summary of which tools are available, injected so GPT knows what it can do
4. **Context window guard** — if the conversation is near the trim limit, a note is added so GPT can inform the user

The final prompt is a single string passed as `role: "system"` in the messages array.

---

## Configuration (`src/lib/config/env.ts`)

All environment variables are accessed through typed accessor functions that throw a clear error if a required variable is missing:

```typescript
export function getOpenAiApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set");
  return key;
}

export function getOpenAiModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4o";
}
```

This prevents silent failures from undefined env vars at runtime.

---

## Data Flow Diagram

```
Browser (ChatSurface)
    │
    │  POST /api/chat
    │  { messages, conversationId }
    ▼
route.ts
    ├── originCheck()           → 403 if bad origin
    ├── validateBody(zod)       → 400 if invalid
    ├── getOrCreateConversation → SQLite
    ├── persistUserMessage      → SQLite
    ├── buildContextWindow      → trim messages
    ├── buildSystemPrompt       → config/prompts.json + directives
    ├── registry.getSchemas()   → tool definitions for OpenAI
    │
    ▼
stream-pipeline.ts
    │  (validates, calls orchestrator, hands off to stream-execution.ts)
    ▼
orchestrator()
    ├── openai.chat.completions.create()  ← non-streaming
    │       ├── [tool_calls?] → executeTools() → loop
    │       └── [text reply] → return text
    │
    ▼
stream-pipeline.ts
    ├── persistAssistantMessage → SQLite
    └── buildStreamResponse()
            │
            ▼
        stream-execution.ts
            └── ReadableStream (SSE)    → Browser
```
