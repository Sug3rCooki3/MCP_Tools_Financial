import { useRef, useEffect } from "react";
import type { DisplayMessage } from "./ChatSurface";
import ChatMessage from "./ChatMessage";

interface MessageListProps {
  messages: DisplayMessage[];
}

export default function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const bottom = bottomRef.current;
    if (!container || !bottom) return;
    const { scrollTop, clientHeight, scrollHeight } = container;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 50;
    if (isNearBottom) {
      bottom.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  return (
    <div
      ref={containerRef}
      data-testid="message-list"
      className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
    >
      {messages.map((msg) => (
        <ChatMessage key={msg.id} message={msg} />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
