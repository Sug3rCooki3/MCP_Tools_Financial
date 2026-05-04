import { describe, it, expect } from "vitest";
import { toolRegistry } from "../registry";

describe("generate_financial_graph", () => {
  it("returns a QuickChart URL for a pie chart", async () => {
    const result = (await toolRegistry.execute("generate_financial_graph", {
      title: "Monthly Budget",
      type: "pie",
      data_points: [
        { label: "Groceries", value: 1000 },
        { label: "Mortgage", value: 30000 },
        { label: "Remaining/Savings", value: 19000 },
      ],
    })) as { chartUrl: string; chartType: string; title: string };

    expect(result.chartUrl).toMatch(/^https:\/\/quickchart\.io\/chart\?c=/);
    expect(result.chartType).toBe("pie");
    expect(result.title).toBe("Monthly Budget");
  });

  it("returns a QuickChart URL for a bar chart", async () => {
    const result = (await toolRegistry.execute("generate_financial_graph", {
      title: "Income vs Expenses",
      type: "bar",
      data_points: [
        { label: "Income", value: 5000 },
        { label: "Expenses", value: 3000 },
      ],
    })) as { chartUrl: string; chartType: string };

    expect(result.chartUrl).toMatch(/quickchart\.io/);
    expect(result.chartType).toBe("bar");
  });

  it("formats dollar values with commas and $ prefix", async () => {
    const result = (await toolRegistry.execute("generate_financial_graph", {
      title: "Budget",
      type: "pie",
      data_points: [{ label: "Food", value: 1500 }],
      unit: "$",
    })) as { dataPoints: Array<{ label: string; formattedValue: string }> };

    expect(result.dataPoints[0].formattedValue).toBe("$1,500");
  });

  it("formats non-dollar units without $ prefix", async () => {
    const result = (await toolRegistry.execute("generate_financial_graph", {
      title: "Currency",
      type: "bar",
      data_points: [{ label: "EUR", value: 2000 }],
      unit: "EUR",
    })) as { dataPoints: Array<{ label: string; formattedValue: string }> };

    expect(result.dataPoints[0].formattedValue).toBe("2,000 EUR");
  });

  it("throws on invalid chart type", async () => {
    await expect(
      toolRegistry.execute("generate_financial_graph", {
        title: "Test",
        type: "scatter",
        data_points: [{ label: "X", value: 1 }],
      })
    ).rejects.toThrow();
  });

  it("throws when data_points is empty", async () => {
    await expect(
      toolRegistry.execute("generate_financial_graph", {
        title: "Test",
        type: "pie",
        data_points: [],
      })
    ).rejects.toThrow();
  });

  it("includes encoded chart config in the URL", async () => {
    const result = (await toolRegistry.execute("generate_financial_graph", {
      title: "Test Chart",
      type: "line",
      data_points: [{ label: "Q1", value: 100 }],
    })) as { chartUrl: string };

    const url = new URL(result.chartUrl);
    const cParam = url.searchParams.get("c");
    expect(cParam).not.toBeNull();
    const config = JSON.parse(cParam!);
    expect(config.type).toBe("line");
    expect(config.data.labels).toEqual(["Q1"]);
  });
});
