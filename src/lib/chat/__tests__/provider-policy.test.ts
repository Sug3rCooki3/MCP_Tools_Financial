import { describe, it, expect, vi, beforeEach } from "vitest";
import OpenAI from "openai";
import { isRetryable, withRetry } from "@/lib/chat/provider-policy";

describe("isRetryable", () => {
  it("returns true for RateLimitError", () => {
    const err = new OpenAI.RateLimitError(429, undefined, "rate limit", undefined as never);
    expect(isRetryable(err)).toBe(true);
  });

  it("returns true for InternalServerError", () => {
    const err = new OpenAI.InternalServerError(500, undefined, "server error", undefined as never);
    expect(isRetryable(err)).toBe(true);
  });

  it("returns true for APIConnectionError", () => {
    const err = new OpenAI.APIConnectionError({ message: "connection failed" });
    expect(isRetryable(err)).toBe(true);
  });

  it("returns true for APIConnectionTimeoutError", () => {
    const err = new OpenAI.APIConnectionTimeoutError();
    expect(isRetryable(err)).toBe(true);
  });

  it("returns false for AuthenticationError (401)", () => {
    const err = new OpenAI.AuthenticationError(401, undefined, "unauthorized", undefined as never);
    expect(isRetryable(err)).toBe(false);
  });

  it("returns false for BadRequestError (400)", () => {
    const err = new OpenAI.BadRequestError(400, undefined, "bad request", undefined as never);
    expect(isRetryable(err)).toBe(false);
  });

  it("returns false for plain Error", () => {
    expect(isRetryable(new Error("something"))).toBe(false);
  });
});

describe("withRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("returns immediately on success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn);
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("rethrows a non-retryable error immediately without retrying", async () => {
    const err = new OpenAI.AuthenticationError(401, undefined, "unauthorized", undefined as never);
    const fn = vi.fn().mockRejectedValue(err);
    await expect(withRetry(fn)).rejects.toThrow();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on a retryable error and succeeds", async () => {
    const rateLimitErr = new OpenAI.RateLimitError(429, undefined, "rate limit", undefined as never);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitErr)
      .mockResolvedValue("ok");

    const promise = withRetry(fn);
    // advance timers to skip delay
    await vi.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
