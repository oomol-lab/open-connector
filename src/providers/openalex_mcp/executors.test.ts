import type { ResolvedCredential } from "../../core/types.ts";

import { describe, expect, it } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { openalexMcpActionNames } from "./actions.ts";
import { provider } from "./definition.ts";
import { credentialValidators } from "./executors.ts";
import { openalexMcpActionHandlers } from "./runtime-mcp.ts";

interface RpcRequest {
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

const endpoint = "https://mcp.openalex.org/mcp";
const accessToken = "synthetic-openalex-mcp-token";

// The 28 tools OpenAlex's MCP server registered when exercised, sorted.
const officialTools = [
  "analyze_works",
  "answer",
  "calculate_works",
  "check_oql",
  "claim_author_profile",
  "create_alert",
  "delete_alert",
  "find_candidate_works",
  "find_entity",
  "find_experts",
  "find_keywords",
  "get_entity",
  "get_my_account",
  "get_work",
  "group_works",
  "keyword_search",
  "list_citations",
  "list_my_alerts",
  "list_my_curations",
  "read_docs",
  "read_help_page",
  "resolve_references",
  "run_oql",
  "search_entities",
  "search_works",
  "submit",
  "submit_curations",
  "update_alert",
];

// Fixtures follow the shapes the OpenAlex MCP tools return when exercised:
// get_my_account answers the account with the claimed author beside it and
// search_works answers a compact result page with its canonical OQL.
const accountBody = {
  user: { display_name: "Sam Lee", emails: [{ email: "sam@university.edu" }] },
  key: { kind: "personal" },
  claimed_author: { id: "A5081234567", display_name: "Sam Lee" },
};
const worksBody = {
  total_results: 1,
  results: [{ id: "W2100837269", title: "A paper", citations: 12 }],
  canonical_oql: 'works where title-abstract-keywords has "a paper"',
};

function fixture(options: { tools?: string[]; callResult?: (name: string) => unknown } = {}) {
  const calls: RpcRequest[] = [];
  const fetcher: typeof fetch = async (_url, init) => {
    if (init?.method === "DELETE") return new Response(null, { status: 204 });
    if (init?.method === "GET") return new Response(null, { status: 405 });
    const request = JSON.parse(String(init?.body)) as RpcRequest;
    calls.push(request);
    if (request.id === undefined) return new Response(null, { status: 202 });
    let result: Record<string, unknown>;
    switch (request.method) {
      case "initialize":
        result = {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "OpenAlex", version: "1.0.0" },
        };
        break;
      case "tools/list":
        result = {
          tools: (options.tools ?? [...openalexMcpActionNames]).map((name) => ({
            name,
            inputSchema: { type: "object" },
          })),
        };
        break;
      case "tools/call": {
        const name = String(request.params?.name);
        const answer = options.callResult?.(name);
        result = { content: [{ type: "text", text: JSON.stringify(answer === undefined ? worksBody : answer) }] };
        break;
      }
      default:
        throw new Error(`Unexpected method ${request.method}`);
    }
    return Response.json({ jsonrpc: "2.0", id: request.id, result }, { headers: { "mcp-session-id": "test-session" } });
  };
  return { calls, fetcher };
}

function oauthCredential(): Extract<ResolvedCredential, { authType: "oauth2" }> {
  return {
    authType: "oauth2",
    accessToken,
    tokenType: "Bearer",
    profile: { accountId: "pending", displayName: "pending", grantedScopes: [] },
    metadata: { scope: "openalex:query" },
  };
}

function actionNamed(name: string) {
  const action = provider.actions.find((candidate) => candidate.name === name);
  if (!action) throw new Error(`missing action ${name}`);
  return action;
}

describe("openalex_mcp definition", () => {
  it("exposes one action per official OpenAlex MCP tool under the same name", () => {
    expect([...openalexMcpActionNames].sort()).toEqual(officialTools);
  });

  it("writes the register step in the scripted shape a host parses", () => {
    const oauth = provider.auth[0]!;
    if (oauth.type !== "oauth2") throw new Error("expected oauth2");
    const steps = oauth.clientSetup?.steps ?? [];
    const scripted = steps.filter((step) => step.startsWith("POST ") && step.includes(" as JSON to "));
    expect(scripted).toHaveLength(1);
    const match = /^POST (\{.*\}) as JSON to (https:\/\/\S+)\.$/.exec(scripted[0]!);
    expect(match).not.toBeNull();
    expect(match![2]).toBe("https://mcp.openalex.org/oauth/register");
    expect(JSON.parse(match![1]!)).toEqual({
      client_name: "Open Connector",
      redirect_uris: ["<Callback URL>"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "openalex:query",
    });
  });
});

describe("openalex_mcp action input schemas", () => {
  it("accept the official shapes and refuse missing required fields and unknown enum values", () => {
    const valid = (name: string, input: unknown) => validateActionInput(actionNamed(name), input).valid;
    expect(valid("get_my_account", {})).toBe(true);
    expect(valid("search_works", { mode: "semantic", limit: 5 })).toBe(true);
    expect(valid("search_works", { countries: ["US", "GB"], include_retracted: false })).toBe(true);
    expect(valid("get_work", {})).toBe(false);
    expect(valid("search_works", { mode: "bogus" })).toBe(false);
  });
});

describe("openalex_mcp action handlers", () => {
  it("forward the compacted input to the same-named tool and answer result beside raw", async () => {
    const host = fixture();
    const output = (await openalexMcpActionHandlers.search_works(
      { query: "CRISPR", limit: 5, page: undefined },
      { accessToken, fetcher: host.fetcher, signal: undefined },
    )) as { result: unknown; raw: string };
    expect(host.calls.filter((call) => call.method === "tools/call").map((call) => call.params)).toEqual([
      { name: "search_works", arguments: { query: "CRISPR", limit: 5 } },
    ]);
    expect(output.result).toEqual(worksBody);
    expect(output.raw).toBe(JSON.stringify(worksBody));
  });

  it("call get_my_account with no arguments", async () => {
    const host = fixture({ callResult: (name) => (name === "get_my_account" ? accountBody : null) });
    const output = (await openalexMcpActionHandlers.get_my_account(
      {},
      {
        accessToken,
        fetcher: host.fetcher,
        signal: undefined,
      },
    )) as { result: unknown };
    expect(output.result).toEqual(accountBody);
  });
});

describe("openalex_mcp credential validator", () => {
  it("requires the three sign-in tools and reads the profile from get_my_account", async () => {
    const host = fixture({ callResult: (name) => (name === "get_my_account" ? accountBody : null) });
    const result = await credentialValidators.oauth2!(oauthCredential(), { fetcher: host.fetcher });
    expect(result).toEqual({
      profile: { accountId: "A5081234567", displayName: "Sam Lee" },
      grantedScopes: ["openalex:query"],
      metadata: { mcpEndpoint: endpoint, discoveredToolCount: 28 },
    });
  });

  it("falls back to the account email when no author profile is claimed", async () => {
    const host = fixture({
      callResult: (name) =>
        name === "get_my_account"
          ? { user: { display_name: "Sam Lee", emails: ["sam@university.edu"] }, claimed_author: null }
          : null,
    });
    const result = await credentialValidators.oauth2!(oauthCredential(), { fetcher: host.fetcher });
    expect(result).toMatchObject({ profile: { accountId: "sam@university.edu", displayName: "Sam Lee" } });
  });

  it("refuses sign-in naming the missing tools and never calls a tool", async () => {
    const host = fixture({ tools: ["get_my_account", "search_works"] });
    await expect(credentialValidators.oauth2!(oauthCredential(), { fetcher: host.fetcher })).rejects.toThrow(
      /get_work/,
    );
    expect(host.calls.filter((call) => call.method === "tools/call")).toHaveLength(0);
  });
});
