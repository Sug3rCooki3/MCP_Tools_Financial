import { z } from "zod";
import { getAlphaVantageApiKey } from "../config/env";
import type { ToolRegistry } from "./registry";

const BASE_URL = "https://www.alphavantage.co/query";

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

// --- Input schemas ---

const GetStockQuoteInput = z.object({
  ticker: z.string().min(1).max(10).toUpperCase(),
});

const GetCompanyOverviewInput = z.object({
  ticker: z.string().min(1).max(10).toUpperCase(),
});

const SearchTickerInput = z.object({
  keywords: z.string().min(1).max(200),
});

// --- Tool implementations ---

async function getStockQuote(rawInput: Record<string, unknown>): Promise<unknown> {
  const { ticker } = GetStockQuoteInput.parse(rawInput);
  const key = getAlphaVantageApiKey();
  const url = `${BASE_URL}?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${key}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Alpha Vantage request failed: ${res.status}`);
  const json = (await res.json()) as Record<string, unknown>;
  const quote = json["Global Quote"] as Record<string, string> | undefined;
  if (!quote || !quote["05. price"]) {
    throw new Error(`No quote data found for ticker "${ticker}"`);
  }
  return {
    ticker,
    price: quote["05. price"],
    change: quote["09. change"],
    changePercent: quote["10. change percent"],
    volume: quote["06. volume"],
    latestTradingDay: quote["07. latest trading day"],
  };
}

async function getCompanyOverview(rawInput: Record<string, unknown>): Promise<unknown> {
  const { ticker } = GetCompanyOverviewInput.parse(rawInput);
  const key = getAlphaVantageApiKey();
  const url = `${BASE_URL}?function=OVERVIEW&symbol=${encodeURIComponent(ticker)}&apikey=${key}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Alpha Vantage request failed: ${res.status}`);
  const json = (await res.json()) as Record<string, string>;
  if (!json["Symbol"]) {
    throw new Error(`No overview data found for ticker "${ticker}"`);
  }
  return {
    ticker,
    name: json["Name"],
    sector: json["Sector"],
    industry: json["Industry"],
    marketCap: json["MarketCapitalization"],
    peRatio: json["PERatio"],
    eps: json["EPS"],
    dividendYield: json["DividendYield"],
    weekHigh52: json["52WeekHigh"],
    weekLow52: json["52WeekLow"],
  };
}

async function searchTicker(rawInput: Record<string, unknown>): Promise<unknown> {
  const { keywords } = SearchTickerInput.parse(rawInput);
  const key = getAlphaVantageApiKey();
  const url = `${BASE_URL}?function=SYMBOL_SEARCH&keywords=${encodeURIComponent(keywords)}&apikey=${key}`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Alpha Vantage request failed: ${res.status}`);
  const json = (await res.json()) as { bestMatches?: Record<string, string>[] };
  const matches = json.bestMatches ?? [];
  return matches.map((m) => ({
    symbol: m["1. symbol"],
    name: m["2. name"],
    type: m["3. type"],
    region: m["4. region"],
    currency: m["8. currency"],
  }));
}

// --- Registration ---

export function registerMarketDataTools(registry: ToolRegistry): void {
  registry.register({
    name: "get_stock_quote",
    description:
      "Get the current stock price, daily change, and trading volume for a ticker symbol.",
    parameters: {
      type: "object",
      properties: {
        ticker: {
          type: "string",
          description: "The stock ticker symbol, e.g. AAPL, MSFT, TSLA",
        },
      },
      required: ["ticker"],
    },
    execute: getStockQuote,
  });

  registry.register({
    name: "get_company_overview",
    description:
      "Get fundamental company data including sector, market cap, P/E ratio, and EPS for a ticker.",
    parameters: {
      type: "object",
      properties: {
        ticker: { type: "string", description: "The stock ticker symbol" },
      },
      required: ["ticker"],
    },
    execute: getCompanyOverview,
  });

  registry.register({
    name: "search_ticker",
    description: "Search for a stock ticker symbol by company name or keywords.",
    parameters: {
      type: "object",
      properties: {
        keywords: {
          type: "string",
          description:
            "Company name or search terms, e.g. 'Apple' or 'electric vehicles'",
        },
      },
      required: ["keywords"],
    },
    execute: searchTicker,
  });
}
