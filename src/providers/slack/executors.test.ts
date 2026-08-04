import type { JsonSchema } from "../../core/types.ts";

import { describe, expect, it } from "vitest";
import { provider } from "./definition.ts";
import { credentialValidators, slackActionHandlers } from "./executors.ts";

function slackFetch(payload: unknown, onRequest?: (url: string, init: RequestInit | undefined) => void): typeof fetch {
  return async (url, init) => {
    onRequest?.(String(url), init);
    return Response.json(payload);
  };
}

describe("Slack message search", () => {
  it("reports bot and user scopes granted by Slack OAuth v2", async () => {
    const validation = await credentialValidators.oauth2?.(
      {
        authType: "oauth2",
        accessToken: "xoxb-test",
        extraAccessTokens: {
          user: "xoxp-test",
        },
        tokenType: "Bearer",
        profile: {
          accountId: "oauth2",
          displayName: "OAuth Credential",
          grantedScopes: [],
        },
        metadata: {
          scope: "channels:read,chat:write",
          authed_user: {
            scope: "search:read",
          },
        },
      },
      {
        fetcher: slackFetch({
          ok: true,
          team: "Sandbox",
          team_id: "T123",
          user_id: "U123",
        }),
      },
    );

    expect(validation?.grantedScopes).toEqual(["channels:read", "chat:write", "search:read"]);
  });

  it("calls search.messages with Slack search parameters and normalizes matches", async () => {
    let requestedUrl = "";
    let authorization = "";

    const result = (await slackActionHandlers.search_messages(
      {
        query: "deploy in:general",
        count: 2,
        page: 3,
        cursor: "*",
        highlight: true,
        sort: "timestamp",
        sortDir: "asc",
        teamId: "T123",
      },
      {
        accessToken: "xoxb-test",
        extraAccessTokens: {
          user: "xoxp-test",
        },
        fetcher: slackFetch(
          {
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
          },
          (url, init) => {
            requestedUrl = url;
            authorization = new Headers(init?.headers).get("authorization") ?? "";
          },
        ),
      },
    )) as {
      matches: Array<{ channelId: string; channelName: string; text: string }>;
      nextCursor: string | null;
      total: number;
    };

    const url = new URL(requestedUrl);
    expect(url.pathname).toBe("/api/search.messages");
    expect(url.searchParams.get("query")).toBe("deploy in:general");
    expect(url.searchParams.get("count")).toBe("2");
    expect(url.searchParams.get("page")).toBe("3");
    expect(url.searchParams.get("cursor")).toBe("*");
    expect(url.searchParams.get("highlight")).toBe("true");
    expect(url.searchParams.get("sort")).toBe("timestamp");
    expect(url.searchParams.get("sort_dir")).toBe("asc");
    expect(url.searchParams.get("team_id")).toBe("T123");
    expect(authorization).toBe("Bearer xoxp-test");
    expect(result.total).toBe(9);
    expect(result.nextCursor).toBe("next-cursor");
    expect(result.matches).toEqual([
      expect.objectContaining({
        channelId: "C123",
        channelName: "general",
        text: "deploy is green",
      }),
    ]);
  });

  it("requires the Slack user token for message search", async () => {
    await expect(
      slackActionHandlers.search_messages(
        {
          query: "deploy",
        },
        {
          accessToken: "xoxb-test",
          fetcher: slackFetch({ ok: true }),
        },
      ),
    ).rejects.toThrow("Reconnect Slack with the search:read user scope before searching messages.");
  });

  it("declares the search scope and Slack pagination limits", () => {
    const action = provider.actions.find((entry) => entry.name === "search_messages");
    const auth = provider.auth.find((entry) => entry.type === "oauth2");
    const inputProperties = action?.inputSchema.properties as Record<string, JsonSchema> | undefined;

    expect(action?.requiredScopes).toEqual(["search:read"]);
    expect(auth).toMatchObject({
      scopes: expect.not.arrayContaining(["search:read"]),
      userScopes: ["search:read"],
      extraAccessTokenPaths: {
        user: "authed_user.access_token",
      },
    });
    expect(inputProperties?.query).toMatchObject({ type: "string", minLength: 1 });
    expect(inputProperties?.count).toMatchObject({ type: "integer", minimum: 1, maximum: 100 });
    expect(inputProperties?.page).toMatchObject({ type: "integer", minimum: 1, maximum: 100 });
  });
});
