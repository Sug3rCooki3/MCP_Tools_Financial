const TOOL_LABELS: Record<string, string> = {
  get_stock_quote: "Fetched stock quote",
  get_company_overview: "Fetched company overview",
  search_ticker: "Searched for ticker",
  get_fx_rate: "Fetched exchange rate",
  compound_interest: "Calculated compound interest",
  simple_interest: "Calculated simple interest",
  percent_change: "Calculated percent change",
  portfolio_summary: "Summarized portfolio",
  generate_financial_graph: "Generated financial chart",
};

interface ToolCallCardProps {
  name: string;
  result?: string;
}

export default function ToolCallCard({ name }: ToolCallCardProps) {
  const label = TOOL_LABELS[name] ?? name;
  return (
    <div
      data-testid="tool-call-card"
      className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-50 border border-blue-100 rounded-full text-xs text-blue-700"
    >
      <span aria-hidden>📊</span>
      <span>{label}</span>
    </div>
  );
}
