# Spec 09 — Graph Tool

This specification defines the `generate_financial_graph` tool — a `ToolDefinition` registered in the project's `ToolRegistry` (see spec 04). It transforms financial data points provided by the LLM into a visual chart by constructing a [QuickChart.io](https://quickchart.io) URL. No new npm dependencies are required.

---

## 1. Overview

When a user asks to visualize financial data (e.g., "Show my budget as a pie chart"), the LLM parses the entities from the conversation, calculates any derived values (such as remaining income), and calls `generate_financial_graph` with the final `data_points`. The tool constructs a Chart.js-compatible config, encodes it into a QuickChart.io URL, and returns it. The LLM then embeds the URL as a markdown image in its text response, which `MarkdownProse` renders inline.

**No new npm dependencies.** Chart config construction is pure string/object manipulation; QuickChart.io is a free public API accessed entirely via URL construction (no fetch call from the tool).

---

## 2. Tool Definition

**File:** `src/lib/tools/graph.ts`

**Registered via:** `registerGraphTools(toolRegistry)` in `src/lib/tools/registry.ts`

### Input Schema

```typescript
{
  name: "generate_financial_graph",
  description: "Creates a visual chart (pie, bar, or line) from financial data points. Returns a chart image URL to display to the user.",
  parameters: {
    type: "object",
    properties: {
      title: {
        type: "string",
        description: "The title of the graph (e.g., 'Monthly Spending Breakdown')"
      },
      type: {
        type: "string",
        enum: ["pie", "bar", "line"],
        description: "The visual format of the graph."
      },
      data_points: {
        type: "array",
        items: {
          type: "object",
          properties: {
            label: { type: "string", description: "Category label, e.g. 'Groceries'" },
            value: { type: "number", description: "Numeric value, e.g. 1000" }
          },
          required: ["label", "value"]
        },
        description: "Array of data point objects with label and value."
      },
      unit: {
        type: "string",
        description: "Currency or unit symbol (e.g., '$' or 'USD'). Defaults to '$'."
      }
    },
    required: ["title", "type", "data_points"]
  }
}
```

### Zod Validation (inside `execute`)

```typescript
const DataPointSchema = z.object({
  label: z.string().min(1),
  value: z.number(),
});

const GenerateFinancialGraphInput = z.object({
  title: z.string().min(1),
  type: z.enum(["pie", "bar", "line"]),
  data_points: z.array(DataPointSchema).min(1),
  unit: z.string().default("$"),
});
```

### Return Shape

```typescript
{
  chartUrl: string;       // https://quickchart.io/chart?c=...&width=600&height=400
  title: string;
  chartType: "pie" | "bar" | "line";
  dataPoints: Array<{
    label: string;
    formattedValue: string;  // e.g. "$1,500" or "1,500 EUR"
  }>;
}
```

---

## 3. Implementation Details

### A. Chart URL Construction (QuickChart.io)

The tool builds a Chart.js v2-compatible config object and encodes it into a QuickChart.io GET URL. No network call is made from the tool itself — the URL is the artifact.

```typescript
const chartConfig = {
  type,  // "pie" | "bar" | "line"
  data: {
    labels: data_points.map((dp) => dp.label),
    datasets: [
      type === "pie"
        ? { data: data_points.map((dp) => dp.value) }
        : { label: title, data: data_points.map((dp) => dp.value), backgroundColor: "rgba(54, 162, 235, 0.5)" },
    ],
  },
  options: {
    title: { display: true, text: title },
    plugins: { legend: { position: "bottom" } },
  },
};

const chartUrl = `https://quickchart.io/chart?c=${encodeURIComponent(JSON.stringify(chartConfig))}&width=600&height=400`;
```

### B. Number Formatting

Values are formatted for readability using `toLocaleString("en-US")`:
- `unit === "$"` → `"$30,000"`
- Otherwise → `"30,000 EUR"`

### C. Remaining Income — LLM Responsibility

The tool does **not** have an `income` parameter. When a user provides income and expenses, the LLM is responsible for:

1. Identifying total income and individual expense amounts from the conversation
2. Calculating `remaining = income - sum(expenses)`
3. Adding `{ label: "Remaining/Savings", value: remaining }` to `data_points` before calling the tool

This is the correct design: the tool is pure data → chart URL transformation. Business logic (deriving remaining income) belongs in the LLM's reasoning step.

---

## 4. Integration Touchpoints

All of these changes are **required** for the tool to function end-to-end:

| File | Change |
|---|---|
| `src/lib/tools/graph.ts` | **Create** — tool implementation |
| `src/lib/tools/registry.ts` | Import and call `registerGraphTools(toolRegistry)` |
| `src/lib/chat/system-prompt.ts` | Add `generate_financial_graph` to `TOOL_DESCRIPTIONS`; add bullet to `IDENTITY_SECTION`; add chart-embedding instruction in `buildToolSection` |
| `src/components/ToolCallCard.tsx` | Add `generate_financial_graph: "Generated financial chart"` to `TOOL_LABELS` |
| `project_management/_specs/04-tool-system.md` | Add Graph Tools section |
| `project_management/_specs/06-prompts-and-config.md` | Update identity section bullet and tool description list |

---

## 5. Expected Workflow

**User:** "My income is 50k and I spend about 1k in groceries and 30k on mortgage. Show it in a pie graph."

**LLM reasoning (before tool call):**
- Income = 50,000; Groceries = 1,000; Mortgage = 30,000; Remaining = 19,000

**Tool call:**
```json
{
  "title": "Monthly Budget Breakdown",
  "type": "pie",
  "data_points": [
    { "label": "Groceries", "value": 1000 },
    { "label": "Mortgage", "value": 30000 },
    { "label": "Remaining/Savings", "value": 19000 }
  ],
  "unit": "$"
}
```

**Tool return:**
```json
{
  "chartUrl": "https://quickchart.io/chart?c=...&width=600&height=400",
  "title": "Monthly Budget Breakdown",
  "chartType": "pie",
  "dataPoints": [
    { "label": "Groceries", "formattedValue": "$1,000" },
    { "label": "Mortgage", "formattedValue": "$30,000" },
    { "label": "Remaining/Savings", "formattedValue": "$19,000" }
  ]
}
```

**LLM text response (instrumented by system prompt):**
```
Here is your monthly budget breakdown:
![Monthly Budget Breakdown](https://quickchart.io/chart?c=...&width=600&height=400)
- Groceries: $1,000
- Mortgage: $30,000
- Remaining/Savings: $19,000
```

**UI rendering:** The existing `MarkdownProse` component renders markdown images inline — no new UI code needed.

---

## 6. Success Criteria

- Tool correctly builds pie, bar, and line chart URLs
- Large numbers are formatted for readability (e.g., `$30,000` not `30000`)
- Zod validation rejects invalid chart types or non-numeric values (throws, caught by orchestrator per-tool error handling)
- `data_points` must have at least 1 entry (Zod `.min(1)`)
- Chart URL is a valid `https://quickchart.io/chart?c=...` URL
- LLM embeds the chart URL as a markdown image in its response (enforced via system prompt instruction)
- Chart renders inline in the chat window via `MarkdownProse` without any new UI components