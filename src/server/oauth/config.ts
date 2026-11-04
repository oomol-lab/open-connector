import type { RuntimeLogger } from "../../core/types.ts";

/**
 * Runtime configuration for the Node authorization server. Defaults reproduce
 * the Workers deployment (`src/server/cloudflare/mcp-oauth.ts`): one-hour access
 * tokens, thirty-day refresh tokens, sixty-second authorization codes.
 */
export interface OAuthServerConfig {
  issuer: string;
  accessTokenTtlSeconds: number;
  refreshTokenTtlSeconds: number;
  authorizationCodeTtlSeconds: number;
  allowDynamicRegistration: boolean;
  allowClientIdMetadataDocuments: boolean;
  logger?: RuntimeLogger;
}

export const defaultAccessTokenTtlSeconds: number = 3600;
export const defaultRefreshTokenTtlSeconds: number = 30 * 86400;
export const defaultAuthorizationCodeTtlSeconds: number = 60;

/** The scopes this authorization server can grant; `requiredScopes` on the Workers side. */
export const accessScope = "mcp:access" as string;
/** Grants refresh tokens so clients survive access-token expiry. */
export const offlineAccessScope = "offline_access" as string;
export const supportedScopes: readonly string[] = [accessScope, offlineAccessScope];

export interface OAuthServerConfigInput {
  issuer: string;
  accessTokenTtlSeconds?: number;
  refreshTokenTtlSeconds?: number;
  authorizationCodeTtlSeconds?: number;
  allowDynamicRegistration?: boolean;
  allowClientIdMetadataDocuments?: boolean;
  logger?: RuntimeLogger;
}

export function resolveOAuthServerConfig(input: OAuthServerConfigInput): OAuthServerConfig {
  const issuer = input.issuer.replace(/\/+$/, "");
  if (!/^https?:\/\//.test(issuer)) {
    throw new Error("OAuth issuer must be an absolute http(s) URL.");
  }
  return {
    issuer,
    accessTokenTtlSeconds: positiveInteger(input.accessTokenTtlSeconds, defaultAccessTokenTtlSeconds),
    refreshTokenTtlSeconds: positiveInteger(input.refreshTokenTtlSeconds, defaultRefreshTokenTtlSeconds),
    authorizationCodeTtlSeconds: positiveInteger(input.authorizationCodeTtlSeconds, defaultAuthorizationCodeTtlSeconds),
    allowDynamicRegistration: input.allowDynamicRegistration ?? true,
    allowClientIdMetadataDocuments: input.allowClientIdMetadataDocuments ?? true,
    logger: input.logger,
  };
}

function positiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error("OAuth lifetimes must be positive integers of seconds.");
  }
  return value;
}

/** Scope string handling shared by the authorize, token, and registration endpoints. */
export function parseScope(value: string | null | undefined): string[] {
  const requested = (value ?? "").split(/\s+/).filter((scope) => scope.length > 0);
  const granted = requested.filter((scope) => (supportedScopes as readonly string[]).includes(scope));
  // `mcp:access` is what the whole flow exists for; a request that only asked
  // for `offline_access` would mint refresh tokens with nothing to refresh.
  return granted.includes(accessScope) ? [...new Set(granted)] : [];
}
