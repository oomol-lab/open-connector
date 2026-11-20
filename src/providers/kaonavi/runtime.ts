import type { ProviderFetch } from "../provider-runtime.ts";

import { sha256Hex } from "../../core/aws-sigv4.ts";
import { looseArray, recordOrEmpty, optionalString, optionalNumber } from "../../core/cast.ts";
import {
  basicAuthorizationHeader,
  isAbortLikeError,
  ProviderRequestError,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  providerInputError,
  providerResponseError,
} from "../provider-runtime.ts";

export const kaonaviBaseUrl = "https://api.kaonavi.jp/api/v2.0";
interface Token {
  value: string;
  expiresAt: number;
}
const tokens = new Map<string, Promise<Token>>();

export async function readKaonaviResponse(response: Response): Promise<Record<string, unknown>> {
  const code = response.status === 429 ? "rate_limited" : "provider_error";
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    if (isAbortLikeError(error)) throw error;
    throw new ProviderRequestError(
      response.ok ? 502 : response.status,
      "Kaonavi returned a non-JSON response",
      undefined,
      code,
    );
  }
  if (!response.ok) {
    const messages = looseArray(recordOrEmpty(payload).errors).map(optionalString).filter(Boolean);
    throw new ProviderRequestError(
      response.status,
      messages.join("; ") || `Kaonavi request failed (${response.status})`,
      undefined,
      code,
    );
  }
  return requiredResponseRecord(payload, "Kaonavi response");
}

export async function getKaonaviToken(
  values: Record<string, string>,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
  fresh = false,
): Promise<string> {
  const key = requiredInputString(values.consumerKey, "consumerKey");
  const secret = requiredInputString(values.consumerSecret, "consumerSecret");
  if (key.includes(":")) throw providerInputError("consumerKey must not contain a colon");
  const cacheKey = sha256Hex(JSON.stringify([key, secret]));
  const existing = fresh ? undefined : tokens.get(cacheKey);
  if (existing) {
    const token = await existing;
    if (token.expiresAt > Date.now()) return token.value;
    if (tokens.get(cacheKey) !== existing) return getKaonaviToken(values, fetcher, signal);
  }
  const pending = runProviderRequest({ label: "Kaonavi token", signal }, async (requestSignal) => {
    const response = await fetcher(`${kaonaviBaseUrl}/token`, {
      method: "POST",
      signal: requestSignal,
      headers: {
        "authorization": basicAuthorizationHeader(`${key}:${secret}`),
        "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
        "accept": "application/json",
      },
      body: new URLSearchParams({ grant_type: "client_credentials" }).toString(),
    });
    const payload = await readKaonaviResponse(response);
    const value = optionalString(payload.access_token);
    const ttl = optionalNumber(payload.expire_in);
    if (!value?.trim() || ttl === undefined || !Number.isFinite(ttl) || ttl <= 0)
      throw providerResponseError("Kaonavi token response is missing a valid access_token or expire_in");
    return { value, expiresAt: Date.now() + Math.max(0, ttl * 1000 - 60_000) };
  });
  tokens.set(cacheKey, pending);
  if (tokens.size > 1024) {
    const oldest = tokens.keys().next().value;
    if (oldest !== undefined) tokens.delete(oldest);
  }
  try {
    return (await pending).value;
  } catch (error) {
    if (tokens.get(cacheKey) === pending) tokens.delete(cacheKey);
    throw error;
  }
}
