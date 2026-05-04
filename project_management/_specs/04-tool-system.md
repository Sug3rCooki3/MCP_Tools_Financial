# Tool System

## Overview

Tools are the mechanism by which GPT calls external services or runs calculations. The tool system has three layers:

1. **ToolRegistry** — registers tool definitions and executes them by name
2. **Tool bundles** — grouped sets of tools registered together (e.g. all market data tools)
3. **Tool implementations** — the actual async functions that fetch data or compute results

---

## ToolRegistry (`src/lib/tools/registry.ts`)

```typescript
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema object
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(definition: ToolDefinition): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool "${definition.name}" is already registered`);
    }
    this.tools.set(definition.name, definition);
  }

  // Returns the array of tool schemas to pass to OpenAI
  getSchemas(): OpenAI.ChatCompletionTool[] {
    return Array.from(this.tools.values()).map((def) => ({
      type: "function",
      function: {
        name: def.name,
        description: def.description,
        parameters: def.parameters,
      },
    }));
  }

  async execute(name: string, input: Record<string, unknown>): Promise<unknown> {
    const def = this.tools.get(name);
    if (!def) throw new Error(`Unknown tool: "${name}"`);
    return def.execute(input);
  }
}
```

The registry is a singleton created once at app startup:

```typescript
// src/lib/tools/registry.ts (bottom of file)
import { registerMarketDataTools } from "./market-data";
import { registerFxTools } from "./fx";
import { registerCalculatorTools } from "./calculator";

export const toolRegistry = new ToolRegistry();
registerMarketDataTools(toolRegistry);
registerFxTools(toolRegistry);
registerCalculatorTools(toolRegistry);
```

---

## Tool Definitions

### Market Data Tools (`src/lib/tools/market-data.ts`)

Data source: **Alpha Vantage API** (`https://www.alphavantage.co/query`)

All requests use `fetch` with a 10-second timeout via `AbortController`. API key via `getAlphaVantageApiKey()` from `src/lib/config/env.ts` — add it following the same pattern as `getOpenAiApiKey()`:

```typescript
export function getAlphaVantageApiKey(): string {
  return process.env.ALPHA_VANTAGE_API_KEY ?? "demo";
}
```

Fetch timeout pattern for all market data and FX tools:

```typescript
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), 10_000);
try {
  const res = await fetch(url, { signal: controller.signal });
  // ...
} finally {
  clearTimeout(timeout);
}
```

#### `get_stock_quote`

```typescript
{
  name: "get_stock_quote",
  description: "Get the current stock price, daily change, and trading volume for a ticker symbol.",
  parameters: {
    type: "object",
    properties: {
      ticker: {
        type: "string",
        description: "The stock ticker symbol, e.g. AAPL, MSFT, TSLA"
      }
    },
    required: ["ticker"]
  },
  execute: async ({ ticker }) => {
    // GET https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol={ticker}&apikey={key}
    // Returns: { price, change, changePercent, volume, latestTradingDay }
  }
}
```

**Return shape:**
```json
{
  "ticker": "AAPL",
  "price": "189.42",
  "change": "+1.23",
  "changePercent": "+0.65%",
  "volume": "54321000",
  "latestTradingDay": "2026-04-29"
}
```

#### `get_company_overview`

```typescript
{
  name: "get_company_overview",
  description: "Get fundamental company data including sector, market cap, P/E ratio, and EPS for a ticker.",
  parameters: {
    type: "object",
    properties: {
      ticker: { type: "string", description: "The stock ticker symbol" }
    },
    required: ["ticker"]
  },
  execute: async ({ ticker }) => {
    // GET https://www.alphavantage.co/query?function=OVERVIEW&symbol={ticker}&apikey={key}
    // Returns: { name, sector, industry, marketCap, peRatio, eps, dividendYield, 52WeekHigh, 52WeekLow }
  }
}
```

#### `search_ticker`

```typescript
{
  name: "search_ticker",
  description: "Search for a stock ticker symbol by company name or keywords.",
  parameters: {
    type: "object",
    properties: {
      keywords: { type: "string", description: "Company name or search terms, e.g. 'Apple' or 'electric vehicles'" }
    },
    required: ["keywords"]
  },
  execute: async ({ keywords }) => {
    // GET https://www.alphavantage.co/query?function=SYMBOL_SEARCH&keywords={keywords}&apikey={key}
    // Returns: array of { symbol, name, type, region, currency }
  }
}
```

---

### FX Tools (`src/lib/tools/fx.ts`)

Data source: **Alpha Vantage CURRENCY_EXCHANGE_RATE**

#### `get_fx_rate`

```typescript
{
  name: "get_fx_rate",
  description: "Get the current exchange rate between two currencies.",
  parameters: {
    type: "object",
    properties: {
      from_currency: { type: "string", description: "Source currency code, e.g. USD, EUR, GBP" },
      to_currency:   { type: "string", description: "Target currency code, e.g. JPY, CAD, CHF" }
    },
    required: ["from_currency", "to_currency"]
  },
  execute: async ({ from_currency, to_currency }) => {
    // GET https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency={}&to_currency={}&apikey={}
    // Returns: { fromCurrency, toCurrency, exchangeRate, lastRefreshed }
  }
}
```

---

### Calculator Tools (`src/lib/tools/calculator.ts`)

Pure functions — no external API calls. These never fail due to network issues.

#### `compound_interest`

```typescript
{
  name: "compound_interest",
  description: "Calculate the future value of an investment with compound interest.",
  parameters: {
    type: "object",
    properties: {
      principal:          { type: "number", description: "Initial investment amount in dollars" },
      annual_rate_percent:{ type: "number", description: "Annual interest rate as a percentage, e.g. 5 for 5%" },
      years:              { type: "number", description: "Number of years" },
      compounds_per_year: { type: "number", description: "How many times interest compounds per year. Default 12 (monthly)" }
    },
    required: ["principal", "annual_rate_percent", "years"]
  },
  execute: async ({ principal, annual_rate_percent, years, compounds_per_year = 12 }) => {
    const r = annual_rate_percent / 100;
    const n = compounds_per_year;
    const futureValue = principal * Math.pow(1 + r / n, n * years);
    const totalInterest = futureValue - principal;
    return {
      principal,
      futureValue: futureValue.toFixed(2),
      totalInterest: totalInterest.toFixed(2),
      years,
      annualRatePercent: annual_rate_percent,
      compoundsPerYear: n,
    };
  }
}
```

#### `simple_interest`

```typescript
{
  name: "simple_interest",
  description: "Calculate simple interest on a principal amount.",
  parameters: {
    type: "object",
    properties: {
      principal:          { type: "number", description: "Principal amount in dollars" },
      annual_rate_percent:{ type: "number", description: "Annual interest rate as a percentage" },
      years:              { type: "number", description: "Number of years" }
    },
    required: ["principal", "annual_rate_percent", "years"]
  },
  execute: async ({ principal, annual_rate_percent, years }) => {
    const interest = principal * (annual_rate_percent / 100) * years;
    return {
      principal,
      interest: interest.toFixed(2),
      total: (principal + interest).toFixed(2),
      years,
      annualRatePercent: annual_rate_percent,
    };
  }
}
```

#### `percent_change`

```typescript
{
  name: "percent_change",
  description: "Calculate the percentage change between an old value and a new value.",
  parameters: {
    type: "object",
    properties: {
      old_value: { type: "number", description: "The original/starting value" },
      new_value: { type: "number", description: "The new/ending value" }
    },
    required: ["old_value", "new_value"]
  },
  execute: async ({ old_value, new_value }) => {
    if (old_value === 0) throw new Error("Cannot calculate percent change from a zero starting value");
    const change = ((new_value - old_value) / Math.abs(old_value)) * 100;
    return {
      oldValue: old_value,
      newValue: new_value,
      percentChange: change.toFixed(4),
      direction: change >= 0 ? "increase" : "decrease",
    };
  }
}
```

#### `portfolio_summary`

```typescript
{
  name: "portfolio_summary",
  description: "Calculate the total value of a portfolio given a list of holdings.",
  parameters: {
    type: "object",
    properties: {
      holdings: {
        type: "array",
        description: "Array of holdings",
        items: {
          type: "object",
          properties: {
            ticker:   { type: "string", description: "Ticker symbol" },
            quantity: { type: "number", description: "Number of shares" },
            price:    { type: "number", description: "Current price per share in dollars" }
          },
          required: ["ticker", "quantity", "price"]
        }
      }
    },
    required: ["holdings"]
  },
  execute: async ({ holdings }) => {
    const rows = holdings.map((h) => ({
      ticker: h.ticker,
      quantity: h.quantity,
      price: h.price,
      value: (h.quantity * h.price).toFixed(2),
    }));
    const total = rows.reduce((sum, r) => sum + parseFloat(r.value), 0);
    return { holdings: rows, totalValue: total.toFixed(2) };
  }
}
```

---

### Graph Tools (`src/lib/tools/graph.ts`)

Pure URL construction — no external API calls. Builds a [QuickChart.io](https://quickchart.io) URL from a Chart.js config and returns it. No new npm dependencies required.

#### `generate_financial_graph`

```typescript
{
  name: "generate_financial_graph",
  description: "Creates a visual chart (pie, bar, or line) from financial data points. Returns a chart image URL to display to the user.",
  parameters: {
    type: "object",
    properties: {
      title:       { type: "string", description: "The title of the graph" },
      type:        { type: "string", enum: ["pie", "bar", "line"], description: "The visual format" },
      data_points: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string" },
            value: { type: "number" }
          },
          required: ["label", "value"]
        }
      },
      unit: { type: "string", description: "Currency or unit symbol. Defaults to '$'" }
    },
    required: ["title", "type", "data_points"]
  },
  execute: async (rawInput) => {
    // Validates with Zod, builds Chart.js config, encodes into QuickChart URL
    // Returns: { chartUrl, title, chartType, dataPoints: [{ label, formattedValue }] }
  }
}
```

**Return shape:**
```json
{
  "chartUrl": "https://quickchart.io/chart?c=...&width=600&height=400",
  "title": "Monthly Budget Breakdown",
  "chartType": "pie",
  "dataPoints": [
    { "label": "Groceries", "formattedValue": "$1,000" },
    { "label": "Mortgage",  "formattedValue": "$30,000" }
  ]
}
```

**Note on remaining income:** The tool does not accept an `income` parameter. When a user provides income + expenses, the LLM calculates `remaining = income - sum(expenses)` and adds it as a `{ label: "Remaining/Savings", value: remaining }` data point before calling the tool.

**Rendering:** The system prompt instructs the LLM to embed `chartUrl` as a markdown image (`![title](chartUrl)`), which `MarkdownProse` renders inline — no new UI code needed.

---

## Tool Input Validation

The `execute` signatures in the tool definitions above show the *intended shape* for readability. In the actual implementation, always accept `rawInput: Record<string, unknown>` and validate with Zod before destructuring:

```typescript
import { z } from "zod";

const GetStockQuoteInput = z.object({
  ticker: z.string().min(1).max(10).toUpperCase(),
});

execute: async (rawInput) => {
  const { ticker } = GetStockQuoteInput.parse(rawInput);
  // ...
}
```

This prevents GPT from passing malformed inputs that could cause unexpected behavior. A Zod parse failure throws a `ZodError`, which the orchestrator catches per-tool and returns as an error result without crashing the loop.

The `portfolio_summary` tool has a nested array input — its Zod schema is the most complex and most likely to receive a malformed payload from GPT:

```typescript
const HoldingSchema = z.object({
  ticker:   z.string().min(1),
  quantity: z.number().positive(),
  price:    z.number().nonnegative(),
});

const PortfolioSummaryInput = z.object({
  holdings: z.array(HoldingSchema).min(1),
});

execute: async (rawInput) => {
  const { holdings } = PortfolioSummaryInput.parse(rawInput);
  // ...
}
```

---

## Adding New Tools

1. Create or add to a tool file in `src/lib/tools/`
2. Define the `ToolDefinition` object with `name`, `description`, `parameters` (JSON Schema), and `execute`
3. Call `registry.register(definition)` inside a `registerXxxTools(registry)` function
4. Import and call that function in the registry singleton setup at the bottom of `src/lib/tools/registry.ts`

No other wiring is required — the orchestrator reads schemas from `registry.getSchemas()` dynamically on every request.
