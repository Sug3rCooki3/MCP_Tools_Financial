import { z } from "zod";
import type { ToolRegistry } from "./registry";

// --- Input schemas ---

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

// --- Helpers ---

function formatValue(value: number, unit: string): string {
  const formatted = value.toLocaleString("en-US");
  return unit === "$" ? `$${formatted}` : `${formatted} ${unit}`;
}

// --- Tool implementation ---

async function generateFinancialGraph(
  rawInput: Record<string, unknown>
): Promise<unknown> {
  const { title, type, data_points, unit } =
    GenerateFinancialGraphInput.parse(rawInput);

  const labels = data_points.map((dp) => dp.label);
  const values = data_points.map((dp) => dp.value);

  const dataset =
    type === "pie"
      ? { data: values }
      : {
          label: title,
          data: values,
          backgroundColor: "rgba(54, 162, 235, 0.5)",
        };

  const chartConfig = {
    type,
    data: {
      labels,
      datasets: [dataset],
    },
    options: {
      title: { display: true, text: title },
      plugins: { legend: { position: "bottom" } },
    },
  };

  const encodedConfig = encodeURIComponent(JSON.stringify(chartConfig));
  const chartUrl = `https://quickchart.io/chart?c=${encodedConfig}&width=600&height=400`;

  return {
    chartUrl,
    title,
    chartType: type,
    dataPoints: data_points.map((dp) => ({
      label: dp.label,
      formattedValue: formatValue(dp.value, unit),
    })),
  };
}

// --- Registration ---

export function registerGraphTools(registry: ToolRegistry): void {
  registry.register({
    name: "generate_financial_graph",
    description:
      "Creates a visual chart (pie, bar, or line) from financial data points. Returns a chart image URL to display to the user.",
    parameters: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description:
            "The title of the graph (e.g., 'Monthly Spending Breakdown')",
        },
        type: {
          type: "string",
          enum: ["pie", "bar", "line"],
          description: "The visual format of the graph.",
        },
        data_points: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                description: "Category label, e.g. 'Groceries'",
              },
              value: {
                type: "number",
                description: "Numeric value, e.g. 1000",
              },
            },
            required: ["label", "value"],
          },
          description: "Array of data point objects with label and value.",
        },
        unit: {
          type: "string",
          description:
            "Currency or unit symbol (e.g., '$' or 'USD'). Defaults to '$'.",
        },
      },
      required: ["title", "type", "data_points"],
    },
    execute: generateFinancialGraph,
  });
}
