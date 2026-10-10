import type { IConnectionStore, StoredConnection } from "../../connection-service.ts";

import { describe, expect, it, vi } from "vitest";
import { createCatalogStore } from "../../catalog-store.ts";
import { ConnectionService } from "../../connection-service.ts";
import { provider } from "../../providers/cloudflare_worker/definition.ts";
import { NativeHttpRunner } from "./native-http.ts";

function fixture() {
  const catalog = createCatalogStore([provider]);
  const rows = new Map<string, StoredConnection>();
  const store: IConnectionStore = {
    get: async (service, name) => rows.get(`${service}:${name}`),
    set: async (service, connectionName, credential) => {
      const row = { id: crypto.randomUUID(), revision: crypto.randomUUID(), service, connectionName, credential };
      rows.set(`${service}:${connectionName}`, row);
      return row;
    },
    updateCredential: async (row) => {
      rows.set(`${row.service}:${row.connectionName}`, row);
      return true;
    },
    delete: async (service, name) => {
      rows.delete(`${service}:${name}`);
    },
    list: async () => [...rows.values()],
  };
  const providerLoader = {
    loadActionExecutor: async () => undefined,
    loadCredentialValidators: async () => undefined,
    loadProxyExecutor: async () => undefined,
  };
  const connections = new ConnectionService({ catalog, store, providerLoader });
  const fetcher = vi.fn<typeof fetch>(async () => Response.json({ success: true, result: [] }));
  const runner = new NativeHttpRunner({ catalog, connections, providerLoader, fetcher });
  return { runner, store, rows, fetcher };
}

const endpoint = "/accounts/account/workers/observability/telemetry/query";
// Cloudflare's public query contract: Unix milliseconds, inline parameters, dry=true.
// https://developers.cloudflare.com/api/resources/workers/subresources/observability/subresources/telemetry/methods/query/
const query = {
  queryId: "diagnosis",
  dry: true,
  timeframe: { from: 1000, to: 2000 },
  limit: 100,
  view: "events",
  parameters: { filters: [{ key: "$metadata.service", operation: "eq", type: "string", value: "example-worker" }] },
};
function request(body: unknown = query, path = endpoint, method = "POST") {
  return {
    service: "cloudflare_worker",
    connectionName: "selected",
    endpoint: path,
    request: new Request("https://computer.internal/request", {
      method,
      headers: {
        authorization: "Bearer caller-secret",
        cookie: "session=caller-cookie",
        "content-type": "application/json",
      },
      ...(method === "GET" ? {} : { body: JSON.stringify(body) }),
    }),
  };
}

describe("native Plugin HTTP reads", () => {
  it("rejects a hosted account without falling back to local credentials or making a provider request", async () => {
    const f = fixture();
    f.rows.set("cloudflare_worker:selected", {
      source: "saas",
      id: "remote",
      revision: "revision",
      service: "cloudflare_worker",
      connectionName: "selected",
      reference: {
        managedProjectId: "project",
        providerConfigId: "config",
        externalUserId: "user",
        connectedAccountId: "account",
        localRequestId: "request",
      },
      profile: { accountId: "account", displayName: "Hosted account", grantedScopes: [] },
      status: "active",
      comment: null,
    });
    const response = await f.runner.run(request());
    expect(response.status).toBe(501);
    expect(await response.json()).toMatchObject({ error: { code: "connection_transport_unavailable" } });
    expect(f.fetcher).not.toHaveBeenCalled();
  });
  it("uses only the selected credential, retains query output, and withholds secrets", async () => {
    const f = fixture();
    await f.store.set("cloudflare_worker", "selected", {
      authType: "custom_credential",
      values: { apiKey: "selected-provider-token", accountId: "account" },
      profile: { accountId: "account", displayName: "Selected", grantedScopes: [] },
      metadata: {},
    });
    await f.store.set("cloudflare_worker", "default", {
      authType: "custom_credential",
      values: { apiKey: "wrong-provider-token" },
      profile: { accountId: "other", displayName: "Other", grantedScopes: [] },
      metadata: {},
    });
    f.fetcher.mockResolvedValueOnce(
      Response.json({
        result: {
          events: [{ message: "failure selected-provider-token", authorization: "Bearer leaked", requestId: "req-1" }],
        },
        success: true,
      }),
    );
    const response = await f.runner.run(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      result: { events: [{ message: "failure [REDACTED]", authorization: "[REDACTED]", requestId: "req-1" }] },
    });
    const [url, options] = f.fetcher.mock.calls[0]!;
    expect(String(url)).toBe(`https://api.cloudflare.com/client/v4${endpoint}`);
    expect(new Headers(options?.headers).get("authorization")).toBe("Bearer selected-provider-token");
    expect(new Headers(options?.headers).get("cookie")).toBeNull();
    expect(options?.redirect).toBe("manual");
    expect(JSON.parse(String(options?.body))).toEqual(query);
    await f.store.delete("cloudflare_worker", "selected");
    expect((await f.runner.run(request())).status).toBe(409);
    expect(f.fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    { body: { ...query, dry: false } },
    { body: { ...query, limit: 1001 } },
    { body: { ...query, timeframe: { from: 0, to: 86_400_001 } } },
    { body: query, path: "/accounts/account/workers/scripts/deploy", method: "POST" },
    { body: query, path: "https://attacker.invalid/api", method: "GET" },
    { body: query, path: "/accounts/account/workers/%2e%2e/tokens", method: "GET" },
    { body: query, path: "/accounts/account/workers/%252e%252e/tokens", method: "GET" },
  ])(
    "rejects a write, unbounded read, or noncanonical destination before provider access: %j",
    async ({ body, path, method }) => {
      const f = fixture();
      expect((await f.runner.run(request(body, path, method))).status).toBeGreaterThanOrEqual(400);
      expect(f.fetcher).not.toHaveBeenCalled();
    },
  );

  it("reports expired OAuth instead of falling back to another account", async () => {
    const f = fixture();
    await f.store.set("cloudflare_worker", "selected", {
      authType: "oauth2",
      accessToken: "expired-token",
      tokenType: "Bearer",
      expiresAt: new Date(Date.now() - 1000).toISOString(),
      profile: { accountId: "account", displayName: "Selected", grantedScopes: [] },
      metadata: {},
    });
    expect(await f.runner.describe("cloudflare_worker", "selected")).toMatchObject({
      connection: { health: { state: "reconnect_required" } },
    });
    const response = await f.runner.run(request());
    expect(await response.json()).toMatchObject({ error: { code: "oauth_token_expired" } });
    expect(f.fetcher).not.toHaveBeenCalled();
  });

  it.each([
    {
      response: () => new Response(null, { status: 302, headers: { location: "https://attacker.invalid" } }),
      code: "connection_redirect_rejected",
    },
    {
      response: () => new Response("not JSON", { headers: { "content-type": "text/html" } }),
      code: "connection_response_type_unsupported",
    },
  ])("rejects unsafe provider responses: $code", async ({ response, code }) => {
    const f = fixture();
    await f.store.set("cloudflare_worker", "selected", {
      authType: "custom_credential",
      values: { apiKey: "selected-provider-token", accountId: "account" },
      profile: { accountId: "account", displayName: "Selected", grantedScopes: [] },
      metadata: {},
    });
    f.fetcher.mockResolvedValueOnce(response());
    const result = await f.runner.run(request());
    expect(result.status).toBe(502);
    expect(await result.json()).toMatchObject({ error: { code } });
    expect(f.fetcher).toHaveBeenCalledTimes(1);
    expect(f.fetcher.mock.calls[0]?.[1]?.redirect).toBe("manual");
  });
});
