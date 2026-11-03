import type {
  OAuthAccessTokenRecord,
  OAuthClientRecord,
  IOAuthClientStore,
  IOAuthCodeStore,
  IOAuthTokenStore,
  IOAuthSigningKeyStore,
} from "../storage/oauth-as-stores.ts";
import type { RuntimeGrant, RuntimeTokenService, IRuntimeTokenStore } from "../storage/runtime-token-service.ts";
import type { OAuthServerConfig } from "./config.ts";

import { constantTimeEqual } from "../api/auth-utils.ts";
import { hashToken, randomToken, signAccessToken, verifyAccessToken } from "./jwks.ts";
import { verifyPkceS256 } from "./pkce.ts";

/**
 * The token endpoint (RFC 6749 section 3.2): `authorization_code` and
 * `refresh_token` grants. Access tokens are ES256 JWTs whose `aud` carries the
 * RFC 8707 `resource` (defaulting to this server's MCP resource URI); refresh
 * tokens are opaque and stored hashed. Every issued token is anchored to a
 * backing runtime token (`runtimeTokenId`) so revocation, policy, and audit
 * stay in the single existing enforcement engine.
 */

export interface TokenDependencies {
  config: OAuthServerConfig;
  clients: IOAuthClientStore;
  codes: IOAuthCodeStore;
  tokens: IOAuthTokenStore;
  keys: IOAuthSigningKeyStore;
  runtimeTokens: RuntimeTokenService;
  runtimeTokenStore: IRuntimeTokenStore;
}

export interface IssuedTokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export class TokenError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export async function handleTokenPost(form: URLSearchParams, deps: TokenDependencies): Promise<IssuedTokenResponse> {
  const client = await authenticateClient(form, deps);
  const grantType = form.get("grant_type") ?? "";
  if (grantType === "authorization_code") {
    return exchangeAuthorizationCode(form, client, deps);
  }
  if (grantType === "refresh_token") {
    return refreshGrant(form, client, deps);
  }
  throw new TokenError("unsupported_grant_type", "Supported grant types: authorization_code, refresh_token.");
}

export async function handleRevokePost(form: URLSearchParams, deps: TokenDependencies): Promise<void> {
  const client = await authenticateClient(form, deps);
  const token = form.get("token") ?? "";
  if (token) {
    await revokeToken(token, client, deps);
  }
  // RFC 7009: revocation succeeds even when the token is already invalid, so
  // the response never leaks token validity.
}

async function revokeToken(token: string, client: OAuthClientRecord, deps: TokenDependencies): Promise<void> {
  const tokenHash = hashToken(token);
  const record = await deps.tokens.findByAccessTokenHash(tokenHash);
  if (record && record.clientId === client.clientId) {
    await revokeGrant(record, deps);
    return;
  }
  const refresh = await deps.tokens.findByRefreshTokenHash(tokenHash);
  if (refresh && refresh.clientId === client.clientId) {
    await revokeGrant(refresh, deps);
  }
}

async function revokeGrant(record: OAuthAccessTokenRecord, deps: TokenDependencies): Promise<void> {
  await deps.tokens.revokeByGrant(record.clientId, record.runtimeTokenId);
  await deps.runtimeTokens.revokeToken(record.runtimeTokenId);
}

/** Client authentication per the registered token_endpoint_auth_method. */
export async function authenticateClient(form: URLSearchParams, deps: TokenDependencies): Promise<OAuthClientRecord> {
  const credentials = readClientCredentials(form);
  const client = await deps.clients.get(credentials.clientId);
  if (!client) {
    throw new TokenError("invalid_client", "Unknown client.", 401);
  }
  if (client.tokenEndpointAuthMethod === "none") {
    if (credentials.clientSecret !== undefined) {
      throw new TokenError("invalid_client", "This client is public and must not send a secret.", 401);
    }
    return client;
  }
  if (!credentials.clientSecret || !client.clientSecretHash) {
    throw new TokenError("invalid_client", "Client authentication required.", 401);
  }
  if (!constantTimeEqual(hashToken(credentials.clientSecret), client.clientSecretHash)) {
    throw new TokenError("invalid_client", "Client authentication failed.", 401);
  }
  return client;
}

function readClientCredentials(form: URLSearchParams): { clientId: string; clientSecret?: string } {
  const header = form.get("_basic_authorization");
  if (header) {
    const decoded = Buffer.from(header, "base64url").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator > 0) {
      return { clientId: decoded.slice(0, separator), clientSecret: decoded.slice(separator + 1) };
    }
  }
  const clientId = form.get("client_id") ?? "";
  const clientSecret = form.get("client_secret") ?? undefined;
  return { clientId, clientSecret };
}

async function exchangeAuthorizationCode(
  form: URLSearchParams,
  client: OAuthClientRecord,
  deps: TokenDependencies,
): Promise<IssuedTokenResponse> {
  const code = form.get("code") ?? "";
  const redirectUri = form.get("redirect_uri") ?? "";
  const verifier = form.get("code_verifier") ?? undefined;
  const resource = form.get("resource") ?? undefined;
  if (!code) {
    throw new TokenError("invalid_request", "code is required.");
  }
  const record = await deps.codes.consume(hashToken(code));
  if (!record) {
    throw new TokenError("invalid_grant", "The authorization code is invalid, expired, or already used.");
  }
  if (record.clientId !== client.clientId) {
    throw new TokenError("invalid_grant", "The authorization code was issued to a different client.");
  }
  if (record.redirectUri !== redirectUri) {
    throw new TokenError("invalid_grant", "redirect_uri does not match the authorization request.");
  }
  if (record.codeChallenge) {
    if (!verifier || !verifyPkceS256(record.codeChallenge, verifier)) {
      throw new TokenError("invalid_grant", "PKCE verification failed.");
    }
  } else if (client.tokenEndpointAuthMethod === "none") {
    throw new TokenError("invalid_grant", "The authorization request did not include a PKCE challenge.");
  }
  if (record.resource && resource && record.resource !== resource) {
    throw new TokenError("invalid_target", "resource does not match the authorization request.");
  }
  return issueTokens(deps, {
    clientId: client.clientId,
    runtimeTokenId: record.runtimeTokenId,
    scope: record.scope,
    resource: record.resource ?? resource,
    refreshTokenTtl: deps.config.refreshTokenTtlSeconds,
  });
}

async function refreshGrant(
  form: URLSearchParams,
  client: OAuthClientRecord,
  deps: TokenDependencies,
): Promise<IssuedTokenResponse> {
  const refreshToken = form.get("refresh_token") ?? "";
  if (!refreshToken) {
    throw new TokenError("invalid_request", "refresh_token is required.");
  }
  const record = await deps.tokens.findByRefreshTokenHash(hashToken(refreshToken));
  if (!record || record.clientId !== client.clientId) {
    throw new TokenError("invalid_grant", "The refresh token is invalid.");
  }
  const now = Date.now();
  if (record.revokedAt !== undefined || (record.refreshExpiresAt !== undefined && record.refreshExpiresAt <= now)) {
    throw new TokenError("invalid_grant", "The refresh token is expired or revoked.");
  }
  const scope = form.get("scope");
  if (
    scope !== null &&
    scope !== "" &&
    !scope.split(/\s+/).every((requested) => record.scope.split(/\s+/).includes(requested))
  ) {
    throw new TokenError("invalid_scope", "Requested scope exceeds the originally granted scope.");
  }
  const backing = await deps.runtimeTokenStore.findById(record.runtimeTokenId);
  if (!backing) {
    throw new TokenError("invalid_grant", "This connection was revoked. Authorize again.");
  }
  return issueTokens(deps, {
    clientId: client.clientId,
    runtimeTokenId: record.runtimeTokenId,
    scope: record.scope,
    resource: record.resource,
    refreshTokenTtl: remainingRefreshTtl(record, deps.config.refreshTokenTtlSeconds),
  });
}

function remainingRefreshTtl(record: OAuthAccessTokenRecord, defaultTtl: number): number {
  if (record.refreshExpiresAt === undefined) {
    return defaultTtl;
  }
  return Math.max(1, Math.floor((record.refreshExpiresAt - Date.now()) / 1000));
}

interface IssueTokensInput {
  clientId: string;
  runtimeTokenId: string;
  scope: string;
  resource?: string;
  refreshTokenTtl: number;
}

async function issueTokens(deps: TokenDependencies, input: IssueTokensInput): Promise<IssuedTokenResponse> {
  const key = await deps.keys.active();
  const nowMs = Date.now();
  const accessTokenId = crypto.randomUUID();
  const audience = input.resource ?? `${deps.config.issuer}/mcp`;
  const { token } = await signAccessToken({
    key,
    issuer: deps.config.issuer,
    audience,
    clientId: input.clientId,
    scope: input.scope,
    runtimeTokenId: input.runtimeTokenId,
    ttlSeconds: deps.config.accessTokenTtlSeconds,
    tokenId: accessTokenId,
  });
  const refreshToken = input.refreshTokenTtl > 0 ? randomToken(32) : undefined;
  const record: OAuthAccessTokenRecord = {
    tokenHash: hashToken(token),
    refreshTokenHash: refreshToken === undefined ? undefined : hashToken(refreshToken),
    clientId: input.clientId,
    runtimeTokenId: input.runtimeTokenId,
    scope: input.scope,
    resource: input.resource,
    issuedAt: new Date(nowMs).toISOString(),
    expiresAt: nowMs + deps.config.accessTokenTtlSeconds * 1000,
    refreshExpiresAt: refreshToken === undefined ? undefined : nowMs + input.refreshTokenTtl * 1000,
  };
  await deps.tokens.add(record);
  return {
    access_token: token,
    token_type: "Bearer",
    expires_in: deps.config.accessTokenTtlSeconds,
    refresh_token: refreshToken,
    scope: input.scope,
  };
}

/**
 * Bridge used by the auth middleware: resolve an OAuth access token to the
 * RuntimeGrant of its backing runtime token. Signature and expiry are checked
 * cryptographically; revocation is the database lookup that must never be
 * skipped. Returns undefined for anything that is not a live, revoked-clean
 * access token anchored to an existing runtime token.
 */
export async function resolveOAuthAccessToken(
  token: string,
  deps: Pick<TokenDependencies, "config" | "tokens" | "keys"> & { runtimeTokenStore: IRuntimeTokenStore },
): Promise<RuntimeGrant | undefined> {
  const verified = await verifyAccessToken(token, deps.keys, deps.config.issuer);
  if (!verified) {
    return undefined;
  }
  const record = await deps.tokens.findByAccessTokenHash(hashToken(token));
  if (!record || record.revokedAt !== undefined || record.expiresAt <= Date.now()) {
    return undefined;
  }
  if (record.clientId !== verified.claims.clientId || record.runtimeTokenId !== verified.claims.runtimeTokenId) {
    return undefined;
  }
  const backing = await deps.runtimeTokenStore.findById(record.runtimeTokenId);
  if (!backing) {
    return undefined;
  }
  return {
    tokenId: backing.id,
    allowedActions: backing.allowedActions,
    blockedActions: backing.blockedActions,
    allowedProxies: backing.allowedProxies,
    allowedConnections: backing.allowedConnections ?? [],
    allowedTriggers: backing.allowedTriggers ?? [],
  };
}
