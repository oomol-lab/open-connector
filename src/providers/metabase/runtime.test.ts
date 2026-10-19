import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { validateActionInput } from "../../core/validation.ts";
import { metabaseActions } from "./actions.ts";
import { credentialValidators, executors, proxy } from "./executors.ts";
import { normalizeMetabaseUrls } from "./runtime.ts";

const credential: ResolvedCredential = {
  authType: "api_key",
  apiKey: "old-api-key",
  values: { instanceUrl: "https://old.example.com/wrong" },
  metadata: { apiBaseUrl: "https://metabase.example.com/bi/api" },
  profile: { accountId: "1", displayName: "Test", grantedScopes: [] },
};
const context: ExecutionContext = { getCredential: async () => credential };

afterEach(() => {
  vi.unstubAllGlobals();
  setPrivateNetworkAccessAllowed(false);
});

interface RestCase {
  name: string;
  input: Record<string, unknown>;
  path: string;
  outputKey: string;
  payload: unknown;
}
const cases: RestCase[] = [
  { name: "get_current_user", input: {}, path: "/user/current", outputKey: "user", payload: { id: 1 } },
  {
    name: "list_databases",
    input: { include: "tables", includeAnalytics: false, canQuery: true, canWriteMetadata: false },
    path: "/database?include=tables&include_analytics=false&can-query=true&can-write-metadata=false",
    outputKey: "databases",
    payload: { data: [{ id: 1 }] },
  },
  {
    name: "get_database",
    input: { id: 1, include: "tables.fields", excludeUneditableDetails: true },
    path: "/database/1?include=tables.fields&exclude_uneditable_details=true",
    outputKey: "database",
    payload: { id: 1 },
  },
  {
    name: "list_collections",
    input: { archived: false, excludeOtherUserCollections: true, namespace: "snippets", personalOnly: false },
    path: "/collection?archived=false&exclude-other-user-collections=true&namespace=snippets&personal-only=false",
    outputKey: "collections",
    payload: [{ id: 1 }],
  },
  {
    name: "get_collection",
    input: { id: "root" },
    path: "/collection/root",
    outputKey: "collection",
    payload: { id: "root" },
  },
  {
    name: "list_cards",
    input: { filter: "using_model", modelId: 2 },
    path: "/card?f=using_model&model_id=2",
    outputKey: "cards",
    payload: [{ id: 1 }],
  },
  {
    name: "get_card",
    input: { id: "entity-id", legacyMbql: false },
    path: "/card/entity-id?legacy-mbql=false",
    outputKey: "card",
    payload: { id: 1 },
  },
  {
    name: "list_dashboards",
    input: { filter: "mine" },
    path: "/dashboard?f=mine",
    outputKey: "dashboards",
    payload: [{ id: 1 }],
  },
  { name: "get_dashboard", input: { id: 1 }, path: "/dashboard/1", outputKey: "dashboard", payload: { id: 1 } },
  {
    name: "search",
    input: { query: "orders", models: ["card", "table"], collectionId: 2, tableDatabaseId: 1, includeMetadata: false },
    path: "/search?q=orders&collection=2&table_db_id=1&models=card&models=table&include_metadata=false",
    outputKey: "results",
    payload: { data: [{ id: 1 }], total: 1 },
  },
];

describe("Metabase REST compatibility", () => {
  it.each(cases)(
    "preserves $name request and output contracts for an existing credential",
    async ({ name, input, path, outputKey, payload }) => {
      const calls: Array<{ url: string; init?: RequestInit }> = [];
      vi.stubGlobal("fetch", async (url: URL | string, init?: RequestInit) => {
        calls.push({ url: String(url), init });
        return Response.json(payload);
      });
      expect(
        validateActionInput(
          metabaseActions.find((action) => action.name === name)!,
          input,
        ).valid,
      ).toBe(true);
      const result = await executors[`metabase.${name}`]!(input, context);
      const isList = name.startsWith("list_") || name === "search";
      const expectedValue = isList && !Array.isArray(payload) ? (payload as { data: unknown }).data : payload;
      expect(result).toEqual({
        ok: true,
        output: { [outputKey]: expectedValue, raw: Array.isArray(payload) ? { data: payload } : payload },
      });
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe(`https://metabase.example.com/bi/api${path}`);
      expect(calls[0]?.init?.method).toBe("GET");
      expect(new Headers(calls[0]?.init?.headers).get("x-api-key")).toBe("old-api-key");
    },
  );

  it("still validates credentials with REST /user/current, not native MCP discovery", async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (url, init) => {
      calls.push(String(url));
      expect(new Headers(init?.headers).get("x-api-key")).toBe("old-api-key");
      return Response.json({ id: 9, email: "test@example.com", common_name: "Test" });
    };
    const output = await credentialValidators.apiKey!(
      { apiKey: "old-api-key", values: { instanceUrl: "https://metabase.example.com/bi/api" } },
      { fetcher },
    );
    expect(calls).toEqual(["https://metabase.example.com/bi/api/user/current"]);
    expect(output).toMatchObject({
      profile: { accountId: "9", displayName: "Test" },
      grantedScopes: [],
      metadata: { apiBaseUrl: "https://metabase.example.com/bi/api", validationEndpoint: "/user/current" },
    });
  });

  it("keeps proxy authentication and normalized legacy base URL", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: URL | string, init?: RequestInit) => {
      calls.push(String(url));
      expect(new Headers(init?.headers).get("x-api-key")).toBe("old-api-key");
      return Response.json({ id: 3 });
    });
    await expect(proxy({ method: "GET", endpoint: "/card/3" }, context)).resolves.toMatchObject({
      ok: true,
      response: { data: { id: 3 } },
    });
    expect(calls).toEqual(["https://metabase.example.com/bi/api/card/3"]);
  });

  it("uses the same metabase credential and stored API base URL for native discovery", async () => {
    const calls: string[] = [];
    const getCredential = vi.fn(async () => credential);
    vi.stubGlobal("fetch", async (url: URL | string, init?: RequestInit) => {
      calls.push(String(url));
      expect(new Headers(init?.headers).get("x-api-key")).toBe("old-api-key");
      if (init?.method === "GET") return new Response(null, { status: 405 });
      const request = JSON.parse(String(init?.body));
      if (request.id === undefined) return new Response(null, { status: 202 });
      const result =
        request.method === "initialize"
          ? {
              protocolVersion: "2025-03-26",
              capabilities: { tools: {} },
              serverInfo: { name: "Metabase", version: "0.63.16" },
            }
          : { tools: [] };
      return Response.json({ jsonrpc: "2.0", id: request.id, result });
    });
    await expect(executors["metabase.list_mcp_tools"]!({}, { getCredential })).resolves.toMatchObject({
      ok: true,
      output: { tools: [] },
    });
    expect(getCredential).toHaveBeenCalledExactlyOnceWith("metabase");
    expect(calls.every((url) => url === "https://metabase.example.com/bi/api/metabase-mcp")).toBe(true);
  });

  it("does not require MCP availability for existing REST actions", async () => {
    vi.stubGlobal("fetch", async (url: URL | string) =>
      String(url).endsWith("/user/current") ? Response.json({ id: 1 }) : new Response(null, { status: 404 }),
    );
    await expect(executors["metabase.get_current_user"]!({}, context)).resolves.toMatchObject({
      ok: true,
      output: { user: { id: 1 } },
    });
    await expect(executors["metabase.list_mcp_tools"]!({}, context)).resolves.toMatchObject({ ok: false });
  });

  it("retains HTTPS public-only URL policy even with the deployment private-network flag enabled", () => {
    setPrivateNetworkAccessAllowed(true);
    for (const url of ["http://example.com", "https://127.0.0.1", "https://10.0.0.1", "https://user:pass@example.com"])
      expect(() => normalizeMetabaseUrls(url)).toThrow();
    for (const url of ["https://example.com/bi", "https://example.com/bi/api/", "example.com/bi"])
      expect(normalizeMetabaseUrls(url)).toEqual({
        instanceUrl: "https://example.com/bi",
        apiBaseUrl: "https://example.com/bi/api",
      });
  });

  it("rejects missing credentials for both REST and MCP before egress", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    for (const name of ["get_current_user", "list_mcp_tools"])
      await expect(executors[`metabase.${name}`]!({}, { getCredential: async () => undefined })).resolves.toMatchObject(
        { ok: false },
      );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
