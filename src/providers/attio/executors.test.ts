import { describe, expect, it } from "vitest";
import { credentialValidators } from "./executors.ts";

const tokenMetadata = {
  active: true,
  workspace_id: "workspace-1",
  workspace_name: "Example",
  workspace_slug: "example",
  scope: "object_configuration:read record_permission:read-write",
};

describe("Attio credentials", () => {
  it("validates OAuth credentials through the token identity endpoint", async () => {
    const result = await credentialValidators.oauth2!(
      {
        authType: "oauth2",
        accessToken: "attio-oauth-token",
        tokenType: "Bearer",
        profile: { accountId: "oauth2", displayName: "OAuth Credential", grantedScopes: [] },
        metadata: {},
      },
      {
        fetcher: async (url, init) => {
          expect(url.toString()).toBe("https://api.attio.com/v2/self");
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer attio-oauth-token");
          return Response.json(tokenMetadata);
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "workspace-1", displayName: "Attio Example" },
      grantedScopes: ["object_configuration:read", "record_permission:read-write"],
      metadata: { workspaceId: "workspace-1", workspaceSlug: "example" },
    });
  });

  it("keeps workspace API key validation compatible with Bearer authentication", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "attio-api-key", values: {} },
      {
        fetcher: async (_url, init) => {
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer attio-api-key");
          return Response.json(tokenMetadata);
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "workspace-1", displayName: "Attio Example" },
    });
  });
});
