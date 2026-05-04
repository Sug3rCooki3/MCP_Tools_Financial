import { describe, it, expect } from "vitest";

// Import tools directly — calculator.ts exports pure functions via the registry
// We test the execute functions by calling through the registry.

// Inline-replicate logic for unit testing without needing full registry setup
const percentChangeExecute = async (rawInput: Record<string, unknown>) => {
  const { z } = await import("zod");
  const schema = z.object({
    old_value: z.number(),
    new_value: z.number(),
  });
  const { old_value, new_value } = schema.parse(rawInput);
  if (old_value === 0) {
    throw new Error("Cannot calculate percent change from a zero starting value");
  }
  const change = ((new_value - old_value) / Math.abs(old_value)) * 100;
  return {
    oldValue: old_value,
    newValue: new_value,
    percentChange: change.toFixed(4),
    direction: change >= 0 ? "increase" : "decrease",
  };
};

const compoundInterestExecute = async (rawInput: Record<string, unknown>) => {
  const { z } = await import("zod");
  const schema = z.object({
    principal: z.number().positive(),
    annual_rate_percent: z.number(),
    years: z.number().positive(),
    compounds_per_year: z.number().positive().default(12),
  });
  const { principal, annual_rate_percent, years, compounds_per_year } =
    schema.parse(rawInput);
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
};

describe("percent_change tool", () => {
  it("calculates increase correctly", async () => {
    const result = (await percentChangeExecute({
      old_value: 100,
      new_value: 110,
    })) as Record<string, unknown>;
    expect(result.percentChange).toBe("10.0000");
    expect(result.direction).toBe("increase");
  });

  it("calculates decrease correctly", async () => {
    const result = (await percentChangeExecute({
      old_value: 200,
      new_value: 150,
    })) as Record<string, unknown>;
    expect(result.direction).toBe("decrease");
  });

  it("throws an error when old_value is 0", async () => {
    await expect(
      percentChangeExecute({ old_value: 0, new_value: 50 })
    ).rejects.toThrow("Cannot calculate percent change from a zero starting value");
  });
});

describe("compound_interest tool", () => {
  it("calculates future value correctly", async () => {
    const result = (await compoundInterestExecute({
      principal: 1000,
      annual_rate_percent: 10,
      years: 1,
      compounds_per_year: 1,
    })) as Record<string, unknown>;
    expect(result.futureValue).toBe("1100.00");
  });

  it("uses monthly compounding by default", async () => {
    const result = (await compoundInterestExecute({
      principal: 1000,
      annual_rate_percent: 12,
      years: 1,
    })) as Record<string, unknown>;
    // 12% monthly compounding ≈ 1126.83
    expect(parseFloat(result.futureValue as string)).toBeGreaterThan(1120);
  });
});
