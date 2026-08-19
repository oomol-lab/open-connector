import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

describe("ORCID credentials", () => {
  it("validates OAuth with the OpenID userinfo endpoint", async () => {
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "orcid-access-token",
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: { scope: "openid" },
      },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://orcid.org/oauth/userinfo");
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer orcid-access-token");
          return Response.json({
            sub: "0000-0002-1825-0097",
            name: "Josiah Carberry",
            given_name: "Josiah",
            family_name: "Carberry",
          });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "0000-0002-1825-0097", displayName: "Josiah Carberry" },
      grantedScopes: ["openid"],
      metadata: { validationEndpoint: "https://orcid.org/oauth/userinfo" },
    });
  });

  it("records granted OAuth scopes from credential metadata", async () => {
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "orcid-access-token",
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: { scope: "openid /read-limited /activities/update" },
      },
      {
        fetcher: async () =>
          Response.json({
            sub: "0000-0002-1825-0097",
            name: "Josiah Carberry",
          }),
      },
    );

    expect(result?.grantedScopes).toEqual(["openid", "/read-limited", "/activities/update"]);
  });
});
