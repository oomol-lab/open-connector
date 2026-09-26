import type { OAuthClientConfigService } from "../../oauth/oauth-client-config-service.ts";

import { describe, expect, it, vi } from "vitest";
import { OAuthCredentialRefreshService } from "../../oauth/oauth-credential-refresh-service.ts";
import { ProviderLoader } from "../provider-loader.ts";
import { provider } from "./definition.ts";

function oauth() {
  const auth = provider.auth.find((candidate) => candidate.type === "oauth2");
  if (auth?.type !== "oauth2") {
    throw new Error("slack must keep an oauth2 auth method");
  }
  return auth;
}

describe("Slack provider definition", () => {
  // The user-token app is a PUBLIC client: PKCE on the authorization
  // request, no client secret on the token endpoint. Slack accepts the
  // secret-less code exchange and the secret-less refresh on
  // oauth.v2.user.access for an app with token rotation enabled.
  it("is a public client with PKCE", () => {
    expect(oauth().tokenEndpointAuthMethod).toBe("none");
    expect(oauth().pkce).toEqual({ method: "S256" });
  });

  it("exchanges and refreshes on the same user-token endpoint", () => {
    expect(oauth().tokenUrl).toBe("https://slack.com/api/oauth.v2.user.access");
    // No refreshTokenUrl: a refresh rides tokenUrl, never oauth.v2.access
    // (the bot exchange, which wants the secret).
    expect(oauth().refreshTokenUrl).toBeUndefined();
  });

  it("refreshes a user token on oauth.v2.user.access without a client secret", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe("xoxe-1-old");
      expect(body.get("client_id")).toBe("client-id");
      expect(body.get("client_secret")).toBeNull();
      return Response.json({
        ok: true,
        access_token: "xoxe.xoxp-1-new",
        refresh_token: "xoxe-1-new",
        token_type: "Bearer",
        expires_in: 43_200,
      });
    });
    vi.stubGlobal("fetch", fetcher);
    try {
      const clientConfigs = {
        getOAuthDefinition: () => oauth(),
        getConfig: async () => ({ clientId: "client-id", clientSecret: "", extra: {} }),
        resolveEndpointUrl: (_service: string, endpointUrl: string) => endpointUrl,
      } as unknown as OAuthClientConfigService;
      const providerLoader = new ProviderLoader({ slack: async () => ({ executors: {} }) });
      const refreshed = await new OAuthCredentialRefreshService(clientConfigs, providerLoader).refresh("slack", {
        authType: "oauth2",
        accessToken: "xoxe.xoxp-1-old",
        tokenType: "Bearer",
        expiresAt: new Date(Date.now() - 60_000).toISOString(),
        refreshToken: "xoxe-1-old",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: {},
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(String(fetcher.mock.calls[0][0])).toBe("https://slack.com/api/oauth.v2.user.access");
      expect(refreshed.accessToken).toBe("xoxe.xoxp-1-new");
      expect(refreshed.refreshToken).toBe("xoxe-1-new");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
