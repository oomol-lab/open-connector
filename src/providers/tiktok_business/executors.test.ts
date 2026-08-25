import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

describe("TikTok Business credentials", () => {
  it("validates OAuth with user info and does not list advertisers", async () => {
    const requestedUrls: string[] = [];
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "tiktok-access-token",
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: { scope: "advertiser.read" },
      },
      {
        fetcher: async (url, init) => {
          requestedUrls.push(url.toString());
          expect(new Headers(init?.headers).get("access-token")).toBe("tiktok-access-token");
          return Response.json({
            code: 0,
            data: {
              core_user_id: "user-1",
              display_name: "Ada",
              email: "ada@example.com",
            },
          });
        },
      },
    );

    expect(requestedUrls).toEqual(["https://business-api.tiktok.com/open_api/v1.3/user/info/"]);
    expect(result).toMatchObject({
      profile: { accountId: "user-1", displayName: "Ada" },
      grantedScopes: ["advertiser.read"],
      metadata: { coreUserId: "user-1", email: "ada@example.com" },
    });
  });
});
