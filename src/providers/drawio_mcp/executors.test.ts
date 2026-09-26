import type { IConnectionStore, StoredConnection } from "../../connection-service.ts";
import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";
import type { CallToolResult } from "@modelcontextprotocol/server";

import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import * as z from "zod/v4";
import { createCatalogStore } from "../../catalog-store.ts";
import { ConnectionService } from "../../connection-service.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { ProviderLoader } from "../provider-loader.ts";
import { executorModules } from "../registry.generated.ts";
import { provider } from "./definition.ts";

const hostedEndpoint = "https://mcp.draw.io/mcp";
const editorUrl =
  "https://app.diagrams.net/?pv=0&grid=0#create=%7B%22type%22%3A%22mermaid%22%2C%22compressed%22%3Atrue%7D";
const openInEditorText = `If this client doesn't show the diagram inline, open it in the draw.io editor (give the user this link):\n${editorUrl}`;
const flowchart = "flowchart TD\n  A --> B";
const diagramXml =
  '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="2" value="A" vertex="1" parent="1"><mxGeometry width="80" height="40" as="geometry"/></mxCell></root></mxGraphModel>';
const lambdaShape = { style: "shape=mxgraph.aws4.lambda;", w: 78, h: 78, title: "Lambda" };

type ToolHandler = (args: Record<string, unknown>) => CallToolResult;

interface SyntheticDrawioOptions {
  tools?: string[];
  createDiagram?: ToolHandler;
  searchShapes?: ToolHandler;
}

/** Serves an in-process MCP server shaped like the hosted draw.io server for the rest of the test. */
function createSyntheticDrawio(options: SyntheticDrawioOptions = {}) {
  const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  const requests: Request[] = [];
  const tools = options.tools ?? ["create_diagram", "search_shapes"];
  const handler = createMcpHandler(
    () => {
      const server = new McpServer({ name: "synthetic-drawio", version: "1.0.0" });
      if (tools.includes("create_diagram")) {
        server.registerTool(
          "create_diagram",
          {
            description: "Synthetic create_diagram",
            inputSchema: z.object({ xml: z.string().optional(), mermaid: z.string().optional() }),
          },
          async (args) => {
            calls.push({ name: "create_diagram", arguments: args });
            return (options.createDiagram ?? liveCreateDiagram)(args);
          },
        );
      }
      if (tools.includes("search_shapes")) {
        server.registerTool(
          "search_shapes",
          {
            description: "Synthetic search_shapes",
            inputSchema: z.object({ query: z.string(), limit: z.number().optional() }),
          },
          async (args) => {
            calls.push({ name: "search_shapes", arguments: args });
            return (options.searchShapes ?? liveSearchShapes)(args);
          },
        );
      }
      return server;
    },
    { legacy: "stateless", responseMode: "json" },
  );
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    requests.push(request);
    return handler.fetch(request);
  });
  onTestFinished(() => handler.close());
  return { calls, requests };
}

// The hosted server answers with a JSON echo of the source followed by the editor link.
function liveCreateDiagram(args: Record<string, unknown>): CallToolResult {
  return {
    content: [
      { type: "text", text: JSON.stringify({ ...args, _buildId: "synthetic" }) },
      { type: "text", text: openInEditorText },
    ],
  };
}

// The hosted server returns the matches as a JSON array inside one text block.
function liveSearchShapes(): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify([lambdaShape]) }] };
}

function executionContext(values: Record<string, string>): ExecutionContext {
  return {
    async getCredential(service) {
      if (service !== "drawio_mcp") return undefined;
      return {
        authType: "custom_credential",
        values,
        profile: { accountId: "synthetic", displayName: "Synthetic draw.io MCP", grantedScopes: [] },
        metadata: {},
      };
    },
  };
}

async function execute(actionName: string, input: Record<string, unknown>, values: Record<string, string> = {}) {
  const action = await new ProviderLoader(executorModules).loadActionExecutor("drawio_mcp", `drawio_mcp.${actionName}`);
  expect(action).toBeDefined();
  return action!(input, executionContext(values));
}

function createConnections(): ConnectionService {
  return new ConnectionService({
    catalog: createCatalogStore([provider], {
      executableActionIds: new Set(["drawio_mcp.create_diagram", "drawio_mcp.search_shapes"]),
    }),
    providerLoader: new ProviderLoader(executorModules),
    store: new MemoryConnectionStore(),
  });
}

class MemoryConnectionStore implements IConnectionStore {
  private stored?: StoredConnection;

  async get(service: string, connectionName: string): Promise<StoredConnection | undefined> {
    return this.stored?.service === service && this.stored.connectionName === connectionName ? this.stored : undefined;
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential): Promise<StoredConnection> {
    this.stored = { id: "synthetic-connection", revision: "1", service, connectionName, credential };
    return this.stored;
  }

  async updateCredential(input: StoredConnection): Promise<boolean> {
    this.stored = input;
    return true;
  }

  async delete(): Promise<void> {
    this.stored = undefined;
  }

  async list(): Promise<StoredConnection[]> {
    return this.stored ? [this.stored] : [];
  }
}

beforeEach(() => {
  setDefaultGuardedFetchDnsLookup(async () => [{ address: "1.1.1.1", family: 4 }]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setDefaultGuardedFetchDnsLookup(undefined);
});

describe("connection", () => {
  it("connects to the hosted server when the endpoint is left blank", async () => {
    const host = createSyntheticDrawio();
    const connections = createConnections();
    const connected = await connections.connectWithCustomCredential("drawio_mcp", { values: {} });
    expect(connected).toMatchObject({ service: "drawio_mcp", configured: true });

    const credential = await connections.forConnection().getCredential("drawio_mcp");
    expect(credential).toMatchObject({
      authType: "custom_credential",
      profile: {
        accountId: expect.stringMatching(/^drawio_mcp:mcp:[0-9a-f]{16}$/u),
        displayName: "draw.io MCP · mcp.draw.io",
      },
      metadata: { mcpEndpoint: hostedEndpoint },
    });
    expect(host.requests.every((request) => request.url === hostedEndpoint)).toBe(true);
  });

  it("refuses an endpoint that does not expose both draw.io tools", async () => {
    const host = createSyntheticDrawio({ tools: ["search_shapes"] });
    await expect(createConnections().connectWithCustomCredential("drawio_mcp", { values: {} })).rejects.toThrow(
      /create_diagram/u,
    );
    expect(host.calls).toEqual([]);
  });

  it("sends requests to a self-hosted endpoint", async () => {
    const host = createSyntheticDrawio();
    const result = await execute(
      "search_shapes",
      { query: "lambda" },
      { mcpEndpoint: "https://drawio.example.com/mcp?token=x#frag" },
    );
    expect(result).toMatchObject({ ok: true });
    expect(host.requests.length).toBeGreaterThan(0);
    for (const request of host.requests) {
      expect(request.url).toBe("https://drawio.example.com/mcp");
      expect(request.redirect).toBe("manual");
    }
  });

  it.each([
    ["plain http", "http://drawio.example.com/mcp"],
    ["embedded credentials", "https://user:secret@drawio.example.com/mcp"],
    ["a relative path", "/mcp"],
  ])("rejects an endpoint with %s before any request", async (_label, mcpEndpoint) => {
    const host = createSyntheticDrawio();
    const result = await execute("search_shapes", { query: "lambda" }, { mcpEndpoint });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(host.requests).toEqual([]);
  });
});

describe("create_diagram", () => {
  it("returns the editor link for a Mermaid diagram", async () => {
    const host = createSyntheticDrawio();
    const result = await execute("create_diagram", { mermaid: `  ${flowchart}\n` });
    expect(result).toEqual({ ok: true, output: { editorUrl, errors: [], warnings: [] } });
    expect(host.calls).toEqual([{ name: "create_diagram", arguments: { mermaid: flowchart } }]);
  });

  it("returns draw.io's link rather than a link written in the diagram source", async () => {
    createSyntheticDrawio();
    const mermaid = `${flowchart}\n  click A "https://app.diagrams.net/?pv=0&grid=0#create=OLD" _blank`;
    const result = await execute("create_diagram", { mermaid });
    expect(result).toMatchObject({ ok: true, output: { editorUrl } });
  });

  it("keeps reading the text blocks when draw.io also returns structured content", async () => {
    createSyntheticDrawio({
      createDiagram: (args) => ({ ...liveCreateDiagram(args), structuredContent: { status: "ok" } }),
    });
    const result = await execute("create_diagram", { mermaid: flowchart });
    expect(result).toEqual({ ok: true, output: { editorUrl, errors: [], warnings: [] } });
  });

  it("returns draw.io's findings for an XML diagram", async () => {
    const host = createSyntheticDrawio({
      createDiagram: (args) => {
        const [echo, link] = liveCreateDiagram(args).content;
        const findings =
          "ERRORS (will cause rendering issues):\n- XML comments (<!-- -->) are forbidden — remove all comments\n\nWARNINGS (may cause issues):\n- Edge e1 references missing target cell 9";
        return { content: [echo!, { type: "text", text: findings }, link!] };
      },
    });
    const result = await execute("create_diagram", { xml: diagramXml });
    expect(result).toEqual({
      ok: true,
      output: {
        editorUrl,
        errors: ["XML comments (<!-- -->) are forbidden — remove all comments"],
        warnings: ["Edge e1 references missing target cell 9"],
      },
    });
    expect(host.calls).toEqual([{ name: "create_diagram", arguments: { xml: diagramXml } }]);
  });

  it("reports draw.io rejecting the diagram source as invalid input", async () => {
    createSyntheticDrawio({
      createDiagram: () => ({
        content: [
          {
            type: "text",
            text: "Could not extract draw.io XML from input. Expected <mxGraphModel> or <mxfile> root element.",
          },
        ],
        isError: true,
      }),
    });
    const result = await execute("create_diagram", { xml: "```xml\n<mxGraphModel/>\n```" });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(JSON.stringify(result)).toContain("Could not extract draw.io XML from input.");
  });

  it("keeps other draw.io tool failures as provider errors", async () => {
    createSyntheticDrawio({
      createDiagram: () => ({ content: [{ type: "text", text: "Internal renderer failure" }], isError: true }),
    });
    expect(await execute("create_diagram", { mermaid: flowchart })).toMatchObject({
      ok: false,
      error: { code: "provider_error" },
    });
  });

  it("fails when draw.io does not return an editor link", async () => {
    createSyntheticDrawio({
      createDiagram: (args) => ({ content: liveCreateDiagram(args).content.slice(0, 1) }),
    });
    expect(await execute("create_diagram", { mermaid: flowchart })).toMatchObject({
      ok: false,
      error: {
        code: "provider_error",
        message: "draw.io MCP create_diagram response did not include an editor link",
      },
    });
  });
});

describe("search_shapes", () => {
  it("parses the text payload of the hosted server and applies the default limit", async () => {
    const host = createSyntheticDrawio();
    const result = await execute("search_shapes", { query: " aws lambda " });
    expect(result).toEqual({
      ok: true,
      output: { shapes: [{ title: "Lambda", style: lambdaShape.style, width: 78, height: 78 }] },
    });
    expect(host.calls).toEqual([{ name: "search_shapes", arguments: { query: "aws lambda", limit: 10 } }]);
  });

  it("prefers structured content and forwards an explicit limit", async () => {
    const host = createSyntheticDrawio({
      searchShapes: () => ({
        content: [{ type: "text", text: "ignored" }],
        structuredContent: { shapes: [{ ...lambdaShape, title: "Structured Lambda" }] },
      }),
    });
    const result = await execute("search_shapes", { query: "lambda", limit: 1 });
    expect(result).toEqual({
      ok: true,
      output: { shapes: [{ title: "Structured Lambda", style: lambdaShape.style, width: 78, height: 78 }] },
    });
    expect(host.calls).toEqual([{ name: "search_shapes", arguments: { query: "lambda", limit: 1 } }]);
  });

  it("returns an empty list when nothing matches", async () => {
    createSyntheticDrawio({
      searchShapes: (args) => ({
        content: [{ type: "text", text: `No shapes found for query: ${String(args.query)}` }],
      }),
    });
    expect(await execute("search_shapes", { query: "zzz" })).toEqual({ ok: true, output: { shapes: [] } });
  });

  it.each<[string, CallToolResult]>([
    ["text that is not JSON", { content: [{ type: "text", text: "Search service unavailable" }] }],
    [
      "a shape without a style",
      { content: [{ type: "text", text: JSON.stringify([{ title: "Lambda", w: 1, h: 1 }]) }] },
    ],
    ["a non-array payload", { content: [{ type: "text", text: JSON.stringify({ shapes: "none" }) }] }],
    ["a response without text", { content: [] }],
  ])("fails on %s", async (_label, response) => {
    createSyntheticDrawio({ searchShapes: () => response });
    expect(await execute("search_shapes", { query: "lambda" })).toMatchObject({
      ok: false,
      error: { code: "provider_error" },
    });
  });
});
