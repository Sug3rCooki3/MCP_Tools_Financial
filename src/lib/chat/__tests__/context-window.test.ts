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

  it("returns empty array for empty input", () => {
    expect(normalizeAlternation([])).toEqual([]);
  });
});
