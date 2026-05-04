import {
  MAX_CONTEXT_MESSAGES,
  MAX_CONTEXT_CHARACTERS,
  WARN_CONTEXT_MESSAGES,
  WARN_CONTEXT_CHARACTERS,
} from "./chat-config";

interface SystemPromptOptions {
  contextMessageCount: number;
  contextCharCount: number;
  toolNames: string[];
}

export function buildSystemPrompt(opts: SystemPromptOptions): string {
  const { contextMessageCount, contextCharCount, toolNames } = opts;

  const contextWindowNearLimit =
    contextMessageCount >= WARN_CONTEXT_MESSAGES ||
    contextCharCount >= WARN_CONTEXT_CHARACTERS;

  const sections: string[] = [];

  // Section 1: Role and identity
  sections.push(`You are a helpful financial assistant. You help users with stock prices, \
exchange rates, portfolio analysis, and financial calculations.

Respond in clear, concise language. Always cite the data source (e.g., "According to \
Alpha Vantage...") when providing market data.`);

  // Section 2: Tool usage rules
  sections.push(`## Tool Usage

You have access to the following tools: ${toolNames.join(", ")}.

- Use tools when users request data you cannot know from training alone (prices, rates, etc.)
- Do not invoke the same tool with the same arguments more than once per response
- If a tool returns an error, report the error to the user clearly
- Present numerical data with appropriate precision (2 decimal places for prices/rates)`);

  // Section 3: Tool descriptions
  sections.push(`## Tool Descriptions

- get_stock_price: Retrieves the current price and basic info for a given stock symbol
- get_stock_overview: Retrieves fundamental data (market cap, P/E ratio, etc.) for a stock
- get_fx_rate: Retrieves the current exchange rate between two currencies
- percent_change: Calculates the percentage change between two values
- compound_interest: Calculates compound interest growth over time
- portfolio_summary: Summarizes a portfolio of holdings by calculating total value and allocation`);

  // Section 4: Context window notice (conditional)
  if (contextWindowNearLimit) {
    sections.push(
      `## Note\n\nThis conversation is approaching the context limit \
(${contextMessageCount}/${MAX_CONTEXT_MESSAGES} messages, \
${contextCharCount}/${MAX_CONTEXT_CHARACTERS} chars). \
Older messages may have been dropped. If context seems missing, ask the user to re-state it.`
    );
  }

  return sections.join("\n\n");
}
