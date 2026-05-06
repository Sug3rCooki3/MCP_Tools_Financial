# Testing Strategy

## Overview

Two testing layers:

| Layer | Tool | Purpose |
|---|---|---|
| Unit / integration | Vitest | Logic, utilities, DB operations, tool implementations |
| E2E | Playwright | Full browser smoke tests — streaming, tool calls, UI states |

---

## Vitest Setup

File: `vitest.config.ts`

```typescript
import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",   // default for server-side tests
    globals: true,
    setupFiles: ["./src/__test-utils__/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Component tests (`*.test.tsx`) that need a DOM must opt into jsdom with a docblock at the top of the file:

```typescript
// @vitest-environment jsdom
```

This keeps server-side tests running in a real Node environment (correct `fetch`, `crypto`, etc.) while component tests get a browser-like DOM.

File: `src/__test-utils__/setup.ts`
```typescript
import "@testing-library/jest-dom";
```

Run all unit tests:
```bash
npx vitest run
```

Run with coverage:
```bash
npx vitest run --coverage
```

---

## Unit Tests

### Context Window (`src/lib/chat/context-window.test.ts`)

```typescript
describe("trimToLimits", () => {
  it("returns messages unchanged when under both limits");
  it("trims oldest messages when over MAX_CONTEXT_MESSAGES");
  it("trims oldest messages when over MAX_CONTEXT_CHARACTERS");
  it("always keeps the most recent message even if it alone exceeds character budget");
  it("ensures the window starts with a user message after trimming");
});

describe("normalizeAlternation", () => {
  it("merges consecutive user messages into one");
  it("merges consecutive assistant messages into one");
  it("leaves correctly alternating messages unchanged");
  it("returns empty array for empty input");
});
```

---

### Provider Policy (`src/lib/chat/provider-policy.test.ts`)

```typescript
describe("isTransientProviderError", () => {
  it("returns true for 429 rate limit message");
  it("returns true for 503 service unavailable");
  it("returns true for network/fetch failure message");
  it("returns false for 401 unauthorized");
  it("returns false for 400 bad request");
});
```

---

### Tool Implementations (`src/lib/tools/calculator.test.ts`)

```typescript
describe("compound_interest", () => {
  it("calculates future value correctly for monthly compounding");
  it("defaults to monthly compounding when not specified");
  it("handles annual compounding (n=1)");
  it("returns correct values for zero years");
});

describe("simple_interest", () => {
  it("calculates interest correctly");
  it("returns total = principal + interest");
});

describe("percent_change", () => {
  it("calculates positive percent change");
  it("calculates negative percent change");
  it("throws an error when old_value is 0");
});

describe("portfolio_summary", () => {
  it("sums holding values correctly");
  it("handles a single holding");
  it("handles empty holdings array");
});
```

---

### Tool Input Validation (`src/lib/tools/market-data.test.ts`)

```typescript
describe("get_stock_quote input validation", () => {
  it("accepts a valid uppercase ticker");
  it("uppercases a lowercase ticker");
  it("throws ZodError for empty string");
  it("throws ZodError for ticker over 10 characters");
});
```

---

### DB Operations (`src/lib/db/conversations.test.ts`)

Uses an **in-memory SQLite** database. To make this work, the functions in `src/lib/db/conversations.ts` must accept an optional `db` parameter instead of always calling `getDb()`:

```typescript
// src/lib/db/conversations.ts — function signature pattern
export function createConversation(
  id: string,
  title: string,
  db: Database.Database = getDb()  // defaults to singleton; tests inject in-memory db
): Conversation { ... }
```

Apply the same optional `db` parameter to `getConversation`, `insertMessage`, `getMessages`, and `deleteConversation`.

```typescript
import Database from "better-sqlite3";
import { ensureSchema } from "@/lib/db/schema";
import { createConversation, getMessages, insertMessage } from "@/lib/db/conversations";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  ensureSchema(db);
});

afterEach(() => db.close());

describe("conversations", () => {
  it("creates and retrieves a conversation", () => {
    // pass db as the last argument to every call
    createConversation("conv_1", "Test", db);
    expect(getConversation("conv_1", db)).toMatchObject({ title: "Test" });
  });
  it("returns null for a non-existent conversation ID");
  it("lists conversations newest first");
  it("deletes a conversation and cascades messages");
});

describe("messages", () => {
  it("inserts and retrieves messages in position order");
  it("returns empty array for a conversation with no messages");
});
```

---

### Origin Check (`src/lib/security/origin-check.test.ts`)

```typescript
describe("checkOrigin", () => {
  it("allows same-host origin");
  it("returns 403 for a different origin");
  it("allows requests without an Origin header (non-browser clients)");
  it("allows GET requests without checking origin");
  it("includes extra origins from ALLOWED_ORIGINS env var");
});
```

---

### UI Components (React Testing Library)

File: `src/components/ChatInput.test.tsx`

```typescript
describe("ChatInput", () => {
  it("calls onSend with the message text on Enter key");
  it("does not call onSend on empty input");
  it("clears the textarea after sending");
  it("inserts a newline on Shift+Enter instead of sending");
  it("disables the textarea and button when disabled=true");
});
```

File: `src/components/MessageList.test.tsx`

```typescript
describe("MessageList", () => {
  it("renders all messages");
  it("renders user messages without markdown");
  it("renders assistant messages with markdown (tables, bold)");
  it("shows a streaming cursor when isStreaming=true");
});
```

---

## Test Data Attributes

Components must use `data-role` and `data-testid` attributes so Playwright selectors are stable across refactors. Add these before writing E2E tests — the smoke and tool-call tests depend on them.

```tsx
// ChatMessage.tsx
<div data-role={message.role} data-testid={`message-${message.id}`}>
  ...
</div>

// ChatInput.tsx
<textarea data-testid="chat-input" placeholder="Ask a financial question..." />

// ToolCallCard.tsx
<div data-testid="tool-call-card">Fetched stock quote</div>
```

---

---

### Anonymous Quota (`src/lib/auth/quota.test.ts`) _(spec 10)_

Uses an in-memory SQLite database. All calls pass the `db` parameter.

```typescript
describe("checkAndIncrementQuota", () => {
  it("allows the first message and creates a quota row");
  it("allows messages up to the limit");
  it("blocks the message at exactly the limit");
  it("resets the count after the 24h window has expired");
  it("does not reset the count before 24h has elapsed");
});
```

---

### User DB Operations (`src/lib/db/users.test.ts`) _(spec 10)_

```typescript
describe("users", () => {
  it("creates a user and retrieves them by email");
  it("returns null for an unknown email");
  it("returns null for an unknown ID");
  it("throws on duplicate email (UNIQUE constraint)");
});
```

---

### Session Migration (`src/app/api/migrate-session/route.test.ts`) _(spec 10)_

```typescript
describe("POST /api/migrate-session", () => {
  it("returns 401 when no auth session is present");
  it("returns { migrated: 0 } when no guest_session_id cookie is present");
  it("transfers conversations from guest_session_id to user_id");
  it("clears guest_session_id on transferred conversations");
  it("deletes the anonymous_quotas row after migration");
  it("sets Set-Cookie Max-Age=0 on the response to clear the guest cookie");
});
```

---

## Playwright E2E Tests

### Setup (`playwright.config.ts`)

```typescript
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
```

Run E2E tests:
```bash
npx playwright test
```

Run in headed mode (watch the browser):
```bash
npx playwright test --headed
```

---

### Smoke Test (`tests/e2e/smoke.spec.ts`)

Tests that the basic chat flow works end-to-end.

```typescript
import { test, expect } from "@playwright/test";

test("user can send a message and receive a response", async ({ page }) => {
  await page.goto("/");

  // Page loads with the empty state
  await expect(page.getByText("Financial Assistant")).toBeVisible();

  // Type a simple message that doesn't need a tool call
  const input = page.getByPlaceholder("Ask a financial question...");
  await input.fill("What is 10% of 500?");
  await input.press("Enter");

  // User message appears immediately
  await expect(page.getByText("What is 10% of 500?")).toBeVisible();

  // Assistant response appears (wait up to 30s for GPT)
  await expect(
    page.locator("[data-role='assistant']").last()
  ).not.toBeEmpty({ timeout: 30_000 });

  // Input is cleared after sending
  await expect(input).toHaveValue("");
});

test("send button is disabled while streaming", async ({ page }) => {
  await page.goto("/");

  const input = page.getByPlaceholder("Ask a financial question...");
  const sendButton = page.getByRole("button", { name: /send/i });

  await input.fill("What is compound interest?");
  await input.press("Enter");

  // Button should be disabled immediately after sending
  await expect(sendButton).toBeDisabled();

  // Wait for response to complete, button re-enables
  await expect(sendButton).toBeEnabled({ timeout: 30_000 });
});

test("New Chat button resets the conversation", async ({ page }) => {
  await page.goto("/");

  const input = page.getByPlaceholder("Ask a financial question...");
  await input.fill("Hello");
  await input.press("Enter");

  await expect(page.locator("[data-role='user']")).toBeVisible();

  await page.getByRole("button", { name: /new chat/i }).click();

  // Messages are cleared
  await expect(page.locator("[data-role='user']")).not.toBeVisible();
});
```

---

### Tool Call Test (`tests/e2e/tool-call.spec.ts`)

Tests that a tool call triggers and the result renders. Uses a real API call so requires `OPENAI_API_KEY` and `ALPHA_VANTAGE_API_KEY` to be set.

```typescript
import { test, expect } from "@playwright/test";

test("asking for a stock price triggers tool call and shows price", async ({ page }) => {
  await page.goto("/");

  const input = page.getByPlaceholder("Ask a financial question...");
  await input.fill("What is the current price of MSFT?");
  await input.press("Enter");

  // Wait for a response that contains a dollar sign (price data)
  const assistantMessage = page.locator("[data-role='assistant']").last();
  await expect(assistantMessage).toContainText("$", { timeout: 45_000 });

  // Tool call card should be visible
  await expect(page.getByText("Fetched stock quote")).toBeVisible();
});

test("asking for exchange rate returns a number", async ({ page }) => {
  await page.goto("/");

  const input = page.getByPlaceholder("Ask a financial question...");
  await input.fill("What is the exchange rate from USD to EUR?");
  await input.press("Enter");

  const assistantMessage = page.locator("[data-role='assistant']").last();
  // Response should contain a decimal number (exchange rate)
  await expect(assistantMessage).toContainText(/\d+\.\d+/, { timeout: 45_000 });
});
```

---

### Error State Test (`tests/e2e/error-states.spec.ts`)

Tests UI resilience when the API fails. Uses route interception to mock failures.

```typescript
import { test, expect } from "@playwright/test";

test("shows error message when API returns 500", async ({ page }) => {
  // Intercept the chat API and return a 500
  await page.route("/api/chat", (route) => {
    route.fulfill({ status: 500, body: "Internal Server Error" });
  });

  await page.goto("/");
  const input = page.getByPlaceholder("Ask a financial question...");
  await input.fill("What is AAPL price?");
  await input.press("Enter");

  // Error message should appear
  await expect(page.getByText(/request failed|try again/i)).toBeVisible({ timeout: 5_000 });

  // Input should be re-enabled so user can retry
  await expect(input).toBeEnabled();
});
```

---

## CI Strategy

For CI (GitHub Actions or similar):

- Run `npx vitest run` on every push — fast, no API keys needed
- Run Playwright smoke test (`smoke.spec.ts`) only — skips the tool-call test that needs live API keys
- Tool call and error state tests run locally or in a dedicated integration test stage with secrets

```yaml
# .github/workflows/ci.yml (example)
- name: Unit tests
  run: npx vitest run

- name: E2E smoke test
  run: npx playwright test tests/e2e/smoke.spec.ts
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```
