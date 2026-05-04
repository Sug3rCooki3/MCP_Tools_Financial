import {
  MAX_CONTEXT_MESSAGES,
  MAX_CONTEXT_CHARACTERS,
} from "./chat-config";

export interface ContextMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Trims oldest messages to stay within the configured message count and
 * character budget. Always keeps at least the most recent message.
 * After trimming, ensures the window starts with a user message (OpenAI requirement).
 */
export function trimToLimits(messages: ContextMessage[]): ContextMessage[] {
  let result = [...messages];

  // Trim by message count
  while (result.length > MAX_CONTEXT_MESSAGES) {
    result = result.slice(1);
  }

  // Trim by character count
  while (result.length > 1) {
    const total = result.reduce((n, m) => n + m.content.length, 0);
    if (total <= MAX_CONTEXT_CHARACTERS) break;
    result = result.slice(1);
  }

  // Ensure the window starts with a user message
  while (result.length > 0 && result[0].role !== "user") {
    result = result.slice(1);
  }

  return result;
}

/**
 * Merges consecutive same-role messages into one.
 * OpenAI requires strictly alternating user/assistant turns.
 */
export function normalizeAlternation(
  messages: ContextMessage[]
): ContextMessage[] {
  if (messages.length === 0) return [];

  const result: ContextMessage[] = [];
  for (const msg of messages) {
    const last = result[result.length - 1];
    if (last && last.role === msg.role) {
      last.content += "\n\n" + msg.content;
    } else {
      result.push({ ...msg });
    }
  }
  return result;
}
