import { afterEach, describe, expect, it, vi } from "vitest";
import { requestClientCredentialsToken } from "./oauth-token.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("requestClientCredentialsToken", () => {
  it("sends a standard form request with scopes and client secret post authentication", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toMatchObject({
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded",
      });
      expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
        grant_type: "client_credentials",
        scope: "devices:read dns:read",
        client_id: "client-id",
        client_secret: "client-secret",
        tags: "tag:server",
      });
      return Response.json({
        access_token: "access-token",
        token_type: "Bearer",
        expires_in: "3600",
        scope: "devices:read dns:read",
      });
    });
    vi.stubGlobal("fetch", fetcher);

    const credential = await requestClientCredentialsToken({
      clientId: "client-id",
      clientSecret: "client-secret",
      scopes: ["devices:read", "dns:read"],
      extraFields: { tags: "tag:server" },
      tokenEndpointAuthMethod: "client_secret_post",
      tokenUrl: "https://example.com/oauth/token",
      createError: (message) => new Error(message),
    });

    expect(credential.accessToken).toBe("access-token");
    expect(credential.refreshToken).toBeUndefined();
    expect(credential.metadata).not.toHaveProperty("access_token");
    expect(credential.metadata.scope).toBe("devices:read dns:read");
    expect(credential.expiresAt).toBeDefined();
    expect(credential.profile.grantedScopes).toEqual(["devices:read", "dns:read"]);
  });

  it("supports basic authentication and provider-specific field names", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({
        authorization: `Basic ${Buffer.from("client-id:client-secret").toString("base64")}`,
      });
      expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({
        grant: "client_credentials",
        permissions: "read,write",
        app_id: "client-id",
      });
      return Response.json({ access_token: "access-token" });
    });
    vi.stubGlobal("fetch", fetcher);

    await requestClientCredentialsToken({
      clientId: "client-id",
      clientSecret: "client-secret",
      scopes: ["read", "write"],
      scopeSeparator: ",",
      tokenEndpointAuthMethod: "client_secret_basic",
      tokenRequestFields: {
        clientId: "app_id",
        clientCredentials: { grantType: "grant", scope: "permissions" },
      },
      tokenUrl: "https://example.com/oauth/token",
      createError: (message) => new Error(message),
    });
  });

  it("preserves zero-second expiry and redacts secrets from token endpoint errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ access_token: "access-token", expires_in: 0 }))
        .mockResolvedValueOnce(
          Response.json({ error_description: "Rejected client-secret\nfor this client" }, { status: 401 }),
        ),
    );

    const credential = await requestClientCredentialsToken({
      clientId: "client-id",
      clientSecret: "client-secret",
      scopes: [],
      tokenEndpointAuthMethod: "client_secret_post",
      tokenUrl: "https://example.com/oauth/token",
      createError: (message) => new Error(message),
    });
    expect(credential.expiresAt).toBeDefined();

    await expect(
      requestClientCredentialsToken({
        clientId: "client-id",
        clientSecret: "client-secret",
        scopes: [],
        tokenEndpointAuthMethod: "client_secret_post",
        tokenUrl: "https://example.com/oauth/token",
        createError: (message) => new Error(message),
      }),
    ).rejects.toThrow("Rejected [redacted] for this client");
  });
});
