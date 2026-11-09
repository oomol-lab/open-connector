import type { OAuthClientConfig } from "../../oauth/oauth-client-config-service.ts";
import type { ProviderOAuthRuntime } from "../../oauth/oauth-token.ts";

import { optionalNumber, optionalRawString, requiredString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerResponseError,
  requiredInputString,
  requiredResponseRecord,
} from "../provider-runtime.ts";
import { metaGraphApiVersion, metaRequest } from "./request.ts";

export const oauth: ProviderOAuthRuntime = {
  buildAuthorizationUrl({ authorizationUrl, clientConfig }) {
    authorizationUrl.searchParams.set("config_id", requiredInputString(clientConfig.extra.configId, "configId"));
    return authorizationUrl.toString();
  },
  async exchangeCode({ code, clientConfig, fetcher, redirectUri }) {
    const context = { accessToken: "", fetcher };
    let token = await metaRequest("oauth/access_token", context, {
      query: {
        client_id: clientConfig.clientId,
        client_secret: clientConfig.clientSecret,
        redirect_uri: redirectUri,
        code,
      },
      phase: "validate",
    });

    let accessToken = requiredString(token.access_token, "Meta access token", providerResponseError);
    let debug = await inspectToken(accessToken, clientConfig, fetcher);
    if (debug.type === "USER") {
      token = await metaRequest("oauth/access_token", context, {
        query: {
          grant_type: "fb_exchange_token",
          client_id: clientConfig.clientId,
          client_secret: clientConfig.clientSecret,
          fb_exchange_token: accessToken,
        },
        phase: "validate",
      });
      accessToken = requiredString(token.access_token, "Meta long-lived access token", providerResponseError);
      debug = await inspectToken(accessToken, clientConfig, fetcher);
    }

    const dataAccessExpiresAt = optionalNumber(debug.data_access_expires_at);
    const expiresAt = resolveTokenExpiration(token, debug, dataAccessExpiresAt);
    if (!Array.isArray(debug.scopes) || !debug.scopes.every((scope) => typeof scope === "string")) {
      throw new ProviderRequestError(502, "Meta granted scopes are missing", undefined, "provider_error");
    }

    return {
      accessToken,
      refreshToken: "",
      tokenType: optionalRawString(token.token_type) ?? "Bearer",
      expiresAt,
      providerSecret: { appSecret: clientConfig.clientSecret },
      metadata: {
        scope: debug.scopes.join(" "),
        graphApiVersion: metaGraphApiVersion,
        tokenType: debug.type,
        dataAccessExpiresAt,
      },
    };
  },
  async refreshAccessToken() {
    throw new ProviderRequestError(
      401,
      "Facebook access token expired. Reconnect using your Meta app.",
      undefined,
      "authorization_failed",
    );
  },
};

async function inspectToken(accessToken: string, clientConfig: OAuthClientConfig, fetcher: typeof fetch) {
  const result = await metaRequest(
    "debug_token",
    {
      accessToken: `${clientConfig.clientId}|${clientConfig.clientSecret}`,
      fetcher,
    },
    { query: { input_token: accessToken }, phase: "validate" },
  );

  const data = requiredResponseRecord(result.data, "Meta token information");
  if (data.is_valid !== true || String(data.app_id) !== clientConfig.clientId) {
    throw new ProviderRequestError(
      400,
      "Meta returned an invalid token or a token for another app",
      undefined,
      "invalid_input",
    );
  }

  return data;
}

function resolveTokenExpiration(
  token: Record<string, unknown>,
  debug: Record<string, unknown>,
  dataAccessExpiresAt: number | undefined,
) {
  const expiresAt = optionalNumber(debug.expires_at);
  const expiresIn = optionalNumber(token.expires_in);
  let expiration: number;
  if (expiresAt != null) {
    expiration = expiresAt * 1000;
  } else if (expiresIn != null) {
    expiration = Date.now() + expiresIn * 1000;
  } else {
    throw new ProviderRequestError(502, "Meta token expiration is missing", undefined, "provider_error");
  }

  if (dataAccessExpiresAt != null && dataAccessExpiresAt > 0) {
    expiration = Math.min(expiration || Infinity, dataAccessExpiresAt * 1000);
  }

  return expiration === 0 ? "9999-12-31T23:59:59.000Z" : new Date(expiration).toISOString();
}
