import type { ResolvedCredential } from "../core/types.ts";
import type { OAuthClientConfigService } from "./oauth-client-config-service.ts";

import { ConnectionError } from "../connection-service.ts";
import { requestRefreshToken } from "./oauth-token.ts";

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
    const config = await this.clientConfigs.getConfig(service);
    if (!config) {
      throw new ConnectionError(
        "oauth_client_config_required",
        `Configure an OAuth client for ${service} before refreshing its token.`,
      );
    }

    const refreshed = await requestRefreshToken({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      responseEnvelope: auth.tokenResponseEnvelope,
      refreshToken: credential.refreshToken ?? "",
      tokenRequestFields: auth.tokenRequestFields,
      tokenEndpointAuthMethod: auth.tokenEndpointAuthMethod,
      tokenRequestFormat: auth.tokenRequestFormat,
      tokenUrl: this.clientConfigs.resolveEndpointUrl(service, auth.refreshTokenUrl ?? auth.tokenUrl, config),
      createError: (message) => new ConnectionError("oauth_token_refresh_failed", message),
    });

    return {
      ...refreshed,
      refreshToken: refreshed.refreshToken ?? credential.refreshToken,
      profile: credential.profile,
      metadata: {
        ...credential.metadata,
        ...refreshed.metadata,
        refreshedAt: new Date().toISOString(),
      },
    };
  }
}
