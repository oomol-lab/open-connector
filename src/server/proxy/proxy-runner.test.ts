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
        input: { endpoint: "/anything", method: "GET" },
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
      actionPolicy: new ActionPolicyService({ allowedProxies: ["other"] }),
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
      actionPolicy,
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
      { allowedActions: [], blockedActions: ["example.*"] },
    );

    await expect(
      runner.run({ service: "example", input: { endpoint: "/items", method: "GET" }, policy }),
    ).resolves.toMatchObject({
      ok: false,
      errorCode: "proxy_blocked",
    });
    expect(loadProxyExecutor).not.toHaveBeenCalled();
  });

  it("runs allowlisted proxies regardless of action policy", async () => {
    const proxy: ProviderProxyExecutor = vi.fn(
      async (): Promise<ProxyExecutionResult> => ({
        ok: true,
        response: { status: 200, headers: {}, data: null },
      }),
    );
    const runner = createRunner({
      actionPolicy: new ActionPolicyService({
        allowedActions: ["example.echo"],
        allowedProxies: ["example"],
      }),
      providerLoader: new TestProviderLoader(proxy),
    });

    await expect(
      runner.run({
        service: "example",
        input: { endpoint: "/items", method: "GET" },
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
  actionPolicy?: ActionPolicyService;
  connections?: ConnectionService;
  logger?: Logger;
  providerLoader: IProviderLoader;
}): ProxyRunner {
  return new ProxyRunner({
    catalog: { providers: [provider] } as CatalogStore,
    actionPolicy: input.actionPolicy,
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
    id: "example:default",
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
