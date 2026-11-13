import type { OAuth2AuthDefinition } from "../core/types.ts";
import type { OAuthClientConfigInput } from "../oauth/oauth-client-config-service.ts";
import type { FetchLike } from "@modelcontextprotocol/client";

import {
  discoverOAuthServerInfo,
  extractWWWAuthenticateParams,
  registerClient,
  checkResourceAllowed,
} from "@modelcontextprotocol/client";
import { assertPublicHttpUrl } from "../core/request.ts";
import { providerFetch, runProviderRequest, ProviderRequestError } from "../providers/provider-runtime.ts";

export interface McpOAuthSetup {
  definition: OAuth2AuthDefinition;
  client: OAuthClientConfigInput;
}

/** Discover public OAuth endpoints and register a PKCE client when the administrator did not supply one. */
export async function prepareMcpOAuth(
  endpoint: string,
  redirectUri: string,
  client: OAuthClientConfigInput | undefined,
  signal?: AbortSignal,
): Promise<McpOAuthSetup> {
  return runProviderRequest({ label: "MCP OAuth discovery", signal }, async (signal) => {
    const fetcher: FetchLike = (url, init) => providerFetch(url, { ...init, signal, redirect: "manual" });
    const probe = await fetcher(endpoint, { headers: { accept: "application/json, text/event-stream" } });
    const challenge = extractWWWAuthenticateParams(probe);
    await probe.body?.cancel();
    const info = await discoverOAuthServerInfo(endpoint, {
      resourceMetadataUrl: challenge.resourceMetadataUrl,
      fetchFn: fetcher,
    });
    const metadata = info.authorizationServerMetadata;
    if (!metadata?.authorization_endpoint || !metadata.token_endpoint)
      throw new ProviderRequestError(
        400,
        "The MCP server did not advertise OAuth endpoints. Supply the OAuth endpoints manually.",
      );
    assertPublicHttpUrl(metadata.authorization_endpoint, {
      fieldName: "authorization endpoint",
      createError: (message) => new ProviderRequestError(400, message),
    });
    assertPublicHttpUrl(metadata.token_endpoint, {
      fieldName: "token endpoint",
      createError: (message) => new ProviderRequestError(400, message),
    });
    const scopes = challenge.scope?.split(/\s+/).filter(Boolean) ?? info.resourceMetadata?.scopes_supported ?? [];
    const resource = info.resourceMetadata?.resource ?? endpoint;
    if (!checkResourceAllowed({ requestedResource: new URL(endpoint), configuredResource: new URL(resource) }))
      throw new ProviderRequestError(400, "OAuth metadata describes a different MCP resource.");
    let configuredClient = client;
    if (!configuredClient) {
      if (!metadata.registration_endpoint)
        throw new ProviderRequestError(400, "This MCP server requires a pre-registered client ID.");
      const registered = await registerClient(info.authorizationServerUrl, {
        metadata,
        clientMetadata: {
          client_name: "OOMOL Connect",
          redirect_uris: [redirectUri],
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
        },
        scope: scopes.join(" ") || undefined,
        fetchFn: fetcher,
      });
      configuredClient = { clientId: registered.client_id, clientSecret: registered.client_secret };
    }
    return {
      definition: {
        type: "oauth2",
        authorizationUrl: metadata.authorization_endpoint,
        tokenUrl: metadata.token_endpoint,
        issuer: metadata.issuer,
        requireIssuer: metadata.authorization_response_iss_parameter_supported === true,
        resource,
        scopes,
        tokenEndpointAuthMethod: configuredClient.clientSecret
          ? metadata.token_endpoint_auth_methods_supported?.includes("client_secret_basic")
            ? "client_secret_basic"
            : "client_secret_post"
          : "none",
        pkce: { method: "S256" },
      },
      client: configuredClient,
    };
  });
}
