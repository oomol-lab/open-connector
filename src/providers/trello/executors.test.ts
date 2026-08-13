import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

describe("Trello OAuth credentials", () => {
  it("uses the OAuth consumer key and access token for Trello API requests", async () => {
    const result = await credentialValidators.oauth1!(
      {
        authType: "oauth1",
        accessToken: "trello-access-token",
        providerSecret: { oauthTokenSecret: "trello-access-secret" },
        profile: { accountId: "oauth1", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: { oauthClientId: "trello-api-key", scope: "read,write" },
      },
      {
        fetcher: async (url) => {
          const requestUrl = new URL(url.toString());
          expect(`${requestUrl.origin}${requestUrl.pathname}`).toBe("https://api.trello.com/1/members/me");
          expect(requestUrl.searchParams.get("key")).toBe("trello-api-key");
          expect(requestUrl.searchParams.get("token")).toBe("trello-access-token");
          return Response.json({ id: "member-1", username: "alice", fullName: "Alice" });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "member-1", displayName: "Alice" },
      grantedScopes: ["read", "write"],
      metadata: { apiBaseUrl: "https://api.trello.com/1", username: "alice" },
    });
  });
});
