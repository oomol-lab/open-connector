import type { OAuthClientConfigInput } from "../oauth/oauth-client-config-service.ts";
import type { CustomMcpAuth, CustomMcpConfig, CustomMcpRegistration, McpHeaderDefinition } from "./definition.ts";

import { assertPublicHttpUrl, isPrivateNetworkAccessAllowed } from "../core/request.ts";
import { ProviderRequestError } from "../providers/provider-runtime.ts";
import { HttpRequestError } from "../server/api/http-utils.ts";

interface PreparedMcpRegistration {
  config: CustomMcpConfig;
  oauthClient?: OAuthClientConfigInput;
}

/** Validate the fixed endpoint and prepare authentication before publishing a provider. */
export async function prepareMcpRegistration(
  input: CustomMcpRegistration,
  service: string,
  redirectUri: string,
  signal?: AbortSignal,
): Promise<PreparedMcpRegistration> {
  const endpoint = assertPublicHttpUrl(input.endpoint, {
    allowPrivateNetwork: isPrivateNetworkAccessAllowed(),
    fieldName: "endpoint",
    createError: (message) => new HttpRequestError("invalid_input", message),
  });
  if (endpoint.search || endpoint.hash || endpoint.username || endpoint.password)
    throw new HttpRequestError(
      "invalid_input",
      "Use a fixed MCP endpoint without credentials, query parameters or a fragment.",
    );
  let auth: CustomMcpAuth;
  let oauthClient: OAuthClientConfigInput | undefined;
  if (input.auth.type === "headers") {
    validateHeaders(input.auth.headers);
    auth = input.auth;
  } else if (input.auth.type === "oauth2") {
    if (input.auth.manual) {
      validateManualOAuth(input.auth);
      auth = {
        type: "oauth2",
        definition: { ...input.auth.manual, type: "oauth2", resource: endpoint.href, pkce: { method: "S256" } },
      };
      oauthClient = input.auth.client;
    } else {
      const { prepareMcpOAuth } = await import("./oauth.ts");
      const setup = await prepareMcpOAuth(endpoint.href, redirectUri, input.auth.client, signal).catch(
        (error: unknown) => {
          if (error instanceof ProviderRequestError)
            throw new HttpRequestError(
              "mcp_oauth_failed",
              error.message,
              error.status === 400 || error.status === 504 ? error.status : 502,
            );
          throw error;
        },
      );
      auth = { type: "oauth2", definition: setup.definition };
      oauthClient = setup.client;
    }
  } else {
    auth = input.auth;
  }
  return {
    config: {
      service,
      displayName: input.displayName,
      endpoint: endpoint.href,
      transport: input.transport,
      auth,
      enabled: true,
    },
    oauthClient,
  };
}

function validateHeaders(headers: McpHeaderDefinition[]): void {
  const names = new Set<string>();
  for (const entry of headers) {
    const name = entry.name.toLowerCase();
    if (
      names.has(name) ||
      [
        "host",
        "content-length",
        "content-type",
        "accept",
        "connection",
        "transfer-encoding",
        "mcp-session-id",
        "mcp-protocol-version",
      ].includes(name) ||
      /[\r\n]/.test(entry.prefix)
    )
      throw new HttpRequestError("invalid_input", "Use unique authentication header names without transport headers.");
    names.add(name);
  }
}

function validateManualOAuth(input: Extract<CustomMcpRegistration["auth"], { type: "oauth2" }>): void {
  const { manual, client } = input;
  if (!manual) return;
  assertPublicHttpUrl(manual.authorizationUrl, {
    fieldName: "authorizationUrl",
    createError: (message) => new HttpRequestError("invalid_input", message),
  });
  assertPublicHttpUrl(manual.tokenUrl, {
    fieldName: "tokenUrl",
    createError: (message) => new HttpRequestError("invalid_input", message),
  });
  if (!client) throw new HttpRequestError("invalid_input", "Manual OAuth setup requires a client ID.");
  if (manual.tokenEndpointAuthMethod !== "none" && !client.clientSecret)
    throw new HttpRequestError("invalid_input", "This OAuth client authentication method requires a client secret.");
}
