import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

describe("Webflow credentials", () => {
  it("validates OAuth credentials and records the configured scopes", async () => {
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "webflow-oauth-token",
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: {},
      },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://api.webflow.com/v2/token/introspect");
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer webflow-oauth-token");
          return Response.json({
            authorization: {
              id: "authorization-1",
              scope: "sites:read,cms:read",
              authorizedTo: { userIds: ["user-1"] },
            },
            application: { id: "app-1", displayName: "Example Webflow App" },
          });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "user-1", displayName: "Example Webflow App" },
      grantedScopes: ["sites:read", "cms:read"],
      metadata: { authorizationId: "authorization-1", applicationId: "app-1", userId: "user-1" },
    });
  });

  it("does not infer OAuth grants when neither token response nor introspection reports scopes", async () => {
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "webflow-oauth-token",
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: {},
      },
      {
        fetcher: async () => Response.json({ authorization: { id: "authorization-1" } }),
      },
    );

    if (!result) {
      throw new Error("expected Webflow OAuth validation result");
    }
    expect(result.grantedScopes).toBeUndefined();
  });

  it("keeps API token validation compatible with the same identity endpoint", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "webflow-api-token", values: {} },
      {
        fetcher: async (_url, init) => {
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer webflow-api-token");
          return Response.json({ id: "user-2", firstName: "API", lastName: "User" });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "user-2", displayName: "API User" },
      grantedScopes: [],
    });
  });
});
