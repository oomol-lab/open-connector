import { StreamableHTTPError } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import {
  createExcalidrawMcpContext,
  excalidrawMcpActionHandlers,
  normalizeExcalidrawMcpEndpoint,
  validateExcalidrawCredential,
} from "./runtime.ts";

const mockSdk = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let callToolImpl: any = vi.fn();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let connectImpl: any = vi.fn().mockResolvedValue(undefined);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let listToolsImpl: any = vi.fn();
  return {
    Client: function () {
      return {
        connect: connectImpl,
        callTool: callToolImpl,
        listTools: listToolsImpl,
        close: vi.fn().mockResolvedValue(undefined),
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setCallToolImpl: (fn: any) => {
      callToolImpl = fn;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setConnectImpl: (fn: any) => {
      connectImpl = fn;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setListToolsImpl: (fn: any) => {
      listToolsImpl = fn;
    },
    resetImpls: () => {
      callToolImpl = vi.fn();
      connectImpl = vi.fn().mockResolvedValue(undefined);
      listToolsImpl = vi.fn();
    },
  };
});

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => mockSdk);

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@modelcontextprotocol/sdk/client/streamableHttp.js")>();
  return { ...actual, StreamableHTTPClientTransport: vi.fn() };
});

function testContext(signal?: AbortSignal) {
  return {
    endpoint: new URL("https://mcp.excalidraw.com/"),
    fetcher: vi.fn() as unknown as typeof fetch,
    signal,
  };
}

describe("Excalidraw MCP runtime", () => {
  beforeEach(() => {
    mockSdk.resetImpls();
  });

  describe("normalizeExcalidrawMcpEndpoint", () => {
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

    it("requires the private-network opt-in for http endpoints", () => {
      expect(() => normalizeExcalidrawMcpEndpoint("http://mcp.example.com/mcp", false)).toThrow(
        "http mcpEndpoint URLs require private-network access to be enabled",
      );
    });

    it("allows private network endpoints when opted in", () => {
      expect(normalizeExcalidrawMcpEndpoint("http://192.168.1.50/mcp", true).toString()).toBe(
        "http://192.168.1.50/mcp",
      );
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

  describe("action handlers", () => {
    it("returns checkpointId and content for create_view", async () => {
      mockSdk.setCallToolImpl(
        vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "Rendered." }],
          structuredContent: { checkpointId: "cp_123" },
        }),
      );

      await expect(excalidrawMcpActionHandlers.create_view({ elements: "[]" }, testContext())).resolves.toEqual({
        checkpointId: "cp_123",
        content: "Rendered.",
      });
    });

    it("rejects create_view results that report isError", async () => {
      mockSdk.setCallToolImpl(
        vi.fn().mockResolvedValue({
          content: [{ type: "text", text: "invalid elements" }],
          isError: true,
        }),
      );

      await expect(excalidrawMcpActionHandlers.create_view({ elements: "[]" }, testContext())).rejects.toMatchObject({
        status: 502,
        message: "Excalidraw MCP create_view failed: invalid elements",
      });
    });

    it("rejects create_view results without a checkpointId", async () => {
      mockSdk.setCallToolImpl(vi.fn().mockResolvedValue({ content: [{ type: "text", text: "done" }] }));

      await expect(excalidrawMcpActionHandlers.create_view({ elements: "[]" }, testContext())).rejects.toMatchObject({
        status: 502,
        message: "Excalidraw MCP create_view response missing checkpointId",
      });
    });

    it("returns read_me content with a fallback for empty responses", async () => {
      mockSdk.setCallToolImpl(vi.fn().mockResolvedValue({ content: [] }));

      await expect(excalidrawMcpActionHandlers.read_me({}, testContext())).resolves.toEqual({
        content: "empty content",
      });
    });

    it("forwards the execution signal to connect and tool calls", async () => {
      const controller = new AbortController();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const connectOptions: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const callToolOptions: any[] = [];
      mockSdk.setConnectImpl(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.fn().mockImplementation((_transport: any, options: any) => {
          connectOptions.push(options);
          return Promise.resolve(undefined);
        }),
      );
      mockSdk.setCallToolImpl(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        vi.fn().mockImplementation((_params: any, _schema: any, options: any) => {
          callToolOptions.push(options);
          return Promise.resolve({ content: [{ type: "text", text: "guide" }] });
        }),
      );

      await excalidrawMcpActionHandlers.read_me({}, testContext(controller.signal));

      expect(connectOptions[0]?.signal).toBe(controller.signal);
      expect(callToolOptions[0]?.signal).toBe(controller.signal);
    });
  });

  describe("validateExcalidrawCredential", () => {
    it("stores a bounded tool summary instead of the raw server tool list", async () => {
      mockSdk.setListToolsImpl(
        vi.fn().mockResolvedValue({
          tools: [{ name: "read_me" }, { name: "create_view" }, { name: "export_to_excalidraw" }],
        }),
      );

      const result = await validateExcalidrawCredential({}, vi.fn() as unknown as typeof fetch);

      expect(result.metadata).toEqual({
        mcpEndpoint: "https://mcp.excalidraw.com",
        discoveredToolCount: 3,
        availableActions: ["read_me", "create_view"],
      });
      expect(result.profile?.accountId).toMatch(/^excalidraw_mcp:mcp:[0-9a-f]{16}$/u);
    });

    it("rejects endpoints that do not expose the expected tools", async () => {
      mockSdk.setListToolsImpl(vi.fn().mockResolvedValue({ tools: [{ name: "read_me" }] }));

      await expect(validateExcalidrawCredential({}, vi.fn() as unknown as typeof fetch)).rejects.toMatchObject({
        status: 502,
        message: "Excalidraw MCP endpoint did not expose the expected tools",
      });
    });
  });

  describe("error mapping", () => {
    it("maps endpoint HTTP 404 to a 400 configuration error", async () => {
      mockSdk.setConnectImpl(vi.fn().mockRejectedValue(new StreamableHTTPError(404, "Error POSTing to endpoint")));

      await expect(excalidrawMcpActionHandlers.read_me({}, testContext())).rejects.toMatchObject({ status: 400 });
    });

    it("maps endpoint HTTP 401 to a 401 authorization error", async () => {
      mockSdk.setConnectImpl(vi.fn().mockRejectedValue(new StreamableHTTPError(401, "Unauthorized")));

      await expect(excalidrawMcpActionHandlers.read_me({}, testContext())).rejects.toMatchObject({ status: 401 });
    });

    it("maps endpoint HTTP 500 to a 502 upstream error", async () => {
      mockSdk.setConnectImpl(vi.fn().mockRejectedValue(new StreamableHTTPError(500, "Internal Server Error")));

      await expect(excalidrawMcpActionHandlers.read_me({}, testContext())).rejects.toMatchObject({ status: 502 });
    });

    it("maps MCP request timeouts to 504", async () => {
      mockSdk.setConnectImpl(vi.fn().mockRejectedValue(new McpError(ErrorCode.RequestTimeout, "Request timed out")));

      await expect(excalidrawMcpActionHandlers.read_me({}, testContext())).rejects.toMatchObject({
        status: 504,
        message: "Excalidraw MCP request timed out",
      });
    });

    it("keeps ProviderRequestError instances unchanged", async () => {
      mockSdk.setConnectImpl(vi.fn().mockRejectedValue(new ProviderRequestError(400, "bad input")));

      await expect(excalidrawMcpActionHandlers.read_me({}, testContext())).rejects.toMatchObject({
        status: 400,
        message: "bad input",
      });
    });
  });
});
