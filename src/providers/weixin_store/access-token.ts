import type { ProviderFetch } from "../provider-runtime.ts";

import { createHash } from "node:crypto";
import { optionalIntegerOrNull, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

const wechatStableTokenUrl = "https://api.weixin.qq.com/cgi-bin/stable_token";
const defaultAccessTokenTtlSeconds = 7200;
const accessTokenRefreshSkewMs = 120_000;

export interface WeixinStoreCredential {
  appId: string;
  appSecret: string;
}

interface WechatAccessTokenRequest {
  credential: WeixinStoreCredential;
  fetcher: ProviderFetch;
  /**
   * The token WeChat just rejected, when minting after a token-invalid API
   * error. The mint happens only when the cache still holds this token; a cache
   * holding a different valid token means another caller already refreshed it,
   * and that token is adopted instead — a forced refresh invalidates the
   * previous token, so minting on top of a fresh one would break its owner.
   */
  rejectedToken?: string;
}

/** A WeChat API response reduced to its HTTP status, parsed JSON envelope, and raw text. */
export interface WechatApiResult {
  status: number;
  record: Record<string, unknown> | undefined;
  rawText: string;
}

interface WechatAccessTokenCacheEntry {
  token: string;
  expiresAtMs: number;
}

/**
 * WeChat Store errcodes outside the 4xxxx range that the category and
 * qualification docs describe as bad parameters or materials, such as an
 * invalid or non-leaf category id, a mismatched certificate group, or a file id
 * that did not come from the qualification upload. The caller has to fix the
 * input, so they map to 400 instead of an upstream failure.
 */
const wechatInvalidInputErrcodes = new Set([
  9401020, 9700234, 10020017, 10020059, 10020060, 10020062, 10020063, 10020087, 10020094, 10020127, 10020504, 10021069,
  10023000, 10023001, 10024003, 10023100, 10023102, 10023104, 10023105, 10023106, 10023107, 10023108, 10023109,
  10023110, 10023111, 10023112, 10023113, 10023116, 10023117, 10023121,
]);

const accessTokenCache = new Map<string, WechatAccessTokenCacheEntry>();
const accessTokenInFlight = new Map<string, Promise<string>>();
const accessTokenRefreshInFlight = new Map<string, Promise<string>>();

export function readWeixinStoreCredential(values: Record<string, string>): WeixinStoreCredential {
  return {
    appId: requiredInputString(values.appId, "appId"),
    appSecret: requiredInputString(values.appSecret, "appSecret"),
  };
}

/**
 * Return a stable access token for the credential, served from the module-level
 * cache until 120 seconds before its WeChat expiry and minted through the
 * stable_token endpoint otherwise. Concurrent callers share one in-flight mint
 * per credential: forced refreshes are limited to 20 per day by WeChat and each
 * one invalidates the previous token, so duplicate mints must not happen.
 *
 * The mint deliberately carries no caller's abort signal: the promise is shared,
 * so one caller's abort would otherwise fail every concurrent caller. A caller
 * that aborts while a mint is in flight is instead cancelled at its own
 * follow-up request; the shared mint still runs under the default 30 s timeout.
 */
export async function getWechatAccessToken(input: WechatAccessTokenRequest): Promise<string> {
  const cacheKey = createHash("sha256")
    .update(input.credential.appId)
    .update("\0")
    .update(input.credential.appSecret)
    .digest("hex");
  const refreshPending = accessTokenRefreshInFlight.get(cacheKey);
  if (refreshPending) return refreshPending;

  const pending = accessTokenInFlight.get(cacheKey);
  if (input.rejectedToken === undefined) {
    if (pending) return pending;
    const request = mintAndCacheAccessToken(input, cacheKey);
    accessTokenInFlight.set(cacheKey, request);
    try {
      return await request;
    } finally {
      if (accessTokenInFlight.get(cacheKey) === request) accessTokenInFlight.delete(cacheKey);
    }
  }

  const refresh = (async () => {
    const pendingToken = pending ? await pending.catch(() => undefined) : undefined;
    if (pendingToken !== undefined && pendingToken !== input.rejectedToken) return pendingToken;
    return mintAndCacheAccessToken(input, cacheKey);
  })();
  accessTokenRefreshInFlight.set(cacheKey, refresh);
  try {
    return await refresh;
  } finally {
    if (accessTokenRefreshInFlight.get(cacheKey) === refresh) {
      accessTokenRefreshInFlight.delete(cacheKey);
    }
  }
}

async function mintAndCacheAccessToken(input: WechatAccessTokenRequest, cacheKey: string): Promise<string> {
  const cached = accessTokenCache.get(cacheKey);
  if (cached && cached.expiresAtMs > Date.now()) {
    // On the refresh path a different cached token means another caller already
    // refreshed the rejected one; adopt it instead of minting over it.
    if (input.rejectedToken === undefined || cached.token !== input.rejectedToken) {
      return cached.token;
    }
  }

  const result = await runProviderRequest(
    { label: "WeChat stable_token" },
    async (signal): Promise<WechatApiResult> => {
      const response = await input.fetcher(wechatStableTokenUrl, {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": providerUserAgent },
        body: JSON.stringify({
          grant_type: "client_credential",
          appid: input.credential.appId,
          secret: input.credential.appSecret,
          force_refresh: input.rejectedToken !== undefined,
        }),
        signal,
      });
      const rawText = await response.text();
      return { status: response.status, record: parseWechatJson(rawText), rawText };
    },
  );
  const errcode = readWechatErrcode(result.record);
  if ((errcode !== null && errcode !== 0) || result.status >= 400) {
    throw normalizeWechatApiError(result);
  }

  const token = optionalString(result.record?.access_token);
  if (!token) {
    throw providerResponseError("WeChat stable_token response is missing access_token");
  }
  const expiresInSeconds = optionalNumber(result.record?.expires_in) ?? defaultAccessTokenTtlSeconds;
  const nowMs = Date.now();
  accessTokenCache.set(cacheKey, {
    token,
    expiresAtMs: Math.max(nowMs, nowMs + expiresInSeconds * 1000 - accessTokenRefreshSkewMs),
  });
  return token;
}

/** Parse a WeChat JSON response body; non-object payloads read as undefined. */
export function parseWechatJson(rawText: string): Record<string, unknown> | undefined {
  try {
    return optionalRecord(JSON.parse(rawText));
  } catch {
    return undefined;
  }
}

/** Read the numeric errcode of a WeChat envelope; absent or non-numeric reads as null. */
export function readWechatErrcode(record: Record<string, unknown> | undefined): number | null {
  return optionalIntegerOrNull(record?.errcode);
}

/** Whether the errcode marks the access token as invalid, so the caller can refresh and retry once. */
export function isWechatTokenError(errcode: number | null): boolean {
  return errcode === 40001 || errcode === 40014 || errcode === 42001;
}

/**
 * Map a failed WeChat API call to the shared provider error. Rate limits
 * and invitation quotas become 429; missing permissions and policy bans become
 * 403; duplicate/cooperation-capacity conflicts become 409; absent promotion
 * products become 404. Documented input errors become 400; other failures 502.
 */
export function normalizeWechatApiError(result: WechatApiResult): ProviderRequestError {
  const errcode = readWechatErrcode(result.record);
  const errmsg = optionalString(result.record?.errmsg);
  let message =
    errcode === null
      ? (errmsg ?? (result.rawText.trim().slice(0, 500) || `WeChat API request failed with status ${result.status}`))
      : `WeChat API error ${errcode}: ${errmsg ?? "unknown error"}`;
  if (result.status === 403 && errcode === null) {
    // A bare HTTP 403 with no errcode envelope is the store's optional IP whitelist rejecting the caller.
    message = `${message}. If the store has an IP whitelist configured (微信小店后台 → 服务市场 → 经营工具 → 自研 → IP 白名单), add this runtime's public egress IP to it and try again.`;
  }
  if (result.status === 429 || errcode === 45009 || errcode === 45011 || errcode === 10020510 || errcode === 10023002) {
    return new ProviderRequestError(429, message, result.record);
  }
  if (errcode === 48001 || errcode === 10023007 || errcode === 10023114 || errcode === 10023115) {
    return new ProviderRequestError(403, message, result.record);
  }
  if (errcode === 10023003 || errcode === 10023004 || errcode === 10023006) {
    return new ProviderRequestError(409, message, result.record);
  }
  if (errcode === 10023103) {
    return new ProviderRequestError(404, message, result.record);
  }
  if (errcode !== null && ((errcode >= 40000 && errcode < 50000) || wechatInvalidInputErrcodes.has(errcode))) {
    return new ProviderRequestError(400, message, result.record);
  }
  if (result.status >= 400 && result.status < 500) {
    return new ProviderRequestError(result.status, message, result.record);
  }
  return providerResponseError(message);
}
