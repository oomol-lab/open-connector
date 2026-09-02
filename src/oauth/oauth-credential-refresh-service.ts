import type { ResolvedCredential } from "../core/types.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { OAuthClientConfigService } from "./oauth-client-config-service.ts";
import type { OAuthTokenResult } from "./oauth-token.ts";

import { ConnectionError } from "../connection-service.ts";
import { optionalRecord, stringRecord } from "../core/cast.ts";
import { providerFetch } from "../providers/provider-runtime.ts";
import { readOAuthClientConfigMetadata } from "./oauth-client-config-service.ts";
import { expiresAtFromLifetime, requestRefreshToken } from "./oauth-token.ts";

type OAuthCredential = Extract<ResolvedCredential, { authType: "oauth2" }>;

export interface IOAuthCredentialRefresher {
  refresh(service: string, credential: OAuthCredential): Promise<OAuthCredential>;
}

/**
 * Refreshes stored OAuth credentials using the user-provided local OAuth app.
 */
export class OAuthCredentialRefreshService implements IOAuthCredentialRefresher {
  private readonly clientConfigs: OAuthClientConfigService;
  private readonly providerLoader?: IProviderLoader;

  constructor(clientConfigs: OAuthClientConfigService, providerLoader?: IProviderLoader) {
    this.clientConfigs = clientConfigs;
    this.providerLoader = providerLoader;
  }

  async refresh(service: string, credential: OAuthCredential): Promise<OAuthCredential> {
    const auth = this.clientConfigs.getOAuthDefinition(service);
    const config =
      readOAuthClientConfigMetadata(service, credential.metadata) ?? (await this.clientConfigs.getConfig(service));
    if (!config) {
      throw new ConnectionError(
        "oauth_client_config_required",
        `Configure an OAuth client for ${service} before refreshing its token.`,
      );
    }

    const refreshToken = credential.refreshToken ?? "";
    const createError = (message: string): ConnectionError =>
      new ConnectionError("oauth_token_refresh_failed", message);
    const providerOAuth = await this.providerLoader?.loadProviderOAuthRuntime?.(service);
    let refreshed: OAuthTokenResult;
    if (providerOAuth?.refreshAccessToken) {
      refreshed = await providerOAuth.refreshAccessToken({
        refreshToken,
        clientConfig: config,
        fetcher: providerFetch,
        createError,
      });
    } else {
      refreshed = await requestRefreshToken({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        responseEnvelope: auth.tokenResponseEnvelope,
        refreshToken,
        extraFields: readOAuthRefreshParameters(credential.providerSecret),
        tokenRequestFields: auth.tokenRequestFields,
        tokenEndpointAuthMethod: auth.tokenEndpointAuthMethod,
        tokenRequestFormat: auth.tokenRequestFormat,
        tokenUrl: this.clientConfigs.resolveEndpointUrl(service, auth.refreshTokenUrl ?? auth.tokenUrl, config),
        createError,
      });
    }
    const expiresIn =
      refreshed.expiresAt === undefined ? credential.metadata.expires_in : refreshed.metadata.expires_in;

    return {
      ...refreshed,
      authType: "oauth2",
      refreshToken: refreshed.refreshToken ?? credential.refreshToken,
      // `expires_in` is optional on a refresh response, and a credential without an
      // expiry is never treated as expired again, so the token silently stops being
      // refreshed and every later call fails once it lapses. Reuse the lifetime the
      // provider last reported instead. Carrying `credential.expiresAt` forward is
      // not an option: a refresh only runs once that timestamp is already past, so
      // the stored token would look expired immediately and refresh on every call.
      expiresAt: refreshed.expiresAt ?? expiresAtFromLifetime(expiresIn),
      providerSecret: credential.providerSecret,
      profile: credential.profile,
      metadata: {
        ...credential.metadata,
        ...refreshed.metadata,
        expires_in: expiresIn,
        refreshedAt: new Date().toISOString(),
      },
    };
  }
}

function readOAuthRefreshParameters(
  providerSecret: Record<string, unknown> | undefined,
): Record<string, string> | undefined {
  const value = optionalRecord(providerSecret?.oauthRefreshParameters);
  if (!value) return undefined;
  const fields = stringRecord(value);
  return Object.keys(fields).length > 0 ? fields : undefined;
}
