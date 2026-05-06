# Tech Stack

## Runtime

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 15 (App Router) | Server components, Route Handlers, streaming support |
| Language | TypeScript 5 | Type safety across the whole stack |
| Runtime | Node.js 20+ (tested on 24) | Required by Next.js |

## Dependencies

### Production

```json
{
  "next": "^15",
  "react": "^19",
  "react-dom": "^19",
  "openai": "^4",
  "better-sqlite3": "^11",
  "zod": "^3",
  "react-markdown": "^9",
  "remark-gfm": "^4",
  "pino": "^9",
  "next-auth": "^5",
  "bcryptjs": "^2"
}
```

- **`openai`** — Official OpenAI SDK for GPT-4o and function/tool calls
- **`better-sqlite3`** — Synchronous SQLite for conversation + message persistence; no separate DB process needed
- **`zod`** — Request body validation and tool input schemas
- **`react-markdown` + `remark-gfm`** — Render GPT markdown replies including tables (important for financial data)
- **`pino`** — Structured JSON logging
- **`next-auth@5`** (Auth.js v5) — Authentication with Credentials provider; JWT sessions stored in signed `httpOnly` cookies; native Next.js 15 App Router support
- **`bcryptjs`** — Pure-JS bcrypt for password hashing (cost factor 12); no native bindings required

### Dev

```json
{
  "typescript": "^5",
  "vitest": "^2",
  "@vitest/coverage-v8": "^2",
  "@testing-library/react": "^16",
  "@testing-library/jest-dom": "^6",
  "@playwright/test": "^1",
  "jsdom": "^25",
  "tailwindcss": "^3",
  "postcss": "^8",
  "autoprefixer": "^10",
  "eslint": "^9",
  "eslint-config-next": "^15",
  "tsx": "^4",
  "@types/better-sqlite3": "^7",
  "@types/node": "^20",
  "@types/react": "^19",
  "@types/react-dom": "^19",
  "@types/bcryptjs": "^2"
}
```

> **Note on Tailwind:** The spec originally called for Tailwind v4 with `@tailwindcss/postcss`. Tailwind v3 is used instead (the current stable release). v3 requires `tailwind.config.ts` + `postcss.config.js` with `autoprefixer`, and `globals.css` uses the standard `@tailwind base/components/utilities` directives instead of `@import "tailwindcss"`.

> **Note on `generate_financial_graph` (spec 09):** The graph tool uses [QuickChart.io](https://quickchart.io) via URL construction only — no npm package is required. The tool builds a Chart.js config object, encodes it into a URL, and returns it. No new production or dev dependencies are added.

## Folder Structure

```
/
├── config/
│   └── prompts.json          # App name, first message, suggestion chips (see 06-prompts-and-config.md)
├── data/
│   └── finance-chat.db       # SQLite file — created automatically on first run (git-ignored)
├── src/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx          # Root page — renders <ChatSurface />
│   │   ├── globals.css
│   │   └── api/
│   │       └── chat/
│   │           └── route.ts  # POST /api/chat — streaming chat endpoint
│   ├── __test-utils__/
│   │   └── setup.ts              # Vitest global setup (imports @testing-library/jest-dom)
│   ├── components/           # Presentational React components
│   │   ├── ChatSurface.tsx
│   │   ├── MessageList.tsx
│   │   ├── ChatInput.tsx
│   │   ├── ChatMessage.tsx
│   │   ├── ToolCallCard.tsx
│   │   ├── ErrorBoundary.tsx
│   │   ├── MarkdownProse.tsx
│   │   ├── CodeBlock.tsx
│   │   ├── ComposerSendControl.tsx
│   │   └── ChatHeader.tsx
│   ├── lib/
│   │   ├── chat/
│   │   │   ├── chat-config.ts          # Centralized constants (max rounds, context limits)
│   │   │   ├── orchestrator.ts         # Multi-round GPT tool-call loop
│   │   │   ├── context-window.ts       # Message trimming + alternation enforcement
│   │   │   ├── provider-policy.ts      # Retry, timeout, transient error classification
│   │   │   ├── stream-pipeline.ts      # Staged request handler
│   │   │   ├── stream-execution.ts     # SSE response builder
│   │   │   ├── system-prompt.ts        # System prompt assembly
│   │   │   └── validation.ts           # Zod schemas for request bodies
│   │   ├── tools/
│   │   │   ├── registry.ts             # ToolRegistry class
│   │   │   ├── market-data.ts          # get_stock_quote, get_company_overview, search_ticker
│   │   │   ├── fx.ts                   # get_fx_rate
│   │   │   └── calculator.ts           # compound_interest, simple_interest, percent_change, portfolio_summary
│   │   ├── db/
│   │   │   ├── index.ts                # DB singleton
│   │   │   ├── schema.ts               # ensureSchema() — creates tables + runs migrations
│   │   │   └── conversations.ts        # CRUD for conversations and messages
│   │   ├── security/
│   │   │   └── origin-check.ts         # CSRF-style origin validation on POST routes
│   │   └── config/
│   │       ├── env.ts                  # Typed env var accessors (throws if missing)
│   │       └── instance.ts             # Loads config/prompts.json for use in server code
│   └── hooks/
│       └── useChatStream.ts            # Client-side streaming hook
├── tests/
│   └── e2e/
│       ├── smoke.spec.ts               # Send message, assert response appears
│       ├── tool-call.spec.ts           # Trigger a tool call, assert rendered result
│       └── error-states.spec.ts        # Mock API failures, assert error UI
├── playwright.config.ts
├── vitest.config.ts
├── next.config.ts         # serverExternalPackages: ["better-sqlite3", "pino"]
├── tailwind.config.ts     # required for Tailwind v3
├── postcss.config.js      # plugins: { tailwindcss, autoprefixer }
├── tsconfig.json          # excludes "docs" to avoid picking up reference project
└── .env.example
```

## Environment Variables

```bash
# .env.local

# Required
OPENAI_API_KEY=sk-...

# Optional — Alpha Vantage free tier for market data
ALPHA_VANTAGE_API_KEY=demo

# Optional — comma-separated extra allowed origins for origin-check
ALLOWED_ORIGINS=

# Optional — override defaults
OPENAI_MODEL=gpt-4o
OPENAI_TIMEOUT_MS=30000
OPENAI_RETRY_ATTEMPTS=2
OPENAI_RETRY_DELAY_MS=1000
MAX_TOOL_ROUNDS=6
MAX_CONTEXT_MESSAGES=40
MAX_CONTEXT_CHARACTERS=80000
DB_PATH=data/finance-chat.db
```

## TypeScript Config

- `strict: true`
- Path alias: `@/*` → `./src/*`
- Target: `ES2022`
- `exclude: ["node_modules", "docs"]` — the `docs/_reference` project must be excluded to prevent type-check conflicts

## Vitest Config

- `environment: "node"` (default); component tests opt in with `// @vitest-environment jsdom` docblock
- `include: ["src/**/*.test.ts", "src/**/*.test.tsx"]` — scoped to `src/` to avoid picking up reference project tests
- `exclude: ["docs/**", "node_modules/**"]`

## Key next.config.ts Setting

`serverExternalPackages: ["better-sqlite3", "pino"]` — required so Next.js does not attempt to bundle native modules. Without this, the SQLite build fails at runtime.
