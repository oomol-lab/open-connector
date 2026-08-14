import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

describe("Datadog credentials", () => {
  it("validates OAuth credentials against the selected Datadog site", async () => {
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "datadog-oauth-token",
        tokenType: "Bearer",
        refreshToken: "datadog-refresh-token",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: {
          scope: "monitors_read timeseries_query metrics_read",
          oauthClientExtra: {
            site: "datadoghq.eu",
          },
        },
      },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://api.datadoghq.eu/api/v2/current_user");
          const headers = new Headers(init?.headers);
          expect(headers.get("authorization")).toBe("Bearer datadog-oauth-token");
          expect(headers.get("dd-api-key")).toBeNull();
          return Response.json({
            data: {
              id: "user-123",
              attributes: {
                name: "Example User",
                email: "user@example.com",
                handle: "example",
              },
            },
          });
        },
      },
    );

    expect(result).toMatchObject({
      profile: {
        accountId: "datadog:datadoghq.eu:user-123",
        displayName: "Example User",
      },
      grantedScopes: ["monitors_read", "timeseries_query", "metrics_read"],
      metadata: {
        site: "datadoghq.eu",
        baseUrl: "https://api.datadoghq.eu",
        userId: "user-123",
      },
    });
  });

  it("rejects an unsupported OAuth site", async () => {
    await expect(
      credentialValidators.oauth2!(
        {
          authType: "oauth2",
          accessToken: "datadog-oauth-token",
          tokenType: "Bearer",
          profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
          metadata: {
            oauthClientExtra: {
              site: "attacker.example",
            },
          },
        },
        { fetcher: async () => Response.json({}) },
      ),
    ).rejects.toThrow("site must be a supported Datadog domain");
  });

  it("uses the official US2-FED site without an app subdomain", async () => {
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "datadog-oauth-token",
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: {
          oauthClientExtra: {
            site: "us2.ddog-gov.com",
          },
        },
      },
      {
        fetcher: async (url) => {
          expect(url.toString()).toBe("https://api.us2.ddog-gov.com/api/v2/current_user");
          return Response.json({ data: { id: "user-fed", attributes: {} } });
        },
      },
    );

    expect(result).toMatchObject({
      metadata: {
        site: "us2.ddog-gov.com",
        baseUrl: "https://api.us2.ddog-gov.com",
      },
    });
  });

  it("keeps API and application key validation compatible", async () => {
    const result = await credentialValidators.apiKey!(
      {
        apiKey: "dd-api-key",
        values: { applicationKey: "dd-app-key", site: "eu" },
      },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://api.datadoghq.eu/api/v1/validate");
          const headers = new Headers(init?.headers);
          expect(headers.get("dd-api-key")).toBe("dd-api-key");
          expect(headers.get("dd-application-key")).toBeNull();
          return Response.json({ valid: true });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "eu", displayName: "Datadog EU" },
      metadata: { site: "eu", baseUrl: "https://api.datadoghq.eu", valid: true },
    });
  });
});
