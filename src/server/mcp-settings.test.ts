import { describe, expect, it } from "vitest";
import { parseMcpOutputMode } from "./mcp-settings.ts";

describe("MCP output mode", () => {
  it.each([undefined, "", "compatible"])("keeps compatibility for %j", (value) => {
    expect(parseMcpOutputMode(value)).toBe("compatible");
  });

  it("requires an explicit compact setting", () => {
    expect(parseMcpOutputMode("compact")).toBe("compact");
  });

  it.each(["structured", "true", " compact "])("rejects an invalid deployment setting %j", (value) => {
    expect(() => parseMcpOutputMode(value)).toThrow("OOMOL_CONNECT_MCP_OUTPUT_MODE");
  });
});
