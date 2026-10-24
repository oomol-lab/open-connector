import { describe, expect, it } from "vitest";
import { ProviderRequestError } from "../provider-runtime.ts";
import { komariActions } from "./actions.ts";
import { komariOperations } from "./operations.ts";
import { komariActionHandlers, normalizeKomariBaseUrl, validateKomariCredential } from "./runtime.ts";

describe("normalizeKomariBaseUrl", () => {
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
});
