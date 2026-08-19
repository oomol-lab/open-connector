import { describe, expect, it } from "vitest";
import { validateActionInput } from "../../core/validation.ts";
import { vercelActions } from "./actions.ts";
import { credentialValidators } from "./executors.ts";
import { readVercelTeamScope, validateVercelCredential, vercelActionHandlers } from "./runtime.ts";

const apiKey = "vercel-token";

function actionContext(fetcher: typeof fetch, team?: { teamId?: string; slug?: string }) {
  return { apiKey, fetcher, ...team };
}

function jsonFetcher(handler: (url: URL, init?: RequestInit) => unknown): typeof fetch {
  return async (input, init) => {
    const payload = handler(new URL(String(input)), init);
    return Response.json(payload);
  };
}

function vercelError(status: number, message: string): Response {
  return Response.json({ error: { code: "not_found", message } }, { status });
}

describe("Vercel team scope schemas", () => {
  it("requires exactly one team selector for get_team", () => {
    const action = vercelActions.find(({ name }) => name === "get_team")!;

    expect(validateActionInput(action, {}).valid).toBe(false);
    expect(validateActionInput(action, { teamId: "team_123" }).valid).toBe(true);
    expect(validateActionInput(action, { slug: "acme" }).valid).toBe(true);
    expect(validateActionInput(action, { teamId: "team_123", slug: "acme" }).valid).toBe(false);
  });

  it("allows at most one team selector for team-scoped actions", () => {
    const action = vercelActions.find(({ name }) => name === "list_projects")!;

    expect(validateActionInput(action, {}).valid).toBe(true);
    expect(validateActionInput(action, { teamId: "team_123" }).valid).toBe(true);
    expect(validateActionInput(action, { slug: "acme" }).valid).toBe(true);
    expect(validateActionInput(action, { teamId: "team_123", slug: "acme" }).valid).toBe(false);
  });
});

describe("Vercel team scope", () => {
  it("rejects credential extra fields that set both teamId and slug", () => {
    expect(() => readVercelTeamScope({ teamId: "team_123", slug: "acme" })).toThrowError(
      "teamId and slug cannot both be provided",
    );
  });

  it("validates a personal token against /v2/user without team query parameters", async () => {
    const result = await validateVercelCredential(
      { apiKey, values: {} },
      jsonFetcher((url, init) => {
        expect(url.toString()).toBe("https://api.vercel.com/v2/user");
        expect(url.searchParams.has("teamId")).toBe(false);
        expect(url.searchParams.has("slug")).toBe(false);
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer vercel-token");
        return { user: { id: "usr_1", username: "alice", name: "Alice" } };
      }),
    );

    expect(result).toMatchObject({
      profile: { accountId: "usr_1", displayName: "Alice" },
      metadata: { validationEndpoint: "/v2/user", userId: "usr_1", username: "alice" },
    });
    expect(result.metadata.teamId).toBeUndefined();
  });

  it("validates an optional team ID after the user endpoint succeeds", async () => {
    const urls: string[] = [];
    const result = await credentialValidators.apiKey!(
      { apiKey, values: { teamId: "team_123" } },
      {
        fetcher: jsonFetcher((url) => {
          urls.push(`${url.pathname}${url.search}`);
          if (url.pathname === "/v2/user") {
            return { user: { id: "usr_1", username: "alice", name: "Alice" } };
          }
          expect(url.pathname).toBe("/v2/teams/team_123");
          return { id: "team_123", slug: "acme", name: "Acme" };
        }),
      },
    );

    expect(urls).toEqual(["/v2/user", "/v2/teams/team_123"]);
    expect(result).toMatchObject({
      profile: { accountId: "team_123", displayName: "Acme" },
      metadata: {
        validationEndpoint: "/v2/teams/team_123",
        userId: "usr_1",
        teamId: "team_123",
        teamSlug: "acme",
        teamName: "Acme",
      },
    });
  });

  it("resolves a credential slug through the team list before GET /v2/teams/{teamId}", async () => {
    const urls: string[] = [];
    const result = await validateVercelCredential(
      { apiKey, values: { slug: "acme" } },
      jsonFetcher((url) => {
        urls.push(`${url.pathname}${url.search}`);
        if (url.pathname === "/v2/user") {
          return { user: { id: "usr_1", name: "Alice" } };
        }
        if (url.pathname === "/v2/teams") {
          expect(url.searchParams.has("slug")).toBe(false);
          return {
            teams: [
              { id: "team_other", slug: "other", name: "Other" },
              { id: "team_123", slug: "acme", name: "Acme" },
            ],
            pagination: { count: 2, next: null, prev: null },
          };
        }
        expect(url.pathname).toBe("/v2/teams/team_123");
        expect(url.search).toBe("");
        return { id: "team_123", slug: "acme", name: "Acme" };
      }),
    );

    expect(urls).toEqual(["/v2/user", "/v2/teams?limit=100", "/v2/teams/team_123"]);
    expect(result.profile).toEqual({ accountId: "team_123", displayName: "Acme" });
    expect(result.metadata.teamSlug).toBe("acme");
  });

  it("paginates the team list until the credential slug is found", async () => {
    const urls: string[] = [];
    const result = await validateVercelCredential(
      { apiKey, values: { slug: "acme" } },
      jsonFetcher((url) => {
        urls.push(`${url.pathname}${url.search}`);
        if (url.pathname === "/v2/user") {
          return { user: { id: "usr_1", name: "Alice" } };
        }
        if (url.pathname === "/v2/teams" && !url.searchParams.get("until")) {
          return {
            teams: [{ id: "team_other", slug: "other", name: "Other" }],
            pagination: { count: 1, next: 1_700_000_000_000, prev: null },
          };
        }
        if (url.pathname === "/v2/teams") {
          expect(url.searchParams.get("until")).toBe("1700000000000");
          return {
            teams: [{ id: "team_123", slug: "acme", name: "Acme" }],
            pagination: { count: 1, next: null, prev: null },
          };
        }
        return { id: "team_123", slug: "acme", name: "Acme" };
      }),
    );

    expect(urls).toEqual([
      "/v2/user",
      "/v2/teams?limit=100",
      "/v2/teams?limit=100&until=1700000000000",
      "/v2/teams/team_123",
    ]);
    expect(result.profile).toEqual({ accountId: "team_123", displayName: "Acme" });
  });
});

describe("Vercel team-scoped REST queries", () => {
  it("lists personal projects without teamId or slug", async () => {
    let requestUrl = "";
    const result = await vercelActionHandlers.list_projects(
      { limit: 5 },
      actionContext(
        jsonFetcher((url) => {
          requestUrl = url.toString();
          return { projects: [{ id: "prj_1", name: "app" }], pagination: { count: 1, next: null, prev: null } };
        }),
      ),
    );

    const url = new URL(requestUrl);
    expect(url.pathname).toBe("/v10/projects");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.has("teamId")).toBe(false);
    expect(url.searchParams.has("slug")).toBe(false);
    expect(result).toEqual({
      projects: [{ id: "prj_1", name: "app" }],
      pagination: { count: 1, next: null, prev: null },
    });
  });

  it("sends teamId as a query parameter on team-owned project lists", async () => {
    let requestUrl = "";
    await vercelActionHandlers.list_projects(
      { teamId: "team_123", repoUrl: "https://github.com/acme/app" },
      actionContext(
        jsonFetcher((url) => {
          requestUrl = url.toString();
          return { projects: [{ id: "prj_1", name: "app" }] };
        }),
      ),
    );

    const url = new URL(requestUrl);
    expect(url.pathname).toBe("/v10/projects");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      teamId: "team_123",
      repoUrl: "https://github.com/acme/app",
    });
  });

  it("sends slug as a query parameter when listing deployments", async () => {
    let requestUrl = "";
    await vercelActionHandlers.list_deployments(
      { slug: "acme", projectId: "prj_1" },
      actionContext(
        jsonFetcher((url) => {
          requestUrl = url.toString();
          return { deployments: [{ id: "dpl_1", name: "app" }] };
        }),
      ),
    );

    expect(Object.fromEntries(new URL(requestUrl).searchParams)).toEqual({
      slug: "acme",
      projectId: "prj_1",
    });
  });

  it("uses the credential team scope when action input omits teamId and slug", async () => {
    let requestUrl = "";
    await vercelActionHandlers.create_project(
      { name: "docs" },
      actionContext(
        jsonFetcher((url, init) => {
          requestUrl = url.toString();
          expect(init?.method).toBe("POST");
          expect(JSON.parse(String(init?.body))).toEqual({ name: "docs" });
          return { id: "prj_2", name: "docs" };
        }),
        { teamId: "team_123" },
      ),
    );

    const url = new URL(requestUrl);
    expect(url.pathname).toBe("/v11/projects");
    expect(url.searchParams.get("teamId")).toBe("team_123");
  });

  it("lets action input override the credential team scope", async () => {
    let requestUrl = "";
    await vercelActionHandlers.get_project(
      { idOrName: "app", slug: "other-team" },
      actionContext(
        jsonFetcher((url) => {
          requestUrl = url.toString();
          return { id: "prj_1", name: "app" };
        }),
        { teamId: "team_123" },
      ),
    );

    const url = new URL(requestUrl);
    expect(url.pathname).toBe("/v9/projects/app");
    expect(url.searchParams.get("slug")).toBe("other-team");
    expect(url.searchParams.has("teamId")).toBe(false);
  });

  it("rejects listing projects when both teamId and slug are provided", async () => {
    await expect(
      vercelActionHandlers.list_projects(
        { teamId: "team_123", slug: "acme" },
        actionContext(async () => {
          throw new Error("fetch should not run");
        }),
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "teamId and slug cannot both be provided",
    });
  });

  it("rejects credential context that sets both teamId and slug when action input omits both", async () => {
    await expect(
      vercelActionHandlers.list_projects(
        { limit: 5 },
        actionContext(
          async () => {
            throw new Error("fetch should not run");
          },
          { teamId: "team_123", slug: "acme" },
        ),
      ),
    ).rejects.toMatchObject({
      status: 400,
      message: "teamId and slug cannot both be provided",
    });
  });

  it("does not attach team query parameters to get_auth_user or list_teams", async () => {
    const urls: string[] = [];
    const fetcher = jsonFetcher((url) => {
      urls.push(`${url.pathname}${url.search}`);
      if (url.pathname === "/v2/user") {
        return { user: { id: "usr_1", name: "Alice" } };
      }
      return { teams: [{ id: "team_123", slug: "acme", name: "Acme" }] };
    });

    await vercelActionHandlers.get_auth_user({}, actionContext(fetcher, { teamId: "team_123" }));
    await vercelActionHandlers.list_teams({ limit: 2 }, actionContext(fetcher, { teamId: "team_123" }));

    expect(urls).toEqual(["/v2/user", "/v2/teams?limit=2"]);
  });

  it("looks up get_team by team ID path and leaves query parameters off", async () => {
    let requestUrl = "";
    const result = await vercelActionHandlers.get_team(
      { teamId: "team_123" },
      actionContext(
        jsonFetcher((url) => {
          requestUrl = url.toString();
          return { id: "team_123", slug: "acme", name: "Acme" };
        }),
        { teamId: "team_default" },
      ),
    );

    const url = new URL(requestUrl);
    expect(url.pathname).toBe("/v2/teams/team_123");
    expect(url.search).toBe("");
    expect(result).toEqual({
      team: { id: "team_123", slug: "acme", name: "Acme" },
    });
  });

  it("resolves get_team slug through the team list before GET /v2/teams/{teamId}", async () => {
    const urls: string[] = [];
    const result = await vercelActionHandlers.get_team(
      { slug: "acme" },
      actionContext(
        jsonFetcher((url) => {
          urls.push(`${url.pathname}${url.search}`);
          if (url.pathname === "/v2/teams") {
            return { teams: [{ id: "team_123", slug: "acme", name: "Acme" }] };
          }
          expect(url.pathname).toBe("/v2/teams/team_123");
          return { id: "team_123", slug: "acme", name: "Acme" };
        }),
      ),
    );

    expect(urls).toEqual(["/v2/teams?limit=100", "/v2/teams/team_123"]);
    expect(result).toEqual({
      team: { id: "team_123", slug: "acme", name: "Acme" },
    });
  });

  it("sends teamId as a query parameter when listing team webhooks", async () => {
    let requestUrl = "";
    await vercelActionHandlers.list_webhooks(
      { teamId: "team_123" },
      actionContext(
        jsonFetcher((url) => {
          requestUrl = url.toString();
          return { webhooks: [{ id: "hook_1", url: "https://example.com/hook" }] };
        }),
      ),
    );

    const url = new URL(requestUrl);
    expect(url.pathname).toBe("/v1/webhooks");
    expect(url.searchParams.get("teamId")).toBe("team_123");
  });

  it("sends teamId as a query parameter when deleting a team webhook", async () => {
    let requestUrl = "";
    const deleted = await vercelActionHandlers.delete_webhook(
      { id: "account_hook_abc", teamId: "team_123" },
      actionContext(async (url, init) => {
        requestUrl = String(url);
        expect(init?.method).toBe("DELETE");
        return new Response(null, { status: 204 });
      }),
    );

    const url = new URL(requestUrl);
    expect(url.pathname).toBe("/v1/webhooks/account_hook_abc");
    expect(url.searchParams.get("teamId")).toBe("team_123");
    expect(deleted).toEqual({ deleted: true });
  });
});

describe("Vercel webhook actions", () => {
  it("deletes a webhook and normalizes a 204 No Content response", async () => {
    let requestUrl = "";
    let requestMethod = "";
    let authorization = "";
    let contentType: string | null = "";

    const deleted = await vercelActionHandlers.delete_webhook(
      { id: "account_hook_abc" },
      actionContext(async (url, init) => {
        requestUrl = String(url);
        requestMethod = String(init?.method);
        const headers = new Headers(init?.headers);
        authorization = String(headers.get("authorization"));
        contentType = headers.get("content-type");
        return new Response(null, { status: 204 });
      }),
    );

    expect(deleted).toEqual({ deleted: true });
    expect(requestMethod).toBe("DELETE");
    expect(requestUrl).toBe("https://api.vercel.com/v1/webhooks/account_hook_abc");
    expect(authorization).toBe("Bearer vercel-token");
    expect(contentType).toBeNull();
  });

  it("encodes the webhook id in the delete path", async () => {
    let requestUrl = "";

    await vercelActionHandlers.delete_webhook(
      { id: "hook/with spaces" },
      actionContext(async (url) => {
        requestUrl = String(url);
        return new Response(null, { status: 204 });
      }),
    );

    expect(requestUrl).toBe("https://api.vercel.com/v1/webhooks/hook%2Fwith%20spaces");
  });

  it("maps missing webhook responses to invalid input", async () => {
    await expect(
      vercelActionHandlers.delete_webhook(
        { id: "missing" },
        actionContext(async () => vercelError(404, "Not Found")),
      ),
    ).rejects.toMatchObject({ status: 400, message: "Not Found" });

    await expect(
      vercelActionHandlers.delete_webhook(
        { id: "gone" },
        actionContext(async () => vercelError(410, "Gone")),
      ),
    ).rejects.toMatchObject({ status: 400, message: "Gone" });
  });

  it("rejects a missing webhook id before making a request", async () => {
    await expect(
      vercelActionHandlers.delete_webhook(
        {},
        actionContext(async () => {
          throw new Error("no request expected");
        }),
      ),
    ).rejects.toMatchObject({ status: 400, message: "id must be a string" });
  });

  it("still parses JSON webhook payloads after empty-body handling", async () => {
    const result = await vercelActionHandlers.get_webhook(
      { id: "account_hook_abc" },
      actionContext(async (url) => {
        expect(String(url)).toBe("https://api.vercel.com/v1/webhooks/account_hook_abc");
        return Response.json({
          id: "account_hook_abc",
          url: "https://example.com/hooks/vercel",
          events: ["deployment.created"],
          createdAt: 1_700_000_000_000,
        });
      }),
    );

    expect(result).toEqual({
      webhook: {
        id: "account_hook_abc",
        url: "https://example.com/hooks/vercel",
        events: ["deployment.created"],
        createdAt: 1_700_000_000_000,
      },
    });
  });

  it("rejects a blank 200 OK list response instead of returning an empty webhook list", async () => {
    await expect(
      vercelActionHandlers.list_webhooks(
        {},
        actionContext(async () => new Response("", { status: 200 })),
      ),
    ).rejects.toMatchObject({ status: 502, message: "vercel returned an empty response" });
  });
});
