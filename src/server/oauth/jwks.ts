import type { OAuthSigningKeyRecord } from "../storage/oauth-as-stores.ts";
import type { IOAuthSigningKeyStore } from "../storage/oauth-as-stores.ts";

import { createHash } from "node:crypto";

// `jose` is a lazy-only package (see eager-imports.test.ts): it must stay out
// of the static import graph of index.ts, so every use is a dynamic import.
async function jose(): Promise<typeof import("jose")> {
  return import("jose");
}

/**
 * Opaque credentials (authorization codes, refresh tokens, client secrets) are
 * stored only as SHA-256 digests, the same discipline as `RuntimeTokenService`.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("base64url");
}

export function randomToken(bytes = 32): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString("base64url");
}

/**
 * ES256 (P-256) signing keys, generated on first use and persisted so access
 * tokens survive process restarts. Rotation retires the old `kid` only after
 * every access token it signed has expired, so verification never needs a key
 * that is gone.
 */
export async function ensureSigningKey(store: IOAuthSigningKeyStore): Promise<OAuthSigningKeyRecord> {
  return store.active();
}

export interface JsonWebKeySet {
  keys: Array<JsonWebKey & { kid: string; alg: string; use: string }>;
}

export function toJwks(keys: OAuthSigningKeyRecord[]): JsonWebKeySet {
  return { keys: keys.map((key) => ({ ...key.publicKeyJwk, kid: key.kid, alg: "ES256", use: "sig" })) };
}

export interface AccessTokenClaims {
  iss: string;
  sub: string;
  aud: string;
  clientId: string;
  scope: string;
  runtimeTokenId: string;
  jti: string;
  iat: number;
  exp: number;
}

export async function signAccessToken(input: {
  key: OAuthSigningKeyRecord;
  issuer: string;
  audience: string;
  clientId: string;
  scope: string;
  runtimeTokenId: string;
  ttlSeconds: number;
  tokenId: string;
}): Promise<{ token: string; claims: AccessTokenClaims }> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + input.ttlSeconds;
  const { importJWK, SignJWT } = await jose();
  const privateKey = await importJWK(input.key.privateKeyJwk, "ES256");
  const claims: AccessTokenClaims = {
    iss: input.issuer,
    sub: `client:${input.clientId}`,
    aud: input.audience,
    clientId: input.clientId,
    scope: input.scope,
    runtimeTokenId: input.runtimeTokenId,
    jti: input.tokenId,
    iat: issuedAt,
    exp: expiresAt,
  };
  const token = await new SignJWT({
    clientId: claims.clientId,
    scope: claims.scope,
    runtimeTokenId: claims.runtimeTokenId,
  })
    .setProtectedHeader({ alg: "ES256", kid: input.key.kid, typ: "JWT" })
    .setIssuer(claims.iss)
    .setSubject(claims.sub)
    .setAudience(claims.aud)
    .setJti(claims.jti)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .sign(privateKey);
  return { token, claims };
}

export interface VerifiedAccessToken {
  claims: AccessTokenClaims;
  tokenId: string;
}

/**
 * Signature-and-expiry check only. Revocation is a database lookup
 * (`oauthTokenStore.findByAccessTokenHash`) and must never be skipped: a JWT is
 * valid until it expires otherwise.
 */
export async function verifyAccessToken(
  token: string,
  store: IOAuthSigningKeyStore,
  issuer: string,
): Promise<VerifiedAccessToken | undefined> {
  const header = decodeJwtHeader(token);
  if (!header?.kid) {
    return undefined;
  }
  const keys = await store.all();
  const key = keys.find((candidate) => candidate.kid === header.kid);
  if (!key) {
    return undefined;
  }
  try {
    const { importJWK, jwtVerify } = await jose();
    const publicKey = await importJWK(key.publicKeyJwk, "ES256");
    // Tokens are only minted for this server's own protected resource
    // (`${issuer}/mcp`, what the PRM advertises): the authorize endpoint
    // rejects any other `resource`, and issueTokens falls back to the same
    // audience when no resource was requested. Enforcing it here keeps a token
    // minted for a different audience from being replayed at /mcp.
    const { payload } = await jwtVerify(token, publicKey, {
      issuer,
      audience: `${issuer}/mcp`,
      algorithms: ["ES256"],
    });
    const claims = payload as unknown as AccessTokenClaims;
    if (!claims.clientId || !claims.runtimeTokenId || typeof claims.scope !== "string") {
      return undefined;
    }
    return { claims, tokenId: claims.jti };
  } catch {
    return undefined;
  }
}

function decodeJwtHeader(token: string): { kid?: string } | undefined {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return undefined;
  }
  try {
    const decoded = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as { kid?: unknown; alg?: unknown };
    if (decoded.alg !== "ES256" || typeof decoded.kid !== "string") {
      return undefined;
    }
    return { kid: decoded.kid };
  } catch {
    return undefined;
  }
}

/** Used by the signing-key store default and by tests that need a fresh key. */
export async function generateSigningKeyRecord(): Promise<Omit<OAuthSigningKeyRecord, "kid"> & { kid: string }> {
  const { exportJWK, generateKeyPair } = await jose();
  const { publicKey, privateKey } = await generateKeyPair("ES256", { extractable: true });
  return {
    kid: crypto.randomUUID(),
    privateKeyJwk: await exportJWK(privateKey),
    publicKeyJwk: await exportJWK(publicKey),
    createdAt: new Date().toISOString(),
  };
}
