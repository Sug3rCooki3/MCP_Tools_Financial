// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatInput from "@/components/ChatInput";

describe("ChatInput", () => {
  it("calls onSend with the message text on Enter key", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} disabled={false} />);
    const textarea = screen.getByTestId("chat-input");
    await userEvent.type(textarea, "Hello world");
    await userEvent.keyboard("{Enter}");
    expect(onSend).toHaveBeenCalledWith("Hello world");
  });

  it("does not call onSend on empty input", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} disabled={false} />);
    const textarea = screen.getByTestId("chat-input");
    await userEvent.click(textarea);
    await userEvent.keyboard("{Enter}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("clears the textarea after sending", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} disabled={false} />);
    const textarea = screen.getByTestId("chat-input") as HTMLTextAreaElement;
    await userEvent.type(textarea, "test message");
    await userEvent.keyboard("{Enter}");
    expect(textarea.value).toBe("");
  });

  it("inserts a newline on Shift+Enter instead of sending", async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} disabled={false} />);
    const textarea = screen.getByTestId("chat-input") as HTMLTextAreaElement;
    await userEvent.type(textarea, "line1");
    await userEvent.keyboard("{Shift>}{Enter}{/Shift}");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disables the textarea and button when disabled=true", () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} disabled={true} />);
    const textarea = screen.getByTestId("chat-input");
    const button = screen.getByRole("button", { name: /send/i });
    expect(textarea).toBeDisabled();
    expect(button).toBeDisabled();
  });
});
