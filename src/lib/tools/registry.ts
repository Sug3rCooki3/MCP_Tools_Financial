import OpenAI from "openai";

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema object
  execute: (input: Record<string, unknown>) => Promise<unknown>;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(definition: ToolDefinition): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool "${definition.name}" is already registered`);
    }
    this.tools.set(definition.name, definition);
  }

  getSchemas(): OpenAI.ChatCompletionTool[] {
    return Array.from(this.tools.values()).map((def) => ({
      type: "function" as const,
      function: {
        name: def.name,
        description: def.description,
        parameters: def.parameters,
      },
    }));
  }

  async execute(name: string, input: Record<string, unknown>): Promise<unknown> {
    const def = this.tools.get(name);
    if (!def) throw new Error(`Unknown tool: "${name}"`);
    return def.execute(input);
  }
}

// Singleton registry
import { registerMarketDataTools } from "./market-data";
import { registerFxTools } from "./fx";
import { registerCalculatorTools } from "./calculator";

export const toolRegistry = new ToolRegistry();
registerMarketDataTools(toolRegistry);
registerFxTools(toolRegistry);
registerCalculatorTools(toolRegistry);
