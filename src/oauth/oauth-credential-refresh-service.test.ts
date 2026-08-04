import type { ResolvedCredential } from "../core/types.ts";
import type { OAuthClientConfigService } from "./oauth-client-config-service.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { OAuthCredentialRefreshService } from "./oauth-credential-refresh-service.ts";

type OAuthCredential = Extract<ResolvedCredential, { authType: "oauth2" }>;

const clientConfigs = {
  getOAuthDefinition: () => ({ type: "oauth2", tokenUrl: "https://provider.example.com/oauth/token" }),
  getConfig: async () => ({ clientId: "client-id", clientSecret: "client-secret", extra: {} }),
  resolveEndpointUrl: (_service: string, endpointUrl: string) => endpointUrl,
} as unknown as OAuthClientConfigService;

/** A stored credential whose access token has already lapsed, which is when a refresh runs. */
function expiredCredential(metadata: Record<string, unknown>): OAuthCredential {
  return {
    authType: "oauth2",
    accessToken: "old-access-token",
    tokenType: "Bearer",
    expiresAt: new Date(Date.now() - 60_000).toISOString(),
    refreshToken: "refresh-token",
    profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
    metadata,
  };
}

function stubRefreshResponse(payload: Record<string, unknown>): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ access_token: "new-access-token", ...payload })),
  );
}

describe("OAuthCredentialRefreshService", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps an expiry when the refresh response omits expires_in", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    stubRefreshResponse({});

    const refreshed = await new OAuthCredentialRefreshService(clientConfigs).refresh(
      "example",
      expiredCredential({ expires_in: 3600 }),
    );

    expect(refreshed.expiresAt).toBe(new Date(now + 3600_000).toISOString());
  });

  it("never carries the lapsed expiry forward, which would refresh on every call", async () => {
    const credential = expiredCredential({ expires_in: 3600 });
    stubRefreshResponse({});

    const refreshed = await new OAuthCredentialRefreshService(clientConfigs).refresh("example", credential);

    expect(refreshed.expiresAt).not.toBe(credential.expiresAt);
    expect(Date.parse(refreshed.expiresAt!)).toBeGreaterThan(Date.now());
  });

  it("prefers the expiry the refresh response reports", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    stubRefreshResponse({ expires_in: 120 });

    const refreshed = await new OAuthCredentialRefreshService(clientConfigs).refresh(
      "example",
      expiredCredential({ expires_in: 3600 }),
    );

    expect(refreshed.expiresAt).toBe(new Date(now + 120_000).toISOString());
  });

  it("leaves the expiry unset when no lifetime was ever reported", async () => {
    stubRefreshResponse({});

    const refreshed = await new OAuthCredentialRefreshService(clientConfigs).refresh("example", expiredCredential({}));

    expect(refreshed.expiresAt).toBeUndefined();
  });

  it("carries a reported lifetime through a later refresh that omits it", async () => {
    const service = new OAuthCredentialRefreshService(clientConfigs);
    stubRefreshResponse({ expires_in: 3600 });
    const first = await service.refresh("example", expiredCredential({}));

    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    stubRefreshResponse({});
    const second = await service.refresh("example", { ...first, expiresAt: new Date(now - 60_000).toISOString() });

    expect(second.expiresAt).toBe(new Date(now + 3600_000).toISOString());
  });

  it("keeps the last usable lifetime when a refresh reports an unusable value", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const service = new OAuthCredentialRefreshService(clientConfigs);
    stubRefreshResponse({ expires_in: 0 });
    const first = await service.refresh("example", expiredCredential({ expires_in: 3600 }));

    stubRefreshResponse({});
    const second = await service.refresh("example", { ...first, expiresAt: new Date(now - 60_000).toISOString() });

    expect(second.expiresAt).toBe(new Date(now + 3600_000).toISOString());
  });

  it("keeps the stored refresh token when the response omits a new one", async () => {
    stubRefreshResponse({});

    const refreshed = await new OAuthCredentialRefreshService(clientConfigs).refresh(
      "example",
      expiredCredential({ expires_in: 3600 }),
    );

    expect(refreshed.refreshToken).toBe("refresh-token");
  });
});
