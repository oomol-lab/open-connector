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
import { offlineAccessScope } from "./config.ts";
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

export async function handleTokenPost(
  form: URLSearchParams,
  deps: TokenDependencies,
  authorization?: string,
): Promise<IssuedTokenResponse> {
  const client = await authenticateClient(form, deps, authorization);
  const grantType = form.get("grant_type") ?? "";
  if (grantType === "authorization_code") {
    return exchangeAuthorizationCode(form, client, deps);
  }
  if (grantType === "refresh_token") {
    return refreshGrant(form, client, deps);
  }
  throw new TokenError("unsupported_grant_type", "Supported grant types: authorization_code, refresh_token.");
}

export async function handleRevokePost(
  form: URLSearchParams,
  deps: TokenDependencies,
  authorization?: string,
): Promise<void> {
  const client = await authenticateClient(form, deps, authorization);
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
export async function authenticateClient(
  form: URLSearchParams,
  deps: TokenDependencies,
  authorization?: string,
): Promise<OAuthClientRecord> {
  const credentials = readClientCredentials(form, authorization);
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

function readClientCredentials(
  form: URLSearchParams,
  authorization?: string,
): { clientId: string; clientSecret?: string } {
  const header = authorization?.trim();
  if (header !== undefined && header !== "" && /^basic\s/i.test(header)) {
    const credentials = parseBasicCredentials(header);
    if (!credentials) {
      throw new TokenError("invalid_client", "Malformed Basic authorization header.", 401);
    }
    return credentials;
  }
  const clientId = form.get("client_id") ?? "";
  const clientSecret = form.get("client_secret") ?? undefined;
  return { clientId, clientSecret };
}

/**
 * RFC 6749 section 2.3.1: the client id and secret are sent as a
 * `client_id:client_secret` pair encoded with the standard `Basic` scheme
 * (case-insensitive; standard base64, not base64url) and both halves are
 * form-URL-decoded before use.
 */
function parseBasicCredentials(header: string): { clientId: string; clientSecret?: string } | undefined {
  const encoded = header.replace(/^basic\s+/i, "");
  if (!encoded) {
    return undefined;
  }
  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 0) {
    return undefined;
  }
  return {
    clientId: decodeFormComponent(decoded.slice(0, separator)),
    clientSecret: decodeFormComponent(decoded.slice(separator + 1)),
  };
}

function decodeFormComponent(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    // Not valid percent-encoding; treat the value as sent verbatim.
    return value;
  }
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
  // A grant is only as valid as its client: a code that survived a racing
  // client deletion must not mint tokens.
  if (!(await deps.clients.get(record.clientId))) {
    throw new TokenError("invalid_grant", "The client no longer exists.");
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
  // RFC 8707: the token request may only name a resource the authorization
  // request already selected. A code issued without a resource still belongs
  // to this server's single protected resource, so a token request cannot add
  // a different audience after the fact.
  const expectedResource = record.resource ?? `${deps.config.issuer}/mcp`;
  if (resource !== undefined && resource !== expectedResource) {
    throw new TokenError("invalid_target", "resource does not match the authorization request.");
  }
  return issueTokens(deps, {
    clientId: client.clientId,
    runtimeTokenId: record.runtimeTokenId,
    scope: record.scope,
    resource: expectedResource,
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
  const tokenHash = hashToken(refreshToken);
  // Read the record before consuming anything: a request with an excess
  // scope, or against a token that cannot redeem anyway, must not burn a
  // redeemable token. The record found here can be stale by the time the
  // rotation runs, so the rotated record is re-checked below.
  const precheck = await deps.tokens.findByRefreshTokenHash(tokenHash);
  if (!precheck) {
    throw new TokenError("invalid_grant", "The refresh token is invalid, expired, or already used.");
  }
  // Replay detection (RFC 6749 section 10.4): a refresh token that was
  // already consumed by a successful rotation stays findable by hash, so a
  // replay maps back to its grant. Presenting it again indicates theft —
  // revoke the whole grant before rejecting.
  if (precheck.refreshConsumedAt !== undefined) {
    await revokeGrant(precheck, deps);
    throw new TokenError("invalid_grant", "The refresh token is invalid, expired, or already used.");
  }
  // Another client's live refresh token was presented: burn it and revoke
  // the grant it anchors — presenting it elsewhere indicates theft. A
  // consumed token from another client is handled above the same way.
  if (precheck.clientId !== client.clientId) {
    await revokeGrant(precheck, deps);
    throw new TokenError("invalid_grant", "The refresh token was issued to a different client.");
  }
  // Replay detection (RFC 6749 section 10.4): a refresh token that is still
  // findable but no longer redeemable (revoked or past its refresh expiry)
  // must not leave its grant alive.
  if (
    precheck.revokedAt !== undefined ||
    precheck.refreshExpiresAt === undefined ||
    precheck.refreshExpiresAt <= Date.now()
  ) {
    await revokeGrant(precheck, deps);
    throw new TokenError("invalid_grant", "The refresh token is invalid, expired, or already used.");
  }
  // A grant is only as valid as its client: a token that survived a racing
  // client deletion must not mint new tokens.
  if (!(await deps.clients.get(precheck.clientId))) {
    await revokeGrant(precheck, deps);
    throw new TokenError("invalid_grant", "The client no longer exists.");
  }
  // A request with an excess scope is rejected before the old token is
  // consumed, so a wrong request does not burn a redeemable token.
  if (exceedsGrantedScope(form.get("scope"), precheck.scope)) {
    throw new TokenError("invalid_scope", "Requested scope exceeds the originally granted scope.");
  }
  // The backing runtime token must still exist; a deleted connection cannot
  // mint new tokens.
  const backing = await deps.runtimeTokenStore.findById(precheck.runtimeTokenId);
  if (!backing) {
    throw new TokenError("invalid_grant", "This connection was revoked. Authorize again.");
  }
  // Build and sign the successor BEFORE consuming the old token: if key
  // activation or signing fails, the old token stays redeemable.
  const built = await buildTokens(deps, {
    clientId: client.clientId,
    runtimeTokenId: precheck.runtimeTokenId,
    scope: precheck.scope,
    resource: precheck.resource,
    refreshTokenTtl: remainingRefreshTtl(precheck, deps.config.refreshTokenTtlSeconds),
  });
  // Rotate atomically: the old hash is consumed and the successor inserted in
  // one store operation, so a concurrent redemption or a persistence failure
  // cannot leave the client with neither token.
  const rotated = await deps.tokens.rotateRefreshToken(tokenHash, built.record);
  if (!rotated) {
    // The token vanished between the pre-check and the rotation (a concurrent
    // request won the race, or it was revoked in between). A mere consumption
    // here is a benign concurrent retry, not evidence of theft, so the grant
    // stays alive for the winner; only a token that is revoked or past its
    // refresh expiry must not leave its grant alive.
    const known = await deps.tokens.findByRefreshTokenHash(tokenHash);
    if (
      known &&
      known.clientId === client.clientId &&
      (known.revokedAt !== undefined || known.refreshExpiresAt === undefined || known.refreshExpiresAt <= Date.now())
    ) {
      await revokeGrant(known, deps);
    }
    throw new TokenError("invalid_grant", "The refresh token is invalid, expired, or already used.");
  }
  return {
    access_token: built.accessToken,
    token_type: "Bearer",
    expires_in: deps.config.accessTokenTtlSeconds,
    refresh_token: built.refreshToken,
    scope: rotated.scope,
  };
}

function exceedsGrantedScope(requested: string | null, granted: string): boolean {
  if (requested === null || requested === "") {
    return false;
  }
  const grantedScopes = granted.split(/\s+/);
  return !requested.split(/\s+/).every((scope) => grantedScopes.includes(scope));
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

interface BuiltTokens {
  accessToken: string;
  refreshToken?: string;
  record: OAuthAccessTokenRecord;
}

/**
 * Key activation, access-token signing, and successor-record construction:
 * everything that can fail BEFORE any store mutation. Refresh-token rotation
 * calls this first so a signing failure cannot consume the old token.
 */
async function buildTokens(deps: TokenDependencies, input: IssueTokensInput): Promise<BuiltTokens> {
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
  const refreshToken =
    input.refreshTokenTtl > 0 && input.scope.split(/\s+/).includes(offlineAccessScope) ? randomToken(32) : undefined;
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
  return { accessToken: token, refreshToken, record };
}

async function issueTokens(deps: TokenDependencies, input: IssueTokensInput): Promise<IssuedTokenResponse> {
  const built = await buildTokens(deps, input);
  await deps.tokens.add(built.record);
  return {
    access_token: built.accessToken,
    token_type: "Bearer",
    expires_in: deps.config.accessTokenTtlSeconds,
    refresh_token: built.refreshToken,
    scope: built.record.scope,
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
  deps: Pick<TokenDependencies, "config" | "tokens" | "keys" | "clients"> & { runtimeTokenStore: IRuntimeTokenStore },
): Promise<RuntimeGrant | undefined> {
  const verified = await verifyAccessToken(token, deps.keys, deps.config.issuer);
  if (!verified) {
    return undefined;
  }
  const record = await deps.tokens.findByAccessTokenHash(hashToken(token));
  if (!record || record.revokedAt !== undefined || record.expiresAt <= Date.now()) {
    return undefined;
  }
  // A grant is only as valid as its client: a token that survived a racing
  // client deletion must not resolve.
  if (!(await deps.clients.get(record.clientId))) {
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
