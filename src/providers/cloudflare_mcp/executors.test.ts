import { describe, expect, it, vi } from "vitest";
import { cloudflareMcpActionHandlers, credentialValidators } from "./executors.ts";

describe("Cloudflare MCP executors", () => {
  it("sends bearer auth and maps search to the official MCP tool", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const fetcher = createMcpFetch(calls, "cf-token");

    const output = await cloudflareMcpActionHandlers.search(
      { code: "async () => ['workers']" },
      { accessToken: "cf-token", fetcher },
    );

    expect(output).toEqual(["workers"]);
    expect(calls.find((call) => call.method === "tools/call")?.params).toEqual({
      name: "search",
      arguments: { code: "async () => ['workers']" },
    });
    expect(fetcher).toHaveBeenCalled();
  });

  it("validates both API-token and OAuth bearer credentials with tools/list", async () => {
    const apiKeyResult = await credentialValidators.apiKey!(
      { apiKey: "api-token", values: {} },
      { fetcher: createMcpFetch([], "api-token") },
    );
    const oauthResult = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "oauth-token",
        tokenType: "Bearer",
        profile: { accountId: "pending", displayName: "Pending", grantedScopes: [] },
        metadata: {},
      },
      { fetcher: createMcpFetch([], "oauth-token") },
    );

    expect(apiKeyResult?.metadata?.mcpTools).toEqual(["docs", "execute", "search"]);
    expect(oauthResult?.metadata?.mcpTools).toEqual(["docs", "execute", "search"]);
  });
});

function createMcpFetch(calls: Array<Record<string, unknown>>, expectedToken: string): typeof fetch {
  return vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const rawBody = typeof init?.body === "string" ? init.body : undefined;
    const request = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
    calls.push(request);

    expect(headers.get("authorization")).toBe(`Bearer ${expectedToken}`);
    if (init?.method === "DELETE") return new Response(null, { status: 200 });
    if (!("id" in request)) return new Response(null, { status: 202 });

    const method = request.method;
    const result =
      method === "initialize"
        ? {
            protocolVersion: "2025-03-26",
            capabilities: {},
            serverInfo: { name: "cloudflare-api", version: "1.0.0" },
          }
        : method === "tools/list"
          ? {
              tools: ["docs", "execute", "search"].map((name) => ({
                name,
                inputSchema: { type: "object" },
              })),
            }
          : { content: [{ type: "text", text: '["workers"]' }] };

    return new Response(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }), {
      headers: {
        "content-type": "application/json",
        "mcp-session-id": "test-session",
      },
    });
  }) as typeof fetch;
}
