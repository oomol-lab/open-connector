import type { CredentialValidationResult, ResolvedCredential } from "../../core/types.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { setPrivateNetworkAccessAllowed } from "../../core/request.ts";
import { credentialValidators, jiraActionHandlers, normalizeJiraServerApiBaseUrl, proxy } from "./executors.ts";

interface RecordedRequest {
  url: string;
  init?: RequestInit;
}

const personalAccessToken = "jira-pat-test";

afterEach(() => {
  vi.unstubAllGlobals();
  setPrivateNetworkAccessAllowed(false);
});

describe("normalizeJiraServerApiBaseUrl", () => {
  it("builds the REST API v2 base URL and preserves an instance context path", () => {
    expect(normalizeJiraServerApiBaseUrl("https://jira.example.com")).toBe("https://jira.example.com/rest/api/2");
    expect(normalizeJiraServerApiBaseUrl("https://jira.example.com/jira/")).toBe(
      "https://jira.example.com/jira/rest/api/2",
    );
    expect(normalizeJiraServerApiBaseUrl("https://jira.example.com/rest/api/2?a=1#fragment")).toBe(
      "https://jira.example.com/rest/api/2",
    );
    expect(normalizeJiraServerApiBaseUrl("https://jira.example.com/rest/api/3")).toBe(
      "https://jira.example.com/rest/api/2",
    );
    expect(normalizeJiraServerApiBaseUrl("https://jira.example.com/jira/rest/api/latest")).toBe(
      "https://jira.example.com/jira/rest/api/2",
    );
  });

  it("rejects embedded credentials and private targets unless enabled", () => {
    expect(() => normalizeJiraServerApiBaseUrl("https://user:pass@jira.example.com")).toThrow();
    expect(() => normalizeJiraServerApiBaseUrl("http://10.0.0.2")).toThrow();
    setPrivateNetworkAccessAllowed(true);
    expect(normalizeJiraServerApiBaseUrl("http://10.0.0.2")).toBe("http://10.0.0.2/rest/api/2");
    expect(() => normalizeJiraServerApiBaseUrl("http://127.0.0.1")).toThrow();
  });
});

describe("Jira Data Center credentials", () => {
  it("validates a PAT against /myself and scopes the account to its instance", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requests.push({ url: String(input), init });
      return Response.json({ key: "alex", displayName: "Alex", emailAddress: "alex@example.com" });
    });

    const result = (await credentialValidators.customCredential!(
      { values: { baseUrl: "https://example.com/jira", personalAccessToken } },
      { fetcher },
    )) as CredentialValidationResult;

    expect(result).toMatchObject({
      profile: { accountId: "jira:example.com:alex", displayName: "Alex" },
      grantedScopes: [],
      metadata: { apiBaseUrl: "https://example.com/jira/rest/api/2", validationEndpoint: "/myself" },
    });
    expect(requests.map((request) => request.url)).toEqual(["https://example.com/jira/rest/api/2/myself"]);
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(`Bearer ${personalAccessToken}`);
  });
});

describe("Jira Data Center actions", () => {
  it("uses v2 routes and Jira Server text field formats for every action", async () => {
    const requests: RecordedRequest[] = [];
    const responses = [
      [{ id: "1", key: "PROJ", name: "Project" }],
      { id: "1", key: "PROJ", name: "Project" },
      { issues: [], total: 0 },
      { id: "100", key: "PROJ-1", fields: { summary: "Issue" } },
      { id: "101", key: "PROJ-2" },
      { id: "101", key: "PROJ-2", fields: { summary: "Created" } },
      { comments: [], total: 0 },
      { id: "201", body: "comment" },
    ];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requests.push({ url: String(input), init });
      return Response.json(responses.shift());
    });
    const context = {
      accessToken: personalAccessToken,
      fetcher,
      providerMetadata: { apiBaseUrl: "https://jira.example.com/rest/api/2" },
      deployment: "server" as const,
    };
    const adf = {
      type: "doc",
      version: 1,
      content: [{ type: "paragraph", content: [{ type: "text", text: "line" }] }],
    };

    await jiraActionHandlers.list_projects({ limit: 10 }, context);
    await jiraActionHandlers.get_project({ projectIdOrKey: "PROJ" }, context);
    await jiraActionHandlers.search_issues({ jql: "project = PROJ", limit: 10, cursor: "0" }, context);
    await jiraActionHandlers.get_issue({ issueIdOrKey: "PROJ-1" }, context);
    await jiraActionHandlers.create_issue(
      { projectKey: "PROJ", issueTypeName: "Task", summary: "Created", description: adf, assigneeAccountId: "alex" },
      context,
    );
    await jiraActionHandlers.list_issue_comments({ issueIdOrKey: "PROJ-1", limit: 10 }, context);
    await jiraActionHandlers.add_comment({ issueIdOrKey: "PROJ-1", body: adf }, context);

    expect(requests.map((request) => request.url)).toEqual([
      "https://jira.example.com/rest/api/2/project",
      "https://jira.example.com/rest/api/2/project/PROJ",
      "https://jira.example.com/rest/api/2/search",
      "https://jira.example.com/rest/api/2/issue/PROJ-1?fields=summary%2Cdescription%2Cstatus%2Cissuetype%2Cproject%2Cassignee%2Creporter%2Cpriority%2Clabels%2Ccreated%2Cupdated%2Cduedate",
      "https://jira.example.com/rest/api/2/issue",
      "https://jira.example.com/rest/api/2/issue/PROJ-2?fields=summary%2Cdescription%2Cstatus%2Cissuetype%2Cproject%2Cassignee%2Creporter%2Cpriority%2Clabels%2Ccreated%2Cupdated%2Cduedate",
      "https://jira.example.com/rest/api/2/issue/PROJ-1/comment?maxResults=10&startAt=0",
      "https://jira.example.com/rest/api/2/issue/PROJ-1/comment",
    ]);
    expect(readJsonBody(requests[2])).toMatchObject({ jql: "project = PROJ", startAt: 0, maxResults: 10 });
    expect(readJsonBody(requests[4])).toMatchObject({
      fields: { description: "line", assignee: { name: "alex" } },
    });
    expect(readJsonBody(requests[7])).toEqual({ body: "line" });
    for (const request of requests) {
      expect(new Headers(request.init?.headers).get("authorization")).toBe(`Bearer ${personalAccessToken}`);
    }
  });
});

describe("Jira Cloud regression", () => {
  it("keeps the Cloud enhanced JQL path and ADF payloads", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requests.push({ url: String(input), init });
      return Response.json({ issues: [], nextPageToken: "next" });
    });

    await jiraActionHandlers.search_issues(
      { jql: "project = PROJ", limit: 10, cursor: "previous" },
      { accessToken: "cloud-token", fetcher, providerMetadata: { cloudId: "cloud-id" }, deployment: "cloud" },
    );

    expect(requests.map((request) => request.url)).toEqual([
      "https://api.atlassian.com/ex/jira/cloud-id/rest/api/3/search/jql",
    ]);
    expect(readJsonBody(requests[0])).toMatchObject({ nextPageToken: "previous" });
  });
});

describe("Jira Data Center proxy", () => {
  it("uses the configured instance and PAT", async () => {
    const requests = stubGlobalFetch([Response.json({ key: "alex" })]);

    await expect(proxy({ method: "GET", endpoint: "/myself" }, serverExecutionContext())).resolves.toMatchObject({
      ok: true,
      response: { status: 200, data: { key: "alex" } },
    });

    expect(requests.map((request) => request.url)).toEqual(["https://example.com/jira/rest/api/2/myself"]);
    expect(new Headers(requests[0]?.init?.headers).get("authorization")).toBe(`Bearer ${personalAccessToken}`);
  });
});

describe("Jira Data Center server payloads", () => {
  const serverContext = (fetcher: typeof fetch) => ({
    accessToken: personalAccessToken,
    fetcher,
    providerMetadata: { apiBaseUrl: "https://jira.example.com/rest/api/2" },
    deployment: "server" as const,
  });

  it("sends expand as an array on POST /search", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requests.push({ url: String(input), init });
      return Response.json({ issues: [], total: 0 });
    });

    await jiraActionHandlers.search_issues(
      { jql: "project = PROJ", expand: ["names", "schema"] },
      serverContext(fetcher),
    );

    expect(readJsonBody(requests[0])).toMatchObject({ expand: ["names", "schema"] });
  });

  it("preserves mention text and rejects an empty comment body", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requests.push({ url: String(input), init });
      return Response.json({ id: "1" });
    });
    // A mention-only body used to convert to "" (mention text lives in attrs.text); assert it survives.
    const mentionAdf = {
      type: "doc",
      version: 1,
      content: [{ type: "paragraph", content: [{ type: "mention", attrs: { text: "@alex" } }] }],
    };

    await jiraActionHandlers.add_comment({ issueIdOrKey: "PROJ-1", body: mentionAdf }, serverContext(fetcher));
    expect(readJsonBody(requests[0])).toEqual({ body: "@alex" });

    const emptyAdf = { type: "doc", version: 1, content: [{ type: "paragraph", content: [] }] };
    await expect(
      jiraActionHandlers.add_comment({ issueIdOrKey: "PROJ-1", body: emptyAdf }, serverContext(fetcher)),
    ).rejects.toMatchObject({ status: 400 });
    expect(requests).toHaveLength(1);
  });

  it("preserves Server user name/key when normalizing an issue", async () => {
    const fetcher = vi.fn(
      async (): Promise<Response> =>
        Response.json({
          id: "1",
          key: "PROJ-1",
          fields: { summary: "S", assignee: { name: "alex", key: "alex", displayName: "Alex" } },
        }),
    );

    const result = (await jiraActionHandlers.get_issue({ issueIdOrKey: "PROJ-1" }, serverContext(fetcher))) as {
      issue: { assignee?: { name?: string; key?: string; displayName?: string } };
    };

    expect(result.issue.assignee).toMatchObject({ name: "alex", key: "alex", displayName: "Alex" });
  });
});

describe("Jira Cloud write payloads", () => {
  const cloudContext = (fetcher: typeof fetch) => ({
    accessToken: "cloud-token",
    fetcher,
    providerMetadata: { cloudId: "cloud-id" },
    deployment: "cloud" as const,
  });
  const adf = {
    type: "doc",
    version: 1,
    content: [{ type: "paragraph", content: [{ type: "text", text: "line" }] }],
  };

  it("keeps ADF description and accountId assignee for create_issue", async () => {
    const requests: RecordedRequest[] = [];
    const responses = [
      { id: "10", key: "PROJ-9" },
      { id: "10", key: "PROJ-9", fields: { summary: "Created" } },
    ];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requests.push({ url: String(input), init });
      return Response.json(responses.shift());
    });

    await jiraActionHandlers.create_issue(
      { projectKey: "PROJ", issueTypeName: "Task", summary: "Created", description: adf, assigneeAccountId: "acc-1" },
      cloudContext(fetcher),
    );

    expect(requests[0]?.url).toBe("https://api.atlassian.com/ex/jira/cloud-id/rest/api/3/issue");
    expect(readJsonBody(requests[0])).toMatchObject({
      fields: { description: adf, assignee: { accountId: "acc-1" } },
    });
  });

  it("converts bodyText to an ADF document for add_comment", async () => {
    const requests: RecordedRequest[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requests.push({ url: String(input), init });
      return Response.json({ id: "1" });
    });

    await jiraActionHandlers.add_comment({ issueIdOrKey: "PROJ-1", bodyText: "hello" }, cloudContext(fetcher));

    expect(readJsonBody(requests[0])).toMatchObject({
      body: { type: "doc", version: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "hello" }] }] },
    });
  });
});

describe("Jira error mapping", () => {
  const serverContext = (fetcher: typeof fetch) => ({
    accessToken: personalAccessToken,
    fetcher,
    providerMetadata: { apiBaseUrl: "https://jira.example.com/rest/api/2" },
    deployment: "server" as const,
  });

  it("maps a 404 on get_issue to invalid input (status 400)", async () => {
    const fetcher = vi.fn(
      async (): Promise<Response> => Response.json({ errorMessages: ["Issue does not exist"] }, { status: 404 }),
    );

    await expect(
      jiraActionHandlers.get_issue({ issueIdOrKey: "PROJ-404" }, serverContext(fetcher)),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("maps a 5xx response to a provider error (status 502)", async () => {
    const fetcher = vi.fn(async (): Promise<Response> => Response.json({ message: "boom" }, { status: 503 }));

    await expect(jiraActionHandlers.list_projects({}, serverContext(fetcher))).rejects.toMatchObject({ status: 502 });
  });
});

function readJsonBody(request: RecordedRequest | undefined): unknown {
  const body = request?.init?.body;
  return typeof body === "string" ? JSON.parse(body) : body;
}

function serverExecutionContext(): { getCredential: () => Promise<ResolvedCredential> } {
  const credential: ResolvedCredential = {
    authType: "custom_credential",
    values: { baseUrl: "https://example.com/jira", personalAccessToken },
    profile: { accountId: "jira:example.com:alex", displayName: "Alex", grantedScopes: [] },
    metadata: {},
  };
  return { getCredential: async () => credential };
}

function stubGlobalFetch(responses: Response[]): RecordedRequest[] {
  const requests: RecordedRequest[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    requests.push({ url: String(input), init });
    const response = responses.shift();
    if (!response) {
      throw new Error("unexpected extra request");
    }
    return response;
  });
  return requests;
}
