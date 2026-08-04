import type { ResolvedCredential } from "../../core/types.ts";

import { describe, expect, it, vi } from "vitest";
import { normalizeSlackAuthorizationCredential, refreshSlackOAuthCredential } from "./oauth.ts";

type OAuthCredential = Extract<ResolvedCredential, { authType: "oauth2" }>;

describe("Slack OAuth credentials", () => {
  it("moves the initial user grant into provider secret state", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-04T00:00:00.000Z"));
    try {
      const credential = normalizeSlackAuthorizationCredential({
        ...oauthCredential("bot-access", "bot-refresh", "bot", 43_200, "channels:read,chat:write"),
        metadata: {
          rawTokenType: "bot",
          scope: "channels:read,chat:write",
          expires_in: 43_200,
          authed_user: {
            access_token: "user-access",
            refresh_token: "user-refresh",
            token_type: "user",
            expires_in: 3_600,
            scope: "search:read",
          },
        },
      });

      expect(credential).toMatchObject({
        accessToken: "bot-access",
        tokenType: "Bearer",
        expiresAt: "2026-08-04T01:00:00.000Z",
        providerSecret: {
          userGrant: {
            accessToken: "user-access",
            refreshToken: "user-refresh",
            expiresAt: "2026-08-04T01:00:00.000Z",
            scopes: ["search:read"],
          },
        },
        profile: {
          grantedScopes: ["channels:read", "chat:write", "search:read"],
        },
      });
      expect(credential.metadata).not.toHaveProperty("authed_user");
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes the user grant before the bot grant and returns one credential", async () => {
    const requestRefreshToken = vi.fn(async (refreshToken: string) =>
      refreshToken === "old-user-refresh"
        ? oauthCredential("new-user-access", "new-user-refresh", "user", 3_600, "search:read")
        : oauthCredential("new-bot-access", "new-bot-refresh", "bot", 43_200, "channels:read,chat:write"),
    );

    const refreshed = await refreshSlackOAuthCredential(
      {
        ...oauthCredential("old-bot-access", "old-bot-refresh", "bot", 43_200, "channels:read,chat:write"),
        providerSecret: {
          userGrant: {
            accessToken: "old-user-access",
            refreshToken: "old-user-refresh",
            expiresAt: "2026-08-04T00:00:00.000Z",
            scopes: ["search:read"],
          },
        },
        profile: {
          accountId: "U123",
          displayName: "Example workspace",
          grantedScopes: ["channels:read", "chat:write", "search:read"],
        },
      },
      requestRefreshToken,
    );

    expect(requestRefreshToken.mock.calls.map(([refreshToken]) => refreshToken)).toEqual([
      "old-user-refresh",
      "old-bot-refresh",
    ]);
    expect(refreshed).toMatchObject({
      accessToken: "new-bot-access",
      refreshToken: "new-bot-refresh",
      tokenType: "Bearer",
      profile: {
        accountId: "U123",
        grantedScopes: ["channels:read", "chat:write", "search:read"],
      },
      providerSecret: {
        userGrant: {
          accessToken: "new-user-access",
          refreshToken: "new-user-refresh",
          scopes: ["search:read"],
        },
      },
    });
    const userGrant = refreshed.providerSecret?.userGrant;
    if (typeof userGrant !== "object" || userGrant === null || !("expiresAt" in userGrant)) {
      throw new Error("expected refreshed Slack user grant expiration");
    }
    expect(refreshed.expiresAt).toBe(userGrant.expiresAt);
  });

  it("keeps old Slack connections on bot-only refresh", async () => {
    const requestRefreshToken = vi.fn(async () =>
      oauthCredential("new-bot-access", "new-bot-refresh", "bot", 43_200, "channels:read"),
    );
    const refreshed = await refreshSlackOAuthCredential(
      oauthCredential("old-bot-access", "old-bot-refresh", "bot", 43_200, "channels:read"),
      requestRefreshToken,
    );

    expect(requestRefreshToken).toHaveBeenCalledOnce();
    expect(refreshed).toMatchObject({
      accessToken: "new-bot-access",
      providerSecret: undefined,
    });
  });

  it("requires reconnect before rotating an incomplete user grant", async () => {
    const requestRefreshToken = vi.fn<() => Promise<OAuthCredential>>();
    const credential = {
      ...oauthCredential("bot-access", "bot-refresh", "bot", 43_200, "channels:read"),
      providerSecret: {
        userGrant: {
          accessToken: "user-access",
          refreshToken: "",
          expiresAt: "2026-08-04T00:00:00.000Z",
          scopes: ["search:read"],
        },
      },
    };

    await expect(refreshSlackOAuthCredential(credential, requestRefreshToken)).rejects.toMatchObject({
      code: "oauth_token_expired",
    });
    expect(requestRefreshToken).not.toHaveBeenCalled();
  });
});

function oauthCredential(
  accessToken: string,
  refreshToken: string,
  rawTokenType: "bot" | "user",
  expiresIn: number,
  scope: string,
): OAuthCredential {
  return {
    authType: "oauth2",
    accessToken,
    tokenType: rawTokenType,
    refreshToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
    profile: {
      accountId: "oauth2",
      displayName: "OAuth Credential",
      grantedScopes: scope.split(","),
    },
    metadata: {
      rawTokenType,
      expires_in: expiresIn,
      scope,
    },
  };
}
