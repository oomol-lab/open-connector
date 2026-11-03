/**
 * Storage contracts for the Node OAuth 2.1 authorization server.
 *
 * Types and interfaces only: SQL and backend specifics live in the
 * sqlite/postgres/d1 runtime stores. Opaque credentials (authorization codes,
 * access tokens, refresh tokens, client secrets) reach these stores only as
 * SHA-256 digests, the same discipline as `RuntimeTokenService`.
 */

export type OAuthClientRegistrationType = "dcr" | "cimd" | "manual";
export type OAuthTokenEndpointAuthMethod = "none" | "client_secret_basic" | "client_secret_post";

export interface OAuthClientRecord {
  clientId: string; // opaque for dcr/manual; CIMD document URL for cimd
  clientName: string;
  registrationType: OAuthClientRegistrationType;
  redirectUris: string[]; // exact-string match list
  scopes: string[]; // grantable scopes, subset of ["mcp:access","offline_access"]
  tokenEndpointAuthMethod: OAuthTokenEndpointAuthMethod;
  clientSecretHash?: string; // sha256-base64url, confidential clients only
  metadataDocumentUrl?: string; // CIMD
  createdAt: string; // ISO
  rotatedAt?: string;
}

export interface OAuthAuthorizationCodeRecord {
  codeHash: string; // sha256-base64url of the code
  clientId: string;
  redirectUri: string;
  scope: string;
  codeChallenge?: string; // S256 only
  resource?: string; // RFC 8707
  runtimeTokenId: string; // backing RuntimeGrant id, minted at authorize time
  issuedAt: string;
  expiresAt: number; // epoch ms
  consumedAt?: number;
}

export interface OAuthAccessTokenRecord {
  tokenHash: string; // sha256-base64url of access token
  refreshTokenHash?: string;
  clientId: string;
  runtimeTokenId: string;
  scope: string;
  resource?: string; // becomes aud claim
  issuedAt: string;
  expiresAt: number; // epoch ms
  refreshExpiresAt?: number;
  revokedAt?: number;
  /**
   * Set when this record's refresh token was consumed by a successful
   * rotation; the hash is retained so the consumed record stays findable and
   * a replayed token can be mapped back to its grant and revoked
   * (refresh-replay detection).
   */
  refreshConsumedAt?: number;
}

export interface OAuthSigningKeyRecord {
  kid: string;
  privateKeyJwk: JsonWebKey; // ES256 P-256, JSON-serialized in storage
  publicKeyJwk: JsonWebKey;
  createdAt: string;
  retiredAt?: string;
}

export interface IOAuthClientStore {
  add(record: OAuthClientRecord): Promise<void>;
  get(clientId: string): Promise<OAuthClientRecord | undefined>;
  list(): Promise<OAuthClientRecord[]>;
  update(record: OAuthClientRecord): Promise<void>;
  delete(clientId: string): Promise<boolean>;
}

export interface IOAuthCodeStore {
  add(record: OAuthAuthorizationCodeRecord): Promise<void>;
  /** Atomically mark consumed and return the record; undefined when missing, expired, or already consumed. */
  consume(codeHash: string): Promise<OAuthAuthorizationCodeRecord | undefined>;
  deleteExpired(nowMs: number): Promise<void>;
}

export interface IOAuthTokenStore {
  add(record: OAuthAccessTokenRecord): Promise<void>;
  findByAccessTokenHash(tokenHash: string): Promise<OAuthAccessTokenRecord | undefined>;
  findByRefreshTokenHash(tokenHash: string): Promise<OAuthAccessTokenRecord | undefined>;
  /**
   * Atomically rotate a refresh token: only an unrevoked, unconsumed,
   * unexpired refresh token matches. The consumption time is recorded
   * (`refreshConsumedAt`) and the successor record inserted in the same
   * transaction, so a persistence failure rolls back and leaves the old
   * token redeemable, and the token can never be redeemed twice. The hash is
   * retained so the consumed record stays findable by hash and a replayed
   * token can be mapped back to its grant and revoked. Returns the consumed
   * record, or undefined when the hash is unknown, already consumed,
   * revoked, expired, or lost a concurrent rotation race.
   */
  rotateRefreshToken(
    oldRefreshTokenHash: string,
    successor: OAuthAccessTokenRecord,
  ): Promise<OAuthAccessTokenRecord | undefined>;
  /** All token records for one client (access + refresh anchoring), any revocation state. */
  listByClient(clientId: string): Promise<OAuthAccessTokenRecord[]>;
  /** Revoke all tokens for one client+grant (the minted RuntimeGrant). Returns count revoked. */
  revokeByGrant(clientId: string, runtimeTokenId: string): Promise<number>;
  deleteExpired(nowMs: number): Promise<void>;
}

export interface IOAuthSigningKeyStore {
  add(record: OAuthSigningKeyRecord): Promise<void>;
  /** Newest non-retired key; generates one if none exists (ES256 P-256, persisted). */
  active(): Promise<OAuthSigningKeyRecord>;
  /** All non-retired keys for JWKS publication. */
  all(): Promise<OAuthSigningKeyRecord[]>;
  retire(kid: string): Promise<void>;
}
