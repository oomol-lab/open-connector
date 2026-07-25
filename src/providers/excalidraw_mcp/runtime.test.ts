import { describe, expect, it } from "vitest";
import { createExcalidrawMcpContext, normalizeExcalidrawMcpEndpoint } from "./runtime.ts";

describe("Excalidraw MCP runtime", () => {
  it("defaults to the public endpoint and strips query or hash", () => {
    expect(normalizeExcalidrawMcpEndpoint(undefined).toString()).toBe("https://mcp.excalidraw.com/");
    expect(normalizeExcalidrawMcpEndpoint("https://mcp.excalidraw.com/?x=1#y").toString()).toBe(
      "https://mcp.excalidraw.com/",
    );
  });

  it("rejects embedded credentials", () => {
    expect(() => normalizeExcalidrawMcpEndpoint("https://user:pass@mcp.excalidraw.com/")).toThrow(
      "mcpEndpoint must not include username or password",
    );
  });

  it("accepts a self-hosted remote MCP endpoint", () => {
    expect(normalizeExcalidrawMcpEndpoint("https://example.vercel.app/mcp").toString()).toBe(
      "https://example.vercel.app/mcp",
    );
  });

  it("allows private network endpoints when opted in", () => {
    expect(normalizeExcalidrawMcpEndpoint("http://192.168.1.50/mcp", true).toString()).toBe("http://192.168.1.50/mcp");
    expect(
      createExcalidrawMcpContext(
        { mcpEndpoint: "http://192.168.1.50/mcp" },
        (() => {
          throw new Error("unused");
        }) as never,
        undefined,
        true,
      ).endpoint.toString(),
    ).toBe("http://192.168.1.50/mcp");
  });
});
