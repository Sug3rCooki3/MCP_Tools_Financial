"use client";

import { useState } from "react";
import ChatHeader from "./ChatHeader";
import MessageList from "./MessageList";
import ChatInput from "./ChatInput";
import ErrorBoundary from "./ErrorBoundary";
import { useChatStream } from "@/hooks/useChatStream";

function newId() {
  return globalThis.crypto.randomUUID();
}

export interface ToolCallSummary {
  name: string;
  result?: string;
}

export interface DisplayMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  isStreaming?: boolean;
  toolCalls?: ToolCallSummary[];
}

interface InitialPrompts {
  appName: string;
  firstMessage: string;
  inputPlaceholder: string;
  suggestions: string[];
}

interface ChatSurfaceProps {
  initialPrompts: InitialPrompts;
}

export default function ChatSurface({ initialPrompts }: ChatSurfaceProps) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { send } = useChatStream({
    onDelta: (chunk) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last || last.role !== "assistant") return prev;
        return [
          ...prev.slice(0, -1),
          { ...last, content: last.content + chunk },
        ];
      });
    },
    onDone: (convId) => {
      setIsStreaming(false);
      setConversationId(convId);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (!last) return prev;
        return [...prev.slice(0, -1), { ...last, isStreaming: false }];
      });
    },
    onError: (message) => {
      setIsStreaming(false);
      setError(message);
      // Remove incomplete assistant placeholder
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.isStreaming) {
          return prev.slice(0, -1);
        }
        return prev;
      });
    },
  });

  const handleSend = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    setError(null);
    const userMsg: DisplayMessage = {
      id: newId(),
      role: "user",
      content: text.trim(),
    };
    const assistantPlaceholder: DisplayMessage = {
      id: newId(),
      role: "assistant",
      content: "",
      isStreaming: true,
    };

    const updatedMessages = [...messages, userMsg];
    setMessages([...updatedMessages, assistantPlaceholder]);
    setIsStreaming(true);

    await send(updatedMessages, conversationId);
  };

  const handleNewChat = () => {
    setMessages([]);
    setConversationId(null);
    setError(null);
    setIsStreaming(false);
  };

  const isEmpty = messages.length === 0;

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen">
        <ChatHeader appName={initialPrompts.appName} onNewChat={handleNewChat} />
        <div className="flex-1 overflow-hidden flex flex-col">
          {isEmpty ? (
            <div className="flex-1 flex flex-col items-center justify-center p-8 gap-6">
              <p className="text-gray-500 text-center max-w-md">
                {initialPrompts.firstMessage}
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {initialPrompts.suggestions.map((s) => (
                  <button
                    key={s}
                    data-testid="suggestion-chip"
                    className="px-4 py-2 bg-white border border-gray-200 rounded-full text-sm text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
                    onClick={() => handleSend(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <MessageList messages={messages} />
          )}
          {error && (
            <div
              role="alert"
              className="mx-4 mb-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700"
            >
              {error}
            </div>
          )}
          <ChatInput
            onSend={handleSend}
            disabled={isStreaming}
            placeholder={initialPrompts.inputPlaceholder}
          />
        </div>
      </div>
    </ErrorBoundary>
  );
}
