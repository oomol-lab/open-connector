import type { IConnectionStore, StoredConnection } from "./connection-service.ts";
import type { ActionPolicySnapshot } from "./core/action-policy.ts";
import type { ActionDefinition, ActionExecutor, ProviderDefinition, ResolvedCredential } from "./core/types.ts";
import type { IProviderLoader } from "./providers/provider-loader.ts";
import type { IRunLogStore, RunLog, RunLogPage } from "./server/storage/runtime-store.ts";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "./catalog-store.ts";
import { ConnectionService } from "./connection-service.ts";
import { ActionPolicyService, emptyPolicyRules } from "./core/action-policy.ts";
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

const getAccountAction: ActionDefinition = {
  id: "example_auth.get_account",
  service: "example_auth",
  name: "get_account",
  description: "Return the connected account.",
  requiredScopes: ["records:read"],
  providerPermissions: [],
  inputSchema: {
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  outputSchema: { type: "object" },
};

const authenticatedProvider: ProviderDefinition = {
  service: "example_auth",
  displayName: "Authenticated Example",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [{ type: "api_key" }],
  actions: [getAccountAction],
};

const defaultCredential: ResolvedCredential = {
  authType: "api_key",
  apiKey: "test-token-default",
  values: { apiKey: "test-token-default" },
  profile: {
    accountId: "account-default",
    displayName: "Default Account",
    grantedScopes: ["records:read"],
  },
  metadata: {},
};

const secondaryCredential: ResolvedCredential = {
  authType: "api_key",
  apiKey: "test-token-secondary",
  values: { apiKey: "test-token-secondary" },
  profile: {
    accountId: "account-secondary",
    displayName: "Secondary Account",
    grantedScopes: ["records:read"],
  },
  metadata: {},
};

describe("MCP server", () => {
  it("lists the discovery tools through the MCP protocol", async () => {
    await withMcpClient(async (client) => {
      const result = await client.listTools();

      expect(result.tools.map((tool) => tool.name)).toEqual([
        "list_apps",
        "list_connections",
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
      expect(instructions).toContain("use list_connections before choosing among multiple accounts");
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
      expect(run.structuredContent).toMatchObject({
        ok: true,
        data: {
          message: "hello",
        },
        executionId: expect.any(String),
        auditPersisted: true,
        connection: {
          service: "example",
          connectionName: "default",
          authType: "no_auth",
          default: true,
        },
      });
    });
  });

  it("lists safe connection profiles without exposing credentials", async () => {
    await withAuthenticatedMcpClient(async (client) => {
      const result = await client.callTool({
        name: "list_connections",
        arguments: { service: "example_auth" },
      });

      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({
        ok: true,
        data: [
          {
            id: "connection-default",
            service: "example_auth",
            connectionName: "default",
            authType: "api_key",
            default: true,
            profile: defaultCredential.profile,
          },
          {
            id: "connection-secondary",
            service: "example_auth",
            connectionName: "secondary",
            authType: "api_key",
            default: false,
            profile: secondaryCredential.profile,
          },
        ],
      });
      expect(JSON.stringify(result.structuredContent)).not.toContain("test-token");
    });
  });

  it("uses an explicitly selected connection for guides and execution", async () => {
    const runs = new MemoryRunLogStore();
    await withAuthenticatedMcpClient(async (client) => {
      const guide = await client.callTool({
        name: "get_action_guide",
        arguments: { actionId: "example_auth.get_account", connectionName: " secondary " },
      });
      const result = await client.callTool({
        name: "execute_action",
        arguments: { actionId: "example_auth.get_account", input: {}, connectionName: "secondary" },
      });

      expect(guide.structuredContent).toMatchObject({
        ok: true,
        data: {
          capability: {
            connection: {
              connectionName: "secondary",
              profile: secondaryCredential.profile,
            },
          },
        },
      });
      expect(result.structuredContent).toMatchObject({
        ok: true,
        data: { accountId: "account-secondary" },
        executionId: expect.any(String),
        auditPersisted: true,
        connection: {
          connectionName: "secondary",
          profile: secondaryCredential.profile,
        },
      });
      expect(JSON.stringify(result.structuredContent)).not.toContain("test-token-secondary");
      expect(runs.runs).toHaveLength(1);
      expect(runs.runs[0]).toMatchObject({
        service: "example_auth",
        actionId: "example_auth.get_account",
        caller: "mcp",
        connectionId: "connection-secondary",
        connectionProfile: secondaryCredential.profile,
      });
    }, runs);
  });

  it("returns the selected connection when execution fails", async () => {
    await withAuthenticatedMcpClient(async (client) => {
      const result = await client.callTool({
        name: "execute_action",
        arguments: {
          actionId: "example_auth.get_account",
          input: { unexpected: true },
          connectionName: "secondary",
        },
      });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toMatchObject({
        ok: false,
        error: {
          code: "invalid_input",
          message: "Action input does not match the action schema.",
        },
        executionId: expect.any(String),
        auditPersisted: true,
        connection: {
          connectionName: "secondary",
          profile: secondaryCredential.profile,
        },
      });
    });
  });

  it("returns a structured error when a selected connection does not exist", async () => {
    await withAuthenticatedMcpClient(async (client) => {
      const result = await client.callTool({
        name: "execute_action",
        arguments: { actionId: "example_auth.get_account", input: {}, connectionName: "missing" },
      });

      expect(result.isError).toBe(true);
      expect(result.structuredContent).toEqual({
        ok: false,
        error: {
          code: "connection_not_found",
          message: "example_auth connection not found: missing.",
        },
      });
    });
  });

  it("does not fall back to a virtual no-auth connection for an unknown name", async () => {
    await withMcpClient(async (client) => {
      const guide = await client.callTool({
        name: "get_action_guide",
        arguments: { actionId: "example.echo", connectionName: "missing" },
      });
      const execution = await client.callTool({
        name: "execute_action",
        arguments: { actionId: "example.echo", input: { message: "hello" }, connectionName: "missing" },
      });

      expect(guide.structuredContent).toEqual({
        ok: false,
        error: {
          code: "connection_not_found",
          message: "example connection not found: missing.",
        },
      });
      expect(execution.structuredContent).toEqual({
        ok: false,
        error: {
          code: "connection_not_found",
          message: "example connection not found: missing.",
        },
      });
    });
  });

  it("rejects blank connection names instead of selecting the default connection", async () => {
    await withAuthenticatedMcpClient(async (client) => {
      const guide = await client.callTool({
        name: "get_action_guide",
        arguments: { actionId: "example_auth.get_account", connectionName: "   " },
      });
      const execution = await client.callTool({
        name: "execute_action",
        arguments: { actionId: "example_auth.get_account", input: {}, connectionName: "" },
      });

      expect(guide.isError).toBe(true);
      expect(execution.isError).toBe(true);
      expect(guide.content).toEqual([
        expect.objectContaining({ type: "text", text: expect.stringContaining("Connection name must not be empty.") }),
      ]);
      expect(execution.content).toEqual([
        expect.objectContaining({ type: "text", text: expect.stringContaining("Connection name must not be empty.") }),
      ]);
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
        executionId: expect.any(String),
        auditPersisted: true,
        connection: {
          service: "example",
          connectionName: "default",
          authType: "no_auth",
          default: true,
        },
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

  it("does not assign execution metadata to unknown actions", async () => {
    await withMcpClient(async (client) => {
      const result = await client.callTool({
        name: "execute_action",
        arguments: { actionId: "example.missing", input: {} },
      });

      expect(result.structuredContent).toEqual({
        ok: false,
        error: {
          code: "unknown_action",
          message: "Unknown action: example.missing",
        },
      });
    });
  });

  it("loads policy lazily and reuses a memoized snapshot across policy tools", async () => {
    const load = vi.fn(async () => new ActionPolicyService().createSnapshot());
    let memo: Promise<ActionPolicySnapshot> | undefined;
    await withMcpClient(
      async (client) => {
        await client.callTool({ name: "list_apps", arguments: {} });
        await client.callTool({ name: "list_connections", arguments: {} });
        expect(load).not.toHaveBeenCalled();

        await client.callTool({ name: "search_actions", arguments: { limit: 5 } });
        await client.callTool({ name: "get_action_guide", arguments: { actionId: "example.echo" } });
        expect(load).toHaveBeenCalledTimes(1);
      },
      { getPolicySnapshot: () => (memo ??= load()) },
    );
  });

  it("fails policy tools closed when the snapshot cannot be loaded", async () => {
    await withMcpClient(
      async (client) => {
        for (const request of [
          { name: "search_actions", arguments: { limit: 5 } },
          { name: "get_action_guide", arguments: { actionId: "example.echo" } },
          { name: "execute_action", arguments: { actionId: "example.echo", input: { message: "hello" } } },
        ]) {
          const result = await client.callTool(request);
          expect(result.structuredContent).toEqual({
            ok: false,
            error: { code: "internal_error", message: "Runtime policy is unavailable." },
          });
        }
      },
      { getPolicySnapshot: async () => Promise.reject(new Error("database unavailable")) },
    );
  });

  it("applies token policy to MCP guides and execution", async () => {
    const policy = new ActionPolicyService().createSnapshot(emptyPolicyRules(), {
      allowedActions: ["example.*"],
      blockedActions: ["example.echo"],
    });
    await withMcpClient(
      async (client) => {
        const guide = await client.callTool({
          name: "get_action_guide",
          arguments: { actionId: "example.echo" },
        });
        expect(guide.structuredContent).toMatchObject({
          ok: true,
          data: {
            capability: {
              policy: {
                allowed: false,
                checks: [{ source: "token", outcome: "block_match", rule: "example.echo" }],
              },
            },
            markdown: expect.stringContaining("`token`: `block_match` via `example.echo`"),
          },
        });

        const execution = await client.callTool({
          name: "execute_action",
          arguments: { actionId: "example.echo", input: { message: "hello" } },
        });
        expect(execution.structuredContent).toMatchObject({
          ok: false,
          error: { code: "action_blocked" },
        });
      },
      {
        getPolicySnapshot: async () => policy,
        runtimeGrant: { tokenId: "token-1", allowedActions: ["example.*"], blockedActions: ["example.echo"] },
      },
    );
  });
});

async function withMcpClient(
  run: (client: Client) => Promise<void>,
  policy: {
    getPolicySnapshot?(): Promise<ActionPolicySnapshot>;
    runtimeGrant?: { tokenId: string; allowedActions: string[]; blockedActions: string[] };
  } = {},
): Promise<void> {
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
    ...policy,
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

async function withAuthenticatedMcpClient(
  run: (client: Client) => Promise<void>,
  runs = new MemoryRunLogStore(),
): Promise<void> {
  const catalog = createCatalogStore([authenticatedProvider], {
    executableActionIds: ["example_auth.get_account"],
  });
  const providerLoader = new EchoProviderLoader();
  const connections = new ConnectionService({
    catalog,
    providerLoader,
    store: new MemoryConnectionStore([
      {
        id: "connection-default",
        service: "example_auth",
        connectionName: "default",
        credential: defaultCredential,
      },
      {
        id: "connection-secondary",
        service: "example_auth",
        connectionName: "secondary",
        credential: secondaryCredential,
      },
    ]),
  });
  const actions = new ActionRunner({ catalog, providerLoader, connections, runs });
  const server = createMcpServer({ catalog, providerLoader, connections, actions });
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
  async loadActionExecutor(_service: string, actionId: string): Promise<ActionExecutor> {
    if (actionId === "example_auth.get_account") {
      return async (_input, context) => {
        const credential = await context.getCredential("example_auth");
        return {
          ok: true,
          output: { accountId: credential?.authType === "api_key" ? credential.profile.accountId : undefined },
        };
      };
    }
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
  private readonly connections = new Map<string, StoredConnection>();

  constructor(connections: StoredConnection[] = []) {
    for (const connection of connections) {
      this.connections.set(this.key(connection.service, connection.connectionName), connection);
    }
  }

  async get(service: string, connectionName: string): Promise<StoredConnection | undefined> {
    return this.connections.get(this.key(service, connectionName));
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential): Promise<StoredConnection> {
    const key = this.key(service, connectionName);
    const connection = {
      id: this.connections.get(key)?.id ?? crypto.randomUUID(),
      service,
      connectionName,
      credential,
    };
    this.connections.set(key, connection);
    return connection;
  }

  async updateCredential(connection: StoredConnection): Promise<boolean> {
    const key = this.key(connection.service, connection.connectionName);
    if (this.connections.get(key)?.id !== connection.id) return false;
    this.connections.set(key, connection);
    return true;
  }

  async delete(service: string, connectionName: string): Promise<void> {
    this.connections.delete(this.key(service, connectionName));
  }

  async list(): Promise<StoredConnection[]> {
    return [...this.connections.values()];
  }

  private key(service: string, connectionName: string): string {
    return `${service}:${connectionName}`;
  }
}

class MemoryRunLogStore implements IRunLogStore {
  readonly runs: RunLog[] = [];

  async add(run: RunLog): Promise<{ retentionApplied: boolean }> {
    this.runs.push(run);
    return { retentionApplied: true };
  }

  async get(id: string): Promise<RunLog | undefined> {
    return this.runs.find((run) => run.id === id);
  }

  async list(): Promise<RunLogPage> {
    return { items: this.runs };
  }
}
