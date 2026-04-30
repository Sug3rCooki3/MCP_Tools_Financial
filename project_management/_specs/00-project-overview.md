# Financial Chatbot — Project Overview

## What This Is

A self-hostable Next.js chat application powered by the OpenAI GPT API. Users ask financial questions in natural language. The assistant calls registered tools (market data, FX rates, calculations) to fetch live data and streams the final answer back to the UI.

**No external services required beyond OpenAI.** SQLite handles conversation persistence. No managed database, message queue, or search server.

---

## How It Works (Core Flow)

1. User types a financial question in the chat UI
2. The request is sent to `POST /api/chat`
3. The server builds a context window from conversation history and calls GPT with tool schemas attached
4. GPT decides which tools (if any) to call — the server executes them and feeds results back to GPT
5. GPT produces a final text response, which is streamed to the browser in real time
6. Both the user message and the assistant response are saved to SQLite

---

## Target User

A single user or small team running the app on `localhost` or a private server. There is no public sign-up, no user accounts, and no authentication in v1.

---

## What to Build (v1 Scope)

### Must Have
- Streaming chat UI with message history
- `POST /api/chat` route handler with GPT tool-call loop
- SQLite conversation + message persistence
- All 8 tools in the table below
- Origin-check CSRF guard on API routes
- Zod validation on all request bodies and tool inputs
- Vitest unit tests for logic and tools
- Playwright E2E smoke tests for the chat UI

### Do Not Build (Out of Scope for v1)
- User authentication or multi-user accounts
- Real-money brokerage integration or trade execution
- Audio/voice input or output
- Push notifications
- Admin dashboard
- Referral, affiliate, or blog systems

---

## Financial Tools (v1)

| Tool | Type | Description |
|---|---|---|
| `get_stock_quote` | Live data | Current price, change, volume for a ticker |
| `get_company_overview` | Live data | Sector, market cap, P/E, EPS for a ticker |
| `search_ticker` | Live data | Find a ticker symbol by company name |
| `get_fx_rate` | Live data | Exchange rate between two currencies |
| `compound_interest` | Calculation | Future value with compound interest |
| `simple_interest` | Calculation | Interest owed/earned on a principal |
| `percent_change` | Calculation | % change between two values |
| `portfolio_summary` | Calculation | Total value of holdings (quantity × price) |

**Live data source:** Alpha Vantage API (`https://www.alphavantage.co`). Use `ALPHA_VANTAGE_API_KEY=demo` for development (limited quota). Register a free key for sustained use. The provider can be swapped later without touching GPT logic.

---

## Reference Project

A working reference implementation lives at:
```
docs/_reference/ai_mcp_chat_ordo/
```

Read it for implementation patterns, not for features to copy. The following patterns are directly reusable:

| Pattern | Reference file |
|---|---|
| Multi-round tool-call orchestrator loop | `src/lib/chat/orchestrator.ts` |
| Context window trimming | `src/lib/chat/context-window.ts` |
| Provider retry/timeout policy | `src/lib/chat/provider-policy.ts` |
| Tool registry + execution | `src/core/tool-registry/ToolRegistry.ts` |
| SQLite schema + migrations | `src/lib/db/` |
| Origin-check CSRF guard | `src/lib/security/origin-check.ts` |
| Staged streaming pipeline | `src/lib/chat/stream-pipeline.ts` |
| Chat UI components | `src/frameworks/ui/` |

**Key differences — do not copy these from the reference:**
- The reference uses Anthropic Claude. This project uses **OpenAI GPT** (`openai` SDK, `tool_calls` format)
- The reference has multi-user auth, RBAC, and role-based tool filtering — **omit all of this**
- The reference has media, audio, blog, referral, and push systems — **omit all of this**
- The reference pipeline has task-origin handoff and media continuity stages — **omit these**, the pipeline here is simpler (see `02-architecture.md`)
