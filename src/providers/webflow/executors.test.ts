import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";
import { webflowOAuthScopes } from "./scopes.ts";

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
          expect(url.toString()).toBe("https://api.webflow.com/v2/token/authorized_by");
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer webflow-oauth-token");
          return Response.json({
            id: "user-1",
            email: "alice@example.com",
            firstName: "Alice",
            lastName: "Example",
          });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "user-1", displayName: "alice@example.com" },
      grantedScopes: webflowOAuthScopes,
      metadata: { userId: "user-1", userEmail: "alice@example.com" },
    });
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
