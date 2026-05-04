import type { DisplayMessage } from "./ChatSurface";
import MarkdownProse from "./MarkdownProse";
import ToolCallCard from "./ToolCallCard";

interface ChatMessageProps {
  message: DisplayMessage;
}

export default function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      data-role={message.role}
      data-testid={`message-${message.id}`}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
          isUser
            ? "bg-blue-600 text-white"
            : "bg-white border border-gray-200 text-gray-900"
        }`}
      >
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="mb-2 flex flex-col gap-1">
            {message.toolCalls.map((tc, i) => (
              <ToolCallCard key={i} name={tc.name} result={tc.result} />
            ))}
          </div>
        )}
        {isUser ? (
          <span className="whitespace-pre-wrap">{message.content}</span>
        ) : (
          <MarkdownProse content={message.content} />
        )}
        {message.isStreaming && (
          <span
            aria-hidden
            className="inline-block w-0.5 h-4 bg-gray-400 ml-0.5 animate-pulse"
          />
        )}
      </div>
    </div>
  );
}
