import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

describe("esa credentials", () => {
  it("validates a personal access token through the esa user endpoint", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "esa-pat", values: {} },
      {
        fetcher: async (url, init) => {
          expect(new URL(url.toString()).pathname).toBe("/v1/user");
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer esa-pat");
          return Response.json({ id: 7, name: "Alice", screen_name: "alice" });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "alice", displayName: "Alice" },
      metadata: { currentUser: { id: 7, screen_name: "alice" } },
    });
  });

  it("validates an OAuth access token through the esa user endpoint", async () => {
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "esa-oauth",
        tokenType: "Bearer",
        profile: { accountId: "alice", displayName: "Alice", grantedScopes: [] },
        metadata: {},
      },
      {
        fetcher: async (url, init) => {
          expect(new URL(url.toString()).pathname).toBe("/v1/user");
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer esa-oauth");
          return Response.json({ id: 7, name: "Alice", screen_name: "alice" });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "alice", displayName: "Alice" },
      metadata: { currentUser: { id: 7, screen_name: "alice" } },
    });
  });
});
