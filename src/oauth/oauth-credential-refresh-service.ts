import type { ResolvedCredential } from "../core/types.ts";
import type { OAuthClientConfig } from "./oauth-client-config-service.ts";
import type { OAuthClientConfigService } from "./oauth-client-config-service.ts";

import { ConnectionError } from "../connection-service.ts";
import {
  createClientCredentialsExtraFields,
  requestClientCredentialsToken,
  requestRefreshToken,
} from "./oauth-token.ts";

type OAuthCredential = Extract<ResolvedCredential, { authType: "oauth2" }>;

export interface IOAuthCredentialRefresher {
  refresh(service: string, credential: OAuthCredential): Promise<OAuthCredential>;
}

/**
 * Refreshes stored OAuth credentials using the user-provided local OAuth app.
 */
export class OAuthCredentialRefreshService implements IOAuthCredentialRefresher {
  private readonly clientConfigs: OAuthClientConfigService;

  constructor(clientConfigs: OAuthClientConfigService) {
    this.clientConfigs = clientConfigs;
  }

  async refresh(service: string, credential: OAuthCredential): Promise<OAuthCredential> {
    const auth = this.clientConfigs.getOAuthDefinition(service);
    if (auth.flow !== "client_credentials" && !credential.refreshToken) {
      throw new ConnectionError(
        "oauth_token_expired",
        `${service} OAuth access token expired and no refresh token is available. Reconnect ${service}.`,
      );
    }
    const config =
      auth.flow === "client_credentials" ? credential.clientCredentials : await this.clientConfigs.getConfig(service);
    if (!config) {
      throw new ConnectionError(
        "oauth_client_config_required",
        `OAuth client credentials for ${service} are unavailable. Reconnect ${service}.`,
      );
    }

    const refreshed =
      auth.flow === "client_credentials"
        ? await requestClientCredentialsToken({
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            extraFields: createClientCredentialsExtraFields(auth, config),
            responseEnvelope: auth.tokenResponseEnvelope,
            scopes: auth.scopes,
            scopeSeparator: auth.scopeSeparator,
            tokenRequestFields: auth.tokenRequestFields,
            tokenEndpointAuthMethod: auth.tokenEndpointAuthMethod,
            tokenRequestFormat: auth.tokenRequestFormat,
            tokenUrl: this.clientConfigs.resolveEndpointUrl(service, auth.tokenUrl, config),
            sensitiveValues: Object.values(config.secretExtra),
            createError: (message) => new ConnectionError("oauth_token_refresh_failed", message),
          })
        : await this.requestRefreshToken(service, auth, config, credential);

    return {
      ...refreshed,
      clientCredentials: credential.clientCredentials,
      refreshToken: refreshed.refreshToken ?? credential.refreshToken,
      profile: {
        ...credential.profile,
        grantedScopes:
          refreshed.profile.grantedScopes.length > 0
            ? refreshed.profile.grantedScopes
            : credential.profile.grantedScopes,
      },
      metadata: {
        ...credential.metadata,
        ...refreshed.metadata,
        refreshedAt: new Date().toISOString(),
      },
    };
  }

  private async requestRefreshToken(
    service: string,
    auth: ReturnType<OAuthClientConfigService["getOAuthDefinition"]>,
    config: Pick<OAuthClientConfig, "clientId" | "clientSecret" | "extra">,
    credential: OAuthCredential,
  ): Promise<OAuthCredential> {
    return await requestRefreshToken({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      responseEnvelope: auth.tokenResponseEnvelope,
      refreshToken: credential.refreshToken!,
      tokenRequestFields: auth.tokenRequestFields,
      tokenEndpointAuthMethod: auth.tokenEndpointAuthMethod,
      tokenRequestFormat: auth.tokenRequestFormat,
      tokenUrl: this.clientConfigs.resolveEndpointUrl(service, auth.refreshTokenUrl ?? auth.tokenUrl, config),
      createError: (message) => new ConnectionError("oauth_token_refresh_failed", message),
    });
  }
}
