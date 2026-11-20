import type { AppleMapsPhase } from "./client.ts";

import { importPKCS8, SignJWT } from "jose";
import { sha256Hex } from "../../core/aws-sigv4.ts";
import { optionalNumber, requiredString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import {
  appleMapsApiOrigin,
  appleMapsProviderLabel,
  appleMapsTokenPath,
  createAppleMapsError,
  readAppleMapsPayload,
} from "./client.ts";

/**
 * A Maps auth token is used for one access-token exchange only.
 * Five minutes covers one exchange while keeping the exposure window short.
 */
const authTokenLifetimeSeconds = 300;
/** Refresh this long before Apple's expiry time to avoid using a token as it expires. */
const accessTokenRefreshLeewayMs = 60_000;
/** Maximum credential entries retained in process; the least recently used entry is evicted. */
const maximumTokenCacheEntries = 256;
const pkcs8Marker = "-----BEGIN PRIVATE KEY-----";

export interface AppleMapsCredential {
  teamId: string;
  keyId: string;
  /** PKCS#8 PEM text with literal `\n` sequences restored to newlines. */
  privateKey: string;
}

export interface AppleMapsAccessTokenLease {
  accessToken: string;
  /**
   * True when the token came from a completed cached exchange.
   * Tokens exchanged by this call or obtained by joining an in-flight exchange return false.
   */
  fromCache: boolean;
}

interface ExchangedAccessToken {
  accessToken: string;
  /** Stop reusing the token after this time. Undefined means it is valid only for the current request. */
  refreshAt: number | undefined;
}

interface TokenCacheEntry {
  token?: { accessToken: string; refreshAt: number };
  /** An in-flight exchange shared by concurrent executions using the same credential. */
  pending?: Promise<ExchangedAccessToken>;
}

/**
 * In-process access-token cache keyed by a SHA-256 digest of the credential.
 *
 * Each exchange consumes the team's shared daily quota of 25,000 upstream calls. Auth tokens are
 * signed locally, so this caches exchanged access tokens instead.
 */
const tokenCache = new Map<string, TokenCacheEntry>();

export function resetAppleMapsTokenCacheForTests(): void {
  tokenCache.clear();
}

/**
 * Read the three credential fields stored with the connection.
 *
 * Single-line inputs and JSON callers may encode PEM newlines as literal `\n` sequences. Restore
 * them before checking the PEM marker, and never echo private-key content in the 400 response.
 */
export function readAppleMapsCredential(values: Record<string, string | undefined>): AppleMapsCredential {
  const teamId = requiredInputString(values.teamId, "teamId");
  const keyId = requiredInputString(values.keyId, "keyId");
  const privateKey = requiredInputString(values.privateKey, "privateKey").replaceAll("\\n", "\n");
  if (!privateKey.includes(pkcs8Marker)) {
    throw new ProviderRequestError(
      400,
      "privateKey must be the PEM contents of the AuthKey .p8 file, starting with -----BEGIN PRIVATE KEY-----",
    );
  }

  return { teamId, keyId, privateKey };
}

/**
 * Acquire a Maps access token for an action or proxy request.
 *
 * Reuse an unexpired cached token or join an exchange already in flight for the credential.
 * Otherwise exchange once and cache a successful token with a usable lifetime. Failed exchanges
 * are never cached.
 */
export async function acquireAppleMapsAccessToken(
  credential: AppleMapsCredential,
  fetcher: typeof fetch,
): Promise<AppleMapsAccessTokenLease> {
  const key = tokenCacheKey(credential);
  const entry = tokenCache.get(key);
  if (entry?.token && Date.now() < entry.token.refreshAt) {
    rememberEntry(key, entry);
    return { accessToken: entry.token.accessToken, fromCache: true };
  }
  if (entry?.pending) {
    return { accessToken: (await entry.pending).accessToken, fromCache: false };
  }

  const pending = exchangeAccessToken(credential, fetcher, "execute");
  rememberEntry(key, { pending });
  try {
    const token = await pending;
    if (tokenCache.get(key)?.pending === pending) {
      settleEntry(key, token);
    }
    return { accessToken: token.accessToken, fromCache: false };
  } catch (error) {
    if (tokenCache.get(key)?.pending === pending) {
      tokenCache.delete(key);
    }
    throw error;
  }
}

/**
 * Evict a token after a business endpoint rejects it with 401.
 *
 * Delete it only if the cache still contains this token, preserving a replacement produced concurrently.
 */
export function evictAppleMapsAccessToken(credential: AppleMapsCredential, accessToken: string): void {
  const key = tokenCacheKey(credential);
  if (tokenCache.get(key)?.token?.accessToken === accessToken) {
    tokenCache.delete(key);
  }
}

/**
 * Validate credentials with a fresh exchange regardless of the cached token.
 *
 * The exchange uses validation-phase error mapping and is not exposed as an in-flight entry to
 * executions, which must not receive connection-form field errors. Cache a successful token so
 * the action immediately following validation need not exchange again.
 */
export async function exchangeAppleMapsAccessTokenForValidation(
  credential: AppleMapsCredential,
  fetcher: typeof fetch,
): Promise<void> {
  const key = tokenCacheKey(credential);
  tokenCache.delete(key);
  settleEntry(key, await exchangeAccessToken(credential, fetcher, "validate"));
}

async function exchangeAccessToken(
  credential: AppleMapsCredential,
  fetcher: typeof fetch,
  phase: AppleMapsPhase,
): Promise<ExchangedAccessToken> {
  return runProviderRequest({ label: appleMapsProviderLabel }, async (signal) => {
    // Sign inside the callback so private-key parsing errors remain 400 ProviderRequestError instances.
    const authToken = await signAuthToken(credential);
    // Start the lifetime before the request so network time advances refresh instead of extending expiry.
    const requestedAt = Date.now();
    const response = await fetcher(`${appleMapsApiOrigin}${appleMapsTokenPath}`, {
      method: "GET",
      headers: {
        "accept": "application/json",
        "authorization": `Bearer ${authToken}`,
        "user-agent": providerUserAgent,
      },
      signal,
    });
    const payload = await readAppleMapsPayload(response);
    if (!response.ok) {
      throw createAppleMapsError(response.status, payload, phase);
    }

    const body = requiredResponseRecord(payload, "Apple Maps token response");
    const expiresInSeconds = optionalNumber(body.expiresInSeconds);
    const lifetimeMs = expiresInSeconds !== undefined && expiresInSeconds > 0 ? expiresInSeconds * 1_000 : NaN;
    return {
      accessToken: requiredString(body.accessToken, "Apple Maps token response accessToken", providerResponseError),
      refreshAt: Number.isFinite(lifetimeMs)
        ? requestedAt + Math.max(lifetimeMs - accessTokenRefreshLeewayMs, 0)
        : undefined,
    };
  });
}

/** Sign an ES256 Maps auth token used only to exchange an access token. */
async function signAuthToken(credential: AppleMapsCredential): Promise<string> {
  const signingKey = await importAppleMapsKey(credential.privateKey);
  const issuedAt = Math.floor(Date.now() / 1000);
  // Maps Server API needs only the server_api scope; origin applies to browser-facing scopes.
  return new SignJWT({ scope: "server_api" })
    .setProtectedHeader({ alg: "ES256", kid: credential.keyId, typ: "JWT" })
    .setIssuer(credential.teamId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + authTokenLifetimeSeconds)
    .sign(signingKey);
}

async function importAppleMapsKey(privateKey: string): Promise<CryptoKey> {
  try {
    return await importPKCS8(privateKey, "ES256");
  } catch {
    // Do not chain the jose error because it may expose private-key fragments in messages or logs.
    throw new ProviderRequestError(
      400,
      "privateKey must be an EC P-256 private key in PKCS#8 PEM format, as downloaded from the Apple Developer account",
    );
  }
}

/**
 * Hash the three NUL-delimited fields so the cache retains no plaintext credentials.
 * NUL cannot occur in these fields, so distinct credentials cannot produce the same joined input.
 */
function tokenCacheKey(credential: AppleMapsCredential): string {
  return sha256Hex([credential.teamId, credential.keyId, credential.privateKey].join("\0"));
}

/** Cache tokens with a usable lifetime; otherwise keep them scoped to the current request. */
function settleEntry(key: string, token: ExchangedAccessToken): void {
  if (token.refreshAt === undefined) {
    tokenCache.delete(key);
    return;
  }
  rememberEntry(key, { token: { accessToken: token.accessToken, refreshAt: token.refreshAt } });
}

function rememberEntry(key: string, entry: TokenCacheEntry): void {
  // Reinsert to maintain recency order, then evict the least recently used entry at the limit.
  tokenCache.delete(key);
  tokenCache.set(key, entry);
  if (tokenCache.size > maximumTokenCacheEntries) {
    const oldestKey = tokenCache.keys().next().value;
    if (oldestKey !== undefined) {
      tokenCache.delete(oldestKey);
    }
  }
}
