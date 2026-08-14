import { describe, expect, it, vi } from "vitest";
import { credentialValidators } from "./executors.ts";
import { oktaActionHandlers } from "./runtime.ts";

describe("Okta authentication", () => {
  it("validates OAuth credentials against the configured Okta organization", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe("https://dev-12345678.okta.com/api/v1/users/me");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer okta-access-token");
      return Response.json({
        id: "user-1",
        profile: {
          email: "admin@example.com",
          login: "admin@example.com",
        },
      });
    });

    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "okta-access-token",
        tokenType: "Bearer",
        profile: {
          accountId: "oauth2",
          displayName: "OAuth Credential",
          grantedScopes: ["okta.users.read"],
        },
        metadata: {
          oauthClientExtra: {
            subdomain: "dev-12345678",
          },
        },
      },
      { fetcher },
    );

    expect(result).toMatchObject({
      profile: {
        accountId: "okta:dev-12345678.okta.com:user-1",
        displayName: "admin@example.com",
      },
      grantedScopes: ["okta.users.read"],
      metadata: {
        orgUrl: "https://dev-12345678.okta.com",
        validationEndpoint: "/api/v1/users/me",
        userId: "user-1",
        userLogin: "admin@example.com",
      },
    });
  });

  it("executes OAuth actions with Bearer authentication", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(input.toString()).toBe("https://dev-12345678.okta.com/api/v1/users?limit=1&sortOrder=asc");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer okta-access-token");
      return Response.json([{ id: "user-1", profile: { email: "admin@example.com" } }]);
    });

    const result = await oktaActionHandlers.list_users(
      { limit: 1 },
      {
        orgUrl: "https://dev-12345678.okta.com",
        authorization: "Bearer okta-access-token",
        fetcher,
      },
    );

    expect(result).toMatchObject({
      users: [{ id: "user-1", profile: { email: "admin@example.com" } }],
      nextAfter: null,
    });
  });

  it("keeps API tokens on the SSWS authorization scheme", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("authorization")).toBe("SSWS okta-api-token");
      return Response.json({ id: "user-1", profile: { login: "admin@example.com" } });
    });

    await credentialValidators.customCredential!(
      {
        values: {
          orgUrl: "https://example.okta.com",
          apiToken: "okta-api-token",
        },
      },
      { fetcher },
    );
  });
});
