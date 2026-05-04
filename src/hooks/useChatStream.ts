import type { DisplayMessage } from "@/components/ChatSurface";

interface UseChatStreamOptions {
  onDelta: (chunk: string) => void;
  onDone: (conversationId: string) => void;
  onError: (message: string) => void;
}

export function useChatStream(options: UseChatStreamOptions) {
  const send = async (
    messages: DisplayMessage[],
    conversationId: string | null
  ) => {
    // Strip UI-only fields — API only accepts { role, content }[]
    const apiMessages = messages.map(({ role, content }) => ({ role, content }));

    let response: Response;
    try {
      response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        messages: apiMessages,
        ...(conversationId !== null && { conversationId }),
      }),
      });
    } catch {
      options.onError("Network error. Please check your connection.");
      return;
    }

    if (!response.ok || !response.body) {
      options.onError("Request failed. Please try again.");
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      for (const line of text.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6);
        if (payload === "[DONE]") return;
        try {
          const event = JSON.parse(payload) as {
            type: string;
            content?: string;
            conversationId?: string;
            message?: string;
          };
          if (event.type === "delta" && event.content) options.onDelta(event.content);
          if (event.type === "done" && event.conversationId) options.onDone(event.conversationId);
          if (event.type === "error" && event.message) options.onError(event.message);
        } catch {
          // Malformed chunk — skip
        }
      }
    }
  };

  return { send };
}
