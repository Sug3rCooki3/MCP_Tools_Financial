# Security

## Threat Model

This is a self-hosted, **multi-user** application (anonymous + authenticated users). The primary threats are:
- Cross-site request forgery (malicious page making POST requests to `/api/chat`)
- Prompt injection via user input
- API key exposure
- Unvalidated input passed to external APIs or the GPT model
- Excessive spend from unbounded tool call loops or context window abuse
- Anonymous quota bypass (clearing cookies to reset message count)
- Account enumeration via registration/login error messages
- Credential stuffing attacks against `/api/auth/register` and login
- Session fixation or hijacking during guest-to-user migration
- XSS reading `guest_session_id` from storage

---

## 1. Origin Check (CSRF Guard)

File: `src/lib/security/origin-check.ts`

All `POST` requests to `/api/chat` must have an `Origin` header matching the server's own host. This prevents a third-party site from making requests on behalf of a visiting user.

```typescript
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function checkOrigin(req: NextRequest): NextResponse | null {
  if (SAFE_METHODS.has(req.method)) return null;

  const origin = req.headers.get("origin");
  if (!origin) return null;  // same-origin requests from non-browser clients pass through

  const host = req.headers.get("host");
  const allowed = getAllowedOrigins(host);

  if (!allowed.has(origin)) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
  }

  return null;
}

function getAllowedOrigins(host: string | null): Set<string> {
  const origins = new Set<string>();
  if (host) {
    origins.add(`https://${host}`);
    origins.add(`http://${host}`);
  }
  const extra = process.env.ALLOWED_ORIGINS?.split(",").map((s) => s.trim());
  if (extra) for (const o of extra) if (o) origins.add(o);
  return origins;
}
```

Usage in the route handler:
```typescript
const originError = checkOrigin(request);
if (originError) return originError;
```

---

## 2. Request Body Validation (Zod)

File: `src/lib/chat/validation.ts`

All incoming request bodies are validated with Zod before any processing. Invalid bodies return a `400` immediately.

```typescript
import { z } from "zod";

export const ChatRequestSchema = z.object({
  messages: z.array(
    z.object({
      role:    z.enum(["user", "assistant"]),
      content: z.string().min(1).max(32_000),
    })
  ).min(1).max(100),
  conversationId: z.string().max(64).optional(),
});

export type ChatRequest = z.infer<typeof ChatRequestSchema>;
```

**Catch pattern in the route handler** (`src/app/api/chat/route.ts`):

```typescript
import { ZodError } from "zod";
import { ChatRequestSchema, type ChatRequest } from "@/lib/chat/validation";

let body: ChatRequest;
try {
  body = ChatRequestSchema.parse(await request.json());
} catch (err) {
  if (err instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request", issues: err.issues }, { status: 400 });
  }
  return NextResponse.json({ error: "Bad request" }, { status: 400 });
}
// body is definitely assigned here — TypeScript narrows correctly because
// the catch block always returns, so execution past it means parse() succeeded.
```

**Limits enforced:**
- `content` max 32,000 characters — prevents excessively large single messages
- `messages` array max 100 — prevents abuse even before context trimming
- `conversationId` max 64 chars — prevents oversized ID injection

---

## 3. Tool Input Validation (Zod)

Each tool validates its own input with Zod inside `execute()` before calling any external API. See `04-tool-system.md` for per-tool schemas.

This prevents GPT from generating a malformed tool call that causes an unhandled exception or unexpected behavior in downstream APIs.

---

## 4. Environment Variable Guards

File: `src/lib/config/env.ts`

API keys are never hardcoded. All secrets are loaded from environment variables through typed accessor functions that throw at startup if required values are missing:

```typescript
export function getOpenAiApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set. Add it to .env.local");
  return key;
}
```

**Rules:**
- Never log the API key value
- Never include `.env.local` in git (`.gitignore` must include it)
- The `.env.example` file lists all variable names with placeholder values, never real keys
- Use `ALLOWED_ORIGINS` (comma-separated) to extend the origin allowlist beyond the app's own host — needed when the Next.js server sits behind a reverse proxy with a different hostname:
  ```
  ALLOWED_ORIGINS=https://finance.example.com,http://localhost:3001
  ```

---

## 5. Tool Call Loop Safety

The orchestrator enforces a hard cap of `MAX_TOOL_ROUNDS` (default 6) to prevent infinite tool-call loops whether caused by model behavior or a buggy tool.

```typescript
if (step >= maxRounds) {
  throw new Error(`Exceeded tool-call safety limit (${maxRounds} rounds)`);
}
```

The route handler (in `stream-execution.ts` or `stream-pipeline.ts`) must wrap the orchestrator call in a `try/catch` and emit a stream error event on failure:

```typescript
try {
  const text = await orchestrate(...);
  // stream text
} catch (err) {
  controller.enqueue(encoder.encode(
    `data: ${JSON.stringify({ type: "error", message: "Something went wrong. Please try again." })}\n\n`
  ));
}
```

---

## 6. Alpha Vantage API Key

The Alpha Vantage key (`ALPHA_VANTAGE_API_KEY`) is used server-side only. It is never sent to the browser.

The `demo` key is a public Alpha Vantage key with very limited quota. For production use, register a free key at `https://www.alphavantage.co/support/#api-key`.

---

## 7. Prompt Injection Awareness

User messages are passed directly to GPT. GPT itself may be susceptible to prompt injection (a user crafting a message like "Ignore previous instructions and...").

Mitigations:
- The system prompt explicitly defines the assistant's scope ("you only assist with financial topics")
- Tool execution is deterministic code — GPT cannot execute arbitrary code via tools
- No tool has write access to the database or file system
- Tool inputs are Zod-validated, so even if GPT is manipulated into calling a tool with bad args, it will fail gracefully

This is considered acceptable risk for a personal-use tool. Do not expose this app publicly without adding rate limiting and authentication.

---

## 8. No Sensitive Data in Logs

`pino` logger must never log:
- `OPENAI_API_KEY` or `ALPHA_VANTAGE_API_KEY` values
- Full message contents (log only metadata like message count, conversationId)
- User-identifying information

---

## 9. HTTPS in Production

When self-hosting, always terminate TLS at a reverse proxy (nginx, Caddy) in front of the Next.js server. Do not run the Node.js server directly on port 80/443 with HTTP.

---

## 10. Authentication Security (spec 10)

### Password Hashing

Passwords are hashed with `bcryptjs` at cost factor 12 before being stored in the `users` table. The plaintext password is never logged, stored, or returned in any response.

```typescript
const passwordHash = await bcrypt.hash(password, 12);
```

### Account Enumeration Prevention

Both registration (email already taken) and login (wrong password or unknown email) must return the **same generic error message** to prevent an attacker from determining whether an email address has an account:

- Registration conflict: `{ error: "Registration failed" }` — HTTP 409
- Login failure: Auth.js returns `null` from `authorize()` — results in a generic "Invalid credentials" error

Do not return `"Email already registered"` or `"User not found"` anywhere.

### Anonymous Session ID

The `guest_session_id` cookie is:
- Generated with `crypto.randomUUID()` (128 bits of entropy)
- Set with `httpOnly: true`, `SameSite: Strict`, `Secure: true` (production)
- Never readable by JavaScript — immune to XSS
- Validated as a UUID in `POST /api/migrate-session` via Zod (`.string().uuid()`)

### JWT Secret

`AUTH_SECRET` must be at minimum 32 characters (256 bits). Treat it like an API key:
- Never commit it to git
- Generate with: `openssl rand -base64 32`
- Add a guard to `src/lib/config/env.ts` that throws at startup if missing (same pattern as `OPENAI_API_KEY`)

When self-hosting, always terminate TLS at a reverse proxy (nginx, Caddy) in front of the Next.js server. Do not run the Node.js server directly on port 80/443 with HTTP.

---

## Security Checklist for the Coder

Before shipping:

- [ ] `.env.local` is in `.gitignore`
- [ ] `origin-check.ts` is called at the top of the route handler
- [ ] Zod validation runs before any DB or OpenAI calls
- [ ] `MAX_TOOL_ROUNDS` is enforced in the orchestrator
- [ ] No secrets appear in `NEXT_PUBLIC_*` environment variables (those are bundled into client-side JS)
- [ ] API keys never appear in log output
- [ ] Tool inputs are Zod-validated before external API calls
- [ ] `AUTH_SECRET` is set (min 32 chars) and not committed to git
- [ ] Passwords stored as bcrypt hashes (cost 12) — never plaintext
- [ ] `guest_session_id` cookie is `httpOnly`, `SameSite=Strict` — not readable by JS
- [ ] Registration and login return the same generic error message (no account enumeration)
- [ ] `POST /api/migrate-session` requires a valid Auth.js session before executing
- [ ] `ANON_MESSAGE_LIMIT` is enforced server-side (not client-side)
