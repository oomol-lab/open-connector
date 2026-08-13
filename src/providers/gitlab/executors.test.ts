import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

describe("GitLab credentials", () => {
  it("validates OAuth credentials against their configured GitLab instance", async () => {
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "gitlab-oauth-token",
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: {
          scope: "api read_user",
          oauthClientExtra: { instanceUrl: "https://gitlab.example.com" },
        },
      },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://gitlab.example.com/api/v4/user");
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer gitlab-oauth-token");
          return Response.json({ id: 7, username: "alice", name: "Alice" });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "gitlab:gitlab.example.com:7", displayName: "Alice" },
      grantedScopes: ["api", "read_user"],
      metadata: { apiBaseUrl: "https://gitlab.example.com/api/v4", username: "alice" },
    });
  });

  it("keeps personal access tokens compatible with Bearer authentication", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "gitlab-pat", values: {} },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://gitlab.com/api/v4/user");
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer gitlab-pat");
          return Response.json({ id: 8, username: "bob", name: "Bob" });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "gitlab:8", displayName: "Bob" },
      grantedScopes: [],
    });
  });
});
