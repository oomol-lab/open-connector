import { describe, expect, it } from "vitest";
import {
  buildCliActionExample,
  buildCliClientSetup,
  buildMcpClientConfig,
  buildPowerShellClientSetup,
  buildSdkActionExample,
  normalizeGatewayUrl,
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
