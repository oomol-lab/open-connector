/**
 * Deployment-facing settings for the inbound OAuth 2.1 authorization server.
 * Environments parse `OOMOL_CONNECT_OAUTH_*` into this shape; `ConnectAppOptions`
 * and `IConnectServerOptions` carry it verbatim so hosts can also set it directly.
 */
export interface OAuthServerSettings {
  enabled: boolean;
  /** RFC 8414 issuer; defaults to the deployment's public origin. */
  issuer?: string;
  accessTokenTtlSeconds?: number;
  refreshTokenTtlSeconds?: number;
  authorizationCodeTtlSeconds?: number;
  allowDynamicRegistration?: boolean;
  allowClientIdMetadataDocuments?: boolean;
}
