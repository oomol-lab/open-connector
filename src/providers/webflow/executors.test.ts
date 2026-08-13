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
            user: { id: "user-1", email: "alice@example.com" },
            workspace: { id: "workspace-1", name: "Example Workspace" },
          });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "user-1", displayName: "alice@example.com" },
      grantedScopes: webflowOAuthScopes,
      metadata: { workspaceId: "workspace-1", workspaceName: "Example Workspace" },
    });
  });

  it("keeps API token validation compatible with the same identity endpoint", async () => {
    const result = await credentialValidators.apiKey!(
      { apiKey: "webflow-api-token", values: {} },
      {
        fetcher: async (_url, init) => {
          expect(new Headers(init?.headers).get("authorization")).toBe("Bearer webflow-api-token");
          return Response.json({ workspace: { id: "workspace-2", name: "API Workspace" } });
        },
      },
    );

    expect(result).toMatchObject({
      profile: { accountId: "workspace-2", displayName: "API Workspace" },
      grantedScopes: [],
    });
  });
});
