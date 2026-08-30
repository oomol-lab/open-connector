import type { CatalogStore } from "../../catalog-store.ts";
import type { ConnectionService, ConnectionSummary } from "../../connection-service.ts";
import type {
  ActionExecutor,
  CredentialValidators,
  ProviderDefinition,
  ProviderProxyExecutor,
  ProxyExecutionResult,
  ResolvedCredential,
} from "../../core/types.ts";
import type { IProviderLoader } from "../../providers/provider-loader.ts";
import type { Logger } from "../logger.ts";

import { describe, expect, it, vi } from "vitest";
import { ConnectionError } from "../../connection-service.ts";
import { ActionPolicyService } from "../../core/action-policy.ts";
import { ProxyRunner } from "./proxy-runner.ts";

const provider: ProviderDefinition = {
  service: "example",
  displayName: "Example",
  categories: ["Developer Tools"],
  authTypes: ["api_key"],
  auth: [{ type: "api_key" }],
  actions: [],
};

const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "example-key",
  values: { apiKey: "example-key" },
  profile: { accountId: "acct_1", displayName: "Example", grantedScopes: [] },
  metadata: {},
};
const connectionId = "11111111-1111-4111-8111-111111111111";
const otherConnectionId = "22222222-2222-4222-8222-222222222222";

describe("ProxyRunner", () => {
  it("returns proxy_not_supported before resolving credentials when the provider has no proxy executor", async () => {
    const connections = createConnections();
    const runner = createRunner({
      connections,
      providerLoader: new TestProviderLoader(),
    });

    await expect(
      runner.run({
        service: "example",
        input: null,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 501,
      errorCode: "proxy_not_supported",
    });
    expect(connections.getConnectionSummary).not.toHaveBeenCalled();
  });

  it("rejects proxies blocked by local policy before loading executors", async () => {
    const loadProxyExecutor = vi.fn();
    const connections = createConnections();
    const runner = createRunner({
      connections,
      providerLoader: {
        loadActionExecutor: async () => undefined,
        loadCredentialValidators: async () => undefined,
        loadProxyExecutor,
      },
    });

    await expect(
      runner.run({
        service: "example",
        input: { endpoint: "/items", method: "GET" },
        policy: new ActionPolicyService({ allowedProxies: ["other"] }).createSnapshot(),
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
      errorCode: "proxy_not_allowed",
    });
    expect(loadProxyExecutor).not.toHaveBeenCalled();
    expect(connections.getConnectionSummary).not.toHaveBeenCalled();
  });

  it("combines deployment and Runtime proxy policy while ignoring token action rules", async () => {
    const loadProxyExecutor = vi.fn();
    const actionPolicy = new ActionPolicyService({ allowedProxies: ["example"] });
    const runner = createRunner({
      providerLoader: {
        loadActionExecutor: async () => undefined,
        loadCredentialValidators: async () => undefined,
        loadProxyExecutor,
      },
    });
    const policy = actionPolicy.createSnapshot(
      {
        allowedActions: [],
        blockedActions: [],
        allowedProxies: [],
        blockedProxies: ["example"],
      },
      { allowedActions: [], blockedActions: ["example.*"], allowedProxies: ["example"] },
    );

    await expect(
      runner.run({ service: "example", input: { endpoint: "/items", method: "GET" }, policy }),
    ).resolves.toMatchObject({
      ok: false,
      errorCode: "proxy_blocked",
    });
    expect(loadProxyExecutor).not.toHaveBeenCalled();
  });

  it("does not load a proxy executor without a runtime token proxy grant", async () => {
    const loadProxyExecutor = vi.fn();
    const actionPolicy = new ActionPolicyService({ allowedProxies: ["example"] });
    const runner = createRunner({
      providerLoader: {
        loadActionExecutor: async () => undefined,
        loadCredentialValidators: async () => undefined,
        loadProxyExecutor,
      },
    });
    const policy = actionPolicy.createSnapshot(
      {
        allowedActions: [],
        blockedActions: [],
        allowedProxies: ["example"],
        blockedProxies: [],
      },
      { allowedActions: ["*"], blockedActions: [], allowedProxies: [] },
    );

    await expect(
      runner.run({ service: "example", input: { endpoint: "/items", method: "GET" }, policy }),
    ).resolves.toMatchObject({
      ok: false,
      errorCode: "proxy_not_allowed",
    });
    expect(loadProxyExecutor).not.toHaveBeenCalled();
  });

  it("denies a restricted connection before executing the proxy", async () => {
    const proxy = vi.fn(
      async (): Promise<ProxyExecutionResult> => ({
        ok: true,
        response: { status: 200, headers: {}, data: null },
      }),
    );
    const loadProxyExecutor = vi.fn(async () => proxy);
    const connections = createConnections();
    const actionPolicy = new ActionPolicyService({ allowedProxies: ["example"] });
    const runner = createRunner({
      connections,
      providerLoader: {
        loadActionExecutor: async () => undefined,
        loadCredentialValidators: async () => undefined,
        loadProxyExecutor,
      },
    });
    const policy = actionPolicy.createSnapshot(undefined, {
      allowedActions: [],
      blockedActions: [],
      allowedProxies: ["example"],
      allowedConnections: [otherConnectionId],
    });

    await expect(
      runner.run({ service: "example", input: { endpoint: "/items", method: "GET" }, policy }),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
      errorCode: "connection_not_allowed",
    });
    await expect(
      runner.run({
        service: "example",
        connectionName: "hidden",
        input: { endpoint: "/items", method: "GET" },
        policy,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 403,
      errorCode: "connection_not_allowed",
    });
    expect(loadProxyExecutor).toHaveBeenCalledTimes(2);
    expect(connections.getConnectionSummary).toHaveBeenCalledTimes(2);
    expect(proxy).not.toHaveBeenCalled();
  });

  it("executes allowlisted proxy connections and leaves unrestricted tokens unchanged", async () => {
    const proxy: ProviderProxyExecutor = vi.fn(
      async (): Promise<ProxyExecutionResult> => ({
        ok: true,
        response: { status: 200, headers: {}, data: null },
      }),
    );
    const actionPolicy = new ActionPolicyService({ allowedProxies: ["example"] });
    const runner = createRunner({
      providerLoader: new TestProviderLoader(proxy),
    });

    await expect(
      runner.run({
        service: "example",
        connectionName: " work ",
        input: { endpoint: "/items", method: "GET" },
        policy: actionPolicy.createSnapshot(undefined, {
          allowedActions: [],
          blockedActions: [],
          allowedProxies: ["example"],
          allowedConnections: [connectionId],
        }),
      }),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      runner.run({
        service: "example",
        connectionName: "personal",
        input: { endpoint: "/items", method: "GET" },
        policy: actionPolicy.createSnapshot(undefined, {
          allowedActions: [],
          blockedActions: [],
          allowedProxies: ["example"],
          allowedConnections: [],
        }),
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(proxy).toHaveBeenCalledTimes(2);
  });

  it("does not apply connection grants to no-auth proxies", async () => {
    const proxy: ProviderProxyExecutor = vi.fn(
      async (): Promise<ProxyExecutionResult> => ({
        ok: true,
        response: { status: 200, headers: {}, data: null },
      }),
    );
    const actionPolicy = new ActionPolicyService({ allowedProxies: ["example"] });
    const runner = createRunner({
      provider: { ...provider, authTypes: ["no_auth"], auth: [{ type: "no_auth" }] },
      connections: createConnections({
        getConnectionSummary: async () => ({
          id: "example:default",
          service: "example",
          connectionName: "default",
          authType: "no_auth",
          configured: true,
          virtual: true,
          default: true,
          profile: { accountId: "example", displayName: "Example", grantedScopes: [] },
        }),
      }),
      providerLoader: new TestProviderLoader(proxy),
    });

    await expect(
      runner.run({
        service: "example",
        input: { endpoint: "/items", method: "GET" },
        policy: actionPolicy.createSnapshot(undefined, {
          allowedActions: [],
          blockedActions: [],
          allowedProxies: ["example"],
          allowedConnections: [otherConnectionId],
        }),
      }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("applies connection grants to credentials on providers that also support no-auth", async () => {
    const proxy = vi.fn(
      async (): Promise<ProxyExecutionResult> => ({
        ok: true,
        response: { status: 200, headers: {}, data: null },
      }),
    );
    const actionPolicy = new ActionPolicyService({ allowedProxies: ["example"] });
    const runner = createRunner({
      provider: {
        ...provider,
        authTypes: ["no_auth", "api_key"],
        auth: [{ type: "no_auth" }, { type: "api_key" }],
      },
      providerLoader: new TestProviderLoader(proxy),
    });

    await expect(
      runner.run({
        service: "example",
        input: { endpoint: "/items", method: "GET" },
        policy: actionPolicy.createSnapshot(undefined, {
          allowedActions: [],
          blockedActions: [],
          allowedProxies: ["example"],
          allowedConnections: [otherConnectionId],
        }),
      }),
    ).resolves.toMatchObject({ ok: false, status: 403, errorCode: "connection_not_allowed" });
    expect(proxy).not.toHaveBeenCalled();
  });

  it("runs allowlisted proxies regardless of action policy", async () => {
    const proxy: ProviderProxyExecutor = vi.fn(
      async (): Promise<ProxyExecutionResult> => ({
        ok: true,
        response: { status: 200, headers: {}, data: null },
      }),
    );
    const runner = createRunner({
      providerLoader: new TestProviderLoader(proxy),
    });

    await expect(
      runner.run({
        service: "example",
        input: { endpoint: "/items", method: "GET" },
        policy: new ActionPolicyService({
          allowedActions: ["example.echo"],
          allowedProxies: ["example"],
        }).createSnapshot(),
      }),
    ).resolves.toMatchObject({
      ok: true,
    });
    expect(proxy).toHaveBeenCalled();
  });

  it("rejects invalid endpoints when a provider supports proxy", async () => {
    const runner = createRunner({
      providerLoader: new TestProviderLoader(async () => ({
        ok: true,
        response: { status: 200, headers: {}, data: null },
      })),
    });

    await expect(
      runner.run({
        service: "example",
        input: { endpoint: "https://evil.test/a", method: "GET" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 400,
      errorCode: "invalid_input",
    });
  });

  it("rejects slash-prefixed absolute endpoints before loading executors", async () => {
    const proxy: ProviderProxyExecutor = vi.fn(
      async (): Promise<ProxyExecutionResult> => ({
        ok: true,
        response: { status: 200, headers: {}, data: null },
      }),
    );
    const runner = createRunner({
      providerLoader: {
        loadActionExecutor: async () => undefined,
        loadCredentialValidators: async () => undefined,
        loadProxyExecutor: async () => proxy,
      },
    });

    for (const endpoint of [
      "/https://evil.example/steal",
      "/https:///evil.example/",
      "/http://169.254.169.254/latest/meta-data/",
      "/http:/169.254.169.254/",
    ]) {
      await expect(runner.run({ service: "example", input: { endpoint, method: "GET" } })).resolves.toMatchObject({
        ok: false,
        status: 400,
        errorCode: "invalid_input",
      });
    }
    expect(proxy).not.toHaveBeenCalled();
  });

  it("passes proxy input and named connection context to provider proxy executors", async () => {
    const proxy: ProviderProxyExecutor = vi.fn(async (_input, context): Promise<ProxyExecutionResult> => {
      await context.getCredential("example");
      return {
        ok: true,
        response: {
          status: 202,
          headers: { "content-type": "application/json" },
          data: { accepted: true },
        },
      };
    });
    const connections = createConnections();
    const runner = createRunner({
      connections,
      providerLoader: new TestProviderLoader(proxy),
    });

    await expect(
      runner.run({
        service: "example",
        connectionName: "work",
        input: { endpoint: "/items", method: "post", query: { limit: 1 } },
      }),
    ).resolves.toEqual({
      ok: true,
      response: {
        status: 202,
        headers: { "content-type": "application/json" },
        data: { accepted: true },
      },
    });

    expect(proxy).toHaveBeenCalledWith(
      {
        endpoint: "/items",
        method: "POST",
        query: { limit: 1 },
      },
      expect.objectContaining({
        getCredential: expect.any(Function),
      }),
    );
    expect(connections.forConnection).toHaveBeenCalledWith("work");
  });

  it("passes HEAD requests through to provider proxy executors", async () => {
    const proxy: ProviderProxyExecutor = vi.fn(
      async (): Promise<ProxyExecutionResult> => ({
        ok: true,
        response: { status: 200, headers: {}, data: null },
      }),
    );
    const runner = createRunner({
      providerLoader: new TestProviderLoader(proxy),
    });

    await expect(
      runner.run({
        service: "example",
        input: { endpoint: "/items", method: "HEAD" },
      }),
    ).resolves.toMatchObject({
      ok: true,
    });
    expect(proxy).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "HEAD",
      }),
      expect.any(Object),
    );
  });

  it("rejects GET and HEAD proxy requests with bodies", async () => {
    const proxy: ProviderProxyExecutor = vi.fn(
      async (): Promise<ProxyExecutionResult> => ({
        ok: true,
        response: { status: 200, headers: {}, data: null },
      }),
    );
    const runner = createRunner({
      providerLoader: new TestProviderLoader(proxy),
    });

    await expect(
      runner.run({
        service: "example",
        input: { endpoint: "/items", method: "GET", body: { ignored: true } },
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 400,
      errorCode: "invalid_input",
      message: "GET and HEAD proxy requests must not include a body.",
    });
    expect(proxy).not.toHaveBeenCalled();
  });

  it.each(["query", "headers"])("rejects a non-object %s field instead of silently dropping it", async (field) => {
    const proxy: ProviderProxyExecutor = vi.fn(
      async (): Promise<ProxyExecutionResult> => ({
        ok: true,
        response: { status: 200, headers: {}, data: null },
      }),
    );
    const runner = createRunner({ providerLoader: new TestProviderLoader(proxy) });

    await expect(
      runner.run({
        service: "example",
        input: { endpoint: "/items", method: "POST", [field]: "not-an-object" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 400,
      errorCode: "invalid_input",
      message: `${field} must be an object`,
    });
    expect(proxy).not.toHaveBeenCalled();
  });

  it("maps unexpected executor failures to a stable runtime failure", async () => {
    const runner = createRunner({
      providerLoader: new TestProviderLoader(async () => {
        throw new Error("provider secret leaked in an exception");
      }),
    });

    await expect(
      runner.run({
        service: "example",
        input: { endpoint: "/items", method: "GET" },
      }),
    ).resolves.toEqual({
      ok: false,
      status: 500,
      errorCode: "internal_error",
      message: "Proxy request failed unexpectedly.",
      meta: { service: "example" },
    });
  });

  it("maps unexpected executor-loading failures to a stable runtime failure", async () => {
    const runner = createRunner({
      providerLoader: {
        loadActionExecutor: async () => undefined,
        loadCredentialValidators: async () => undefined,
        loadProxyExecutor: async () => {
          throw new Error("module failed to load");
        },
      },
    });

    await expect(
      runner.run({
        service: "example",
        input: { endpoint: "/items", method: "GET" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 500,
      errorCode: "internal_error",
    });
  });

  it("logs proxy endpoints without query strings", async () => {
    const proxy: ProviderProxyExecutor = vi.fn(
      async (): Promise<ProxyExecutionResult> => ({
        ok: true,
        response: { status: 200, headers: {}, data: null },
      }),
    );
    const info = vi.fn();
    const logger = {
      info,
      warn: vi.fn(),
    } as unknown as Logger;
    const runner = createRunner({
      logger,
      providerLoader: new TestProviderLoader(proxy),
    });

    await runner.run({
      service: "example",
      input: { endpoint: "/items?access_token=secret", method: "GET" },
    });

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: "/items",
      }),
      "proxy request started",
    );
    expect(JSON.stringify(info.mock.calls)).not.toContain("secret");
  });

  it("maps connection errors to runtime failures", async () => {
    const connections = createConnections({
      getConnectionSummary: async () => {
        throw new ConnectionError("connection_not_found", "example connection not found: work.");
      },
    });
    const runner = createRunner({
      connections,
      providerLoader: new TestProviderLoader(async () => ({
        ok: true,
        response: { status: 200, headers: {}, data: null },
      })),
    });

    await expect(
      runner.run({
        service: "example",
        connectionName: "work",
        input: { endpoint: "/items", method: "GET" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 404,
      errorCode: "connection_not_found",
    });
  });

  it("maps provider proxy errors to runtime failures", async () => {
    const runner = createRunner({
      providerLoader: new TestProviderLoader(async () => ({
        ok: false,
        error: {
          code: "rate_limited",
          message: "Rate limit exceeded.",
          details: { status: 429 },
        },
      })),
    });

    await expect(
      runner.run({
        service: "example",
        input: { endpoint: "/items", method: "GET" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 429,
      errorCode: "rate_limited",
      message: "Rate limit exceeded.",
    });
  });

  it("preserves proxy response payload limit failures as HTTP 413", async () => {
    const runner = createRunner({
      providerLoader: new TestProviderLoader(async () => ({
        ok: false,
        error: {
          code: "invalid_input",
          message: "proxy response exceeds 4 bytes",
          details: { status: 413 },
        },
      })),
    });

    await expect(
      runner.run({
        service: "example",
        input: { endpoint: "/items", method: "GET" },
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 413,
      errorCode: "invalid_input",
      message: "proxy response exceeds 4 bytes",
    });
  });
});

function createRunner(input: {
  connections?: ConnectionService;
  logger?: Logger;
  provider?: ProviderDefinition;
  providerLoader: IProviderLoader;
}): ProxyRunner {
  return new ProxyRunner({
    catalog: { providers: [input.provider ?? provider] } as CatalogStore,
    connections: input.connections ?? createConnections(),
    logger: input.logger,
    providerLoader: input.providerLoader,
  });
}

function createConnections(
  input: {
    getConnectionSummary?: ConnectionService["getConnectionSummary"];
  } = {},
): ConnectionService {
  const summary: ConnectionSummary = {
    id: connectionId,
    service: "example",
    connectionName: "default",
    authType: "api_key",
    configured: true,
    virtual: false,
    default: true,
    profile: credential.profile,
  };
  return {
    getConnectionSummary: vi.fn(input.getConnectionSummary ?? (async () => summary)),
    forConnection: vi.fn(() => ({
      getCredential: async () => credential,
    })),
  } as unknown as ConnectionService;
}

class TestProviderLoader implements IProviderLoader {
  private readonly proxy?: ProviderProxyExecutor;

  constructor(proxy?: ProviderProxyExecutor) {
    this.proxy = proxy;
  }

  async loadActionExecutor(): Promise<ActionExecutor | undefined> {
    return undefined;
  }

  async loadProxyExecutor(): Promise<ProviderProxyExecutor | undefined> {
    return this.proxy;
  }

  async loadCredentialValidators(): Promise<CredentialValidators | undefined> {
    return undefined;
  }
}
