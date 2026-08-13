import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

describe("Asana credentials", () => {
  it("validates OAuth credentials and records the requested default scope", async () => {
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "asana-oauth-token",
        tokenType: "bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: {},
      },
      {
        fetcher: async (url, init) => {
          expect(new URL(url.toString()).pathname).toBe("/api/1.0/users/me");
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer asana-oauth-token");
          return Response.json({
            data: {
              gid: "123",
              name: "Ada Lovelace",
              email: "ada@example.com",
              workspaces: [{ gid: "456", name: "Analytical Engine" }],
            },
          });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "123", displayName: "Ada Lovelace" },
      grantedScopes: ["default"],
      metadata: {
        validationEndpoint: "/users/me",
        workspaceCount: 1,
        workspaceNames: ["Analytical Engine"],
      },
    });
  });

  it("keeps personal access token validation on the shared bearer path", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "asana-pat", values: {} },
      {
        fetcher: async (_url, init) => {
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer asana-pat");
          return Response.json({ data: { gid: "789", name: "Grace Hopper" } });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "789", displayName: "Grace Hopper" },
      grantedScopes: [],
    });
  });
});
