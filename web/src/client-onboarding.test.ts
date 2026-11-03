import { describe, expect, it } from "vitest";
import {
  buildCliActionExample,
  buildCliClientSetup,
  buildMcpClientConfig,
  buildMcpOAuthClientConfig,
  buildOAuthDiscoveryCurl,
  buildOAuthDiscoveryUrls,
  buildPowerShellClientSetup,
  buildSdkActionExample,
  normalizeGatewayUrl,
  OAUTH_MCP_REQUIREMENTS,
} from "./client-onboarding";

describe("client gateway setup", () => {
  it("preserves a reverse-proxy prefix and rejects URLs the CLI cannot connect to", () => {
    expect(normalizeGatewayUrl(" https://connect.example.com/gateway/ ")).toBe("https://connect.example.com/gateway");
    for (const url of [
      "localhost:3000",
      "file:///tmp/gateway",
      "https://user:secret@example.com",
      "https://example.com?q=1",
      "https://example.com/#fragment",
      "https://example.com/?",
      "https://example.com/#",
    ]) {
      expect(normalizeGatewayUrl(url)).toBeUndefined();
    }
  });
  it("uses the same gateway and adds authentication only when selected", () => {
    const baseUrl = "https://connect.example.com/gateway";
    const authenticated = JSON.parse(buildMcpClientConfig(baseUrl, true));
    const anonymous = JSON.parse(buildMcpClientConfig(baseUrl, false));
    expect(authenticated.mcpServers["open-connector"]).toEqual({
      url: `${baseUrl}/mcp`,
      headers: { Authorization: "Bearer <RUNTIME_TOKEN>" },
    });
    expect(anonymous.mcpServers["open-connector"]).toEqual({ url: `${baseUrl}/mcp` });
    expect(buildCliClientSetup(baseUrl, true)).toContain(`OO_CONNECTOR_URL='${baseUrl}'`);
    expect(buildCliClientSetup(baseUrl, false)).toContain("unset OO_CONNECTOR_TOKEN");
  });
  it("quotes gateway URLs as literal values in both shell families", () => {
    const baseUrl = "https://example.com/a'b$(echo example)";
    expect(buildCliClientSetup(baseUrl, true)).toContain("'https://example.com/a'\\''b$(echo example)'");
    expect(buildPowerShellClientSetup(baseUrl, true)).toContain("'https://example.com/a''b$(echo example)'");
  });
  it("selects the same named connection in CLI and SDK calls", () => {
    const action = {
      id: "github.get_current_user",
      service: "github",
      name: "get_current_user",
      input: {},
      connectionName: "work",
    };
    const url = "https://connect.example.com";
    expect(buildCliActionExample(url, action)).toContain("--connection-name 'work'");
    expect(buildSdkActionExample(url, action)).toContain('baseUrl: "https://connect.example.com"');
    expect(buildSdkActionExample(url, action)).toContain(
      'gateway.execute("github.get_current_user", {}, {"connectionName":"work"})',
    );
    expect(buildSdkActionExample(url, action)).not.toContain('baseUrl: "https://connect.example.com/v1"');
  });
});

describe("OAuth 2.1 client setup", () => {
  const baseUrl = "https://connect.example.com/gateway";

  it("derives the absolute discovery and endpoint URLs from the gateway base URL", () => {
    expect(buildOAuthDiscoveryUrls(baseUrl)).toEqual({
      resource: `${baseUrl}/mcp`,
      protectedResourceMetadata: `${baseUrl}/.well-known/oauth-protected-resource/mcp`,
      authorizationServerMetadata: `${baseUrl}/.well-known/oauth-authorization-server`,
      registrationEndpoint: `${baseUrl}/oauth/mcp/register`,
      authorizationEndpoint: `${baseUrl}/oauth/mcp/authorize`,
      tokenEndpoint: `${baseUrl}/oauth/mcp/token`,
      scopes: ["mcp:access", "offline_access"],
    });
  });

  it("emits an MCP client configuration under the same mcpServers map as the token config", () => {
    const config = JSON.parse(buildMcpOAuthClientConfig(baseUrl));
    expect(Object.keys(config)).toEqual(["mcpServers"]);
    expect(config.mcpServers["open-connector"]).toEqual({
      type: "http",
      url: `${baseUrl}/mcp`,
      auth: "oauth2.1",
      protectedResourceMetadata: `${baseUrl}/.well-known/oauth-protected-resource/mcp`,
      authorizationServerMetadata: `${baseUrl}/.well-known/oauth-authorization-server`,
      registrationEndpoint: `${baseUrl}/oauth/mcp/register`,
      authorizationEndpoint: `${baseUrl}/oauth/mcp/authorize`,
      tokenEndpoint: `${baseUrl}/oauth/mcp/token`,
      scopes: ["mcp:access", "offline_access"],
    });
  });

  it("quotes the discovery documents for curl", () => {
    const curl = buildOAuthDiscoveryCurl(baseUrl);
    expect(curl).toContain(`curl -fsSL '${baseUrl}/.well-known/oauth-protected-resource/mcp'`);
    expect(curl).toContain(`curl -fsSL '${baseUrl}/.well-known/oauth-authorization-server'`);
  });

  it("requires PKCE S256 and the resource parameter", () => {
    expect(OAUTH_MCP_REQUIREMENTS.some((line) => line.includes("PKCE S256"))).toBe(true);
    expect(OAUTH_MCP_REQUIREMENTS.some((line) => line.includes("resource parameter"))).toBe(true);
  });
});
