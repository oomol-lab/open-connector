import type { OAuth2AuthDefinition, ResolvedCredential } from "../core/types.ts";
import type { IProviderLoader } from "../providers/provider-loader.ts";
import type { OAuthClientConfigService } from "./oauth-client-config-service.ts";
import type { OAuthTokenResult } from "./oauth-token.ts";

import { ConnectionError } from "../connection-service.ts";
import { optionalRecord, stringRecord } from "../core/cast.ts";
import { providerFetch } from "../providers/provider-runtime.ts";
import { readOAuthClientConfigMetadata } from "./oauth-client-config-service.ts";
import { expiresAtFromLifetime, requestRefreshToken, requestTokenRevocation } from "./oauth-token.ts";

type OAuthCredential = Extract<ResolvedCredential, { authType: "oauth2" }>;

/**
 * What a disconnect did about the grant at the provider: `done` when the
 * provider's revocation endpoint accepted the token, `failed` when it did not
 * (or could not be reached) — the credential is deleted locally either way —
 * `unsupported` when the provider declares no revocation endpoint or the
 * connection held no OAuth token to revoke, and `skipped` when the caller
 * asked to keep the grant (`revoke: false`).
 */
export type OAuthRevocationOutcome = "done" | "failed" | "unsupported" | "skipped";

export interface IOAuthCredentialRefresher {
  refresh(service: string, credential: OAuthCredential): Promise<OAuthCredential>;
  /**
   * Revoke the credential at the provider's `revocationUrl`: `done` or
   * `unsupported` (none declared); a refusal or an unreachable endpoint throws.
   */
  revoke?(service: string, credential: OAuthCredential): Promise<"done" | "unsupported">;
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
        metadata: credential.metadata,
        providerSecret: credential.providerSecret,
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
      providerSecret: refreshed.providerSecret ?? credential.providerSecret,
      profile: credential.profile,
      metadata: {
        ...credential.metadata,
        ...refreshed.metadata,
        // Refresh rotates tokens within the existing authorization, including legacy absence.
        oauthAuthorizationId: credential.metadata.oauthAuthorizationId,
        expires_in: expiresIn,
        refreshedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Revoke the refresh token, or the access token when none was issued, using
   * the client configuration the credential was minted under. The provider
   * determines whether related tokens and the underlying grant are revoked.
   */
  async revoke(service: string, credential: OAuthCredential): Promise<"done" | "unsupported"> {
    let auth: OAuth2AuthDefinition;
    try {
      auth = this.clientConfigs.getOAuthDefinition(service);
    } catch {
      return "unsupported";
    }
    if (!auth.revocationUrl) {
      return "unsupported";
    }
    const token = credential.refreshToken || credential.accessToken;
    if (!token) {
      return "unsupported";
    }
    const createError = (message: string): ConnectionError =>
      new ConnectionError("oauth_token_revocation_failed", message);
    const config =
      readOAuthClientConfigMetadata(service, credential.metadata) ?? (await this.clientConfigs.getConfig(service));
    let revocationUrl: string;
    if (config) {
      revocationUrl = this.clientConfigs.resolveEndpointUrl(service, auth.revocationUrl, config);
    } else if (auth.revocationUrl.includes("{")) {
      // A templated endpoint ({tenant}) needs the client configuration that
      // filled it in at sign-in; without one there is nowhere to post to.
      throw createError(`Configure an OAuth client for ${service} before revoking its token.`);
    } else {
      revocationUrl = auth.revocationUrl;
    }
    await requestTokenRevocation({
      revocationUrl,
      token,
      tokenTypeHint: credential.refreshToken ? "refresh_token" : "access_token",
      clientId: config?.clientId,
      clientSecret: config?.clientSecret,
      tokenRequestFields: auth.tokenRequestFields,
      tokenEndpointAuthMethod: auth.tokenEndpointAuthMethod,
      createError,
    });
    return "done";
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
