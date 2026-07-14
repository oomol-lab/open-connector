import type { AddressInfo } from "node:net";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { jumpServerActions, jumpServerMcpToolNames } from "./actions.ts";
import {
  createJumpServerMcpContext,
  jumpServerActionHandlers,
  normalizeJumpServerMcpEndpoint,
  validateJumpServerCredential,
} from "./runtime.ts";

const servers: ReturnType<typeof createServer>[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    ),
  );
});

describe("JumpServer MCP provider contract", () => {
  it("defines one runtime handler for every catalog action", () => {
    expect(Object.keys(jumpServerActionHandlers).sort()).toEqual(jumpServerActions.map((action) => action.name).sort());
  });

  it("validates credentials and calls curated static actions over SSE", async () => {
    const fixture = await startJumpServerMcpFixture();
    const values = { mcpEndpoint: fixture.endpoint, token: "jumpserver-token" };

    await expect(validateJumpServerCredential(values, fixture.fetcher)).resolves.toMatchObject({
      profile: { displayName: expect.stringContaining("JumpServer MCP") },
      metadata: { discoveredToolCount: jumpServerMcpToolNames.length, availableActions: jumpServerMcpToolNames },
    });

    const context = createJumpServerMcpContext(values, fixture.fetcher);
    await expect(jumpServerActionHandlers.assets_assets_list({ limit: 1 }, context)).resolves.toEqual({
      count: 1,
      results: [{ source: "assets_assets_list", limit: 1 }],
    });
  });

  it("rejects an MCP endpoint that exposes no supported static actions", async () => {
    const fixture = await startJumpServerMcpFixture(["unrelated_tool"]);
    const values = { mcpEndpoint: fixture.endpoint, token: "jumpserver-token" };

    await expect(validateJumpServerCredential(values, fixture.fetcher)).rejects.toThrow(
      "JumpServer MCP endpoint did not expose any supported tools",
    );
  });
});

describe("normalizeJumpServerMcpEndpoint", () => {
  it.each([
    ["http://10.0.0.12:8099/sse/", "http://10.0.0.12:8099/sse"],
    ["http://100.64.0.4:8099/sse", "http://100.64.0.4:8099/sse"],
    ["http://172.16.0.12:8099/sse", "http://172.16.0.12:8099/sse"],
    ["http://192.168.1.12:8099/sse", "http://192.168.1.12:8099/sse"],
    ["http://jumpserver.internal:8099/sse", "http://jumpserver.internal:8099/sse"],
    ["https://10.0.0.12:8099/sse", "https://10.0.0.12:8099/sse"],
    ["https://mcp.example.com/sse?token=leak#part", "https://mcp.example.com/sse"],
  ])("accepts supported self-hosted endpoint %s", (input, expected) => {
    expect(normalizeJumpServerMcpEndpoint(input, true).toString()).toBe(expected);
  });

  it("defaults an empty public HTTPS path to /sse", () => {
    expect(normalizeJumpServerMcpEndpoint("https://mcp.example.com").toString()).toBe("https://mcp.example.com/sse");
  });

  it.each([
    "http://127.0.0.1:8099/sse",
    "http://localhost:8099/sse",
    "http://10.0.0.12:8099/sse",
    "http://mcp.example.com/sse",
    "ftp://localhost/mcp",
    "http://user:password@localhost:8099/sse",
    "http://169.254.169.254/latest/meta-data",
    "http://100.100.100.200/latest/meta-data",
    "http://metadata.google.internal/computeMetadata/v1",
    "https://instance-data.ec2.internal/latest/meta-data",
    "https://metadata.goog/computeMetadata/v1",
    "https://169.254.1.1/sse",
    "https://224.0.0.1/sse",
    "https://203.0.113.1/sse",
    "http://[::1]:8099/sse",
    "http://[fd7a:115c:a1e0::1]:8099/sse",
  ])("rejects unsafe endpoint %s", (input) => {
    expect(() => normalizeJumpServerMcpEndpoint(input)).toThrow(ProviderRequestError);
  });
});

interface JumpServerMcpFixture {
  endpoint: string;
  fetcher: typeof fetch;
}

async function startJumpServerMcpFixture(
  toolNames: readonly string[] = jumpServerMcpToolNames,
): Promise<JumpServerMcpFixture> {
  const transports = new Map<string, SSEServerTransport>();
  const httpServer = createServer(async (request, response) => {
    if (request.headers.authorization !== "Bearer jumpserver-token") {
      response.writeHead(401).end("Unauthorized");
      return;
    }
    if (request.method === "GET" && request.url === "/sse") {
      const transport = new SSEServerTransport("/messages", response);
      transports.set(transport.sessionId, transport);
      transport.onclose = () => transports.delete(transport.sessionId);
      await createFixtureMcpServer(toolNames).connect(transport);
      return;
    }
    if (request.method === "POST" && request.url?.startsWith("/messages")) {
      const sessionId = new URL(request.url, "http://localhost").searchParams.get("sessionId");
      const transport = sessionId ? transports.get(sessionId) : undefined;
      if (!transport) {
        response.writeHead(404).end("Unknown session");
        return;
      }
      await transport.handlePostMessage(request, response);
      return;
    }
    response.writeHead(404).end("Not found");
  });
  servers.push(httpServer);
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });
  const address = httpServer.address() as AddressInfo;
  const localOrigin = `http://127.0.0.1:${address.port}`;
  const fetcher: typeof fetch = (input, init) => {
    const source = input instanceof Request ? input.url : input.toString();
    const url = new URL(source);
    if (url.hostname === "mcp.example.com") {
      const target = new URL(`${url.pathname}${url.search}`, localOrigin);
      return fetch(target, init);
    }
    return fetch(input, init);
  };
  return { endpoint: "https://mcp.example.com/sse", fetcher };
}

function createFixtureMcpServer(toolNames: readonly string[]): Server {
  const server = new Server({ name: "jumpserver-test", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: toolNames.map((name) => ({
      name,
      description: `List JumpServer resources with ${name}.`,
      inputSchema: {
        type: "object" as const,
        properties: {
          limit: { type: "integer" },
          offset: { type: "integer" },
          search: { type: "string" },
        },
        additionalProperties: false,
      },
    })),
  }));
  server.setRequestHandler(CallToolRequestSchema, (request) => {
    expect(toolNames).toContain(request.params.name);
    const limit = request.params.arguments?.limit;
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ count: 1, results: [{ source: request.params.name, limit }] }),
        },
      ],
    };
  });
  return server;
}
