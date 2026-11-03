import type { OAuthServerConfig } from "./config.ts";
import type { Context, Hono } from "hono";

import { accessScope, offlineAccessScope } from "./config.ts";

/**
 * Discovery documents (RFC 9728 protected-resource metadata, RFC 8414
 * authorization-server metadata). MCP clients discover the AS from the
 * resource's 401 WWW-Authenticate challenge (emitted by the auth middleware
 * when OAuth is enabled), then read the AS metadata to find the endpoints.
 */

export function protectedResourceMetadata(config: OAuthServerConfig, resourcePath = "/mcp"): Record<string, unknown> {
  return {
    resource: `${config.issuer}${resourcePath}`,
    resource_name: "OpenConnector",
    authorization_servers: [config.issuer],
    scopes_supported: [accessScope, offlineAccessScope],
    bearer_methods_supported: ["header"],
  };
}

export function authorizationServerMetadata(config: OAuthServerConfig): Record<string, unknown> {
  const metadata: Record<string, unknown> = {
    issuer: config.issuer,
    authorization_endpoint: `${config.issuer}/oauth/mcp/authorize`,
    token_endpoint: `${config.issuer}/oauth/mcp/token`,
    revocation_endpoint: `${config.issuer}/oauth/mcp/revoke`,
    jwks_uri: `${config.issuer}/oauth/jwks`,
    scopes_supported: [accessScope, offlineAccessScope],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
    revocation_endpoint_auth_methods_supported: ["client_secret_basic", "client_secret_post"],
    service_documentation: `${config.issuer}/docs`,
    ui_locales_supported: ["en"],
  };
  if (config.allowDynamicRegistration) {
    metadata.registration_endpoint = `${config.issuer}/oauth/mcp/register`;
  }
  if (config.allowClientIdMetadataDocuments) {
    metadata.client_id_metadata_document_supported = true;
  }
  return metadata;
}

export function protectedResourceChallenge(config: OAuthServerConfig): string {
  return `Bearer resource_metadata="${config.issuer}/.well-known/oauth-protected-resource/mcp"`;
}

export function applyWellKnownRoutes(app: Hono, config: OAuthServerConfig): void {
  const prm = protectedResourceMetadata(config);
  const as = authorizationServerMetadata(config);
  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
    app.get(path, (context: Context) => context.json(prm));
  }
  app.get("/.well-known/oauth-authorization-server", (context: Context) => context.json(as));
}
