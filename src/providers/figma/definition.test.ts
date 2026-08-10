import { describe, expect, it } from "vitest";
import { provider } from "./definition.ts";
import { figmaPersonalAccessTokenScopes } from "./scopes.ts";

describe("Figma provider definition", () => {
  it("keeps OAuth on Figma's current token endpoint with PKCE and Basic client auth", () => {
    const oauth = provider.auth.find((auth) => auth.type === "oauth2");

    expect(oauth?.tokenUrl).toBe("https://api.figma.com/v1/oauth/token");
    // Refresh must reuse the token endpoint; Figma deprecated /v1/oauth/refresh.
    expect(oauth).not.toHaveProperty("refreshTokenUrl");
    expect(oauth?.pkce).toEqual({ method: "S256" });
    expect(oauth?.tokenEndpointAuthMethod).toBe("client_secret_basic");
    expect(oauth?.tokenRequestFields).toEqual({ clientId: false });
  });

  it("requests only scopes public OAuth apps may use", () => {
    const oauth = provider.auth.find((auth) => auth.type === "oauth2");

    expect(oauth?.scopes).not.toContain("projects:read");
    expect(oauth?.scopes).not.toContain("project_metadata:read");
  });

  it("keeps private project capabilities available to personal access tokens", () => {
    expect(figmaPersonalAccessTokenScopes).toEqual(expect.arrayContaining(["projects:read", "project_metadata:read"]));
  });
});
