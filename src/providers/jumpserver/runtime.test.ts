import type { AddressInfo } from "node:net";

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { createServer } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { jumpServerActions } from "./actions.ts";
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

  it("validates credentials, discovers tools, and calls a tool over SSE", async () => {
    const endpoint = await startJumpServerMcpFixture();
    const values = { mcpEndpoint: endpoint, token: "jumpserver-token" };

    await expect(validateJumpServerCredential(values, fetch)).resolves.toMatchObject({
      profile: { displayName: expect.stringContaining("JumpServer MCP") },
      metadata: { discoveredToolCount: 1, hasMoreTools: false },
    });

    const context = createJumpServerMcpContext(values, fetch);
    await expect(jumpServerActionHandlers.list_tools({}, context)).resolves.toMatchObject({
      tools: [{ name: "assets_assets_list" }],
    });
    await expect(
      jumpServerActionHandlers.call_tool({ toolName: "assets_assets_list", arguments: { limit: 1 } }, context),
    ).resolves.toMatchObject({
      content: [{ type: "text", text: '{"count":1}' }],
    });
  });
});

describe("normalizeJumpServerMcpEndpoint", () => {
  it.each([
    ["http://127.0.0.1:8099/sse", "http://127.0.0.1:8099/sse"],
    ["http://10.0.0.12:8099/sse/", "http://10.0.0.12:8099/sse"],
    ["http://100.64.0.4:8099/sse", "http://100.64.0.4:8099/sse"],
    ["http://172.16.0.12:8099/sse", "http://172.16.0.12:8099/sse"],
    ["http://192.168.1.12:8099/sse", "http://192.168.1.12:8099/sse"],
    ["http://jumpserver.internal:8099/sse", "http://jumpserver.internal:8099/sse"],
    ["https://10.0.0.12:8099/sse", "https://10.0.0.12:8099/sse"],
    ["https://mcp.example.com/sse?token=leak#part", "https://mcp.example.com/sse"],
  ])("accepts supported self-hosted endpoint %s", (input, expected) => {
    expect(normalizeJumpServerMcpEndpoint(input).toString()).toBe(expected);
  });

  it("defaults an empty path to the official /sse path", () => {
    expect(normalizeJumpServerMcpEndpoint("http://localhost:8099").toString()).toBe("http://localhost:8099/sse");
  });

  it.each([
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

async function startJumpServerMcpFixture(): Promise<string> {
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
      await createFixtureMcpServer().connect(transport);
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
  return `http://127.0.0.1:${address.port}/sse`;
}

function createFixtureMcpServer(): Server {
  const server = new Server({ name: "jumpserver-test", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: "assets_assets_list",
        description: "List JumpServer assets.",
        inputSchema: {
          type: "object",
          properties: { limit: { type: "integer" } },
          additionalProperties: false,
        },
      },
    ],
  }));
  server.setRequestHandler(CallToolRequestSchema, (request) => {
    expect(request.params).toMatchObject({
      name: "assets_assets_list",
      arguments: { limit: 1 },
    });
    return { content: [{ type: "text", text: '{"count":1}' }] };
  });
  return server;
}
