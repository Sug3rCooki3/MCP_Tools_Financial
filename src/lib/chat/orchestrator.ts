import OpenAI from "openai";
import type { ToolRegistry } from "../tools/registry";
import { getOpenAiApiKey, getOpenAiModel, getOpenAiTimeoutMs } from "../config/env";
import { withRetry } from "./provider-policy";
import { MAX_TOOL_ROUNDS } from "./chat-config";

export interface OrchestratorMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export async function orchestrate(
  messages: OrchestratorMessage[],
  registry: ToolRegistry
): Promise<string> {
  const client = new OpenAI({
    apiKey: getOpenAiApiKey(),
    maxRetries: 0,
    timeout: getOpenAiTimeoutMs(),
  });

  const model = getOpenAiModel();
  const tools = registry.getSchemas();

  // Build the mutable message list for the loop
  const loopMessages: OpenAI.ChatCompletionMessageParam[] = messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  for (let step = 0; step < MAX_TOOL_ROUNDS; step++) {
    const response = await withRetry(() =>
      client.chat.completions.create({
        model,
        messages: loopMessages,
        tools,
        tool_choice: "auto",
      })
    );

    const choice = response.choices[0];
    const assistantMessage = choice.message;

    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      // No tool calls — return final text
      return assistantMessage.content ?? "";
    }

    // Append assistant message with tool_calls
    loopMessages.push(assistantMessage);

    // Execute all tool calls in parallel
    const toolResults = await Promise.all(
      assistantMessage.tool_calls.map(async (tc) => {
        let content: string;
        try {
          const rawInput = JSON.parse(tc.function.arguments) as Record<string, unknown>;
          const result = await registry.execute(tc.function.name, rawInput);
          content = JSON.stringify(result);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          content = JSON.stringify({ error: message });
        }
        return {
          role: "tool" as const,
          tool_call_id: tc.id,
          content,
        };
      })
    );

    loopMessages.push(...toolResults);
  }

  throw new Error("Exceeded tool-call safety limit without a final response");
}
