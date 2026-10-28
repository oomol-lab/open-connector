import type { CryptoKey as JoseCryptoKey, JWK } from "jose";

import { optionalRecord, optionalString, optionalStringOrNull } from "../core/cast.ts";
import { readBoundedResponseBytes } from "../core/request.ts";
import { isAllowedTeamsBotConnectorHost } from "../core/teams-bot-connector.ts";
import { eventRequestMaximumBodyBytes } from "./event-request-body.ts";

/** Bot Framework publishes RSA keys for RS256 tokens in its OpenID metadata. */
const allowedAlgorithms = ["RS256"];
/** Clock skew the Bot Framework SDKs allow when checking exp and nbf. */
const clockToleranceSeconds = 5 * 60;
const keysTtlMs = 60 * 60 * 1000;
const keysRetryDelayMs = 5 * 60 * 1000;
const keysRequestTimeoutMs = 5_000;
const keysDocumentMaximumBytes = 1024 * 1024;

interface BotFrameworkCloud {
  issuer: string;
  openIdMetadataUrl: string;
}

const botFrameworkClouds: BotFrameworkCloud[] = [
  {
    issuer: "https://api.botframework.com",
    openIdMetadataUrl: "https://login.botframework.com/v1/.well-known/openidconfiguration",
  },
  {
    issuer: "https://api.botframework.us",
    openIdMetadataUrl: "https://login.botframework.azure.us/v1/.well-known/openidconfiguration",
  },
];

/** A Bot Framework signing key and the channels it is endorsed to sign for. */
export interface BotFrameworkSigningKey {
  key: JoseCryptoKey;
  endorsements: string[];
}

/** Looks up the signing key for a token key id; undefined when the issuer publishes no such key. */
export type BotFrameworkKeyResolver = (
  cloud: BotFrameworkCloud,
  keyId: string,
) => Promise<BotFrameworkSigningKey | undefined>;

export interface TeamsBotEventVerificationInput {
  /** Raw Authorization header value of the inbound activity request. */
  authorization: string;
  /** Raw activity request body bytes. */
  rawBody: Uint8Array;
  /** Microsoft App ID of the bot; the audience the token must name. */
  appId: string;
  /** Signing key lookup; defaults to the keys Bot Framework publishes. Injectable for tests. */
  resolveKey?: BotFrameworkKeyResolver;
  /** Current time in milliseconds; injectable for tests. */
  now?: number;
}

export type TeamsBotEventVerificationResult =
  | {
      valid: true;
      appId: string;
      tenantId: string | null;
      serviceUrl: string;
      activityId: string | null;
      conversationId: string | null;
      aadObjectId: string | null;
      channelId: string | null;
    }
  | {
      valid: false;
      reason: "token" | "timestamp" | "app" | "payload" | "service_url" | "channel" | "body_too_large";
    };

/** Raised when Bot Framework's signing keys cannot be fetched; an infrastructure failure, not a rejection. */
export class BotFrameworkKeysUnavailableError extends Error {}

/**
 * Verifies the bearer token Bot Framework attaches to an inbound Teams activity.
 *
 * The token is checked for signature, issuer, audience, expiry, the serviceUrl
 * claim and the signing key's channel endorsement, following the Bot Connector
 * authentication rules. The token does not sign the request body: the serviceUrl
 * claim is what binds the two. Verification only; nothing is stored or scheduled.
 */
export async function verifyTeamsBotEventRequest(
  input: TeamsBotEventVerificationInput,
): Promise<TeamsBotEventVerificationResult> {
  if (input.rawBody.byteLength > eventRequestMaximumBodyBytes) return { valid: false, reason: "body_too_large" };

  // jose is loaded on first use so a runtime that never verifies Teams activities does not load it.
  const jose = await import("jose");

  const token = /^bearer\s+(.+)$/i.exec(input.authorization.trim())?.[1]?.trim();
  if (!token) return { valid: false, reason: "token" };

  let cloud: BotFrameworkCloud | undefined;
  let keyId: string | undefined;
  try {
    // Pick the issuer's key set from the unverified issuer, then pin that issuer when verifying.
    cloud = botFrameworkClouds.find((candidate) => candidate.issuer === jose.decodeJwt(token).iss);
    keyId = jose.decodeProtectedHeader(token).kid;
  } catch {
    return { valid: false, reason: "token" };
  }
  if (!cloud || !keyId) return { valid: false, reason: "token" };

  const signingKey = await (input.resolveKey ?? resolvePublishedKey)(cloud, keyId);
  if (!signingKey) return { valid: false, reason: "token" };

  let serviceUrlClaim: unknown;
  try {
    const { payload } = await jose.jwtVerify(token, signingKey.key, {
      issuer: cloud.issuer,
      audience: input.appId,
      algorithms: allowedAlgorithms,
      requiredClaims: ["exp"],
      clockTolerance: clockToleranceSeconds,
      currentDate: input.now === undefined ? undefined : new Date(input.now),
    });
    serviceUrlClaim = payload.serviceurl;
  } catch (error) {
    return { valid: false, reason: rejectionReason(error, jose.errors) };
  }

  // Only parse the body after its token is trusted.
  let activity: Record<string, unknown> | undefined;
  try {
    activity = optionalRecord(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(input.rawBody)));
  } catch {
    return { valid: false, reason: "payload" };
  }
  const serviceUrl = optionalString(activity?.serviceUrl);
  if (!activity || !serviceUrl) return { valid: false, reason: "payload" };
  if (serviceUrlClaim !== serviceUrl || !allowedConnectorServiceUrl(serviceUrl))
    return { valid: false, reason: "service_url" };

  // A key without endorsements, or an activity naming no channel, asserts nothing to check.
  const channelId = optionalString(activity.channelId) ?? null;
  if (channelId && signingKey.endorsements.length > 0 && !signingKey.endorsements.includes(channelId))
    return { valid: false, reason: "channel" };

  const conversation = optionalRecord(activity.conversation);
  const channelData = optionalRecord(activity.channelData);
  const from = optionalRecord(activity.from);
  return {
    valid: true,
    appId: input.appId,
    tenantId:
      optionalStringOrNull(conversation?.tenantId) ?? optionalStringOrNull(optionalRecord(channelData?.tenant)?.id),
    serviceUrl,
    activityId: optionalStringOrNull(activity.id),
    conversationId: optionalStringOrNull(conversation?.id),
    aadObjectId: optionalStringOrNull(from?.aadObjectId),
    channelId,
  };
}

function rejectionReason(error: unknown, joseErrors: typeof import("jose").errors): "token" | "timestamp" | "app" {
  if (error instanceof joseErrors.JWTExpired) return "timestamp";
  if (error instanceof joseErrors.JWTClaimValidationFailed) {
    if (error.claim === "aud") return "app";
    if (error.claim === "nbf") return "timestamp";
  }
  return "token";
}

interface PublishedKeys {
  keys: Map<string, BotFrameworkSigningKey>;
  fetchedAt: number;
  expiresAt: number;
  refreshError: BotFrameworkKeysUnavailableError | undefined;
}

const publishedKeys = new Map<string, PublishedKeys>();
const pendingFetches = new Map<string, Promise<PublishedKeys>>();

/**
 * Resolves a key from the issuer's published OpenID metadata. Microsoft asks
 * receivers to refresh at least daily and new keys can appear at any time, so keys
 * are cached for an hour and refetched once when a token names an unknown key. A
 * failed refresh keeps serving the keys already held.
 */
async function resolvePublishedKey(
  cloud: BotFrameworkCloud,
  keyId: string,
): Promise<BotFrameworkSigningKey | undefined> {
  const now = Date.now();
  let current = publishedKeys.get(cloud.openIdMetadataUrl);
  if (!current || current.expiresAt <= now) current = await refreshPublishedKeys(cloud, current);
  let key = current.keys.get(keyId);
  if (!key && now - current.fetchedAt > keysRetryDelayMs) {
    current = await refreshPublishedKeys(cloud, current);
    key = current.keys.get(keyId);
  }
  if (!key && current.refreshError) throw current.refreshError;
  return key;
}

async function refreshPublishedKeys(
  cloud: BotFrameworkCloud,
  stale: PublishedKeys | undefined,
): Promise<PublishedKeys> {
  let pending = pendingFetches.get(cloud.openIdMetadataUrl);
  if (!pending) {
    pending = fetchPublishedKeys(cloud)
      .catch((error: unknown) => {
        const refreshError = new BotFrameworkKeysUnavailableError("Bot Framework signing keys are unavailable.", {
          cause: error,
        });
        if (!stale) throw refreshError;
        return { ...stale, fetchedAt: Date.now(), expiresAt: Date.now() + keysRetryDelayMs, refreshError };
      })
      .then((keys) => {
        publishedKeys.set(cloud.openIdMetadataUrl, keys);
        return keys;
      })
      .finally(() => pendingFetches.delete(cloud.openIdMetadataUrl));
    pendingFetches.set(cloud.openIdMetadataUrl, pending);
  }
  return pending;
}

async function fetchPublishedKeys(cloud: BotFrameworkCloud): Promise<PublishedKeys> {
  const metadata = optionalRecord(await fetchJson(cloud.openIdMetadataUrl));
  const jwksUri = optionalString(metadata?.jwks_uri);
  if (!jwksUri || new URL(jwksUri).protocol !== "https:")
    throw new Error("Bot Framework metadata has no HTTPS jwks_uri.");

  const document = optionalRecord(await fetchJson(jwksUri));
  if (!Array.isArray(document?.keys)) throw new Error("Bot Framework keys document has no keys array.");
  const { importJWK } = await import("jose");
  const keys = new Map<string, BotFrameworkSigningKey>();
  for (const entry of document.keys) {
    const jwk = optionalRecord(entry);
    const keyId = optionalString(jwk?.kid);
    if (!jwk || !keyId || jwk.kty !== "RSA") continue;
    // jose drops members it does not know, so the endorsements are read from the raw entry.
    const endorsements = Array.isArray(jwk.endorsements)
      ? jwk.endorsements.filter((item): item is string => typeof item === "string")
      : [];
    keys.set(keyId, { key: (await importJWK(jwk as unknown as JWK, "RS256")) as JoseCryptoKey, endorsements });
  }
  if (keys.size === 0) throw new Error("Bot Framework keys document has no usable RSA signing keys.");
  const now = Date.now();
  return { keys, fetchedAt: now, expiresAt: now + keysTtlMs, refreshError: undefined };
}

// The metadata URLs are fixed Microsoft endpoints and the jwks_uri they publish is required to be HTTPS.
async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(keysRequestTimeoutMs) });
  if (!response.ok) throw new Error(`Bot Framework keys request failed with HTTP ${response.status}.`);
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes: keysDocumentMaximumBytes,
    fieldName: "Bot Framework keys document",
    createError: (message) => new Error(message),
  });
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  return JSON.parse(text);
}

function allowedConnectorServiceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.search &&
      !url.hash &&
      isAllowedTeamsBotConnectorHost(url.hostname)
    );
  } catch {
    return false;
  }
}
