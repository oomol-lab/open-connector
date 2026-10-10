import type { ResolvedCredential } from "../core/types.ts";
import type { OAuthClientConfigService } from "./oauth-client-config-service.ts";

import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderLoader } from "../providers/provider-loader.ts";
import { OAuthCredentialRefreshService } from "./oauth-credential-refresh-service.ts";

type OAuthCredential = Extract<ResolvedCredential, { authType: "oauth2" }>;

const clientConfigs = {
  getOAuthDefinition: () => ({
    type: "oauth2",
    tokenUrl: "https://provider.example.com/oauth/token",
    tokenEndpointAuthMethod: "client_secret_post",
    scopes: [],
  }),
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

  // A refresh rotates tokens INSIDE an existing authorization — it is not a
  // new consent — so the provenance has to survive it.
  //
  // The case that matters is a provider runtime returning its OWN `metadata`:
  // that spreads over `...credential.metadata`, so without carrying the field
  // forward explicitly the connection loses its provenance on first refresh,
  // hours after the consent it describes. A stub that returns no metadata
  // passes either way and proves nothing, so this one returns a conflicting
  // value and asserts the stored one wins.
  it("keeps the stored provenance when a provider runtime returns its own", async () => {
    const providerLoader = new ProviderLoader({
      example: async () => ({
        executors: {},
        oauth: {
          async refreshAccessToken() {
            return {
              accessToken: "provider-refreshed-token",
              tokenType: "Bearer",
              expiresAt: "2026-12-29T00:00:00.000Z",
              metadata: { oauthAuthorizationId: "runtime-supplied", refreshedBy: "provider-runtime" },
            };
          },
        },
      }),
    });

    const refreshed = await new OAuthCredentialRefreshService(clientConfigs, providerLoader).refresh(
      "example",
      expiredCredential({ oauthAuthorizationId: "completed-authorization", expires_in: 3600 }),
    );

    expect(refreshed.metadata.oauthAuthorizationId).toBe("completed-authorization");
    expect(refreshed.metadata.refreshedBy).toBe("provider-runtime");
  });

  // Legacy absence stays absence, under the same pressure: a connection made
  // before provenance existed must not acquire one at refresh time, which
  // would claim a consent nobody recorded.
  it("does not let a refresh invent provenance for a credential that has none", async () => {
    const providerLoader = new ProviderLoader({
      example: async () => ({
        executors: {},
        oauth: {
          async refreshAccessToken() {
            return {
              accessToken: "provider-refreshed-token",
              tokenType: "Bearer",
              expiresAt: "2026-12-29T00:00:00.000Z",
              metadata: { oauthAuthorizationId: "runtime-supplied" },
            };
          },
        },
      }),
    });

    const refreshed = await new OAuthCredentialRefreshService(clientConfigs, providerLoader).refresh(
      "example",
      expiredCredential({ expires_in: 3600 }),
    );

    expect(refreshed.metadata.oauthAuthorizationId).toBeUndefined();
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

  it("keeps the stored lifetime when a provider runtime reports only an expiry", async () => {
    const providerLoader = new ProviderLoader({
      example: async () => ({
        executors: {},
        oauth: {
          async refreshAccessToken() {
            return {
              accessToken: "provider-refreshed-token",
              tokenType: "Bearer",
              expiresAt: "2026-12-29T00:00:00.000Z",
              metadata: { refreshedBy: "provider-runtime" },
            };
          },
        },
      }),
    });

    const refreshed = await new OAuthCredentialRefreshService(clientConfigs, providerLoader).refresh(
      "example",
      expiredCredential({ expires_in: 3600 }),
    );

    expect(refreshed.metadata.expires_in).toBe(3600);
    expect(refreshed.expiresAt).toBe("2026-12-29T00:00:00.000Z");
  });

  it("prefers the lifetime a provider runtime reports without an expiry", async () => {
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
    const providerLoader = new ProviderLoader({
      example: async () => ({
        executors: {},
        oauth: {
          async refreshAccessToken() {
            return {
              accessToken: "provider-refreshed-token",
              tokenType: "Bearer",
              metadata: { expires_in: 120 },
            };
          },
        },
      }),
    });

    const refreshed = await new OAuthCredentialRefreshService(clientConfigs, providerLoader).refresh(
      "example",
      expiredCredential({ expires_in: 3600 }),
    );

    expect(refreshed.metadata.expires_in).toBe(120);
    expect(refreshed.expiresAt).toBe(new Date(now + 120_000).toISOString());
  });

  it("refreshes through a provider OAuth runtime and preserves connection identity", async () => {
    let receivedMetadata: Record<string, unknown> | undefined;
    let receivedProviderSecret: Record<string, unknown> | undefined;
    const providerLoader = new ProviderLoader({
      example: async () => ({
        executors: {},
        oauth: {
          async refreshAccessToken(input) {
            receivedMetadata = input.metadata;
            receivedProviderSecret = input.providerSecret;
            return {
              accessToken: "provider-refreshed-token",
              refreshToken: "provider-refreshed-token",
              tokenType: "Bearer",
              expiresAt: "2026-12-29T00:00:00.000Z",
              providerSecret: { rotated: true },
              metadata: { refreshedBy: "provider-runtime" },
            };
          },
        },
      }),
    });
    const credential = {
      ...expiredCredential({ permissions: "read,write" }),
      providerSecret: { inventory: "stored" },
    };

    const refreshed = await new OAuthCredentialRefreshService(clientConfigs, providerLoader).refresh(
      "example",
      credential,
    );

    expect(refreshed).toMatchObject({
      authType: "oauth2",
      accessToken: "provider-refreshed-token",
      refreshToken: "provider-refreshed-token",
      expiresAt: "2026-12-29T00:00:00.000Z",
      profile: credential.profile,
      metadata: {
        permissions: "read,write",
        refreshedBy: "provider-runtime",
      },
      providerSecret: { rotated: true },
    });
    expect(receivedMetadata).toBe(credential.metadata);
    expect(receivedProviderSecret).toBe(credential.providerSecret);
  });

  it("uses a connection-scoped OAuth client config before the global config", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => {
      return Response.json({ access_token: "new-access-token" });
    });
    vi.stubGlobal("fetch", fetcher);

    await new OAuthCredentialRefreshService(clientConfigs).refresh(
      "example",
      expiredCredential({
        oauthClientConfig: {
          clientId: "connection-client-id",
          clientSecret: "connection-client-secret",
        },
      }),
    );

    const request = fetcher.mock.calls[0]?.[1];
    expect(request?.headers).toMatchObject({
      "content-type": "application/x-www-form-urlencoded",
    });
    expect(String(request?.body)).toContain("client_id=connection-client-id");
    expect(String(request?.body)).toContain("client_secret=connection-client-secret");
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

  it("keeps stored refresh tokens and provider secrets when the response omits them", async () => {
    stubRefreshResponse({});

    const credential = {
      ...expiredCredential({ expires_in: 3600 }),
      providerSecret: { opaque: "provider-owned-secret" },
    };

    const refreshed = await new OAuthCredentialRefreshService(clientConfigs).refresh("example", credential);

    expect(refreshed.refreshToken).toBe("refresh-token");
    expect(refreshed.providerSecret).toEqual(credential.providerSecret);
  });

  it("forwards stored provider parameters during refresh", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({ access_token: "new-access-token" }),
    );
    vi.stubGlobal("fetch", fetcher);
    const credential = {
      ...expiredCredential({ expires_in: 3600 }),
      providerSecret: { oauthRefreshParameters: { employer: "employer-id" } },
    };

    await new OAuthCredentialRefreshService(clientConfigs).refresh("example", credential);

    expect(String(fetcher.mock.calls[0]?.[1]?.body)).toContain("employer=employer-id");
  });
});

describe("OAuthCredentialRefreshService revoke", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function revokingConfigs(revocationUrl: string | undefined, config: unknown): OAuthClientConfigService {
    return {
      getOAuthDefinition: () => ({
        type: "oauth2",
        tokenUrl: "https://provider.example.com/oauth/token",
        revocationUrl,
        tokenEndpointAuthMethod: "none",
        scopes: [],
      }),
      getConfig: async () => config,
      resolveEndpointUrl: (_service: string, endpointUrl: string, resolved: { extra: Record<string, string> }) =>
        endpointUrl.replace("{tenant}", resolved.extra.tenant ?? ""),
    } as unknown as OAuthClientConfigService;
  }

  it("answers unsupported, without a request, when the definition names no revocation endpoint", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const service = new OAuthCredentialRefreshService(revokingConfigs(undefined, undefined));

    await expect(service.revoke("example", expiredCredential({}))).resolves.toBe("unsupported");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("resolves a templated endpoint through the client configuration the credential was minted under", async () => {
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 200 }),
    );
    vi.stubGlobal("fetch", fetcher);
    const service = new OAuthCredentialRefreshService(
      revokingConfigs("https://login.example.com/{tenant}/oauth2/revoke", {
        clientId: "global-client",
        clientSecret: "",
        extra: { tenant: "common" },
      }),
    );

    await expect(
      service.revoke(
        "example",
        expiredCredential({ oauthClientConfig: { clientId: "connection-client", extra: { tenant: "contoso" } } }),
      ),
    ).resolves.toBe("done");

    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(url).toBe("https://login.example.com/contoso/oauth2/revoke");
    const body = init?.body;
    if (!(body instanceof URLSearchParams)) {
      throw new Error("Expected the revocation request body to use URLSearchParams");
    }
    expect(body.get("client_id")).toBe("connection-client");
  });

  it("rejects HTTP endpoints even when no client configuration is stored", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const service = new OAuthCredentialRefreshService(revokingConfigs("http://provider.example.com/revoke", undefined));

    await expect(service.revoke("example", expiredCredential({}))).rejects.toThrow(
      "OAuth revocation URL must use https.",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("refuses a templated endpoint it cannot fill in, so the caller records a failure", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const service = new OAuthCredentialRefreshService(
      revokingConfigs("https://login.example.com/{tenant}/oauth2/revoke", undefined),
    );

    await expect(service.revoke("example", expiredCredential({}))).rejects.toThrow(
      "Configure an OAuth client for example before revoking its token.",
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("OAuthCredentialRefreshService for a credential held outside the runtime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  /** Record the token request bodies sent to the stubbed endpoint. */
  function stubTokenEndpoint(status = 200): string[] {
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        bodies.push(input instanceof Request ? await input.clone().text() : String(init?.body ?? ""));
        return status === 200
          ? Response.json({ access_token: "new-access-token", expires_in: 3600 })
          : Response.json({ error: "invalid_grant" }, { status });
      }),
    );
    return bodies;
  }

  it("fills a credential's embedded client with the configured client's secrets when the client ids match", async () => {
    const bodies = stubTokenEndpoint();
    const configs = {
      ...clientConfigs,
      getConfig: async () => ({
        clientId: "client-id",
        clientSecret: "configured-secret",
        extra: {},
        secretExtra: { developerToken: "configured-developer-token" },
      }),
    } as unknown as OAuthClientConfigService;
    const service = new OAuthCredentialRefreshService(configs);

    const refreshed = await service.refresh(
      "example",
      expiredCredential({ oauthClientConfig: { clientId: "client-id" } }),
    );
    expect(bodies[0]).toContain("client_id=client-id");
    expect(bodies[0]).toContain("client_secret=configured-secret");
    expect(refreshed.metadata.oauthClientConfig).toEqual({ clientId: "client-id" });
    expect(JSON.stringify(refreshed)).not.toContain("configured-secret");
    expect(JSON.stringify(refreshed)).not.toContain("configured-developer-token");

    // Another client's id gets nothing of the configured one — and with no secret of its own, the
    // provider's client authentication cannot be met: a configuration gap, not a refused refresh.
    await expect(
      service.refresh("example", expiredCredential({ oauthClientConfig: { clientId: "another-client" } })),
    ).rejects.toMatchObject({ code: "oauth_client_config_required" });
    expect(bodies).toHaveLength(1);

    const publicClient = {
      ...configs,
      getOAuthDefinition: () => ({ ...clientConfigs.getOAuthDefinition("example"), tokenEndpointAuthMethod: "none" }),
    } as unknown as OAuthClientConfigService;
    await new OAuthCredentialRefreshService(publicClient).refresh(
      "example",
      expiredCredential({ oauthClientConfig: { clientId: "another-client" } }),
    );
    expect(bodies[1]).toContain("client_id=another-client");
    expect(bodies[1]).not.toContain("client_secret");
  });

  it("answers the transient code for a refresh the provider did not answer and the refusal code for one it refused", async () => {
    const service = new OAuthCredentialRefreshService(clientConfigs);
    const options = { transientErrorCode: "provider_error" };

    stubTokenEndpoint(503);
    await expect(service.refresh("example", expiredCredential({}), options)).rejects.toMatchObject({
      code: "provider_error",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    await expect(service.refresh("example", expiredCredential({}), options)).rejects.toMatchObject({
      code: "provider_error",
    });
    stubTokenEndpoint(400);
    await expect(service.refresh("example", expiredCredential({}), options)).rejects.toMatchObject({
      code: "oauth_token_refresh_failed",
    });

    // Without the option every failure is the refusal code, as before.
    stubTokenEndpoint(503);
    await expect(service.refresh("example", expiredCredential({}))).rejects.toMatchObject({
      code: "oauth_token_refresh_failed",
    });
  });
});
