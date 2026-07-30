import { describe, expect, it } from "vitest";
import { provider } from "./definition.ts";

describe("Cloudflare MCP provider definition", () => {
  it("supports Cloudflare MCP OAuth and API Bearer tokens", () => {
    const oauth = provider.auth.find((auth) => auth.type === "oauth2");
    const apiKey = provider.auth.find((auth) => auth.type === "api_key");

    expect(oauth).toMatchObject({
      authorizationUrl: "https://mcp.cloudflare.com/authorize",
      tokenUrl: "https://mcp.cloudflare.com/token",
      refreshTokenUrl: "https://mcp.cloudflare.com/token",
      tokenEndpointAuthMethod: "none",
      pkce: { method: "S256" },
    });
    expect(oauth?.scopes).toEqual(["user:read", "account:read", "offline_access"]);
    expect(apiKey?.label).toContain("Bearer Token");
  });

  it("exposes all tools from the official code-mode MCP server", () => {
    expect(provider.actions.map((action) => action.name)).toEqual(["docs", "search", "execute"]);
  });
});
