import { z } from "zod";
import { getAlphaVantageApiKey } from "../config/env";
import type { ToolRegistry } from "./registry";

const BASE_URL = "https://www.alphavantage.co/query";

const GetFxRateInput = z.object({
  from_currency: z.string().min(1).max(10).toUpperCase(),
  to_currency: z.string().min(1).max(10).toUpperCase(),
});

async function getFxRate(rawInput: Record<string, unknown>): Promise<unknown> {
  const { from_currency, to_currency } = GetFxRateInput.parse(rawInput);
  const key = getAlphaVantageApiKey();
  const url =
    `${BASE_URL}?function=CURRENCY_EXCHANGE_RATE` +
    `&from_currency=${encodeURIComponent(from_currency)}` +
    `&to_currency=${encodeURIComponent(to_currency)}` +
    `&apikey=${key}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) throw new Error(`Alpha Vantage request failed: ${res.status}`);
  const json = (await res.json()) as Record<string, unknown>;
  const rate = json["Realtime Currency Exchange Rate"] as
    | Record<string, string>
    | undefined;
  if (!rate || !rate["5. Exchange Rate"]) {
    throw new Error(
      `No exchange rate data found for ${from_currency}/${to_currency}`
    );
  }
  return {
    fromCurrency: rate["1. From_Currency Code"],
    toCurrency: rate["3. To_Currency Code"],
    exchangeRate: rate["5. Exchange Rate"],
    lastRefreshed: rate["6. Last Refreshed"],
  };
}

export function registerFxTools(registry: ToolRegistry): void {
  registry.register({
    name: "get_fx_rate",
    description: "Get the current exchange rate between two currencies.",
    parameters: {
      type: "object",
      properties: {
        from_currency: {
          type: "string",
          description: "Source currency code, e.g. USD, EUR, GBP",
        },
        to_currency: {
          type: "string",
          description: "Target currency code, e.g. JPY, CAD, CHF",
        },
      },
      required: ["from_currency", "to_currency"],
    },
    execute: getFxRate,
  });
}
