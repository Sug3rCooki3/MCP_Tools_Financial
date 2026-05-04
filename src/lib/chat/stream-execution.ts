export interface SseChunkData {
  type: "delta" | "done" | "error";
  content?: string;
  conversationId?: string;
  message?: string;
}

const encoder = new TextEncoder();

export function sseChunk(data: SseChunkData): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(data)}\n\n`);
}

export function buildStreamResponse(opts: {
  text: string;
  conversationId: string;
}): Response {
  const { text, conversationId } = opts;

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(sseChunk({ type: "delta", content: text }));
      controller.enqueue(sseChunk({ type: "done", conversationId }));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export function buildErrorStreamResponse(message: string): Response {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(sseChunk({ type: "error", message }));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
