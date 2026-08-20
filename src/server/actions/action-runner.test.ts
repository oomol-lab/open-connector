import type { IConnectionStore, StoredConnection } from "../../connection-service.ts";
import type { ActionDefinition, ActionExecutor, ProviderDefinition, ResolvedCredential } from "../../core/types.ts";
import type { IProviderLoader } from "../../providers/provider-loader.ts";
import type { Logger } from "../logger.ts";
import type { IRunLogStore, RunLog, RunLogListInput, RunLogPage } from "../storage/runtime-store.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { ConnectionService } from "../../connection-service.ts";
import { ActionPolicyService } from "../../core/action-policy.ts";
import { ActionRunner } from "./action-runner.ts";
import * as runLogSummary from "./run-log-summary.ts";

const echoAction: ActionDefinition = {
  id: "example.echo",
  service: "example",
  name: "echo",
  description: "Echo input.",
  requiredScopes: [],
  providerPermissions: [],
  inputSchema: { type: "object" },
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
const authenticatedProvider: ProviderDefinition = {
  ...exampleProvider,
  authTypes: ["no_auth", "api_key"],
  auth: [{ type: "no_auth" }, { type: "api_key" }],
};
const credential: Extract<ResolvedCredential, { authType: "api_key" }> = {
  authType: "api_key",
  apiKey: "example-key",
  values: { apiKey: "example-key" },
  profile: { accountId: "example", displayName: "Example", grantedScopes: [] },
  metadata: {},
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ActionRunner", () => {
  it("uses one execution id across logs, storage, and the result", async () => {
    const runs = new MemoryRunLogStore();
    const { entries, logger } = createTestLogger();
    const runner = createRunner({ runs, logger });

    const run = await runner.run({
      actionId: "example.echo",
      input: { message: "hello", token: "secret" },
      caller: "http",
    });

    expect(run).toMatchObject({ auditPersisted: true, result: { ok: true } });
    expect(runs.items).toEqual([
      expect.objectContaining({
        id: run?.executionId,
        connectionId: "example:default",
        inputSummary: { message: "hello", token: "[redacted]" },
        outputSummary: { message: "ok" },
      }),
    ]);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fields: expect.objectContaining({ executionId: run?.executionId }) }),
        expect.objectContaining({
          fields: expect.objectContaining({ executionId: run?.executionId, auditPersisted: true }),
        }),
      ]),
    );
  });

  it("does not replace a successful action result when audit storage fails", async () => {
    const runs = new MemoryRunLogStore();
    runs.addError = new Error("secret-in-storage");
    const { entries, logger } = createTestLogger();
    const runner = createRunner({ runs, logger });

    const run = await runner.run({ actionId: "example.echo", input: {}, caller: "mcp" });

    expect(run).toMatchObject({
      auditPersisted: false,
      result: { ok: true, output: { message: "ok" } },
    });
    expect(JSON.stringify(entries)).not.toContain("secret-in-storage");
  });

  it("falls back to an unavailable summary without changing the action result", async () => {
    vi.spyOn(runLogSummary, "summarizeForRunLog").mockImplementationOnce(() => {
      throw new Error("secret-in-summary");
    });
    const runs = new MemoryRunLogStore();
    const { entries, logger } = createTestLogger();
    const runner = createRunner({ runs, logger });

    const run = await runner.run({ actionId: "example.echo", input: {}, caller: "web" });

    expect(run?.result).toEqual({ ok: true, output: { message: "ok" } });
    expect(runs.items[0]).toMatchObject({ inputSummary: "[unavailable]" });
    expect(JSON.stringify(entries)).not.toContain("secret-in-summary");
  });

  it("records unexpected execution errors as internal errors without logging the thrown value", async () => {
    const runs = new MemoryRunLogStore();
    const { entries, logger } = createTestLogger();
    const runner = createRunner({
      runs,
      logger,
      providerLoader: new TestProviderLoader(async () => {
        throw new Error("secret-in-executor");
      }),
    });

    const run = await runner.run({ actionId: "example.echo", input: {}, caller: "http" });

    expect(run?.result).toEqual({
      ok: false,
      error: { code: "internal_error", message: "Action execution failed unexpectedly." },
    });
    expect(runs.items[0]).toMatchObject({ ok: false, errorCode: "internal_error" });
    expect(JSON.stringify(entries)).not.toContain("secret-in-executor");
  });

  it("records policy denial before resolving a connection or loading an executor", async () => {
    const runs = new MemoryRunLogStore();
    const { logger } = createTestLogger();
    const providerLoader = new TestProviderLoader(async () => ({ ok: true, output: {} }));
    const loadExecutor = vi.spyOn(providerLoader, "loadActionExecutor");
    const resolveConnection = vi.spyOn(ConnectionService.prototype, "resolveForExecution");
    const actionPolicy = new ActionPolicyService({ blockedActions: ["example.echo"] });
    const runner = createRunner({ runs, logger, providerLoader, actionPolicy });

    const run = await runner.run({
      actionId: "example.echo",
      input: {},
      caller: "http",
      policy: actionPolicy.createSnapshot(),
      runtimeTokenId: "token-1",
    });

    expect(run).toMatchObject({
      result: { ok: false, error: { code: "action_blocked" } },
      auditPersisted: true,
    });
    expect(resolveConnection).not.toHaveBeenCalled();
    expect(loadExecutor).not.toHaveBeenCalled();
    expect(runs.items[0]).toMatchObject({
      runtimeTokenId: "token-1",
      policy: {
        allowed: false,
        checks: [{ source: "deployment", outcome: "block_match", rule: "example.echo" }],
      },
    });
  });

  it("does not apply connection grants to no-auth actions", async () => {
    const runs = new MemoryRunLogStore();
    const providerLoader = new TestProviderLoader(async () => ({ ok: true, output: {} }));
    const loadExecutor = vi.spyOn(providerLoader, "loadActionExecutor");
    const resolveConnection = vi.spyOn(ConnectionService.prototype, "resolveForExecution");
    const actionPolicy = new ActionPolicyService();
    const policy = actionPolicy.createSnapshot(undefined, {
      allowedActions: [],
      blockedActions: [],
      allowedProxies: [],
      allowedConnections: ["ungranted-connection-id"],
    });
    const runner = createRunner({ runs, logger: createTestLogger().logger, providerLoader, actionPolicy });

    const omitted = await runner.run({
      actionId: "example.echo",
      input: {},
      caller: "http",
      policy,
      runtimeTokenId: "token-1",
    });
    const hidden = await runner.run({
      actionId: "example.echo",
      input: {},
      caller: "http",
      connectionName: "hidden",
      policy,
      runtimeTokenId: "token-1",
    });

    expect(omitted?.result).toMatchObject({ ok: true });
    expect(hidden?.result).toMatchObject({ ok: true });
    expect(resolveConnection).toHaveBeenCalledTimes(2);
    expect(loadExecutor).toHaveBeenCalledTimes(2);
    expect(runs.items[0]).toMatchObject({
      runtimeTokenId: "token-1",
      policy: { allowed: true },
    });
  });

  it("uses stable IDs for credential connections on a provider that also supports no-auth", async () => {
    const runs = new MemoryRunLogStore();
    const resolveConnection = vi.spyOn(ConnectionService.prototype, "resolveForExecution");
    const actionPolicy = new ActionPolicyService();
    const store = new MemoryConnectionStore();
    const connection = await store.set("example", "work", credential);
    const runner = createRunner({
      runs,
      logger: createTestLogger().logger,
      actionPolicy,
      provider: authenticatedProvider,
      store,
    });

    const allowed = await runner.run({
      actionId: "example.echo",
      input: {},
      caller: "http",
      connectionName: " work ",
      policy: actionPolicy.createSnapshot(undefined, {
        allowedActions: [],
        blockedActions: [],
        allowedProxies: [],
        allowedConnections: [connection.id],
      }),
    });
    const unrestricted = await runner.run({
      actionId: "example.echo",
      input: {},
      caller: "mcp",
      connectionName: "work",
      policy: actionPolicy.createSnapshot(undefined, {
        allowedActions: [],
        blockedActions: [],
        allowedProxies: [],
        allowedConnections: [],
      }),
    });
    const denied = await runner.run({
      actionId: "example.echo",
      input: {},
      caller: "http",
      connectionName: "work",
      policy: actionPolicy.createSnapshot(undefined, {
        allowedActions: [],
        blockedActions: [],
        allowedProxies: [],
        allowedConnections: ["another-connection-id"],
      }),
    });

    expect(allowed?.result).toMatchObject({ ok: true });
    expect(unrestricted?.result).toMatchObject({ ok: true });
    expect(denied?.result).toMatchObject({ ok: false, error: { code: "connection_not_allowed" } });
    expect(resolveConnection).toHaveBeenCalledTimes(2);
  });

  it("propagates the caller abort signal into the executor context", async () => {
    const controller = new AbortController();
    let seen: AbortSignal | undefined;
    const runner = createRunner({
      runs: new MemoryRunLogStore(),
      logger: createTestLogger().logger,
      providerLoader: new TestProviderLoader(async (_input, context) => {
        seen = context.signal;
        return { ok: true, output: {} };
      }),
    });

    controller.abort();
    const run = await runner.run({
      actionId: "example.echo",
      input: {},
      caller: "http",
      signal: controller.signal,
    });

    expect(run?.result).toEqual({ ok: true, output: {} });
    expect(seen).toBe(controller.signal);
    expect(seen?.aborted).toBe(true);
  });

  it("does not set context.signal when the caller omits one", async () => {
    let seen: AbortSignal | undefined | "unset" = "unset";
    const runner = createRunner({
      runs: new MemoryRunLogStore(),
      logger: createTestLogger().logger,
      providerLoader: new TestProviderLoader(async (_input, context) => {
        seen = context.signal;
        return { ok: true, output: {} };
      }),
    });

    await runner.run({ actionId: "example.echo", input: {}, caller: "http" });

    expect(seen).toBeUndefined();
  });

  it("aborts a waiting executor when the caller signal aborts", async () => {
    const controller = new AbortController();
    let started!: () => void;
    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });
    const runner = createRunner({
      runs: new MemoryRunLogStore(),
      logger: createTestLogger().logger,
      providerLoader: new TestProviderLoader(async (_input, context) => {
        await new Promise<void>((_resolve, reject) => {
          const signal = context.signal;
          if (!signal) {
            reject(new Error("missing signal"));
            return;
          }
          const abort = (): void => {
            reject(signal.reason ?? new Error("aborted"));
          };
          if (signal.aborted) {
            abort();
            return;
          }
          signal.addEventListener("abort", abort, { once: true });
          started();
        });
        return { ok: true, output: {} };
      }),
    });

    const pending = runner.run({
      actionId: "example.echo",
      input: {},
      caller: "http",
      signal: controller.signal,
    });
    await startedPromise;
    controller.abort();
    const run = await pending;

    expect(run?.result).toEqual({
      ok: false,
      error: { code: "internal_error", message: "Action execution failed unexpectedly." },
    });
  });
});

function createRunner(options: {
  runs: IRunLogStore;
  logger: Logger;
  providerLoader?: IProviderLoader;
  actionPolicy?: ActionPolicyService;
  provider?: ProviderDefinition;
  store?: IConnectionStore;
}): ActionRunner {
  const catalog = createCatalogStore([options.provider ?? exampleProvider], { executableActionIds: [echoAction.id] });
  const providerLoader =
    options.providerLoader ?? new TestProviderLoader(async () => ({ ok: true, output: { message: "ok" } }));
  return new ActionRunner({
    catalog,
    providerLoader,
    connections: new ConnectionService({
      catalog,
      providerLoader,
      store: options.store ?? new MemoryConnectionStore(),
    }),
    runs: options.runs,
    actionPolicy: options.actionPolicy,
    logger: options.logger,
  });
}

class TestProviderLoader implements IProviderLoader {
  private readonly executor: ActionExecutor;

  constructor(executor: ActionExecutor) {
    this.executor = executor;
  }

  async loadActionExecutor(): Promise<ActionExecutor> {
    return this.executor;
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

  async get(service: string, connectionName: string): Promise<StoredConnection | undefined> {
    return this.connections.get(`${service}:${connectionName}`);
  }

  async set(service: string, connectionName: string, credential: ResolvedCredential): Promise<StoredConnection> {
    const key = `${service}:${connectionName}`;
    const connection = {
      id: this.connections.get(key)?.id ?? crypto.randomUUID(),
      revision: crypto.randomUUID(),
      service,
      connectionName,
      credential,
    };
    this.connections.set(key, connection);
    return connection;
  }

  async updateCredential(): Promise<boolean> {
    return false;
  }

  async delete(service: string, connectionName: string): Promise<void> {
    this.connections.delete(`${service}:${connectionName}`);
  }

  async list(): Promise<StoredConnection[]> {
    return [...this.connections.values()];
  }
}

class MemoryRunLogStore implements IRunLogStore {
  readonly items: RunLog[] = [];
  addError?: Error;

  async add(run: RunLog): Promise<{ retentionApplied: boolean }> {
    if (this.addError) throw this.addError;
    this.items.push(run);
    return { retentionApplied: true };
  }

  async get(id: string): Promise<RunLog | undefined> {
    return this.items.find((run) => run.id === id);
  }

  async list(_input?: RunLogListInput): Promise<RunLogPage> {
    return { items: this.items };
  }
}

type TestLogEntry = {
  fields: Record<string, unknown>;
  message: string;
};

function createTestLogger(): { entries: TestLogEntry[]; logger: Logger } {
  const entries: TestLogEntry[] = [];
  const record = (fields: Record<string, unknown>, message: string): void => {
    entries.push({ fields, message });
  };
  return {
    entries,
    logger: { info: record, warn: record } as unknown as Logger,
  };
}
