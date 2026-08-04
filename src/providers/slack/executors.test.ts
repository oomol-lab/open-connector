import { describe, expect, it, vi } from "vitest";
import { credentialValidators, slackActionHandlers } from "./executors.ts";

describe("Slack message search", () => {
  it("uses the user grant and normalizes message matches", async () => {
    let requestedUrl = "";
    let authorization = "";
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requestedUrl = String(url);
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json({
        ok: true,
        query: "deploy in:general",
        messages: {
          matches: [
            {
              channel: { id: "C123", name: "general" },
              iid: "match-1",
              permalink: "https://example.slack.com/archives/C123/p1508284197000015",
              team: "T123",
              text: "deploy is green",
              ts: "1508284197.000015",
              type: "message",
              user: "U123",
              username: "workflow",
            },
          ],
          pagination: { page: 3, page_count: 5 },
          paging: { page: 3, pages: 5, total: 9 },
          total: 9,
        },
        response_metadata: { next_cursor: "next-cursor" },
      });
    });

    const result = (await slackActionHandlers.search_messages!(
      {
        query: "deploy in:general",
        count: 2,
        cursor: "*",
        highlight: true,
        sort: "timestamp",
        sortDir: "asc",
        teamId: "T123",
      },
      slackContext(fetcher),
    )) as {
      matches: Array<{ channelId: string; channelName: string; text: string }>;
      nextCursor: string | null;
      total: number;
    };

    const url = new URL(requestedUrl);
    expect(url.pathname).toBe("/api/search.messages");
    expect(url.searchParams.get("query")).toBe("deploy in:general");
    expect(url.searchParams.get("count")).toBe("2");
    expect(url.searchParams.get("cursor")).toBe("*");
    expect(url.searchParams.get("highlight")).toBe("true");
    expect(url.searchParams.get("sort")).toBe("timestamp");
    expect(url.searchParams.get("sort_dir")).toBe("asc");
    expect(url.searchParams.get("team_id")).toBe("T123");
    expect(authorization).toBe("Bearer user-access");
    expect(result).toMatchObject({
      total: 9,
      nextCursor: "next-cursor",
      matches: [{ channelId: "C123", channelName: "general", text: "deploy is green" }],
    });
  });

  it("requires a valid user grant", async () => {
    await expect(
      slackActionHandlers.search_messages!(
        { query: "deploy" },
        {
          accessToken: "bot-access",
          fetcher: vi.fn(),
        },
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("rejects mixed page and cursor pagination", async () => {
    await expect(
      slackActionHandlers.search_messages!({ query: "deploy", page: 1, cursor: "next" }, slackContext(vi.fn())),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("reports bot and user scopes from the stored credential", async () => {
    const validation = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "bot-access",
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        providerSecret: {
          userGrant: {
            accessToken: "user-access",
            refreshToken: "",
            scopes: ["search:read"],
          },
        },
        metadata: { scope: "channels:read,chat:write" },
      },
      {
        fetcher: vi.fn(async () => Response.json({ ok: true, team: "Sandbox", user_id: "U123" })),
      },
    );

    expect(validation?.grantedScopes).toEqual(["channels:read", "chat:write", "search:read"]);
  });
});

function slackContext(fetcher: typeof fetch) {
  return {
    accessToken: "bot-access",
    providerSecret: {
      userGrant: {
        accessToken: "user-access",
        refreshToken: "user-refresh",
        expiresAt: "2026-08-05T00:00:00.000Z",
        scopes: ["search:read"],
      },
    },
    fetcher,
  };
}
