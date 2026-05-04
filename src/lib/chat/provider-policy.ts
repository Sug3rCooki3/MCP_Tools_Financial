import OpenAI from "openai";
import {
  getOpenAiRetryAttempts,
  getOpenAiRetryDelayMs,
} from "../config/env";

export function isRetryable(err: unknown): boolean {
  if (err instanceof OpenAI.RateLimitError) return true;
  if (err instanceof OpenAI.InternalServerError) return true;
  if (err instanceof OpenAI.APIConnectionError) return true;
  if (err instanceof OpenAI.APIConnectionTimeoutError) return true;
  return false;
}

export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  const maxAttempts = getOpenAiRetryAttempts() + 1;
  const delayMs = getOpenAiRetryDelayMs();
  let lastErr: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === maxAttempts - 1) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw lastErr;
}
