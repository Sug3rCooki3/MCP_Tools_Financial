export function getOpenAiApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY is not set. Add it to .env.local");
  return key;
}

export function getOpenAiModel(): string {
  return process.env.OPENAI_MODEL ?? "gpt-4o";
}

export function getOpenAiRetryAttempts(): number {
  return Number(process.env.OPENAI_RETRY_ATTEMPTS ?? "2");
}

export function getOpenAiRetryDelayMs(): number {
  return Number(process.env.OPENAI_RETRY_DELAY_MS ?? "1000");
}

export function getOpenAiTimeoutMs(): number {
  return Number(process.env.OPENAI_TIMEOUT_MS ?? "30000");
}

export function getAlphaVantageApiKey(): string {
  return process.env.ALPHA_VANTAGE_API_KEY ?? "demo";
}

export function getDbPath(): string {
  return process.env.DB_PATH ?? "data/finance-chat.db";
}

export function getAuthSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set. Generate with: openssl rand -base64 32");
  return secret;
}

export function getAnonMessageLimit(): number {
  return Number(process.env.ANON_MESSAGE_LIMIT ?? "5");
}
