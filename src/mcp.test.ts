import type { IConnectionStore, StoredConnection } from "./connection-service.ts";
import type { ActionDefinition, ActionExecutor, ProviderDefinition, ResolvedCredential } from "./core/types.ts";
import type { IProviderLoader } from "./providers/provider-loader.ts";
import type { IRunLogStore, RunLogPage } from "./server/storage/runtime-store.ts";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createCatalogStore } from "./catalog-store.ts";
import { ConnectionService } from "./connection-service.ts";
import { createMcpServer } from "./mcp.ts";
import { ActionRunner } from "./server/actions/action-runner.ts";

const echoAction: ActionDefinition = {
  id: "example.echo",
  service: "example",
  name: "echo",
  description: "Echo input.",
  requiredScopes: [],
  providerPermissions: [],
  inputSchema: {
    type: "object",
    properties: {
      message: { type: "string" },
    },
    required: ["message"],
    additionalProperties: false,
  },
  outputSchema: { type: "object" },
};

const exampleProvider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
  categories: ["Developer Tools"],
  authTypes: ["no_auth"],
  auth: [{ type: "no_auth" }],
  actions: [echoAction],
};

describe("MCP server", () => {
  it("lists the discovery tools through the MCP protocol", async () => {
    await withMcpClient(async (client) => {
      const result = await client.listTools();

      expect(result.tools.map((tool) => tool.name)).toEqual([
        "list_apps",
        "search_actions",
        "get_action_guide",
        "execute_action",
      ]);
    });
  });

  it("publishes server instructions through MCP initialization", async () => {
    await withMcpClient(async (client) => {
      const instructions = client.getInstructions();

      expect(instructions).toBeTypeOf("string");
      expect(instructions).toContain("Start with list_apps or search_actions.");
      expect(instructions).toContain("Call get_action_guide before execute_action");
    });
  });

  it("returns structured content for action search and execution", async () => {
    await withMcpClient(async (client) => {
      const search = await client.callTool({
        name: "search_actions",
        arguments: { query: "echo", limit: 1 },
      });
      const run = await client.callTool({
        name: "execute_action",
        arguments: { actionId: "example.echo", input: { message: "hello" } },
      });

      expect(search.isError).toBeUndefined();
      expect(search.structuredContent).toMatchObject({
        ok: true,
        data: [
          {
            id: "example.echo",
            service: "example",
          },
        ],
      });
      expect(run.isError).toBeUndefined();
      expect(run.structuredContent).toEqual({
        ok: true,
        data: {
          message: "hello",
        },
      });
    });
  });

  it("marks action execution failures as MCP tool errors", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: "execute_action",
        arguments: { actionId: "example.echo", input: {} },
      });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        ok: false,
        error: {
          code: "invalid_input",
          message: "Action input does not match the action schema.",
        },
      });
    });
  });

  it("marks unknown action guides as MCP tool errors", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: "get_action_guide",
        arguments: { actionId: "example.missing" },
      });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toEqual({
        ok: false,
        error: {
          code: "unknown_action",
          message: "Unknown action: example.missing",
        },
      });
    });
  });
});

async function withMcpClient(run: (client: Client) => Promise<void>): Promise<void> {
  const catalog = createCatalogStore([exampleProvider], {
    executableActionIds: ["example.echo"],
  });
  const providerLoader = new EchoProviderLoader();
  const connections = new ConnectionService({
    catalog,
    providerLoader,
    store: new MemoryConnectionStore(),
  });
  const actions = new ActionRunner({
    catalog,
    providerLoader,
    connections,
    runs: new MemoryRunLogStore(),
  });
  const server = createMcpServer({
    catalog,
    providerLoader,
    connections,
    actions,
  });
  const client = new Client({ name: "mcp-test", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    await run(client);
  } finally {
    await client.close();
  }
}

class EchoProviderLoader implements IProviderLoader {
  async loadActionExecutor(): Promise<ActionExecutor> {
    return async (input) => ({ ok: true, output: input });
  }

  async loadProxyExecutor(): Promise<undefined> {
    return undefined;
  }

  async loadCredentialValidators(): Promise<undefined> {
    return undefined;
  }
}

class MemoryConnectionStore implements IConnectionStore {
  async get(): Promise<ResolvedCredential | undefined> {
    return undefined;
  }

  async set(): Promise<void> {}

  async delete(): Promise<void> {}

  async list(): Promise<StoredConnection[]> {
    return [];
  }
}

class MemoryRunLogStore implements IRunLogStore {
  async add(): Promise<void> {}

  async list(): Promise<RunLogPage> {
    return { items: [] };
  }
}
