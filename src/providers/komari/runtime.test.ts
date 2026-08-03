import { afterEach, describe, expect, it } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { komariActionHandlers, normalizeKomariBaseUrl, validateKomariCredential } from "./runtime.ts";

afterEach(() => setPrivateNetworkAccessAllowed(false));

describe("normalizeKomariBaseUrl", () => {
  it("normalizes instance and RPC endpoint URLs while preserving proxy paths", () => {
    expect(normalizeKomariBaseUrl("https://monitor.example.com/komari/api/rpc2?x=1#hash")).toBe(
      "https://monitor.example.com/komari",
    );
    expect(normalizeKomariBaseUrl("https://monitor.example.com/api/")).toBe("https://monitor.example.com");
  });

  it("gates private-network instances and always rejects embedded credentials", () => {
    expect(() => normalizeKomariBaseUrl("http://10.0.0.8:25774")).toThrow(ProviderRequestError);
    expect(normalizeKomariBaseUrl("http://10.0.0.8:25774", true)).toBe("http://10.0.0.8:25774");
    expect(() => normalizeKomariBaseUrl("https://admin:secret@monitor.example.com")).toThrow(
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
      grantedScopes: [],
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
      { uuid: "9a7b4379-b85f-4ed3-a942-12e097cf4c77", loadType: "cpu", hours: 12 },
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
    expect(output).toEqual({ count: 0, records: [], loadType: "cpu", hasGpuData: false });
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
  });

  it("maps Komari permission errors without exposing response details", async () => {
    const fetcher = async (): Promise<Response> =>
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32041, message: "Unauthorized.", data: { token: "secret" } },
      });

    await expect(
      validateKomariCredential({ baseUrl: "https://monitor.example.com" }, "bad-key", fetcher),
    ).rejects.toMatchObject({ status: 400, message: "Unauthorized." });
  });
});
