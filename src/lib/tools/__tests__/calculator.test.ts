import { describe, it, expect } from "vitest";
import { toolRegistry } from "@/lib/tools/registry";

describe("percent_change tool", () => {
  it("calculates increase correctly", async () => {
    const result = (await toolRegistry.execute("percent_change", {
      old_value: 100,
      new_value: 110,
    })) as Record<string, unknown>;
    expect(result.percentChange).toBe("10.0000");
    expect(result.direction).toBe("increase");
  });

  it("calculates decrease correctly", async () => {
    const result = (await toolRegistry.execute("percent_change", {
      old_value: 200,
      new_value: 150,
    })) as Record<string, unknown>;
    expect(result.direction).toBe("decrease");
  });

  it("throws when old_value is 0", async () => {
    await expect(
      toolRegistry.execute("percent_change", { old_value: 0, new_value: 50 })
    ).rejects.toThrow("Cannot calculate percent change from a zero starting value");
  });
});

describe("compound_interest tool", () => {
  it("calculates future value correctly", async () => {
    const result = (await toolRegistry.execute("compound_interest", {
      principal: 1000,
      annual_rate_percent: 10,
      years: 1,
      compounds_per_year: 1,
    })) as Record<string, unknown>;
    expect(result.futureValue).toBe("1100.00");
  });

  it("uses monthly compounding by default", async () => {
    const result = (await toolRegistry.execute("compound_interest", {
      principal: 1000,
      annual_rate_percent: 12,
      years: 1,
    })) as Record<string, unknown>;
    // 12% monthly compounding ≈ 1126.83
    expect(parseFloat(result.futureValue as string)).toBeGreaterThan(1120);
  });
});

describe("simple_interest tool", () => {
  it("calculates correctly", async () => {
    const result = (await toolRegistry.execute("simple_interest", {
      principal: 1000,
      annual_rate_percent: 5,
      years: 2,
    })) as Record<string, unknown>;
    expect(result.interest).toBe("100.00");
    expect(result.total).toBe("1100.00");
  });
});

describe("portfolio_summary tool", () => {
  it("sums holdings correctly", async () => {
    const result = (await toolRegistry.execute("portfolio_summary", {
      holdings: [
        { ticker: "AAPL", quantity: 10, price: 100 },
        { ticker: "MSFT", quantity: 5, price: 200 },
      ],
    })) as Record<string, unknown>;
    expect(result.totalValue).toBe("2000.00");
  });
});
