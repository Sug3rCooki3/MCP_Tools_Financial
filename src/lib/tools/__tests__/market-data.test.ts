import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { toolRegistry } from "@/lib/tools/registry";

// Mock fetch globally — we don't want real network calls in unit tests
const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

function mockAlphaVantageResponse(body: unknown): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => body,
  });
}

describe("get_stock_quote input validation", () => {
  it("accepts a valid uppercase ticker", async () => {
    mockAlphaVantageResponse({
      "Global Quote": {
        "05. price": "189.42",
        "09. change": "+1.23",
        "10. change percent": "+0.65%",
        "06. volume": "54321000",
        "07. latest trading day": "2026-04-29",
      },
    });
    const result = (await toolRegistry.execute("get_stock_quote", { ticker: "AAPL" })) as Record<string, string>;
    expect(result.ticker).toBe("AAPL");
    expect(result.price).toBe("189.42");
  });

  it("uppercases a lowercase ticker", async () => {
    mockAlphaVantageResponse({
      "Global Quote": {
        "05. price": "100.00",
        "09. change": "0",
        "10. change percent": "0%",
        "06. volume": "1000",
        "07. latest trading day": "2026-04-29",
      },
    });
    const result = (await toolRegistry.execute("get_stock_quote", { ticker: "aapl" })) as Record<string, string>;
    expect(result.ticker).toBe("AAPL");
  });

  it("throws ZodError for empty string ticker", async () => {
    await expect(
      toolRegistry.execute("get_stock_quote", { ticker: "" })
    ).rejects.toThrow();
  });

  it("throws ZodError for ticker over 10 characters", async () => {
    await expect(
      toolRegistry.execute("get_stock_quote", { ticker: "TOOLONGNAME" })
    ).rejects.toThrow();
  });
});
