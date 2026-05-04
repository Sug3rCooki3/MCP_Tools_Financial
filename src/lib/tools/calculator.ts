import { z } from "zod";
import type { ToolRegistry } from "./registry";

// --- Input schemas ---

const CompoundInterestInput = z.object({
  principal: z.number().positive(),
  annual_rate_percent: z.number(),
  years: z.number().positive(),
  compounds_per_year: z.number().positive().default(12),
});

const SimpleInterestInput = z.object({
  principal: z.number().positive(),
  annual_rate_percent: z.number(),
  years: z.number().positive(),
});

const PercentChangeInput = z.object({
  old_value: z.number(),
  new_value: z.number(),
});

const HoldingSchema = z.object({
  ticker: z.string().min(1),
  quantity: z.number().positive(),
  price: z.number().nonnegative(),
});

const PortfolioSummaryInput = z.object({
  holdings: z.array(HoldingSchema).min(1),
});

// --- Tool implementations ---

async function compoundInterest(rawInput: Record<string, unknown>): Promise<unknown> {
  const { principal, annual_rate_percent, years, compounds_per_year } =
    CompoundInterestInput.parse(rawInput);
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

async function simpleInterest(rawInput: Record<string, unknown>): Promise<unknown> {
  const { principal, annual_rate_percent, years } = SimpleInterestInput.parse(rawInput);
  const interest = principal * (annual_rate_percent / 100) * years;
  return {
    principal,
    interest: interest.toFixed(2),
    total: (principal + interest).toFixed(2),
    years,
    annualRatePercent: annual_rate_percent,
  };
}

async function percentChange(rawInput: Record<string, unknown>): Promise<unknown> {
  const { old_value, new_value } = PercentChangeInput.parse(rawInput);
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
}

async function portfolioSummary(rawInput: Record<string, unknown>): Promise<unknown> {
  const { holdings } = PortfolioSummaryInput.parse(rawInput);
  const rows = holdings.map((h) => ({
    ticker: h.ticker,
    quantity: h.quantity,
    price: h.price,
    value: (h.quantity * h.price).toFixed(2),
  }));
  const total = rows.reduce((sum, r) => sum + parseFloat(r.value), 0);
  return { holdings: rows, totalValue: total.toFixed(2) };
}

// --- Registration ---

export function registerCalculatorTools(registry: ToolRegistry): void {
  registry.register({
    name: "compound_interest",
    description:
      "Calculate the future value of an investment with compound interest.",
    parameters: {
      type: "object",
      properties: {
        principal: {
          type: "number",
          description: "Initial investment amount in dollars",
        },
        annual_rate_percent: {
          type: "number",
          description: "Annual interest rate as a percentage, e.g. 5 for 5%",
        },
        years: { type: "number", description: "Number of years" },
        compounds_per_year: {
          type: "number",
          description:
            "How many times interest compounds per year. Default 12 (monthly)",
        },
      },
      required: ["principal", "annual_rate_percent", "years"],
    },
    execute: compoundInterest,
  });

  registry.register({
    name: "simple_interest",
    description: "Calculate simple interest on a principal amount.",
    parameters: {
      type: "object",
      properties: {
        principal: {
          type: "number",
          description: "Principal amount in dollars",
        },
        annual_rate_percent: {
          type: "number",
          description: "Annual interest rate as a percentage",
        },
        years: { type: "number", description: "Number of years" },
      },
      required: ["principal", "annual_rate_percent", "years"],
    },
    execute: simpleInterest,
  });

  registry.register({
    name: "percent_change",
    description:
      "Calculate the percentage change between an old value and a new value.",
    parameters: {
      type: "object",
      properties: {
        old_value: {
          type: "number",
          description: "The original/starting value",
        },
        new_value: {
          type: "number",
          description: "The new/ending value",
        },
      },
      required: ["old_value", "new_value"],
    },
    execute: percentChange,
  });

  registry.register({
    name: "portfolio_summary",
    description:
      "Calculate the total value of a portfolio given a list of holdings.",
    parameters: {
      type: "object",
      properties: {
        holdings: {
          type: "array",
          description: "Array of holdings",
          items: {
            type: "object",
            properties: {
              ticker: { type: "string", description: "Ticker symbol" },
              quantity: {
                type: "number",
                description: "Number of shares",
              },
              price: {
                type: "number",
                description: "Current price per share in dollars",
              },
            },
            required: ["ticker", "quantity", "price"],
          },
        },
      },
      required: ["holdings"],
    },
    execute: portfolioSummary,
  });
}
