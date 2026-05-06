# Spec 10 — Login System & Anonymous Quota

## 1. Overview

To prevent "token bleed" from bot traffic or high-volume anonymous users, the system implements a tiered access model. Anonymous users receive a limited message quota. Once exhausted, the system gates further interaction behind a login/sign-up wall. The context of the current conversation is preserved and migrated to the new user profile upon successful authentication — without a page reload.

---

## 2. Tech Decisions

All decisions are locked. No alternatives.

| Concern | Decision | Reason |
|---|---|---|
| Auth provider | **Auth.js v5 (`next-auth@5`)** | Native Next.js 15 App Router support; self-hosted; no external cloud service |
| Credentials | **Email + password** via Credentials provider | Self-hosted, no OAuth dependency |
| Password hashing | **`bcryptjs`** | Pure JS, no native bindings; consistent with no-build-dependency philosophy |
| Sessions | **JWT** stored in signed `httpOnly` cookie by Auth.js | No DB adapter needed; stateless |
| Database | **SQLite (existing `better-sqlite3`)** | No new processes; consistent with entire stack (spec 01, 03) |
| Anonymous quota storage | **SQLite `anonymous_quotas` table** | No Redis; self-healing (reset on 24h window expiry); zero new infrastructure |
| Anonymous session ID | **`httpOnly`, `SameSite=Strict` cookie** | Immune to XSS (spec 07); not localStorage |
| Quota limit | **`ANON_MESSAGE_LIMIT` env var**, default `5` | Configurable without code change, consistent with `MAX_TOOL_ROUNDS` pattern |
| Account tiers (Free/Pro) | **Deferred** — v1 has one authenticated tier | Out of scope for this spec |

---

## 3. New Dependencies

### Production

```json
"next-auth": "^5",
"bcryptjs": "^2"
```

### Dev

```json
"@types/bcryptjs": "^2"
```

---

## 4. Authentication States

### A. Anonymous User

- **Identification:** `guest_session_id` stored in a server-set `httpOnly`, `SameSite=Strict` cookie (max-age 30 days). Value is `crypto.randomUUID()` — 36-char UUID, cryptographically random, unguessable.
- **Quota:** Up to `ANON_MESSAGE_LIMIT` (default `5`) messages per 24-hour window tracked in the `anonymous_quotas` SQLite table.
- **UI:** `<AnonQuotaBanner />` shows "X messages remaining" below the input. When the limit is reached, `<LoginModal />` opens automatically.

### B. Authenticated User

- **Identification:** Auth.js JWT session cookie.
- **Quota:** None — full access.
- **History:** All conversations stored in SQLite with `user_id` set to the authenticated user's ID.

---

## 5. Database Schema — Migration v2

File: `src/lib/db/schema.ts` — `ensureSchema(db)` must apply the v2 migration when `schema_version.version = 1` is present (i.e., existing DB) or alongside the initial schema on fresh installs.

### New table: `users`

```sql
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,                          -- e.g. "user_<uuid>"
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,                             -- bcrypt hash
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### New table: `anonymous_quotas`

```sql
CREATE TABLE IF NOT EXISTS anonymous_quotas (
  session_id    TEXT PRIMARY KEY,
  message_count INTEGER NOT NULL DEFAULT 0,
  window_start  TEXT NOT NULL DEFAULT (datetime('now'))   -- reset when > 24h old
);
```

### Altered table: `conversations`

Two new columns added via `ALTER TABLE` in the v2 migration:

```sql
ALTER TABLE conversations ADD COLUMN user_id TEXT REFERENCES users(id);
ALTER TABLE conversations ADD COLUMN guest_session_id TEXT;
```

- `user_id` — NULL for anonymous conversations; set to the authenticated user's ID for logged-in users. Updated to `user_id` during session migration.
- `guest_session_id` — the anonymous cookie value that created this conversation. Set on creation, cleared to NULL after migration.

### Migration block in `ensureSchema`

```typescript
const v2Applied = db
  .prepare("SELECT version FROM schema_version WHERE version = 2")
  .get();

if (!v2Applied) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS anonymous_quotas (
      session_id    TEXT PRIMARY KEY,
      message_count INTEGER NOT NULL DEFAULT 0,
      window_start  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // SQLite ALTER TABLE only supports ADD COLUMN
  // Guard with try/catch in case columns already exist (idempotent)
  try { db.exec("ALTER TABLE conversations ADD COLUMN user_id TEXT REFERENCES users(id)"); } catch {}
  try { db.exec("ALTER TABLE conversations ADD COLUMN guest_session_id TEXT"); } catch {}

  db.prepare("INSERT INTO schema_version (version) VALUES (2)").run();
}
```

---

## 6. New Files

| File | Purpose |
|---|---|
| `src/auth.ts` | Auth.js v5 config — Credentials provider, JWT strategy |
| `src/app/api/auth/[...nextauth]/route.ts` | Auth.js route handler (GET + POST) |
| `src/app/api/auth/register/route.ts` | `POST /api/auth/register` — create account |
| `src/app/api/migrate-session/route.ts` | `POST /api/migrate-session` — guest → user handoff |
| `src/lib/db/users.ts` | DB functions: `createUser`, `getUserByEmail`, `getUserById` |
| `src/lib/auth/quota.ts` | Anonymous quota: `checkAndIncrementQuota`, `deleteQuota` |
| `src/components/LoginModal.tsx` | Login/register modal |
| `src/components/AnonQuotaBanner.tsx` | "X messages remaining" counter below chat input |

---

## 7. Auth.js v5 Config (`src/auth.ts`)

```typescript
import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getUserByEmail } from "@/lib/db/users";
import { getAuthSecret } from "@/lib/config/env";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email:    { label: "Email",    type: "email"    },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = getUserByEmail(credentials.email as string);
        if (!user) return null;
        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password_hash
        );
        if (!valid) return null;
        return { id: user.id, email: user.email };
      },
    }),
  ],
  session: { strategy: "jwt" },
  secret: getAuthSecret(),
  callbacks: {
    // Persist user.id from the DB into the JWT token
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    // Expose token.id on the session object so route handlers can read session.user.id
    session({ session, token }) {
      if (typeof token.id === "string") session.user.id = token.id;
      return session;
    },
  },
});

// Type augmentation required for TypeScript strict mode.
// Without this, token.id and session.user.id are unknown to the compiler.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
```

```typescript
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/auth";
export const { GET, POST } = handlers;
```

**Required env var:** `AUTH_SECRET` — minimum 32-character random string. Generate with:
```bash
openssl rand -base64 32
```

Import `getAuthSecret()` from `env.ts` rather than reading the env var directly:
```typescript
import { getAuthSecret } from "@/lib/config/env";
// ...
secret: getAuthSecret(),
```
This ensures a clear startup error if the var is missing (see section 13).

---

## 8. User Registration (`POST /api/auth/register`)

```typescript
// src/app/api/auth/register/route.ts
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { createUser, getUserByEmail } from "@/lib/db/users";
import { checkOrigin } from "@/lib/security/origin-check";

const RegisterSchema = z.object({
  email:    z.string().email().max(254),
  password: z.string().min(8).max(128),
});

export async function POST(req: NextRequest) {
  const originError = checkOrigin(req);
  if (originError) return originError;

  let body: z.infer<typeof RegisterSchema>;
  try {
    body = RegisterSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const existing = getUserByEmail(body.email);
  // Return the same error for both "email taken" and "email not found" cases
  // to prevent account enumeration (spec 07)
  if (existing) {
    return NextResponse.json({ error: "Registration failed" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(body.password, 12);
  const id = `user_${crypto.randomUUID()}`;
  createUser(id, body.email, passwordHash);

  return NextResponse.json({ success: true }, { status: 201 });
}
```

---

## 9. Quota Enforcement in `POST /api/chat`

The quota check is added as a new step in `src/app/api/chat/route.ts`, between the origin check and the Zod parse.

When a new anonymous session is created, the `guest_session_id` cookie must be attached to the streaming `Response`. Because `Response.headers` are immutable after construction, the route handler wraps the stream response with the cookie header instead of modifying it in place.

```typescript
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkAndIncrementQuota } from "@/lib/auth/quota";
import { getAnonMessageLimit } from "@/lib/config/env";
import { checkOrigin } from "@/lib/security/origin-check";
import { runStreamPipeline } from "@/lib/chat/stream-pipeline";
// ... other existing imports

export async function POST(request: NextRequest): Promise<Response> {
  // Step 1: Origin check (existing)
  const originError = checkOrigin(request);
  if (originError) return originError;

  // Step 2: Quota check (new)
  const session = await auth();
  let guestSessionId: string | undefined;
  let isNewSession = false;

  if (!session?.user) {
    // Anonymous path — enforce quota
    guestSessionId = request.cookies.get("guest_session_id")?.value;
    if (!guestSessionId) {
      guestSessionId = crypto.randomUUID();
      isNewSession = true;
    }

    const allowed = checkAndIncrementQuota(guestSessionId);
    if (!allowed) {
      return NextResponse.json(
        { error: "quota_exceeded", limit: getAnonMessageLimit() },
        { status: 401 }
      );
    }
  }

  // Steps 3–11: Zod parse, DB, orchestrate, stream.
  // The original `return runStreamPipeline(body)` is replaced by the block below.
  // Keep the existing Zod safeParse logic (rawBody parse + ChatRequestSchema.safeParse) unchanged
  // between the quota check above and the runStreamPipeline call below.
  // `body: ChatRequest` is produced by that parse, exactly as in the original route.
  const streamResponse = await runStreamPipeline(body, { guestSessionId });

  // Attach guest_session_id cookie on the first anonymous request.
  // Response.headers are immutable — reconstruct with the added Set-Cookie header.
  if (isNewSession && guestSessionId) {
    return new Response(streamResponse.body, {
      status: streamResponse.status,
      headers: {
        ...Object.fromEntries(streamResponse.headers.entries()),
        "Set-Cookie":
          `guest_session_id=${guestSessionId}; HttpOnly; SameSite=Strict; Max-Age=2592000; Path=/`,
      },
    });
  }

  return streamResponse;
}
```

`checkAndIncrementQuota` and `deleteQuota` in `src/lib/auth/quota.ts`:
```typescript
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
```

**`getAnonMessageLimit()` and `getAuthSecret()`** follow the env pattern in `src/lib/config/env.ts`:
```typescript
export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set. Generate with: openssl rand -base64 32");
  return secret;
}

export function getAnonMessageLimit(): number {
  return Number(process.env.ANON_MESSAGE_LIMIT ?? "5");
}
```

---

## 10. Session Migration (`POST /api/migrate-session`)

Called by the client immediately after a successful login, before replaying any queued message.

**Important:** `guest_session_id` is an `httpOnly` cookie — client JavaScript cannot read it. The route reads it from the request cookies server-side. No body is required.

**Request:** empty body (`{}`)

**Response (success):**
```json
{ "migrated": 2 }
```

**Implementation:**
```typescript
// src/app/api/migrate-session/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { checkOrigin } from "@/lib/security/origin-check";
import { getDb } from "@/lib/db";
import { deleteQuota } from "@/lib/auth/quota";

export async function POST(req: NextRequest) {
  const originError = checkOrigin(req);
  if (originError) return originError;

  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Read guest_session_id from httpOnly cookie (not the request body)
  const guestSessionId = req.cookies.get("guest_session_id")?.value;
  if (!guestSessionId) {
    return NextResponse.json({ migrated: 0 });
  }

  const db = getDb();

  // Transfer ownership of all conversations from guest session to authenticated user
  const result = db
    .prepare(
      "UPDATE conversations SET user_id = ?, guest_session_id = NULL WHERE guest_session_id = ?"
    )
    .run(session.user.id, guestSessionId);

  // Delete quota record — authenticated users have no quota
  deleteQuota(guestSessionId, db);

  // Clear the guest_session_id cookie
  const response = NextResponse.json({ migrated: result.changes });
  response.cookies.set("guest_session_id", "", { maxAge: 0, path: "/" });
  return response;
}
```

---

## 11. Client-Side Flow (ChatSurface state additions)

`ChatSurface` gains four new state fields and one ref:

```typescript
const [pendingMessage, setPendingMessage] = useState<string | null>(null);
const [showLoginModal, setShowLoginModal] = useState(false);
const [messagesUsed, setMessagesUsed] = useState(0);    // count of anon sends this session
const [anonLimit, setAnonLimit] = useState<number>(5);  // populated from first 401 response

// Ref captures the in-flight message text so onQuotaExceeded callback can store it.
// A ref is used (not state) because its value must be current inside the callback closure.
const pendingTextRef = useRef<string>("");
```

`useRef` must be imported alongside `useState`:
```typescript
import { useState, useRef } from "react";
```

In `handleSend`, capture the text before calling `send`:
```typescript
const handleSend = async (text: string) => {
  if (!text.trim() || isStreaming) return;
  pendingTextRef.current = text.trim(); // capture before async send
  // ... existing message state updates ...
  await send(updatedMessages, conversationId);
};
```

The `useChatStream` call gains the new `onQuotaExceeded` callback. Also add `setMessagesUsed` increment to the existing `onDone` handler:
```typescript
const { send } = useChatStream({
  onDelta: /* unchanged */,
  onDone: (convId) => {
    // existing onDone logic unchanged, plus:
    setMessagesUsed((n) => n + 1); // increment after each successful anonymous send
  },
  onError: /* unchanged */,
  onQuotaExceeded: (limit) => {
    setAnonLimit(limit);
    setPendingMessage(pendingTextRef.current); // text captured via ref
    setShowLoginModal(true);
    setIsStreaming(false);
    // Remove the optimistic assistant placeholder
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.isStreaming) return prev.slice(0, -1);
      return prev;
    });
  },
});
```

**After successful login** (inside `<LoginModal />` `onSuccess` callback):
1. Call `POST /api/migrate-session` — no body needed; the server reads `guest_session_id` from the request cookie automatically
2. Close the modal (`setShowLoginModal(false)`)
3. If `pendingMessage !== null`: call `handleSend(pendingMessage)` and `setPendingMessage(null)`
   - Use `handleSend` (not `send` directly) — it rebuilds the full message array and assistant placeholder
   - `pendingMessage` is a plain string, matching `handleSend(text: string)`

**Edge cases:**
- If user closes the modal without logging in: `pendingMessage` is cleared, user must retype
- If migration fails: log the error silently, pending message is still replayed (history may not carry over)
- User navigating away before login: message is lost (acceptable for v1 — it was never sent to the server)

---

## 12. UI Component Specs

### `<AnonQuotaBanner />` — `src/components/AnonQuotaBanner.tsx`

Displayed below the chat input for anonymous users. Must be a **client component** (`"use client"`) because it receives function props.

```typescript
"use client";

interface AnonQuotaBannerProps {
  messagesUsed: number;   // count of messages sent this session (tracked in ChatSurface state)
  limit: number;          // ANON_MESSAGE_LIMIT value (received from 401 response)
  onSignUpClick: () => void;
}
```

- Shows: `"{messagesUsed} of {limit} free messages used. Sign up to continue."`
- When `messagesUsed >= limit`: warning style, text becomes `"Sign up to unlock unlimited messages"`
- Hidden for authenticated users
- `data-testid="anon-quota-banner"`

**How `messagesUsed` and `limit` are known:** `ChatSurface` increments a local `messagesUsed` counter on each successful anonymous send. `limit` is captured from the first `401 quota_exceeded` response body (`{ limit }`) and stored in `ChatSurface` state. Both are passed as props.

### `<LoginModal />` — `src/components/LoginModal.tsx`

Modal overlay shown when the quota is hit or the user clicks "Sign up." Must be a **client component** (`"use client"`) — it manages form state and calls `signIn` from `next-auth/react`.

```typescript
"use client";
import { signIn } from "next-auth/react"; // client-side signIn — NOT from @/auth (server action)

interface LoginModalProps {
  open: boolean;        // controls visibility — set to showLoginModal in ChatSurface
  onSuccess: () => void;  // called after successful login + migration
  onClose: () => void;
}
```

- Two tabs: **Log in** / **Sign up**
- **Sign up tab:** email + password fields → `POST /api/auth/register` → then auto-login via `signIn("credentials", ...)` (from `next-auth/react`)
- **Log in tab:** email + password fields → `signIn("credentials", { email, password, redirect: false })` (from `next-auth/react`)
- On success: calls `onSuccess()` then `onClose()`
- Shows inline error on invalid credentials: `"Invalid email or password."` (generic — no enumeration)
- `data-testid="login-modal"`

---

## 13. Environment Variables

Add to `.env.example` and `src/lib/config/env.ts`:

| Variable | Required | Default | Description |
|---|---|---|---|
| `AUTH_SECRET` | **Yes** | — | Min 32-char secret for JWT signing. `openssl rand -base64 32` |
| `ANON_MESSAGE_LIMIT` | No | `5` | Max messages per anonymous session per 24h window |

`AUTH_SECRET` **must** use a guard function (same pattern as `OPENAI_API_KEY`) so a missing value throws a clear error on startup rather than a cryptic Auth.js internal error. See the `getAuthSecret()` implementation in section 9.

---

## 14. Integration Touchpoints

All files that must change for end-to-end functionality:

| File | Change |
|---|---|
| `src/lib/db/schema.ts` | Add v2 migration block |
| `src/lib/db/conversations.ts` | Update `createConversation` to accept optional `guestSessionId?: string` and insert it |
| `src/lib/db/users.ts` | **Create** — `createUser`, `getUserByEmail`, `getUserById` |
| `src/lib/auth/quota.ts` | **Create** — `checkAndIncrementQuota`, `deleteQuota` |
| `src/lib/config/env.ts` | Add `getAuthSecret()` (throws on missing) and `getAnonMessageLimit()` |
| `src/auth.ts` | **Create** — Auth.js config |
| `src/app/api/auth/[...nextauth]/route.ts` | **Create** — Auth.js route handler |
| `src/app/api/auth/register/route.ts` | **Create** — registration endpoint |
| `src/app/api/migrate-session/route.ts` | **Create** — session migration endpoint |
| `src/app/api/chat/route.ts` | Add quota check step between origin check and Zod parse |
| `src/lib/chat/stream-pipeline.ts` | Accept optional `{ guestSessionId?: string }` as second argument; pass to `createConversation` |
| `src/components/AnonQuotaBanner.tsx` | **Create** |
| `src/components/LoginModal.tsx` | **Create** |
| `src/components/ChatSurface.tsx` | Add `pendingMessage`, `showLoginModal`, `messagesUsed`, `anonLimit` state + `pendingTextRef`; handle `401 quota_exceeded`; render `<AnonQuotaBanner />` and `<LoginModal />` |
| `src/hooks/useChatStream.ts` | Add `onQuotaExceeded` callback; parse `401 quota_exceeded` response body before calling it |

### `users.ts` implementation

```typescript
// src/lib/db/users.ts
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
```

### `useChatStream` interface change

```typescript
interface UseChatStreamOptions {
  onDelta: (chunk: string) => void;
  onDone: (conversationId: string) => void;
  onError: (message: string) => void;
  onQuotaExceeded?: (limit: number) => void;  // NEW — called on 401 quota_exceeded
}
```

New handling in the `send` function. The existing `if (!response.ok || !response.body)` block is split into two separate checks:

```typescript
// Replace the existing single `if (!response.ok || !response.body)` block with:
if (!response.ok) {
  if (response.status === 401) {
    try {
      const body = await response.json() as { error?: string; limit?: number };
      if (body.error === "quota_exceeded" && options.onQuotaExceeded) {
        options.onQuotaExceeded(body.limit ?? 5);
        return;
      }
    } catch { /* fall through to generic error */ }
  }
  options.onError("Request failed. Please try again.");
  return;
}
// Keep the existing !response.body guard as a separate check:
if (!response.body) {
  options.onError("Request failed. Please try again.");
  return;
}
```

### `createConversation` signature change

```typescript
// src/lib/db/conversations.ts
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
```

### `runStreamPipeline` signature change

```typescript
// src/lib/chat/stream-pipeline.ts
export async function runStreamPipeline(
  body: ChatRequest,
  options?: { guestSessionId?: string }
): Promise<Response>
```

Inside, the `createConversation` call becomes:
```typescript
createConversation(conversationId, "", options?.guestSessionId);
```

---

## 15. Success Criteria

- Anonymous users cannot exceed `ANON_MESSAGE_LIMIT` messages per 24h window
- The quota resets automatically after 24h without any cron job
- Users who sign up mid-conversation see their full chat history immediately after logging in
- The transition from anonymous to authenticated happens without a page reload
- `guest_session_id` cookie is `httpOnly` and `SameSite=Strict` — not readable by JavaScript
- Passwords are stored as bcrypt hashes (cost factor 12) — never plaintext
- Registration and login return the same generic error for invalid credentials — no account enumeration
- `AUTH_SECRET` missing at startup throws a clear error (same pattern as `OPENAI_API_KEY`)