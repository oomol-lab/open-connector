import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { komariActions } from "./actions.ts";
import { komariOperations } from "./operations.ts";
import { komariActionHandlers, normalizeKomariBaseUrl, validateKomariCredential } from "./runtime.ts";

beforeEach(() => setPrivateNetworkAccessAllowed(false));
afterEach(() => setPrivateNetworkAccessAllowed(false));

describe("normalizeKomariBaseUrl", () => {
  it("normalizes instance and RPC endpoint URLs while preserving proxy paths", () => {
    expect(normalizeKomariBaseUrl("https://monitor.example.com/komari/api/rpc2?x=1#hash", false)).toBe(
      "https://monitor.example.com/komari",
    );
    expect(normalizeKomariBaseUrl("https://monitor.example.com/api/", false)).toBe("https://monitor.example.com");
  });

  it("gates private-network instances and always rejects embedded credentials", () => {
    expect(() => normalizeKomariBaseUrl("http://10.0.0.8:25774", false)).toThrow(ProviderRequestError);
    expect(normalizeKomariBaseUrl("http://10.0.0.8:25774", true)).toBe("http://10.0.0.8:25774");
    expect(() => normalizeKomariBaseUrl("https://admin:secret@monitor.example.com", false)).toThrow(
      "baseUrl must not include credentials",
    );
  });
});

describe("Komari RPC runtime", () => {
  it("validates the API key and records server identity metadata", async () => {
    const requests: Array<{ url: string; authorization: string | null; method: string }> = [];
    const fetcher = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const body = JSON.parse(String(init?.body)) as { method: string };
      requests.push({
        url: String(input),
        authorization: new Headers(init?.headers).get("authorization"),
        method: body.method,
      });
      const result =
        body.method === "public:getVersion" ? { version: "1.3.2", hash: "05a91adc" } : { type: "sqlite", size: 42 };
      return Response.json({ jsonrpc: "2.0", id: 1, result });
    };

    const validation = await validateKomariCredential(
      { baseUrl: "https://monitor.example.com/komari" },
      "komari-secret",
      fetcher,
      false,
    );

    expect(requests).toEqual([
      {
        url: "https://monitor.example.com/komari/api/rpc2",
        authorization: "Bearer komari-secret",
        method: "public:getVersion",
      },
      {
        url: "https://monitor.example.com/komari/api/rpc2",
        authorization: "Bearer komari-secret",
        method: "admin:getDatabaseSize",
      },
    ]);
    expect(validation).toEqual({
      profile: { accountId: "komari:monitor.example.com", displayName: "Komari monitor.example.com" },
      grantedScopes: komariOperations.map((operation) => operation.rpcMethod),
      metadata: {
        baseUrl: "https://monitor.example.com/komari",
        version: "1.3.2",
        rpcPath: "/api/rpc2",
      },
    });
  });

  it("maps node history inputs to Komari string parameters", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetcher = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ jsonrpc: "2.0", id: 1, result: { count: 0, records: [], has_gpu_data: false } });
    };

    const output = await komariActionHandlers.get_load_history!(
      { uuid: "9a7b4379-b85f-4ed3-a942-12e097cf4c77", load_type: "cpu", hours: 12 },
      {
        apiKey: "komari-secret",
        baseUrl: "https://monitor.example.com",
        fetcher,
      },
    );

    expect(requestBody).toMatchObject({
      method: "public:getRecordsByUUID",
      params: {
        uuid: "9a7b4379-b85f-4ed3-a942-12e097cf4c77",
        load_type: "cpu",
        hours: "12",
      },
    });
    expect(output).toEqual({ count: 0, records: [], load_type: "cpu", has_gpu_data: false });
  });

  it("declares each JSON-RPC method as its action capability", () => {
    expect(komariActions).toHaveLength(71);
    expect(komariActions.map((action) => action.requiredScopes)).toEqual(
      komariOperations.map((operation) => [operation.rpcMethod]),
    );
  });

  it.each([
    { name: "get_recent_metrics", required: ["uuid"] },
    { name: "get_execution_task", required: ["task_id"] },
    { name: "delete_ping_tasks", required: ["id"] },
    { name: "enable_offline_notifications", required: ["clients"] },
    { name: "query_metrics", required: ["metric_keys"] },
    { name: "edit_client", required: ["uuid"] },
    { name: "update_clipboard", required: ["id"] },
    { name: "delete_session", required: ["session_id"] },
    { name: "execute_command", required: ["command", "clients"] },
    { name: "set_message_sender_provider", required: ["name"] },
    { name: "get_client_task_result", required: ["task_id", "uuid"] },
  ])("declares the required inputs for $name", ({ name, required }) => {
    expect(komariActions.find((action) => action.name === name)?.inputSchema.required).toEqual(required);
  });

  it("never returns Komari client tokens from the node list", async () => {
    const fetcher = async (): Promise<Response> =>
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: [
          {
            uuid: "9a7b4379-b85f-4ed3-a942-12e097cf4c77",
            name: "edge-1",
            os: "linux",
            token: "client-secret",
            ipv4: "192.0.2.10",
          },
        ],
      });

    const output = await komariActionHandlers.list_nodes!(
      {},
      {
        apiKey: "komari-secret",
        baseUrl: "https://monitor.example.com",
        fetcher,
      },
    );

    expect(output).toEqual({
      nodes: [{ uuid: "9a7b4379-b85f-4ed3-a942-12e097cf4c77", name: "edge-1", os: "linux" }],
    });

    const adminOutput = await komariActionHandlers.list_clients!(
      {},
      {
        apiKey: "komari-secret",
        baseUrl: "https://monitor.example.com",
        fetcher,
      },
    );
    expect(adminOutput).toEqual({
      clients: [
        {
          uuid: "9a7b4379-b85f-4ed3-a942-12e097cf4c77",
          name: "edge-1",
          os: "linux",
          ipv4: "192.0.2.10",
        },
      ],
    });
  });

  it("maps Komari permission errors without exposing response details", async () => {
    const fetcher = async (): Promise<Response> =>
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32041, message: "Unauthorized.", data: { token: "secret" } },
      });

    await expect(
      validateKomariCredential({ baseUrl: "https://monitor.example.com" }, "bad-key", fetcher, false),
    ).rejects.toMatchObject({ status: 400, message: "Unauthorized." });
  });

  it.each([
    { name: "invalid parameters", code: -32602, status: 400 },
    { name: "cancelled", code: -32010, status: 409 },
    { name: "deadline exceeded", code: -32011, status: 504 },
    { name: "aborted", code: -32021, status: 409 },
    { name: "out of range", code: -32022, status: 400 },
    { name: "unauthenticated", code: -32040, status: 401 },
    { name: "permission denied", code: -32041, status: 403 },
    { name: "not found", code: -32044, status: 404 },
    { name: "already exists", code: -32045, status: 409 },
    { name: "unimplemented", code: -32050, status: 501 },
    { name: "unavailable", code: -32051, status: 503 },
  ])("maps Komari $name errors to status $status", async ({ code, status }) => {
    const fetcher = async (): Promise<Response> =>
      Response.json({ jsonrpc: "2.0", id: 1, error: { code, message: "Komari operation failed" } });

    await expect(
      komariActionHandlers.get_execution_task!(
        { task_id: "missing" },
        { apiKey: "komari-secret", baseUrl: "https://monitor.example.com", fetcher },
      ),
    ).rejects.toMatchObject({ status, message: "Komari operation failed" });
  });

  it("converts ping task IDs and hours to Komari string parameters", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetcher = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({
        jsonrpc: "2.0",
        id: 1,
        result: { count: 0, records: [], basic_info: [], tasks: [] },
      });
    };

    await komariActionHandlers.get_ping_history!(
      { task_id: 23, hours: 6 },
      { apiKey: "komari-secret", baseUrl: "https://monitor.example.com", fetcher },
    );

    expect(requestBody).toMatchObject({
      method: "public:getPingRecords",
      params: { task_id: "23", hours: "6" },
    });
  });

  it("maps non-success HTTP responses to their status and safe message", async () => {
    const fetcher = async (): Promise<Response> => Response.json({ message: "upstream unavailable" }, { status: 503 });

    await expect(
      komariActionHandlers.get_version!(
        {},
        { apiKey: "komari-secret", baseUrl: "https://monitor.example.com", fetcher },
      ),
    ).rejects.toMatchObject({ status: 503, message: "upstream unavailable" });
  });

  it("maps invalid JSON and missing JSON-RPC results to bad gateway", async () => {
    const context = {
      apiKey: "komari-secret",
      baseUrl: "https://monitor.example.com",
      fetcher: async (): Promise<Response> => new Response("{not-json"),
    };
    await expect(komariActionHandlers.get_version!({}, context)).rejects.toMatchObject({
      status: 502,
      message: "Komari returned invalid JSON",
    });

    context.fetcher = async (): Promise<Response> => Response.json({ jsonrpc: "2.0", id: 1 });
    await expect(komariActionHandlers.get_version!({}, context)).rejects.toMatchObject({
      status: 502,
      message: "Komari returned a JSON-RPC response without a result",
    });
  });

  it("maps aborted requests to gateway timeout", async () => {
    const fetcher = async (): Promise<Response> => {
      throw new DOMException("aborted", "AbortError");
    };

    await expect(
      komariActionHandlers.get_version!(
        {},
        { apiKey: "komari-secret", baseUrl: "https://monitor.example.com", fetcher },
      ),
    ).rejects.toMatchObject({ status: 504, message: "Komari request timed out" });
  });

  it("redacts session tokens and IPs and revokes sessions by a stable identifier", async () => {
    const requests: Array<{ method: string; params: unknown }> = [];
    const fetcher = async (_input: string | URL | Request, init?: RequestInit): Promise<Response> => {
      const body = JSON.parse(String(init?.body)) as { method: string; params: unknown };
      requests.push(body);
      if (body.method === "admin:getSessions") {
        return Response.json({
          jsonrpc: "2.0",
          id: 1,
          result: {
            current: "session-secret",
            data: [
              {
                session: "session-secret",
                uuid: "9a7b4379-b85f-4ed3-a942-12e097cf4c77",
                ip: "192.0.2.10",
                latest_ip: "192.0.2.11",
                login_method: "password",
                created_at: "2026-08-03T00:00:00Z",
              },
            ],
          },
        });
      }
      return Response.json({ jsonrpc: "2.0", id: 1, result: null });
    };
    const context = { apiKey: "komari-secret", baseUrl: "https://monitor.example.com", fetcher };

    const output = (await komariActionHandlers.list_sessions!({}, context)) as {
      current_session_id: string;
      sessions: Array<{ session_id: string }>;
    };
    expect(output.current_session_id).toHaveLength(64);
    expect(output.sessions[0]?.session_id).toBe(output.current_session_id);
    expect(JSON.stringify(output)).not.toContain("session-secret");
    expect(JSON.stringify(output)).not.toContain("192.0.2.");

    await expect(
      komariActionHandlers.delete_session!({ session_id: output.current_session_id }, context),
    ).resolves.toEqual({ success: true });
    expect(requests.at(-1)).toMatchObject({
      method: "admin:deleteSession",
      params: { session: "session-secret" },
    });
  });

  it("returns not found when a stable session identifier does not match", async () => {
    const fetcher = async (): Promise<Response> =>
      Response.json({ jsonrpc: "2.0", id: 1, result: { current: null, data: [] } });
    const context = { apiKey: "komari-secret", baseUrl: "https://monitor.example.com", fetcher };

    await expect(komariActionHandlers.delete_session!({ session_id: "0".repeat(64) }, context)).rejects.toMatchObject({
      status: 404,
      message: "Komari session was not found",
    });
  });
});
