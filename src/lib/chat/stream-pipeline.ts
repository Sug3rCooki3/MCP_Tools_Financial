import { randomUUID } from "crypto";
import type { ChatRequest } from "./validation";
import { getConversation, createConversation, getMessages, insertMessage } from "../db/conversations";
import { trimToLimits, normalizeAlternation } from "./context-window";
import { buildSystemPrompt } from "./system-prompt";
import { orchestrate } from "./orchestrator";
import { toolRegistry } from "../tools/registry";
import { buildStreamResponse, buildErrorStreamResponse } from "./stream-execution";
import {
  MAX_CONTEXT_MESSAGES,
  MAX_CONTEXT_CHARACTERS,
} from "./chat-config";

export async function runStreamPipeline(body: ChatRequest): Promise<Response> {
  try {
    // 3. Load or create conversation
    const conversationId = body.conversationId ?? `conv_${randomUUID()}`;
    const existing = getConversation(conversationId);
    if (!existing) {
      createConversation(conversationId, "");
    }

    // 4. Persist user message
    const userMessage = body.messages[body.messages.length - 1];
    const existingMessages = getMessages(conversationId);
    insertMessage({
      id: randomUUID(),
      conversation_id: conversationId,
      role: "user",
      content: userMessage.content,
      tool_call_id: null,
      tool_name: null,
      position: existingMessages.length,
    });

    // 5. Build context window from DB (user/assistant only)
    const dbMessages = getMessages(conversationId).filter(
      (m) => m.role === "user" || m.role === "assistant"
    );
    const contextMessages = normalizeAlternation(
      trimToLimits(
        dbMessages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
      )
    );

    const totalChars = contextMessages.reduce((n, m) => n + m.content.length, 0);

    // 6. Build system prompt
    const systemPrompt = buildSystemPrompt({
      contextMessageCount: contextMessages.length,
      contextCharCount: totalChars,
      toolNames: Array.from(toolRegistry.getSchemas()).map((t) => t.function.name),
    });

    // 8. Orchestrate
    const text = await orchestrate(
      [{ role: "system", content: systemPrompt }, ...contextMessages],
      toolRegistry
    );

    // 10. Persist assistant message
    const afterMessages = getMessages(conversationId);
    insertMessage({
      id: randomUUID(),
      conversation_id: conversationId,
      role: "assistant",
      content: text,
      tool_call_id: null,
      tool_name: null,
      position: afterMessages.length,
    });

    // 9. Stream response
    return buildStreamResponse({ text, conversationId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred";
    return buildErrorStreamResponse(message);
  }
}
