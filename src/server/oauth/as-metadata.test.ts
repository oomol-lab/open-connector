import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { applyWellKnownRoutes, authorizationServerMetadata, protectedResourceMetadata } from "./as-metadata.ts";
import { resolveOAuthServerConfig } from "./config.ts";

const config = resolveOAuthServerConfig({ issuer: "https://gateway.example.com" });

describe("protectedResourceMetadata", () => {
  it("points at the MCP resource and this AS", () => {
    expect(protectedResourceMetadata(config)).toEqual({
      resource: "https://gateway.example.com/mcp",
      resource_name: "OpenConnector",
      authorization_servers: ["https://gateway.example.com"],
      scopes_supported: ["mcp:access", "offline_access"],
      bearer_methods_supported: ["header"],
    });
  });
});

describe("authorizationServerMetadata", () => {
  it("serves the ChatGPT-required surface: PKCE S256, CIMD flag, DCR endpoint", () => {
    const metadata = authorizationServerMetadata(config);
    expect(metadata.issuer).toBe("https://gateway.example.com");
    expect(metadata.authorization_endpoint).toBe("https://gateway.example.com/oauth/mcp/authorize");
    expect(metadata.token_endpoint).toBe("https://gateway.example.com/oauth/mcp/token");
    expect(metadata.registration_endpoint).toBe("https://gateway.example.com/oauth/mcp/register");
    expect(metadata.revocation_endpoint).toBe("https://gateway.example.com/oauth/mcp/revoke");
    expect(metadata.jwks_uri).toBe("https://gateway.example.com/oauth/jwks");
    expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
    expect(metadata.client_id_metadata_document_supported).toBe(true);
    expect(metadata.grant_types_supported).toEqual(["authorization_code", "refresh_token"]);
  });

  it("omits registration and CIMD when disabled", () => {
    const restricted = resolveOAuthServerConfig({
      issuer: "https://gateway.example.com",
      allowDynamicRegistration: false,
      allowClientIdMetadataDocuments: false,
    });
    const metadata = authorizationServerMetadata(restricted);
    expect("registration_endpoint" in metadata).toBe(false);
    expect("client_id_metadata_document_supported" in metadata).toBe(false);
  });
});

describe("well-known routes", () => {
  it("serves PRM at both paths and AS metadata", async () => {
    const app = new Hono();
    applyWellKnownRoutes(app, config);
    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
      const response = await app.request(`http://gateway.example.com${path}`);
      expect(response.status).toBe(200);
      const body = (await response.json()) as { resource: string };
      expect(body.resource).toBe("https://gateway.example.com/mcp");
    }
    const asResponse = await app.request("http://gateway.example.com/.well-known/oauth-authorization-server");
    expect(asResponse.status).toBe(200);
    // Discovery JSON read back in tests; only the issuer field is asserted.
    const asBody = (await asResponse.json()) as { issuer: string };
    expect(asBody.issuer).toBe("https://gateway.example.com");
  });
});
