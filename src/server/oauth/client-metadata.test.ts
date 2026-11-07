import { describe, expect, it } from "vitest";
import {
  ClientMetadataError,
  isValidRedirectUri,
  normalizeClientMetadata,
  redirectUriMatches,
} from "./client-metadata.ts";

describe("normalizeClientMetadata", () => {
  it("normalizes a DCR body with defaults", () => {
    expect(
      normalizeClientMetadata({
        client_name: "My Client",
        redirect_uris: ["https://client.example/callback"],
        token_endpoint_auth_method: "none",
      }),
    ).toEqual({
      clientName: "My Client",
      redirectUris: ["https://client.example/callback"],
      scopes: ["mcp:access", "offline_access"],
      tokenEndpointAuthMethod: "none",
      grantTypes: ["authorization_code"],
      responseTypes: ["code"],
    });
  });

  it.each(["mcp:access", "offline_access"])("preserves the declared scope %s", (scope) => {
    const metadata = normalizeClientMetadata({
      redirect_uris: ["https://client.example/callback"],
      scope,
    });
    expect(metadata?.scopes).toEqual([scope]);
  });

  it("keeps a CIMD client_id and defaults its name", () => {
    const metadata = normalizeClientMetadata({
      client_id: "https://client.example/mcp.json",
      redirect_uris: ["https://client.example/callback"],
    });
    expect(metadata?.clientId).toBe("https://client.example/mcp.json");
    expect(metadata?.clientName).toBe("https://client.example/mcp.json");
    expect(metadata?.scopes).toEqual(["mcp:access", "offline_access"]);
  });

  it("rejects empty redirect_uris", () => {
    expect(() => normalizeClientMetadata({ redirect_uris: [] })).toThrow(ClientMetadataError);
  });

  it("rejects unsupported scopes", () => {
    expect(() =>
      normalizeClientMetadata({ redirect_uris: ["https://a.example/cb"], scope: ["mcp:access", "admin:all"] }),
    ).toThrow(/Unsupported scope/);
  });

  it("rejects unknown token endpoint auth methods", () =>
    expect(() =>
      normalizeClientMetadata({
        redirect_uris: ["https://a.example/cb"],
        token_endpoint_auth_method: "tls_client_auth",
      }),
    ).toThrow(/token_endpoint_auth_method/));

  it("returns undefined for non-objects", () => {
    expect(normalizeClientMetadata("nope")).toBeUndefined();
    expect(normalizeClientMetadata([1, 2])).toBeUndefined();
  });
});

describe("isValidRedirectUri", () => {
  it("accepts https and loopback http", () => {
    expect(isValidRedirectUri("https://client.example/cb")).toBe(true);
    expect(isValidRedirectUri("http://127.0.0.1:9375/callback")).toBe(true);
    expect(isValidRedirectUri("http://localhost:3000/cb")).toBe(true);
  });

  it("rejects remote http, credentials, queries, and non-http schemes", () => {
    expect(isValidRedirectUri("http://client.example/cb")).toBe(false);
    expect(isValidRedirectUri("https://user:pass@client.example/cb")).toBe(false);
    expect(isValidRedirectUri("https://client.example/cb?trace=1")).toBe(false);
    expect(isValidRedirectUri("javascript:alert(1)")).toBe(false);
    expect(isValidRedirectUri("not a url")).toBe(false);
  });
});

describe("redirectUriMatches", () => {
  const registered = ["https://client.example/callback", "http://127.0.0.1:9375/callback"];

  it("matches exact strings", () => {
    expect(redirectUriMatches(registered, "https://client.example/callback")).toBe(true);
    expect(redirectUriMatches(registered, "http://127.0.0.1:9375/callback")).toBe(true);
  });

  it("allows loopback port variation only", () => {
    expect(redirectUriMatches(registered, "http://127.0.0.1:53211/callback")).toBe(true);
    expect(redirectUriMatches(registered, "http://localhost:9375/callback")).toBe(false);
    expect(redirectUriMatches(registered, "https://client.example/other")).toBe(false);
    expect(redirectUriMatches(registered, "https://client.example/callback/extra")).toBe(false);
    expect(redirectUriMatches(registered, "https://client.example/callback?x=1")).toBe(false);
  });
});
