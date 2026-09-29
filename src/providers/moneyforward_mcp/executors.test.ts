import type { IConnectionStore, StoredConnection } from "../../connection-service.ts";
import type { ExecutionContext, ExecutionResult, ResolvedCredential } from "../../core/types.ts";
import type { CallToolResult, JsonSchemaType } from "@modelcontextprotocol/server";

import { createMcpHandler, fromJsonSchema, McpServer } from "@modelcontextprotocol/server";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { ConnectionService } from "../../connection-service.ts";
import { setDefaultGuardedFetchDnsLookup } from "../../core/guarded-fetch.ts";
import { ProviderLoader } from "../provider-loader.ts";
import { toProviderExecutionError } from "../provider-runtime.ts";
import { executorModules } from "../registry.generated.ts";
import { moneyforwardActions } from "./actions.ts";
import { provider } from "./definition.ts";
import { moneyforwardMcpEndpoint, moneyforwardTools, schemaDigest } from "./manifest.ts";
import {
  createMoneyforwardMcpHandlers,
  moneyforwardMcpActionHandlers,
  validateMoneyforwardMcpCredential,
} from "./runtime.ts";

// Synthetic values only: no real key, office code or office name appears in this file.
const apiKey = "test-mf-api-key";
const officeA = { code: "0000-0000", name: "株式会社テスト事業者A" };
const officeB = { code: "1111-1111", name: "テスト事業者B" };
const offices = [officeA, officeB];

const journalInput = {
  office_code: officeA.code,
  expected_office_name: "(株)テスト事業者A",
  journal: {
    journal_type: "journal_entry",
    transaction_date: "2026-09-01",
    branches: [
      { debitor: { account_id: "acc-1", value: 1200 }, creditor: { account_id: "acc-2", value: 1200 } },
      { debitor: { account_id: "acc-3", value: 800 }, creditor: { account_id: "acc-2", value: 800 } },
    ],
  },
};

// The synthetic server advertises this schema for every tool; the real schemas stay with Money Forward.
const syntheticSchema = { type: "object", additionalProperties: true };
const syntheticDigests = Object.fromEntries(
  moneyforwardTools.map((tool) => [tool.toolName, schemaDigest(syntheticSchema)]),
);
const writeOptions = { deadlineMs: 5000, closeGraceMs: 50, schemaDigests: syntheticDigests };

type ToolHandler = (args: Record<string, unknown>) => CallToolResult | Promise<CallToolResult>;

interface SyntheticOptions {
  omitTools?: string[];
  schemaOverrides?: Record<string, Record<string, unknown>>;
  handlers?: Record<string, ToolHandler>;
  /** The server runs this tool, then the connection drops before the response arrives. */
  dropResponseOf?: string;
  /** Answer every POST with this HTTP status instead of reaching the MCP server. */
  httpStatus?: number;
  /** Session DELETE never settles, so the SDK's close never finishes. */
  hangSessionDelete?: boolean;
  /** Answer every POST with a 307 to this URL. */
  redirectTo?: string;
  /** Hold every tools/list response this long, ignoring the request signal like a stalled transport. */
  delayToolsListMs?: number;
}

function textResult(value: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(value) }] };
}

function toolErrorText(text: string): CallToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

// Shaped like the real Money Forward relay of an API error (seen live: "API request failed: client error: {...}").
function mfError(kind: "client" | "server"): CallToolResult {
  return toolErrorText(`API request failed: ${kind} error: {"errors":[{"code":"synthetic"}]}`);
}

function defaultHandler(toolName: string): ToolHandler {
  if (toolName === "mfc_ca_getAccessibleOffices") {
    return () => textResult({ accessible_offices: offices.map((office) => ({ ...office, type: "CORPORATE" })) });
  }
  if (toolName === "mfc_ca_currentOffice") {
    return (args) => {
      const office = offices.find((candidate) => candidate.code === args.office_code);
      return office ? textResult({ ...office, type: "CORPORATE", accounting_periods: [] }) : mfError("client");
    };
  }
  return (args) => textResult({ tool: toolName, received: args });
}

/** An in-process MCP server that serves every Money Forward tool name with a synthetic schema. */
function createSyntheticMoneyforward(options: SyntheticOptions = {}) {
  const calls: Array<{ name: string; arguments: Record<string, unknown> }> = [];
  const methods: string[] = [];
  const requests: Request[] = [];
  const handler = createMcpHandler(
    () => {
      const server = new McpServer({ name: "synthetic-moneyforward", version: "1.0.0" });
      for (const { toolName } of moneyforwardTools) {
        if (options.omitTools?.includes(toolName)) continue;
        const schema = options.schemaOverrides?.[toolName] ?? syntheticSchema;
        server.registerTool(
          toolName,
          {
            description: `Synthetic ${toolName}`,
            inputSchema: fromJsonSchema<Record<string, unknown>>(schema as JsonSchemaType),
          },
          async (args) => {
            calls.push({ name: toolName, arguments: args });
            return (options.handlers?.[toolName] ?? defaultHandler(toolName))(args);
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
    const message = request.method === "POST" ? JSON.parse(await request.clone().text()) : undefined;
    if (message?.method) {
      methods.push(message.method === "tools/call" ? `tools/call:${message.params.name}` : message.method);
    }
    if (message?.method === "tools/list" && options.delayToolsListMs !== undefined) {
      await new Promise((resolve) => setTimeout(resolve, options.delayToolsListMs));
    }
    if (request.method === "DELETE" && options.hangSessionDelete) return new Promise<Response>(() => {});
    if (options.redirectTo !== undefined && request.method === "POST") {
      return new Response(null, { status: 307, headers: { location: options.redirectTo } });
    }
    if (options.httpStatus !== undefined && request.method === "POST") {
      return new Response("synthetic", { status: options.httpStatus });
    }
    const response = await handler.fetch(request);
    if (message?.method === "tools/call" && message.params.name === options.dropResponseOf) {
      await response.text();
      throw new TypeError("fetch failed: other side closed");
    }
    return response;
  });
  onTestFinished(() => handler.close());
  return { calls, methods, requests };
}

function executionContext(): ExecutionContext {
  return {
    async getCredential(service) {
      if (service !== "moneyforward_mcp") return undefined;
      return {
        authType: "api_key",
        apiKey,
        values: { apiKey },
        profile: { accountId: "synthetic", displayName: "Synthetic Money Forward", grantedScopes: [] },
        metadata: {},
      };
    },
  };
}

async function execute(actionName: string, input: Record<string, unknown>): Promise<ExecutionResult> {
  const action = await new ProviderLoader(executorModules).loadActionExecutor(
    "moneyforward_mcp",
    `moneyforward_mcp.${actionName}`,
  );
  expect(action).toBeDefined();
  return action!(input, executionContext());
}

/** Run a write through handlers that expect the synthetic schema, shaped like an executor result. */
async function executeWrite(
  actionName: string,
  input: Record<string, unknown>,
  options: Record<string, unknown> = {},
): Promise<ExecutionResult> {
  const handlers = createMoneyforwardMcpHandlers({ ...writeOptions, ...options });
  try {
    return { ok: true, output: await handlers[actionName]!(input, { apiKey, fetcher: fetch }) };
  } catch (error) {
    return toProviderExecutionError(error, "Money Forward request failed");
  }
}

function writeOutcome(result: ExecutionResult): unknown {
  const details = (result as { error?: { details?: { details?: { writeOutcome?: unknown } } } }).error?.details;
  return details?.details?.writeOutcome;
}

function savedApiKeyCredential(
  credential: ResolvedCredential | undefined,
): Extract<ResolvedCredential, { authType: "api_key" }> {
  if (credential?.authType !== "api_key") throw new Error("expected a saved api_key credential");
  return credential;
}

function createConnections(): ConnectionService {
  return new ConnectionService({
    catalog: createCatalogStore([provider], {
      executableActionIds: new Set(moneyforwardActions.map((action) => action.id)),
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

  async set(service: string, connectionName: string, credential: ResolvedCredential) {
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

describe("wiring", () => {
  it("has an action and a handler for every Money Forward tool, and nothing else", () => {
    const actionNames = moneyforwardActions.map((action) => action.name).sort();
    const toolActions = moneyforwardTools.map((tool) => tool.actionName);
    expect(actionNames).toEqual([...toolActions, "list_tools"].sort());
    expect(Object.keys(moneyforwardMcpActionHandlers).sort()).toEqual(actionNames);
    const writes = moneyforwardActions
      .filter((action) => action.operationType === "write")
      .map((action) => action.name);
    expect(writes.sort()).toEqual(
      moneyforwardTools
        .filter((tool) => tool.isWrite)
        .map((tool) => tool.actionName)
        .sort(),
    );
  });
});

describe("connection", () => {
  it("validates the key with tools/list only and stores no office data", async () => {
    const host = createSyntheticMoneyforward();
    const connections = createConnections();
    await expect(connections.connectWithApiKey("moneyforward_mcp", { values: { apiKey } })).resolves.toMatchObject({
      service: "moneyforward_mcp",
      configured: true,
    });
    const credential = await connections.forConnection().getCredential("moneyforward_mcp");
    expect(credential).toMatchObject({
      profile: { accountId: expect.stringMatching(/^moneyforward_mcp:[0-9a-f]{16}$/u) },
      metadata: { mcpEndpoint: moneyforwardMcpEndpoint },
    });
    const visible = JSON.stringify({
      profile: savedApiKeyCredential(credential).profile,
      metadata: savedApiKeyCredential(credential).metadata,
    });
    expect(visible).not.toContain(apiKey);
    expect(visible).not.toContain(officeA.code);
    expect(host.methods.some((method) => method.startsWith("tools/call"))).toBe(false);
  });

  it("refuses a key whose server lacks a tool, naming it", async () => {
    createSyntheticMoneyforward({ omitTools: ["mfc_ca_postJournals"] });
    await expect(createConnections().connectWithApiKey("moneyforward_mcp", { values: { apiKey } })).rejects.toThrow(
      /mfc_ca_postJournals/u,
    );
  });

  it("records schema drift without refusing the connection", async () => {
    createSyntheticMoneyforward({ schemaOverrides: { mfc_ca_postJournals: { type: "object", properties: {} } } });
    const result = await validateMoneyforwardMcpCredential(apiKey, fetch, undefined, syntheticDigests);
    expect(result).toMatchObject({ metadata: { schemaDrift: ["mfc_ca_postJournals"] } });
  });

  it("reports no drift when every live schema matches", async () => {
    createSyntheticMoneyforward();
    const result = await validateMoneyforwardMcpCredential(apiKey, fetch, undefined, syntheticDigests);
    expect(result).toMatchObject({ metadata: { schemaDrift: [] } });
  });
});

describe("read actions", () => {
  it("forwards the input and the Mf-API-Key header, and parses the JSON text result", async () => {
    const host = createSyntheticMoneyforward();
    const result = await execute("get_accounts", { office_code: officeA.code, available: true });
    expect(result).toEqual({
      ok: true,
      output: { tool: "mfc_ca_getAccounts", received: { office_code: officeA.code, available: true } },
    });
    for (const request of host.requests) {
      expect(request.url).toBe(moneyforwardMcpEndpoint);
      expect(request.headers.get("mf-api-key")).toBe(apiKey);
    }
  });

  it("lists accessible offices without an office_code", async () => {
    createSyntheticMoneyforward();
    const result = await execute("get_accessible_offices", {});
    expect(result).toMatchObject({
      ok: true,
      output: { accessible_offices: [{ code: officeA.code }, { code: officeB.code }] },
    });
  });

  it.each([
    ["missing", {}],
    ["malformed", { office_code: "00000000" }],
  ])("rejects a %s office_code before contacting Money Forward", async (_label, input) => {
    const host = createSyntheticMoneyforward();
    const result = await execute("get_accounts", input);
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(host.requests).toHaveLength(0);
  });

  it("maps a Money Forward client error to invalid_input and a server error to provider_error", async () => {
    createSyntheticMoneyforward({
      handlers: { mfc_ca_getAccounts: () => mfError("client"), mfc_ca_getTaxes: () => mfError("server") },
    });
    expect(await execute("get_accounts", { office_code: officeA.code })).toMatchObject({
      ok: false,
      error: { code: "invalid_input" },
    });
    expect(await execute("get_taxes", { office_code: officeA.code })).toMatchObject({
      ok: false,
      error: { code: "provider_error" },
    });
  });

  it.each([
    [401, "authorization_failed"],
    [403, "authorization_failed"],
    [429, "rate_limited"],
    [503, "provider_error"],
  ])("maps HTTP %i to %s without echoing the key", async (status, code) => {
    createSyntheticMoneyforward({ httpStatus: status });
    const result = await execute("get_accounts", { office_code: officeA.code });
    expect(result).toMatchObject({ ok: false, error: { code } });
    expect(JSON.stringify(result)).not.toContain(apiKey);
  });

  // The upstream transport swallows the size-limit error, so the call surfaces as a timeout at the deadline.
  it("refuses a response larger than 8 MiB", async () => {
    createSyntheticMoneyforward({
      handlers: { mfc_ca_getJournals: () => ({ content: [{ type: "text", text: "x".repeat(8 * 1024 * 1024 + 1) }] }) },
    });
    const handlers = createMoneyforwardMcpHandlers({ deadlineMs: 300, closeGraceMs: 50 });
    await expect(
      handlers.get_journals!({ office_code: officeA.code }, { apiKey, fetcher: fetch }),
    ).rejects.toMatchObject({
      status: 504,
    });
  });

  it("times out a read that outlives the deadline", async () => {
    createSyntheticMoneyforward({ handlers: { mfc_ca_getAccounts: () => new Promise<CallToolResult>(() => {}) } });
    const handlers = createMoneyforwardMcpHandlers({ deadlineMs: 150, closeGraceMs: 50 });
    await expect(
      handlers.get_accounts!({ office_code: officeA.code }, { apiKey, fetcher: fetch }),
    ).rejects.toMatchObject({
      status: 504,
    });
  });

  it("does not follow a redirect away from the Money Forward endpoint", async () => {
    const host = createSyntheticMoneyforward({ redirectTo: "https://elsewhere.example.com/mcp" });
    expect(await execute("get_accounts", { office_code: officeA.code })).toMatchObject({ ok: false });
    expect(host.requests.every((request) => request.url === moneyforwardMcpEndpoint)).toBe(true);
  });

  it("maps an auth failure on list_tools to authorization_failed", async () => {
    createSyntheticMoneyforward({ httpStatus: 401 });
    expect(await execute("list_tools", {})).toMatchObject({ ok: false, error: { code: "authorization_failed" } });
  });

  it("returns the live tool list", async () => {
    createSyntheticMoneyforward();
    const result = await execute("list_tools", {});
    expect(result).toMatchObject({ ok: true });
    const tools = (result as { output: { tools: Array<{ name: string }> } }).output.tools;
    expect(tools).toHaveLength(22);
  });
});

describe("write actions", () => {
  it("confirms the office, then writes once without the guard field", async () => {
    const host = createSyntheticMoneyforward();
    const result = await executeWrite("post_journals", journalInput);
    expect(result).toMatchObject({ ok: true, output: { tool: "mfc_ca_postJournals" } });
    expect(host.calls.map((call) => call.name)).toEqual(["mfc_ca_currentOffice", "mfc_ca_postJournals"]);
    expect(host.calls[1]!.arguments).toEqual({ office_code: officeA.code, journal: journalInput.journal });
  });

  it("refuses when the office name does not match, without writing", async () => {
    const host = createSyntheticMoneyforward();
    const result = await executeWrite("post_journals", { ...journalInput, office_code: officeB.code });
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(JSON.stringify(result)).toContain(officeB.name);
    expect(writeOutcome(result)).toBe("definitely_not_sent");
    expect(host.calls.map((call) => call.name)).toEqual(["mfc_ca_currentOffice"]);
  });

  it("refuses when currentOffice answers for a different office code", async () => {
    const host = createSyntheticMoneyforward({
      handlers: { mfc_ca_currentOffice: () => textResult({ ...officeB, name: officeA.name }) },
    });
    const result = await executeWrite("post_journals", journalInput);
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(host.calls.map((call) => call.name)).toEqual(["mfc_ca_currentOffice"]);
  });

  it("reports definitely_not_sent when the office check itself fails", async () => {
    const host = createSyntheticMoneyforward({ handlers: { mfc_ca_currentOffice: () => mfError("server") } });
    const result = await executeWrite("post_journals", journalInput);
    expect(result).toMatchObject({ ok: false });
    expect(writeOutcome(result)).toBe("definitely_not_sent");
    expect(host.calls.map((call) => call.name)).toEqual(["mfc_ca_currentOffice"]);
  });

  it("refuses to write when the server schema drifted", async () => {
    const host = createSyntheticMoneyforward({
      schemaOverrides: { mfc_ca_postJournals: { ...syntheticSchema, description: "wording changed" } },
    });
    const result = await executeWrite("post_journals", journalInput);
    expect(result).toMatchObject({ ok: false, error: { message: expect.stringMatching(/schema/u) } });
    expect(writeOutcome(result)).toBe("definitely_not_sent");
    expect(host.methods).not.toContain("tools/call:mfc_ca_postJournals");
  });

  it("holds writes to the schema digests pinned in the manifest", async () => {
    const host = createSyntheticMoneyforward();
    const result = await execute("post_journals", journalInput);
    expect(writeOutcome(result)).toBe("definitely_not_sent");
    expect(host.methods).not.toContain("tools/call:mfc_ca_postJournals");
  });

  it("refuses to write when the server no longer exposes the tool", async () => {
    const host = createSyntheticMoneyforward({ omitTools: ["mfc_ca_postJournals"] });
    const result = await executeWrite("post_journals", journalInput);
    expect(writeOutcome(result)).toBe("definitely_not_sent");
    expect(host.methods).not.toContain("tools/call:mfc_ca_postJournals");
  });

  it("reports definitely_not_sent when Money Forward cannot be reached", async () => {
    const host = createSyntheticMoneyforward({ httpStatus: 503 });
    const result = await executeWrite("post_journals", journalInput);
    expect(writeOutcome(result)).toBe("definitely_not_sent");
    expect(host.methods).not.toContain("tools/call:mfc_ca_postJournals");
  });

  it("reports an auth failure on a write as authorization_failed and definitely_not_sent", async () => {
    createSyntheticMoneyforward({ httpStatus: 401 });
    const result = await executeWrite("post_journals", journalInput);
    expect(result).toMatchObject({ ok: false, error: { code: "authorization_failed" } });
    expect(writeOutcome(result)).toBe("definitely_not_sent");
  });

  it("reports outcome_unknown once the write was sent and the response was lost, without retrying", async () => {
    const host = createSyntheticMoneyforward({ dropResponseOf: "mfc_ca_postJournals" });
    const result = await executeWrite("post_journals", journalInput);
    expect(result).toMatchObject({ ok: false, error: { code: "provider_error" } });
    expect(writeOutcome(result)).toBe("outcome_unknown");
    expect(host.calls.filter((call) => call.name === "mfc_ca_postJournals")).toHaveLength(1);
    const writeIndex = host.methods.indexOf("tools/call:mfc_ca_postJournals");
    expect(host.methods.slice(writeIndex + 1)).not.toContain("initialize");
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(apiKey);
    expect(result).toMatchObject({
      error: {
        details: {
          details: {
            submitted: {
              office_code: officeA.code,
              transaction_date: "2026-09-01",
              branch_count: 2,
              debit_total: 2000,
            },
          },
        },
      },
    });
  });

  it("reports outcome_unknown when Money Forward answers the write with a server error", async () => {
    createSyntheticMoneyforward({ handlers: { mfc_ca_postJournals: () => mfError("server") } });
    const result = await executeWrite("post_journals", journalInput);
    expect(writeOutcome(result)).toBe("outcome_unknown");
  });

  it("reports rejected, with the submission, only when the tool's input validation refused it", async () => {
    createSyntheticMoneyforward({
      handlers: { mfc_ca_postJournals: () => toolErrorText("Input validation error: Invalid arguments for tool") },
    });
    const result = await executeWrite("post_journals", journalInput);
    expect(result).toMatchObject({ ok: false, error: { code: "invalid_input" } });
    expect(writeOutcome(result)).toBe("rejected");
    expect(result).toMatchObject({ error: { details: { details: { submitted: { office_code: officeA.code } } } } });
  });

  it("reports rejected when the tool does not exist on the server side (-32601)", async () => {
    createSyntheticMoneyforward({
      handlers: { mfc_ca_postJournals: () => toolErrorText("MCP error -32601: Tool not found") },
    });
    expect(writeOutcome(await executeWrite("post_journals", journalInput))).toBe("rejected");
  });

  it("asks for a manual check when a rejected write was a batch", async () => {
    createSyntheticMoneyforward({
      handlers: { mfc_ca_postTradePartners: () => toolErrorText("Input validation error: bad partner") },
    });
    const result = await executeWrite("post_trade_partners", {
      office_code: officeA.code,
      expected_office_name: officeA.name,
      trade_partners: [{ name: "取引先1" }, { name: "取引先2" }],
    });
    expect(writeOutcome(result)).toBe("rejected");
    expect(result).toMatchObject({
      error: {
        message: expect.stringMatching(/batch write/u),
        details: { details: { submitted: { trade_partners_count: 2 } } },
      },
    });
  });

  it.each([
    [
      "a Money Forward client error (a batch may have failed part-way)",
      'API request failed: client error: {"errors":[{"code":"synthetic"}]}',
    ],
    [
      "an output validation error (the handler already ran)",
      "MCP error -32602: Output validation error: unexpected field",
    ],
    [
      "a transport error that merely mentions client error",
      "API request failed: server error: client error (SendRequest): connection closed",
    ],
  ])("keeps %s as outcome_unknown", async (_label, text) => {
    createSyntheticMoneyforward({ handlers: { mfc_ca_postJournals: () => toolErrorText(text) } });
    const result = await executeWrite("post_journals", journalInput);
    expect(writeOutcome(result)).toBe("outcome_unknown");
  });

  it("refuses writes past the per-minute budget before contacting Money Forward", async () => {
    const host = createSyntheticMoneyforward();
    const handlers = createMoneyforwardMcpHandlers({ ...writeOptions, writesPerMinute: 1 });
    await handlers.post_journals!(journalInput, { apiKey, fetcher: fetch });
    await expect(handlers.post_journals!(journalInput, { apiKey, fetcher: fetch })).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
      details: { writeOutcome: "definitely_not_sent" },
    });
    expect(host.calls.filter((call) => call.name === "mfc_ca_postJournals")).toHaveLength(1);
  });
});

describe("deadline", () => {
  const timing = { deadlineMs: 150, closeGraceMs: 50, schemaDigests: syntheticDigests };
  const context = () => ({ apiKey, fetcher: fetch });

  it("reports outcome_unknown when the write outlives the deadline", async () => {
    createSyntheticMoneyforward({
      handlers: { mfc_ca_postJournals: () => new Promise<CallToolResult>(() => {}) },
    });
    const handlers = createMoneyforwardMcpHandlers(timing);
    await expect(handlers.post_journals!(journalInput, context())).rejects.toMatchObject({
      details: { writeOutcome: "outcome_unknown" },
    });
  });

  it("reports definitely_not_sent when the office check outlives the deadline", async () => {
    createSyntheticMoneyforward({
      handlers: { mfc_ca_currentOffice: () => new Promise<CallToolResult>(() => {}) },
    });
    const handlers = createMoneyforwardMcpHandlers(timing);
    await expect(handlers.post_journals!(journalInput, context())).rejects.toMatchObject({
      details: { writeOutcome: "definitely_not_sent" },
    });
  });

  it("returns a completed write even when closing the session hangs", async () => {
    createSyntheticMoneyforward({ hangSessionDelete: true });
    const handlers = createMoneyforwardMcpHandlers(timing);
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    onTestFinished(() => void process.off("unhandledRejection", unhandled));
    const started = Date.now();
    await expect(handlers.post_journals!(journalInput, context())).resolves.toMatchObject({
      tool: "mfc_ca_postJournals",
    });
    expect(Date.now() - started).toBeLessThan(1000);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(unhandled).not.toHaveBeenCalled();
  });

  it("stops before contacting Money Forward when the caller already aborted", async () => {
    const host = createSyntheticMoneyforward();
    const handlers = createMoneyforwardMcpHandlers(timing);
    await expect(
      handlers.post_journals!(journalInput, { ...context(), signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ details: { writeOutcome: "definitely_not_sent" } });
    expect(host.methods).not.toContain("tools/call:mfc_ca_postJournals");
  });

  it("never dispatches a write whose tools/list answers after the deadline", async () => {
    const host = createSyntheticMoneyforward({ delayToolsListMs: 300 });
    const handlers = createMoneyforwardMcpHandlers(timing);
    await expect(handlers.post_journals!(journalInput, context())).rejects.toMatchObject({
      details: { writeOutcome: "definitely_not_sent" },
    });
    // Let the held tools/list answer, so a late dispatch would have been recorded by now. Today the SDK
    // drops the late answer itself; the authorizeTool abort check is the backstop if that ever changes.
    await new Promise((resolve) => setTimeout(resolve, 400));
    // The office check has no tools/list, so the held answer is the write's own schema discovery.
    expect(host.methods).toContain("tools/call:mfc_ca_currentOffice");
    expect(host.methods.indexOf("tools/call:mfc_ca_currentOffice")).toBeLessThan(host.methods.indexOf("tools/list"));
    expect(host.methods).not.toContain("tools/call:mfc_ca_postJournals");
  });
});
