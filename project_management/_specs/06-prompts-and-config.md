# Prompts & Configuration

## Overview

Prompts and UI copy are stored in `config/prompts.json` so they can be edited without touching source code. The system prompt is assembled in `src/lib/chat/system-prompt.ts` from multiple sources.

---

## `config/prompts.json`

```json
{
  "appName": "Financial Assistant",
  "firstMessage": "Hello! I can help you with stock prices, exchange rates, interest calculations, and portfolio analysis. What would you like to know?",
  "inputPlaceholder": "Ask a financial question...",
  "suggestions": [
    "What is the current price of AAPL?",
    "What is 1 USD in EUR today?",
    "Calculate compound interest on $5,000 at 6% for 20 years",
    "What is the market cap of Microsoft?"
  ]
}
```

---

## System Prompt Assembly (`src/lib/chat/system-prompt.ts`)

The system prompt is built from four sections joined with double newlines:

### Section 1 — Identity

```
You are a financial assistant powered by GPT-4o. You help users with:
- Stock prices, company overviews, and ticker lookups
- Currency exchange rates
- Financial calculations (compound interest, simple interest, percent change)
- Portfolio value summaries
- Visual charts and graphs for financial data

You are knowledgeable, precise, and concise. You cite the source of data when relevant (e.g. "According to Alpha Vantage...").
```

### Section 2 — Scope Boundaries

```
You only assist with financial topics. If a user asks about something unrelated to finance, politely redirect them.

Important limitations:
- You cannot execute trades or access any brokerage accounts
- Market data may be delayed by up to 15-20 minutes on the free API tier
- You do not have access to private financial data unless the user provides it in the conversation
- Always remind users that nothing you say constitutes financial advice
```

### Section 3 — Tool Usage Guidance

This section is dynamically generated based on registered tools. The one-line descriptions below are **hardcoded in `system-prompt.ts`** as a separate map — they are not pulled from the tool registry (those descriptions are for OpenAI's function-calling schema, not for the system prompt):

```
You have access to the following tools. Use them when the user asks for live data or calculations.
Do not guess or make up financial figures — always use a tool for real data.

Available tools:
- get_stock_quote: Use for current price, change, and volume of a stock
- get_company_overview: Use for fundamental data (sector, market cap, P/E, EPS)
- search_ticker: Use when the user gives a company name but not a ticker
- get_fx_rate: Use for currency exchange rates
- compound_interest: Use for compound interest calculations
- simple_interest: Use for simple interest calculations
- percent_change: Use to calculate the percentage difference between two values
- portfolio_summary: Use when the user provides a list of holdings
- generate_financial_graph: Use to create a pie, bar, or line chart when the user wants to visualize financial data

When you need data, call the appropriate tool first, then incorporate the result into your response.

When generate_financial_graph returns a chartUrl, display the chart inline using markdown: ![Chart Title](chartUrl)
```

### Section 4 — Context Window Guard (conditional)

If the context window is near the trim limit (≥ `WARN_CONTEXT_MESSAGES` or `WARN_CONTEXT_CHARACTERS`), append:

```
Note: This conversation is getting long and older messages have been summarized or removed to stay within context limits. If you reference something from earlier that seems missing, ask the user to repeat it.
```

---

## Assembling the Prompt

```typescript
// src/lib/chat/system-prompt.ts

export function buildSystemPrompt(options: {
  toolNames: string[];
  contextWindowNearLimit: boolean;
}): string {
  const sections: string[] = [
    IDENTITY_SECTION,
    SCOPE_SECTION,
    buildToolSection(options.toolNames),
  ];

  if (options.contextWindowNearLimit) {
    sections.push(CONTEXT_WINDOW_WARN_SECTION);
  }

  return sections.join("\n\n");
}
```

**How to compute `contextWindowNearLimit` in the route handler** (after `buildContextWindow` runs):

```typescript
import { WARN_CONTEXT_MESSAGES, WARN_CONTEXT_CHARACTERS } from "./chat-config";

const totalChars = trimmedMessages.reduce((n, m) => n + m.content.length, 0);
const contextWindowNearLimit =
  trimmedMessages.length >= WARN_CONTEXT_MESSAGES ||
  totalChars >= WARN_CONTEXT_CHARACTERS;
```

---

## Config Loading (`src/lib/config/instance.ts`)

```typescript
import promptsConfig from "../../../config/prompts.json";

export function getInstancePrompts() {
  return promptsConfig;
}
```

Ensure `tsconfig.json` has `"resolveJsonModule": true` (Next.js includes this by default). The path `../../../config/prompts.json` is relative from `src/lib/config/` up to the project root, then into `config/`.

---

## Updating the System Prompt

To change the assistant's persona or scope rules, edit the string constants in `src/lib/chat/system-prompt.ts`. To change UI copy (first message, suggestions, placeholder), edit `config/prompts.json`.

Do **not** put secrets or API keys in config files — use environment variables only.
