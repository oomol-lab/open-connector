import { describe, expect, it, vi } from "vitest";
import { getPagesToWorkersMigrationGuide, searchCloudflareDocumentation } from "./runtime.ts";

const mockSdk = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let callToolImpl: any = vi.fn();
  return {
    Client: function () {
      return {
        connect: vi.fn().mockResolvedValue(undefined),
        callTool: callToolImpl,
        close: vi.fn().mockResolvedValue(undefined),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setCallToolImpl: (fn: any) => {
      callToolImpl = fn;
    },
  };
});

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => mockSdk);

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: vi.fn(),
}));

describe("Cloudflare Docs runtime", () => {
  describe("searchCloudflareDocumentation", () => {
    it("rejects empty or missing query parameter", async () => {
      await expect(searchCloudflareDocumentation({}, {})).rejects.toThrow("query parameter is required");
      await expect(searchCloudflareDocumentation({ query: "   " }, {})).rejects.toThrow("query parameter is required");
    });

    it("rejects when MCP tool returns isError", async () => {
      mockSdk.setCallToolImpl(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "Tool execution failed" }],
          isError: true,
        } as any),
      );

      await expect(
        searchCloudflareDocumentation({ query: "test" }, { fetcher: vi.fn() as unknown as typeof fetch }),
      ).rejects.toThrow("Tool execution failed");
    });
  });

  describe("getPagesToWorkersMigrationGuide", () => {
    it("is defined as a function", () => {
      expect(typeof getPagesToWorkersMigrationGuide).toBe("function");
    });
  });
});
