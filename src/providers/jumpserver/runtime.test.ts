import { afterEach, describe, expect, it, vi } from "vitest";
import { validateJumpServerCredential } from "./runtime.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("JumpServer MCP runtime", () => {
  it("uses Streamable HTTP with Worker-safe tool schema validation", async () => {
    const credential = {
      mcpEndpoint: "https://jumpserver.example.com/mcp",
      token: "jumpserver-token",
    };

    // Warm the SDK's Node-only Zod fast path so this test isolates tool output validation.
    await validateJumpServerCredential(credential, createStreamableMcpFetch());
    vi.stubGlobal("Function", function disabledFunctionConstructor() {
      throw new EvalError("Code generation from strings disallowed for this context");
    });

    const result = await validateJumpServerCredential(credential, createStreamableMcpFetch());

    expect(result.metadata).toMatchObject({
      mcpEndpoint: "https://jumpserver.example.com/mcp",
      availableActions: ["assets_assets_list"],
    });
  });

  it("falls back to legacy SSE when Streamable HTTP is unavailable", async () => {
    const requests: Array<{ method: string; pathname: string }> = [];

    const result = await validateJumpServerCredential(
      {
        mcpEndpoint: "https://jumpserver.example.com/sse",
        token: "jumpserver-token",
      },
      createLegacySseMcpFetch(requests),
    );

    expect(result.metadata).toMatchObject({
      mcpEndpoint: "https://jumpserver.example.com/sse",
      availableActions: ["assets_assets_list"],
    });
    expect(requests).toContainEqual({ method: "POST", pathname: "/sse" });
    expect(requests).toContainEqual({ method: "GET", pathname: "/sse" });
    expect(requests).toContainEqual({ method: "POST", pathname: "/messages" });
  });
});

function createStreamableMcpFetch(): typeof fetch {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const method = init?.method ?? "GET";
    if (method === "GET") {
      return new Response(null, { status: 405 });
    }

    const request = readRequest(init);
    if (!("id" in request)) {
      return new Response(null, { status: 202 });
    }

    const result =
      request.method === "initialize"
        ? {
            protocolVersion: "2025-03-26",
            capabilities: {},
            serverInfo: { name: "jumpserver", version: "1.0.0" },
          }
        : {
            tools: [
              {
                name: "assets_assets_list",
                inputSchema: { type: "object" },
                outputSchema: { type: "object" },
              },
            ],
          };

    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
      headers: {
        "content-type": "application/json",
        "mcp-session-id": "test-session",
      },
    });
  }) as typeof fetch;
}

function createLegacySseMcpFetch(requests: Array<{ method: string; pathname: string }>): typeof fetch {
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;

  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : input.toString());
    const method = init?.method ?? "GET";
    requests.push({ method, pathname: url.pathname });

    if (method === "POST" && url.pathname === "/sse") {
      return new Response(null, { status: 405 });
    }
    if (method === "GET") {
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            streamController = controller;
            controller.enqueue(encoder.encode("event: endpoint\ndata: /messages?session_id=test-session\n\n"));
          },
        }),
        { headers: { "content-type": "text/event-stream" } },
      );
    }

    const request = readRequest(init);
    if ("id" in request) {
      const result =
        request.method === "initialize"
          ? {
              protocolVersion: "2024-11-05",
              capabilities: {},
              serverInfo: { name: "jumpserver", version: "1.0.0" },
            }
          : {
              tools: [
                {
                  name: "assets_assets_list",
                  inputSchema: { type: "object" },
                },
              ],
            };
      streamController!.enqueue(
        encoder.encode(`event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: request.id, result })}\n\n`),
      );
    }
    return new Response(null, { status: 202 });
  }) as typeof fetch;
}

function readRequest(init?: RequestInit): Record<string, unknown> {
  return typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {};
}
