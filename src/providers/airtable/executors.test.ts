import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

describe("Airtable credentials", () => {
  it("validates OAuth credentials and records the granted scopes", async () => {
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "airtable-oauth-token",
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: {},
      },
      {
        fetcher: async (url, init) => {
          expect(new URL(url.toString()).pathname).toBe("/v0/meta/whoami");
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer airtable-oauth-token");
          return Response.json({
            id: "usr123",
            scopes: ["data.records:read", "schema.bases:read"],
          });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "usr123", displayName: "usr123" },
      grantedScopes: ["data.records:read", "schema.bases:read"],
      metadata: {
        validationEndpoint: "/v0/meta/whoami",
        currentUser: { id: "usr123" },
      },
    });
  });

  it("keeps personal access token validation compatible with the same identity endpoint", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "airtable-pat", values: {} },
      {
        fetcher: async (url, init) => {
          expect(new URL(url.toString()).pathname).toBe("/v0/meta/whoami");
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer airtable-pat");
          return Response.json({ id: "usr456" });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "usr456", displayName: "usr456" },
      grantedScopes: [],
    });
  });
});
