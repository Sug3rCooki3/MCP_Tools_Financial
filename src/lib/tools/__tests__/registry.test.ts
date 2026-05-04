import { describe, it, expect } from "vitest";
import { ToolRegistry, toolRegistry } from "@/lib/tools/registry";

describe("ToolRegistry", () => {
  it("throws when registering a duplicate tool name", () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "my_tool",
      description: "test",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async () => ({}),
    });
    expect(() =>
      registry.register({
        name: "my_tool",
        description: "duplicate",
        parameters: { type: "object", properties: {}, required: [] },
        execute: async () => ({}),
      })
    ).toThrow('Tool "my_tool" is already registered');
  });

  it("throws when executing an unknown tool", async () => {
    const registry = new ToolRegistry();
    await expect(registry.execute("nonexistent", {})).rejects.toThrow(
      'Unknown tool: "nonexistent"'
    );
  });

  it("getSchemas returns type:function for each registered tool", () => {
    const registry = new ToolRegistry();
    registry.register({
      name: "tool_a",
      description: "A",
      parameters: { type: "object", properties: {}, required: [] },
      execute: async () => ({}),
    });
    const schemas = registry.getSchemas();
    expect(schemas).toHaveLength(1);
    expect(schemas[0].type).toBe("function");
    expect(schemas[0].function.name).toBe("tool_a");
  });
});

describe("singleton toolRegistry", () => {
  it("has all 8 tools registered", () => {
    const names = toolRegistry.getSchemas().map((s) => s.function.name);
    expect(names).toContain("get_stock_quote");
    expect(names).toContain("get_company_overview");
    expect(names).toContain("search_ticker");
    expect(names).toContain("get_fx_rate");
    expect(names).toContain("compound_interest");
    expect(names).toContain("simple_interest");
    expect(names).toContain("percent_change");
    expect(names).toContain("portfolio_summary");
    expect(names).toHaveLength(8);
  });
});
