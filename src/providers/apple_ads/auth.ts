import type { KeyObject } from "node:crypto";

import { SignJWT } from "jose";
import { createPrivateKey } from "node:crypto";
import { optionalString, pickOptionalString, recordOrEmpty } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerUserAgent,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

export const appleAdsTokenEndpoint = "https://appleid.apple.com/auth/oauth2/token";
const clientSecretAudience = "https://appleid.apple.com";
const clientSecretLifetimeSeconds = 300;
const accessTokenScope = "searchadsorg";
const pemMarkers = ["-----BEGIN EC PRIVATE KEY-----", "-----BEGIN PRIVATE KEY-----"];
const tokenRequestLabel = "Apple Ads token";

export interface AppleAdsCredential {
  clientId: string;
  teamId: string;
  keyId: string;
  privateKey: string;
  adAccountId: string | undefined;
}

export function readAppleAdsCredential(values: Record<string, string | undefined>): AppleAdsCredential {
  const privateKey = requiredInputString(values.privateKey, "privateKey").replaceAll("\\n", "\n");
  if (!pemMarkers.some((marker) => privateKey.includes(marker))) {
    throw new ProviderRequestError(
      400,
      "privateKey must be the PEM contents of the EC private key paired with the public key uploaded to Apple Ads, starting with -----BEGIN EC PRIVATE KEY----- or -----BEGIN PRIVATE KEY-----",
    );
  }

  return {
    clientId: requiredInputString(values.clientId, "clientId"),
    teamId: requiredInputString(values.teamId, "teamId"),
    keyId: requiredInputString(values.keyId, "keyId"),
    privateKey,
    adAccountId: optionalString(values.adAccountId)?.trim() || undefined,
  };
}

export async function signAppleAdsClientSecret(
  credential: AppleAdsCredential,
  now: Date = new Date(),
): Promise<string> {
  const signingKey = importAppleAdsKey(credential.privateKey);
  const issuedAt = Math.floor(now.getTime() / 1000);
  return new SignJWT({ sub: credential.clientId })
    .setProtectedHeader({ alg: "ES256", kid: credential.keyId })
    .setIssuer(credential.teamId)
    .setAudience(clientSecretAudience)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + clientSecretLifetimeSeconds)
    .sign(signingKey);
}

export type AppleAdsPhase = "execute" | "validate";

export interface AppleAdsAccessToken {
  accessToken: string;
  expiresInSeconds: number | null;
  scope: string | null;
}

export async function requestAppleAdsAccessToken(
  credential: AppleAdsCredential,
  fetcher: typeof fetch,
  phase: AppleAdsPhase = "execute",
  parentSignal?: AbortSignal,
): Promise<AppleAdsAccessToken> {
  return runProviderRequest({ label: tokenRequestLabel, signal: parentSignal }, async (signal) => {
    const body = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: credential.clientId,
      client_secret: await signAppleAdsClientSecret(credential),
      scope: accessTokenScope,
    });
    const response = await fetcher(appleAdsTokenEndpoint, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": providerUserAgent,
      },
      body: body.toString(),
      signal,
    });
    const payload = await readTokenPayload(response);
    if (!response.ok) {
      throw createTokenError(response.status, payload, phase);
    }

    const accessToken = pickOptionalString(recordOrEmpty(payload), "access_token");
    if (!accessToken) {
      throw new ProviderRequestError(502, "Apple Ads did not return an access token", payload);
    }

    const expiresIn = recordOrEmpty(payload).expires_in;
    return {
      accessToken,
      expiresInSeconds: typeof expiresIn === "number" && Number.isInteger(expiresIn) ? expiresIn : null,
      scope: pickOptionalString(recordOrEmpty(payload), "scope") ?? null,
    };
  });
}

export function createAppleAdsAuthorization(
  credential: AppleAdsCredential,
  fetcher: typeof fetch,
  phase: AppleAdsPhase = "execute",
  parentSignal?: AbortSignal,
): () => Promise<string> {
  let authorization: Promise<string> | undefined;
  return () => {
    authorization ??= requestAppleAdsAccessToken(credential, fetcher, phase, parentSignal).then(
      (token) => `Bearer ${token.accessToken}`,
    );
    return authorization;
  };
}

async function readTokenPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createTokenError(status: number, payload: unknown, phase: AppleAdsPhase): ProviderRequestError {
  const envelope = recordOrEmpty(payload);
  const summary = [pickOptionalString(envelope, "error"), pickOptionalString(envelope, "error_description")]
    .filter((part) => part !== undefined)
    .join(": ");

  if (phase === "validate") {
    return new ProviderRequestError(
      400,
      "Apple Ads rejected the API credentials. Check the Client ID, Team ID, Key ID, and that the private key matches the public key uploaded under Account Settings > API.",
      payload,
      "invalid_input",
    );
  }

  if (status === 429) {
    return new ProviderRequestError(
      429,
      summary || `Apple Ads token request failed with HTTP ${status}`,
      payload,
      "rate_limited",
    );
  }

  return new ProviderRequestError(
    400 <= status && status < 600 ? status : 502,
    summary || `Apple Ads token request failed with HTTP ${status}`,
    payload,
  );
}

function importAppleAdsKey(privateKey: string): KeyObject {
  let key: KeyObject;
  try {
    key = createPrivateKey({ key: privateKey, format: "pem" });
  } catch {
    throw new ProviderRequestError(
      400,
      "privateKey must be an unencrypted EC P-256 private key in PEM format, as generated by openssl ecparam -genkey -name prime256v1",
    );
  }
  if (key.asymmetricKeyType !== "ec" || key.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    throw new ProviderRequestError(
      400,
      "privateKey must be an EC P-256 private key; Apple Ads signs client secrets with ES256",
    );
  }

  return key;
}
