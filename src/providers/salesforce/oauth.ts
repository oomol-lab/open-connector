import type { OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";
import type { OAuthTokenErrorFactory, OAuthTokenResult, ProviderOAuthRuntime } from "../../oauth/oauth-token.ts";

import { optionalNumber, optionalRecord, optionalString, optionalRawString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerResponseError, requiredResponseRecord } from "../provider-runtime.ts";
import { salesforceOrigin, salesforceRequest } from "./transport.ts";

function loginOrigin(config: OAuthClientConfig): string {
  return salesforceOrigin(optionalString(config.extra.loginUrl) ?? "https://login.salesforce.com", "loginUrl");
}
interface TokenRequest {
  config: OAuthClientConfig;
  parameters: Record<string, string>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  createError: OAuthTokenErrorFactory;
}
async function requestToken(input: TokenRequest): Promise<OAuthTokenResult> {
  const origin = loginOrigin(input.config);
  const result = await salesforceRequest(
    new URL("/services/oauth2/token", origin),
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        ...input.parameters,
        client_id: input.config.clientId,
        client_secret: input.config.clientSecret,
      }),
    },
    input.fetcher,
    input.signal,
  ).catch((error: unknown) => {
    if (!(error instanceof ProviderRequestError)) throw error;
    const details = optionalRecord(error.details);
    // Only Salesforce's explicit expired-refresh-token response warrants reconnecting.
    const expired =
      input.parameters.grant_type === "refresh_token" &&
      details?.errorCode === "invalid_grant" &&
      details.errorDescription === "expired access/refresh token";
    throw input.createError(error.message, expired ? { status: error.status, errorCode: "invalid_grant" } : undefined);
  });
  const body = requiredResponseRecord(result.body, "Salesforce token response");
  const instanceUrl = salesforceOrigin(
    requiredString(body.instance_url, "Salesforce instance_url", providerResponseError),
    "instance_url",
  );
  const identityUrl = new URL(requiredString(body.id, "Salesforce identity URL", providerResponseError));
  salesforceOrigin(identityUrl.origin, "identity URL");
  const parts = identityUrl.pathname.split("/");
  if (
    parts.length !== 4 ||
    parts[1] !== "id" ||
    !parts[2] ||
    !parts[3] ||
    identityUrl.search ||
    identityUrl.hash ||
    identityUrl.username ||
    identityUrl.password
  )
    throw providerResponseError("Salesforce returned an invalid identity URL");
  const scope = optionalRawString(body.scope);
  const expiresIn = optionalNumber(body.expires_in);
  // Salesforce normally omits expires_in; ten minutes is a local refresh budget, not its session lifetime.
  const refreshAfterSeconds = expiresIn !== undefined && expiresIn > 0 ? Math.min(expiresIn, 600) : 600;
  return {
    accessToken: requiredString(body.access_token, "Salesforce access token", providerResponseError),
    refreshToken:
      input.parameters.grant_type === "authorization_code"
        ? requiredString(
            body.refresh_token,
            "Salesforce refresh token; enable refresh_token scope and authorize again",
            input.createError,
          )
        : optionalString(body.refresh_token),
    tokenType: optionalString(body.token_type) ?? "Bearer",
    expiresAt: new Date(Date.now() + refreshAfterSeconds * 1000).toISOString(),
    providerSecret: { instanceUrl, identityUrl: identityUrl.toString(), organizationId: parts[2], userId: parts[3] },
    metadata: { scope },
  };
}

export const oauth: ProviderOAuthRuntime = {
  buildAuthorizationUrl({ authorizationUrl, clientConfig }) {
    const url = new URL("/services/oauth2/authorize", loginOrigin(clientConfig));
    url.search = authorizationUrl.search;
    return url.toString();
  },
  exchangeCode(input) {
    const parameters: Record<string, string> = {
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: requiredString(input.codeVerifier, "Salesforce PKCE verifier", input.createError),
    };
    return requestToken({
      config: input.clientConfig,
      parameters,
      fetcher: input.fetcher,
      signal: input.signal,
      createError: input.createError,
    });
  },
  refreshAccessToken(input) {
    return requestToken({
      config: input.clientConfig,
      parameters: { grant_type: "refresh_token", refresh_token: input.refreshToken },
      fetcher: input.fetcher,
      createError: input.createError,
    });
  },
};
