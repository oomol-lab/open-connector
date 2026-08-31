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
import type { ProxyFailureStatus } from "./proxy-runner.ts";

import { describe, expect, it, vi } from "vitest";
import { ConnectionError } from "../../connection-service.ts";
import { ActionPolicyService } from "../../core/action-policy.ts";
import { providerErrorCodes, serializeRuntimeActionResult } from "../api/runtime-api.ts";
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
const openPolicy = new ActionPolicyService().createSnapshot();

interface CrossRouteErrorCase {
  title: string;
  error: Extract<ProxyExecutionResult, { ok: false }>["error"];
}

/**
 * Both `/v1` front doors serve the same provider error object through their own
 * mapper, so both must derive the same HTTP status from it. Cover every code a
 * provider executor can raise, the `connection_not_found` the runtime raises on
 * its behalf, and the two upstream statuses a provider preserves in
 * `details.status`.
 */
const crossRouteErrorCases: CrossRouteErrorCase[] = [
  ...providerErrorCodes.map((code) => ({ title: code, error: { code, message: "Provider request failed." } })),
  { title: "connection_not_found", error: { code: "connection_not_found", message: "Connect the account." } },
  {
    title: "an upstream not-found status",
    error: { code: "invalid_input", message: "Task not found.", details: { status: 404 } },
  },
  {
    title: "an upstream payload-too-large status",
    error: { code: "invalid_input", message: "response exceeds 4 bytes", details: { status: 413 } },
  },
];

interface ProxyFailureStatusCase extends CrossRouteErrorCase {
  status: ProxyFailureStatus;
}

/**
 * The cross-route table proves the two mappers agree about an error object;
 * these pin what they agree on, so the statuses this layer moved on the proxy
 * route are caught by value rather than by both routes moving together.
 */
const proxyFailureStatusCases: ProxyFailureStatusCase[] = [
  {
    title: "an exhausted provider credit balance",
    error: { code: "insufficient_credit", message: "Account balance is empty." },
    status: 402,
  },
  {
    title: "an upstream not-found status",
    error: { code: "invalid_input", message: "Task not found.", details: { status: 404 } },
    status: 404,
  },
];

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
        policy: openPolicy,
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
        policy: openPolicy,
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
      await expect(
        runner.run({ service: "example", input: { endpoint, method: "GET" }, policy: openPolicy }),
      ).resolves.toMatchObject({
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
        policy: openPolicy,
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

  it("threads the caller abort signal into the proxy execution context", async () => {
    const controller = new AbortController();
    let seenSignal: AbortSignal | undefined;
    const proxy: ProviderProxyExecutor = vi.fn(async (_input, context): Promise<ProxyExecutionResult> => {
      seenSignal = context.signal;
      return { ok: true, response: { status: 200, headers: {}, data: null } };
    });
    const runner = createRunner({ providerLoader: new TestProviderLoader(proxy) });

    await expect(
      runner.run({
        service: "example",
        input: { endpoint: "/items", method: "GET" },
        policy: openPolicy,
        signal: controller.signal,
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(seenSignal).toBe(controller.signal);
    expect(seenSignal?.aborted).toBe(false);
  });

  it("hands the proxy executor an already aborted signal when the caller aborted first", async () => {
    const controller = new AbortController();
    controller.abort();
    let aborted: boolean | undefined;
    const proxy: ProviderProxyExecutor = vi.fn(async (_input, context): Promise<ProxyExecutionResult> => {
      aborted = context.signal?.aborted;
      return { ok: true, response: { status: 200, headers: {}, data: null } };
    });
    const runner = createRunner({ providerLoader: new TestProviderLoader(proxy) });

    await runner.run({
      service: "example",
      input: { endpoint: "/items", method: "GET" },
      policy: openPolicy,
      signal: controller.signal,
    });
    expect(aborted).toBe(true);
  });

  // An aborted proxy request must settle on the existing failure envelope rather than hang. This is the
  // shape a hand-written proxy produces: it lets the abort propagate, so the runner catches a rejection.
  it("surfaces an abort raised during proxy execution as a stable runtime failure", async () => {
    const controller = new AbortController();
    const proxy: ProviderProxyExecutor = vi.fn(async (_input, context): Promise<ProxyExecutionResult> => {
      controller.abort();
      context.signal?.throwIfAborted();
      return { ok: true, response: { status: 200, headers: {}, data: null } };
    });
    const runner = createRunner({ providerLoader: new TestProviderLoader(proxy) });

    await expect(
      runner.run({
        service: "example",
        input: { endpoint: "/items", method: "GET" },
        policy: openPolicy,
        signal: controller.signal,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 500,
      errorCode: "internal_error",
      message: "Proxy request failed unexpectedly.",
      meta: { service: "example" },
    });
  });

  // The shape most proxies produce: defineProviderProxy catches the abort and reports it as an error
  // result, so a cancelled request lands on mapProxyErrorStatus's fall-through rather than the 500 above.
  it("maps an abort a proxy executor reports as an error result onto the existing 400 envelope", async () => {
    const controller = new AbortController();
    const proxy: ProviderProxyExecutor = vi.fn(async (_input, context): Promise<ProxyExecutionResult> => {
      controller.abort();
      try {
        context.signal?.throwIfAborted();
        return { ok: true, response: { status: 200, headers: {}, data: null } };
      } catch {
        // What toProviderProxyError builds for an error that is not a ProviderRequestError.
        return { ok: false, error: { code: "internal_error", message: "provider request failed" } };
      }
    });
    const runner = createRunner({ providerLoader: new TestProviderLoader(proxy) });

    await expect(
      runner.run({
        service: "example",
        input: { endpoint: "/items", method: "GET" },
        policy: openPolicy,
        signal: controller.signal,
      }),
    ).resolves.toEqual({
      ok: false,
      status: 400,
      errorCode: "internal_error",
      message: "provider request failed",
      data: null,
      meta: { service: "example" },
    });
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
        policy: openPolicy,
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
        policy: openPolicy,
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
        policy: openPolicy,
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
        policy: openPolicy,
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
        policy: openPolicy,
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
      policy: openPolicy,
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
        policy: openPolicy,
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
        policy: openPolicy,
      }),
    ).resolves.toMatchObject({
      ok: false,
      status: 429,
      errorCode: "rate_limited",
      message: "Rate limit exceeded.",
    });
  });

  it.each(proxyFailureStatusCases)("answers $title with HTTP $status", async ({ error, status }) => {
    const runner = createRunner({
      providerLoader: new TestProviderLoader(async () => ({ ok: false, error })),
    });

    await expect(
      runner.run({
        service: "example",
        input: { endpoint: "/items", method: "GET" },
        policy: openPolicy,
      }),
    ).resolves.toMatchObject({ ok: false, status, errorCode: error.code });
  });

  it.each(crossRouteErrorCases)("answers $title with the status the action route answers", async ({ error }) => {
    const runner = createRunner({
      providerLoader: new TestProviderLoader(async () => ({ ok: false, error })),
    });

    const proxyResult = await runner.run({
      service: "example",
      input: { endpoint: "/items", method: "GET" },
      policy: openPolicy,
    });

    expect(proxyResult).toMatchObject({
      ok: false,
      status: serializeRuntimeActionResult({
        actionId: "example.echo",
        executionId: "execution-1",
        auditPersisted: false,
        result: { ok: false, error },
      }).status,
      errorCode: error.code,
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
        policy: openPolicy,
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
