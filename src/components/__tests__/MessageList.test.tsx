// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MessageList from "@/components/MessageList";
import type { DisplayMessage } from "@/components/ChatSurface";

function msg(overrides: Partial<DisplayMessage> & { role: "user" | "assistant" }): DisplayMessage {
  return {
    id: Math.random().toString(36).slice(2),
    content: "Hello",
    ...overrides,
  };
}

describe("MessageList", () => {
  it("renders all messages", () => {
    const messages = [
      msg({ role: "user", content: "What is AAPL?" }),
      msg({ role: "assistant", content: "AAPL is $189." }),
    ];
    render(<MessageList messages={messages} />);
    expect(screen.getByText("What is AAPL?")).toBeInTheDocument();
    expect(screen.getByText("AAPL is $189.")).toBeInTheDocument();
  });

  it("renders user messages without markdown processing", () => {
    const messages = [msg({ role: "user", content: "**bold text**" })];
    render(<MessageList messages={messages} />);
    // Should appear as literal text, not rendered <strong>
    expect(screen.getByText("**bold text**")).toBeInTheDocument();
  });

  it("renders assistant messages with markdown (bold)", () => {
    const messages = [msg({ role: "assistant", content: "**bold text**" })];
    render(<MessageList messages={messages} />);
    // react-markdown renders **bold** as a <strong> element
    expect(screen.getByRole("strong")).toBeInTheDocument();
  });

  it("shows a streaming cursor when isStreaming=true", () => {
    const messages = [msg({ role: "assistant", content: "thinking...", isStreaming: true })];
    const { container } = render(<MessageList messages={messages} />);
    // The streaming cursor is an aria-hidden span with animate-pulse class
    const cursor = container.querySelector(".animate-pulse");
    expect(cursor).not.toBeNull();
  });
});
