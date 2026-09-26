import type { ExecutionContext, ResolvedCredential } from "../../core/types.ts";

import { describe, expect, it } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { ProviderRequestError } from "../provider-runtime.ts";
import { provider } from "./definition.ts";
import { credentialValidators, executors } from "./executors.ts";
import { linearMcpActionHandlers, linearMcpToolsByAction } from "./runtime-mcp.ts";

interface RpcRequest {
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

const endpoint = "https://mcp.linear.app/mcp";
const accessToken = "synthetic-linear-mcp-token";
const mappedTools = Object.values(linearMcpToolsByAction);

// Fixtures follow the shapes Linear's MCP tools returned when exercised: the
// list_issues id was the human identifier with the UUID beside it and the
// description clipped; get_user answered the viewer with displayName and name.
const selfBody = {
  id: "8c0b2b7e-1c1e-4b1c-9a0e-5f6d7e8f9a0b",
  email: "me@example.com",
  displayName: "sam",
  name: "Sam",
};
const listBody = {
  issues: [
    {
      id: "ENG-1310",
      uuid: "5c1e3d2a-8f41-4b4e-9d2f-0a1b2c3d4e5f",
      title: "Fix the loader",
      description: "The spinner stays for 10 s and then (truncated, use get_issue to read the full description)",
      url: "https://linear.app/acme/issue/ENG-1310/fix-the-loader",
      state: { id: "state-1", name: "In Progress" },
      priority: 2,
      assignee: { id: "8c0b2b7e-1c1e-4b1c-9a0e-5f6d7e8f9a0b", name: "Sam" },
      team: { id: "team-1", key: "ENG", name: "Engineering" },
      labels: [{ id: "label-1", name: "bug" }, "chore"],
      createdAt: "2026-09-20T10:00:00.000Z",
      updatedAt: "2026-09-25T09:30:00.000Z",
    },
    {
      id: "ENG-1309",
      title: "No description",
      state: "Done",
      assignee: "Alex",
      updatedAt: "2026-09-24T08:00:00.000Z",
    },
    { title: "no id at all" },
  ],
  hasNextPage: true,
  cursor: "cursor-2",
};
const issueBody = {
  issue: {
    id: "5c1e3d2a-8f41-4b4e-9d2f-0a1b2c3d4e5f",
    identifier: "ENG-1310",
    title: "Fix the loader",
    description: "The spinner stays for 10 s and then a false banner appears.",
    creator: { id: "user-2", displayName: "alex" },
    project: { id: "project-1", name: "Acme" },
    dueDate: "2026-10-01",
  },
};
const commentsBody = {
  comments: [
    {
      id: "comment-1",
      body: "Reproduced on the current release.",
      user: { id: "user-2", name: "Alex" },
      createdAt: "2026-09-21T11:00:00.000Z",
      url: "https://linear.app/acme/issue/ENG-1310#comment-1",
    },
    { id: "comment-2", body: "Fixed in the linked pull request.", user: "Sam", createdAt: "2026-09-22T11:00:00.000Z" },
    { body: "no id" },
  ],
};
const bodiesByTool: Record<string, unknown> = {
  get_user: selfBody,
  list_issues: listBody,
  get_issue: issueBody,
  list_comments: commentsBody,
};

interface FixtureOptions {
  tools?: string[];
  toolPages?: string[][];
  status?: number;
  callResult?: (name: string) => Record<string, unknown>;
}

function fixture(options: FixtureOptions = {}) {
  const calls: RpcRequest[] = [];
  const requests: { url: string; method: string; headers: Headers; redirect?: RequestRedirect }[] = [];
  const toolPages = options.toolPages ?? [options.tools ?? mappedTools];
  const fetcher: typeof fetch = async (url, init) => {
    requests.push({
      url: String(url),
      method: init?.method ?? "GET",
      headers: new Headers(init?.headers),
      redirect: init?.redirect,
    });
    if (options.status !== undefined) return new Response("denied", { status: options.status });
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
          serverInfo: { name: "Linear", version: "1.0.0" },
        };
        break;
      case "tools/list": {
        const page = request.params?.cursor === undefined ? 0 : Number(request.params.cursor);
        result = {
          tools: (toolPages[page] ?? []).map((name) => ({ name, inputSchema: { type: "object" } })),
          ...(page + 1 < toolPages.length ? { nextCursor: String(page + 1) } : {}),
        };
        break;
      }
      case "tools/call": {
        const name = String(request.params?.name);
        result = options.callResult?.(name) ?? {
          content: [{ type: "text", text: JSON.stringify(bodiesByTool[name] ?? null) }],
        };
        break;
      }
      default:
        throw new Error(`Unexpected method ${request.method}`);
    }
    return Response.json({ jsonrpc: "2.0", id: request.id, result }, { headers: { "mcp-session-id": "test-session" } });
  };
  const context = { accessToken, fetcher, signal: undefined };
  const toolCalls = () => calls.filter((call) => call.method === "tools/call").map((call) => call.params);
  return { context, calls, requests, fetcher, toolCalls };
}

function oauthCredential(): Extract<ResolvedCredential, { authType: "oauth2" }> {
  return {
    authType: "oauth2",
    accessToken,
    tokenType: "Bearer",
    profile: { accountId: "pending", displayName: "pending", grantedScopes: [] },
    metadata: { scope: "read write" },
  };
}

function actionNamed(name: string) {
  const action = provider.actions.find((candidate) => candidate.name === name);
  if (!action) throw new Error(`missing action ${name}`);
  return action;
}

describe("linear_mcp definition", () => {
  it("declares Linear's MCP authorization server as a public PKCE client with the MCP resource", () => {
    expect(provider.service).toBe("linear_mcp");
    expect(provider.authTypes).toEqual(["oauth2"]);
    expect(provider.auth).toHaveLength(1);
    const oauth = provider.auth[0]!;
    if (oauth.type !== "oauth2") throw new Error("expected oauth2");
    expect(oauth.authorizationUrl).toBe("https://mcp.linear.app/authorize");
    expect(oauth.tokenUrl).toBe("https://mcp.linear.app/token");
    expect(oauth.scopes).toEqual(["read", "write"]);
    expect(oauth.scopeSeparator).toBeUndefined();
    expect(oauth.tokenEndpointAuthMethod).toBe("none");
    expect(oauth.pkce).toEqual({ method: "S256" });
    expect(oauth.authorizationParams).toEqual({ resource: endpoint });
  });

  it("writes the register step in the scripted shape a host parses", () => {
    const oauth = provider.auth[0]!;
    if (oauth.type !== "oauth2") throw new Error("expected oauth2");
    const steps = oauth.clientSetup?.steps ?? [];
    const scripted = steps.filter((step) => step.startsWith("POST ") && step.includes(" as JSON to "));
    expect(scripted).toHaveLength(1);
    const match = /^POST (\{.*\}) as JSON to (https:\/\/\S+)\.$/.exec(scripted[0]!);
    expect(match).not.toBeNull();
    expect(match![2]).toBe("https://mcp.linear.app/register");
    expect(JSON.parse(match![1]!)).toEqual({
      client_name: "Open Connector",
      redirect_uris: ["<Callback URL>"],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: "read write",
    });
  });

  it("maps every action to a tool and spells action ids as service.name", () => {
    expect(provider.actions.map((action) => action.id).sort()).toEqual([
      "linear_mcp.get_issue",
      "linear_mcp.get_self",
      "linear_mcp.list_comments",
      "linear_mcp.list_issues",
    ]);
    expect(Object.keys(linearMcpToolsByAction).sort()).toEqual(provider.actions.map((action) => action.name).sort());
    expect(Object.keys(executors).sort()).toEqual(provider.actions.map((action) => action.id).sort());
    for (const action of provider.actions) expect(action.operationType).toBe("read");
  });
});

describe("linear_mcp action input schemas", () => {
  it("accept the recorded inputs and refuse missing ids, bad limits, and unknown fields", () => {
    const valid = (name: string, input: unknown) => validateActionInput(actionNamed(name), input).valid;
    expect(valid("get_self", {})).toBe(true);
    expect(valid("get_self", { query: "me" })).toBe(false);
    expect(valid("list_issues", {})).toBe(true);
    expect(valid("list_issues", { updatedAt: "-P1D", orderBy: "updatedAt", limit: 50, cursor: "abc" })).toBe(true);
    expect(valid("list_issues", { limit: 0 })).toBe(false);
    expect(valid("list_issues", { limit: "50" })).toBe(false);
    expect(valid("list_issues", { cursor: "" })).toBe(false);
    expect(valid("list_issues", { team: "ENG" })).toBe(false);
    expect(valid("get_issue", { id: "ENG-1310" })).toBe(true);
    expect(valid("get_issue", {})).toBe(false);
    expect(valid("get_issue", { id: "" })).toBe(false);
    expect(valid("list_comments", { issueId: "ENG-1310" })).toBe(true);
    expect(valid("list_comments", { issue_id: "ENG-1310" })).toBe(false);
  });
});

describe("linear_mcp handlers", () => {
  it("get_self calls get_user for me and lifts the viewer", async () => {
    const host = fixture();
    const output = await linearMcpActionHandlers.get_self({}, host.context);
    expect(host.toolCalls()).toEqual([{ name: "get_user", arguments: { query: "me" } }]);
    expect(output).toEqual({
      user: { id: selfBody.id, email: "me@example.com", displayName: "sam", name: "Sam" },
      raw: JSON.stringify(selfBody),
    });
    for (const request of host.requests) {
      expect(request.url).toBe(endpoint);
      expect(request.headers.get("authorization")).toBe(`Bearer ${accessToken}`);
      expect(request.redirect).toBe("manual");
    }
  });

  it("list_issues forwards only the given filters and normalizes the recorded page", async () => {
    const host = fixture();
    const output = await linearMcpActionHandlers.list_issues(
      { updatedAt: "2026-09-24T00:00:00Z", orderBy: "updatedAt", limit: 50, cursor: undefined },
      host.context,
    );
    expect(host.toolCalls()).toEqual([
      { name: "list_issues", arguments: { updatedAt: "2026-09-24T00:00:00Z", orderBy: "updatedAt", limit: 50 } },
    ]);
    expect(output).toMatchObject({ hasNextPage: true, cursor: "cursor-2", raw: JSON.stringify(listBody) });
    const issues = (output as { issues: Record<string, unknown>[] }).issues;
    expect(issues).toHaveLength(2);
    expect(issues[0]).toEqual({
      id: "ENG-1310",
      identifier: "ENG-1310",
      uuid: "5c1e3d2a-8f41-4b4e-9d2f-0a1b2c3d4e5f",
      title: "Fix the loader",
      description: listBody.issues[0]!.description,
      descriptionTruncated: true,
      url: "https://linear.app/acme/issue/ENG-1310/fix-the-loader",
      state: "In Progress",
      priority: 2,
      assignee: "Sam",
      assigneeId: selfBody.id,
      team: "Engineering",
      labels: ["bug", "chore"],
      createdAt: "2026-09-20T10:00:00.000Z",
      updatedAt: "2026-09-25T09:30:00.000Z",
    });
    expect(issues[1]).toEqual({
      id: "ENG-1309",
      identifier: "ENG-1309",
      title: "No description",
      state: "Done",
      assignee: "Alex",
      updatedAt: "2026-09-24T08:00:00.000Z",
    });
  });

  it("list_issues reads a bare array page and infers hasNextPage from the cursor", async () => {
    const asArray = fixture({
      callResult: () => ({ content: [{ type: "text", text: JSON.stringify([{ id: "ENG-1" }]) }] }),
    });
    expect(await linearMcpActionHandlers.list_issues({}, asArray.context)).toEqual({
      issues: [{ id: "ENG-1", identifier: "ENG-1", descriptionTruncated: undefined }],
      hasNextPage: false,
      cursor: null,
      raw: '[{"id":"ENG-1"}]',
    });
    expect(asArray.toolCalls()).toEqual([{ name: "list_issues", arguments: {} }]);
    const withCursor = fixture({
      callResult: () => ({ content: [{ type: "text", text: JSON.stringify({ issues: [], nextCursor: "n2" }) }] }),
    });
    expect(await linearMcpActionHandlers.list_issues({}, withCursor.context)).toMatchObject({
      issues: [],
      hasNextPage: true,
      cursor: "n2",
    });
  });

  it("get_issue unwraps the issue envelope and derives identifier and uuid from the id", async () => {
    const host = fixture();
    const output = await linearMcpActionHandlers.get_issue({ id: " ENG-1310 " }, host.context);
    expect(host.toolCalls()).toEqual([{ name: "get_issue", arguments: { id: "ENG-1310" } }]);
    expect(output).toEqual({
      issue: {
        id: "5c1e3d2a-8f41-4b4e-9d2f-0a1b2c3d4e5f",
        identifier: "ENG-1310",
        uuid: "5c1e3d2a-8f41-4b4e-9d2f-0a1b2c3d4e5f",
        title: "Fix the loader",
        description: "The spinner stays for 10 s and then a false banner appears.",
        descriptionTruncated: false,
        creator: "alex",
        creatorId: "user-2",
        project: "Acme",
        dueDate: "2026-10-01",
      },
      raw: JSON.stringify(issueBody),
    });
    await expect(linearMcpActionHandlers.get_issue({}, host.context)).rejects.toMatchObject({
      status: 400,
      message: "id is required.",
    });
  });

  it("list_comments keeps id, body, author, time and url per comment", async () => {
    const host = fixture();
    const output = await linearMcpActionHandlers.list_comments({ issueId: "ENG-1310" }, host.context);
    expect(host.toolCalls()).toEqual([{ name: "list_comments", arguments: { issueId: "ENG-1310" } }]);
    expect(output).toEqual({
      comments: [
        {
          id: "comment-1",
          body: "Reproduced on the current release.",
          user: "Alex",
          userId: "user-2",
          createdAt: "2026-09-21T11:00:00.000Z",
          url: "https://linear.app/acme/issue/ENG-1310#comment-1",
        },
        {
          id: "comment-2",
          body: "Fixed in the linked pull request.",
          user: "Sam",
          createdAt: "2026-09-22T11:00:00.000Z",
        },
      ],
      raw: JSON.stringify(commentsBody),
    });
  });

  it("keeps raw and empties the typed fields when the tool answers with prose instead of JSON", async () => {
    const host = fixture({
      callResult: () => ({
        content: [
          { type: "text", text: "No issues matched." },
          { type: "text", text: "Try again." },
        ],
      }),
    });
    expect(await linearMcpActionHandlers.list_issues({}, host.context)).toEqual({
      issues: [],
      hasNextPage: false,
      cursor: null,
      raw: "No issues matched.\nTry again.",
    });
    expect(await linearMcpActionHandlers.get_self({}, host.context)).toEqual({
      user: null,
      raw: "No issues matched.\nTry again.",
    });
    expect(await linearMcpActionHandlers.list_comments({ issueId: "ENG-1" }, host.context)).toEqual({
      comments: [],
      raw: "No issues matched.\nTry again.",
    });
  });

  it("prefers structuredContent for the typed fields while raw stays the text", async () => {
    const host = fixture({
      callResult: () => ({
        content: [{ type: "text", text: "rendered" }],
        structuredContent: { issues: [{ id: "ENG-7" }], hasNextPage: false },
      }),
    });
    expect(await linearMcpActionHandlers.list_issues({}, host.context)).toMatchObject({
      issues: [{ id: "ENG-7" }],
      hasNextPage: false,
      cursor: null,
      raw: "rendered",
    });
  });

  it("maps a tool error to 502 and a rejected token to 401 while executing", async () => {
    const failing = fixture({ callResult: () => ({ isError: true, content: [{ type: "text", text: "boom" }] }) });
    await expect(linearMcpActionHandlers.get_issue({ id: "ENG-1" }, failing.context)).rejects.toMatchObject({
      status: 502,
      message: "Linear MCP tool get_issue failed.",
    });
    const unauthorized = fixture({ status: 401 });
    await expect(linearMcpActionHandlers.get_self({}, unauthorized.context)).rejects.toMatchObject({
      status: 401,
      message: "Linear MCP credential is invalid or expired; reconnect Linear.",
    });
  });

  it("dispatches through the OAuth executor with the stored credential", async () => {
    const host = fixture();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = host.fetcher;
    try {
      const context: ExecutionContext = {
        async getCredential(service) {
          return service === "linear_mcp" ? oauthCredential() : undefined;
        },
      };
      const output = await executors["linear_mcp.get_self"]!({}, context);
      expect(output).toMatchObject({ ok: true, output: { user: { id: selfBody.id } } });
      expect(host.toolCalls()).toEqual([{ name: "get_user", arguments: { query: "me" } }]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("linear_mcp credential validator", () => {
  it("lists tools across pages, requires every mapped tool, and reads the profile from get_user me", async () => {
    const host = fixture({
      toolPages: [
        ["get_user", "list_issues", "create_issue"],
        ["get_issue", "list_comments"],
      ],
    });
    const result = await credentialValidators.oauth2!(oauthCredential(), { fetcher: host.fetcher });
    expect(result).toEqual({
      profile: { accountId: selfBody.id, displayName: "sam" },
      grantedScopes: ["read", "write"],
      metadata: { mcpEndpoint: endpoint, discoveredToolCount: 5 },
    });
    expect(host.calls.filter((call) => call.method === "tools/list").map((call) => call.params?.cursor)).toEqual([
      undefined,
      "1",
    ]);
    expect(host.toolCalls()).toEqual([{ name: "get_user", arguments: { query: "me" } }]);
    expect(host.calls.filter((call) => call.method === "initialize")).toHaveLength(1);
  });

  it("refuses sign-in naming the missing tools and never calls the self tool", async () => {
    const host = fixture({ tools: ["get_user", "list_issues", "list_my_issues"] });
    await expect(credentialValidators.oauth2!(oauthCredential(), { fetcher: host.fetcher })).rejects.toMatchObject({
      status: 502,
      message:
        "Linear MCP did not expose the get_issue, list_comments tools this connector needs; Linear may have renamed them.",
    });
    expect(host.toolCalls()).toEqual([]);
    const oneMissing = fixture({ tools: ["get_user", "list_issues", "get_issue"] });
    await expect(
      credentialValidators.oauth2!(oauthCredential(), { fetcher: oneMissing.fetcher }),
    ).rejects.toMatchObject({
      message: "Linear MCP did not expose the list_comments tool this connector needs; Linear may have renamed it.",
    });
  });

  it("refuses a self answer without an id and maps a rejected token to 400 while validating", async () => {
    const noId = fixture({
      callResult: (name) => ({
        content: [{ type: "text", text: name === "get_user" ? JSON.stringify({ email: "x@example.com" }) : "{}" }],
      }),
    });
    await expect(credentialValidators.oauth2!(oauthCredential(), { fetcher: noId.fetcher })).rejects.toMatchObject({
      status: 502,
      message: "Linear MCP did not return the signed-in user.",
    });
    const unauthorized = fixture({ status: 401 });
    const error = await credentialValidators.oauth2!(oauthCredential(), { fetcher: unauthorized.fetcher }).catch(
      (thrown: unknown) => thrown,
    );
    expect(error).toBeInstanceOf(ProviderRequestError);
    expect(error).toMatchObject({
      status: 400,
      message: "Linear MCP credential is invalid or expired; reconnect Linear.",
    });
  });
});
