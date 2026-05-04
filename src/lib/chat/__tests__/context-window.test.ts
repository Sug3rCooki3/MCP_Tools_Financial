import { describe, it, expect } from "vitest";
import { trimToLimits, normalizeAlternation } from "@/lib/chat/context-window";

describe("trimToLimits", () => {
  it("returns messages unchanged when under limits", () => {
    const msgs = [
      { role: "user" as const, content: "Hi" },
      { role: "assistant" as const, content: "Hello" },
    ];
    expect(trimToLimits(msgs)).toEqual(msgs);
  });

  it("always starts with a user message after trim", () => {
    const msgs = [
      { role: "assistant" as const, content: "a" },
      { role: "user" as const, content: "b" },
      { role: "assistant" as const, content: "c" },
    ];
    const result = trimToLimits(msgs);
    expect(result[0].role).toBe("user");
  });

  it("preserves at least the most recent message", () => {
    const msgs = [{ role: "user" as const, content: "only" }];
    expect(trimToLimits(msgs)).toHaveLength(1);
  });

  it("trims oldest messages when over MAX_CONTEXT_MESSAGES", () => {
    // Build 42 alternating messages (over the 40 limit)
    const msgs = Array.from({ length: 42 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      content: `msg ${i}`,
    }));
    const result = trimToLimits(msgs);
    expect(result.length).toBeLessThanOrEqual(40);
  });

  it("trims oldest messages when over MAX_CONTEXT_CHARACTERS", () => {
    // Two huge messages + one small user message
    const big = "x".repeat(50_000);
    const msgs = [
      { role: "user" as const, content: big },
      { role: "assistant" as const, content: big },
      { role: "user" as const, content: "small" },
    ];
    const result = trimToLimits(msgs);
    const totalChars = result.reduce((n, m) => n + m.content.length, 0);
    expect(totalChars).toBeLessThanOrEqual(80_000);
  });

  it("always keeps the most recent message even if it alone exceeds character budget", () => {
    const huge = "x".repeat(100_000); // exceeds MAX_CONTEXT_CHARACTERS alone
    const msgs = [{ role: "user" as const, content: huge }];
    const result = trimToLimits(msgs);
    expect(result).toHaveLength(1);
    expect(result[0].content).toBe(huge);
  });
});

describe("normalizeAlternation", () => {
  it("merges consecutive same-role messages", () => {
    const msgs = [
      { role: "user" as const, content: "a" },
      { role: "user" as const, content: "b" },
      { role: "assistant" as const, content: "c" },
    ];
    const result = normalizeAlternation(msgs);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("a\n\nb");
  });

  it("merges consecutive assistant messages into one", () => {
    const msgs = [
      { role: "user" as const, content: "q" },
      { role: "assistant" as const, content: "a1" },
      { role: "assistant" as const, content: "a2" },
    ];
    const result = normalizeAlternation(msgs);
    expect(result).toHaveLength(2);
    expect(result[1].content).toBe("a1\n\na2");
  });

  it("leaves correctly alternating messages unchanged", () => {
    const msgs = [
      { role: "user" as const, content: "hi" },
      { role: "assistant" as const, content: "hello" },
      { role: "user" as const, content: "bye" },
    ];
    expect(normalizeAlternation(msgs)).toHaveLength(3);
  });

  it("returns empty array for empty input", () => {
    expect(normalizeAlternation([])).toEqual([]);
  });
});
