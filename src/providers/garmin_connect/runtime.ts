import type { QueryValue } from "../../core/request.ts";
import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderActionHandlers, ProviderRuntimeHandler } from "../provider-executors.ts";
import type { ProviderFetch, ProviderRequestContext } from "../provider-runtime.ts";

import { decodeJwt } from "jose";
import { sha256Hex } from "../../core/aws-sigv4.ts";
import { waitForSignal } from "../../core/cancellation.ts";
import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment, queryParams } from "../../core/request.ts";
import {
  providerInputError,
  ProviderRequestError,
  providerResponseError,
  providerUserAgent,
  parseProviderJsonBodyText,
  readProviderErrorBody,
  readProviderTextBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  setSearchParams,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";
import { garminConnectActivityPageSize, garminConnectMaxRangeDays } from "./limits.ts";

/** Origin of the Garmin Connect Personal API. */
export const garminConnectApiBaseUrl = "https://personal.connectapi.garmin.com";

const tokenPath = "/personalapitoken-service/personal-api/personal-api-key/token";
const userSettingsPath = "/userprofile-service/userprofile/settings";

/**
 * Renew a token an hour before it expires, the window Garmin's Python client
 * (github.com/garmin/connect-personal-api-python) uses. A token never outlives
 * its key, so one issued in the key's last hour renews halfway through its
 * life instead of on every request.
 */
const tokenRenewalWindowMs = 60 * 60 * 1000;
const maxCachedTokens = 1024;
const dayMs = 24 * 60 * 60 * 1000;
const generatedDisplayNamePattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Handler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface GarminConnectAccessToken {
  value: string;
  /** When to exchange the key for a new token, in epoch milliseconds. */
  renewAt: number;
  /** The Garmin account GUID the token was issued for. */
  accountId: string | undefined;
}

interface GarminConnectTokenRequest {
  apiKey: string;
  fetcher: ProviderFetch;
  /** Exchange the key again even when a cached token is still fresh. */
  fresh?: boolean;
  /** A token Garmin just rejected; a cached token with this value is not reused. */
  rejectedToken?: string;
  /** Stops this caller's wait; a shared exchange keeps running for the others. */
  signal?: AbortSignal;
}

interface GarminConnectGetRequest {
  path: string;
  query?: Record<string, QueryValue>;
}

interface GarminConnectDateRange {
  startDate: string;
  endDate: string;
}

/**
 * In-flight and issued access tokens, keyed by the SHA-256 of the API key so
 * a cached token is only ever returned to a caller holding the same key.
 */
const tokens = new Map<string, Promise<GarminConnectAccessToken>>();

/**
 * Action handlers for every Garmin Connect action. Each one is a single GET
 * against the Personal API, which has no write endpoints.
 */
export const garminConnectActionHandlers: ProviderActionHandlers<"garmin_connect", Handler> = {
  async get_user_settings(_input, context) {
    const settings = await getGarminConnect(context, { path: userSettingsPath });
    return { settings: requiredResponseRecord(settings, "Garmin Connect user settings") };
  },
  async list_activity_types(_input, context) {
    const activityTypes = await getGarminConnect(context, { path: "/activity-service/activity/activityTypes/simple" });
    return { activityTypes: responseList(activityTypes, "activity types") };
  },
  async list_activities(input, context) {
    const start = optionalInteger(input.start) ?? 0;
    const limit = optionalInteger(input.limit) ?? garminConnectActivityPageSize.default;
    const response = await getGarminConnect(context, {
      path: "/activitylist-service/activities/search/activities",
      query: {
        start,
        limit,
        startDate: optionalString(input.startDate),
        endDate: optionalString(input.endDate),
        activityType: optionalString(input.activityType),
        activitySubType: optionalString(input.activitySubType),
        eventType: optionalString(input.eventType),
        search: optionalString(input.search),
        sortOrder: optionalString(input.sortOrder),
      },
    });
    const activities = responseList(response, "activity list");
    return { activities, nextStart: activities.length < limit ? null : start + limit };
  },
  async get_activity(input, context) {
    const activityId = optionalInteger(input.activityId);
    if (activityId === undefined || activityId < 1) {
      throw providerInputError("activityId must be a positive integer.");
    }
    const activity = await getGarminConnect(context, {
      path: `/activity-service/activity/${encodePathSegment(activityId)}`,
    });
    return { activity: requiredResponseRecord(activity, "Garmin Connect activity") };
  },
  async list_daily_summaries(input, context) {
    const range = readDateRange(input, garminConnectMaxRangeDays.dailySummaries);
    const response = await getGarminConnect(context, {
      path: "/usersummary-service/v2/dailysummaries",
      query: { ...range },
    });
    return { summaries: responseList(response, "daily summaries", "data") };
  },
  async get_sleep(input, context) {
    const date = requiredInputString(input.date, "date");
    const sleep = await getGarminConnect(context, { path: "/sleep-service/sleep/dailySleep", query: { date } });
    return { sleep: nullableResponseRecord(sleep, "sleep") };
  },
  async list_sleep_summaries(input, context) {
    const range = readDateRange(input, garminConnectMaxRangeDays.sleepSummaries);
    const response = await getGarminConnect(context, {
      path: "/sleep-service/sleep/dailySleepSummariesByDate",
      query: { ...range },
    });
    return { summaries: responseList(response, "sleep summaries") };
  },
  async list_hrv_summaries(input, context) {
    const range = readDateRange(input);
    const response = await getGarminConnect(context, {
      path: `/hrv-service/hrv/daily/${encodePathSegment(range.startDate)}/${encodePathSegment(range.endDate)}`,
    });
    // Garmin answers 204 No Content when no night in the range has an HRV reading.
    return { summaries: responseList(response, "HRV summaries", "hrvSummaries") };
  },
  async list_body_battery(input, context) {
    const range = readDateRange(input, garminConnectMaxRangeDays.bodyBattery);
    const response = await getGarminConnect(context, {
      path: "/wellness-service/wellness/bodyBattery/reports/daily",
      query: { ...range, chunks: optionalInteger(input.chunks) },
    });
    return { days: responseList(response, "Body Battery reports") };
  },
  async get_heart_rate(input, context) {
    const date = requiredInputString(input.date, "date");
    const heartRate = await getGarminConnect(context, {
      path: "/wellness-service/wellness/dailyHeartRate",
      query: { date },
    });
    return { heartRate: nullableResponseRecord(heartRate, "heart rate") };
  },
  async list_weight(input, context) {
    const range = readDateRange(input);
    const weight = await getGarminConnect(context, {
      path: `/weight-service/weight/range/${encodePathSegment(range.startDate)}/${encodePathSegment(range.endDate)}`,
      query: { includeAll: true },
    });
    return { weight: requiredResponseRecord(weight, "Garmin Connect weight range") };
  },
  async get_heart_rate_zones(_input, context) {
    const zones = await getGarminConnect(context, { path: "/biometric-service/heartRateZones/v2" });
    return { zones: responseList(zones, "heart rate zones") };
  },
};

/**
 * Return an access token for a Personal API key, exchanging the key only when
 * no cached token has more than the renewal window left. Garmin issues 24-hour
 * tokens and no refresh tokens, so a new token always comes from the key.
 *
 * The exchange is shared by concurrent callers, so it runs under the shared
 * request timeout rather than any one caller's abort signal; a caller's own
 * signal only stops that caller's wait.
 */
export async function getGarminConnectAccessToken(
  request: GarminConnectTokenRequest,
): Promise<GarminConnectAccessToken> {
  const cacheKey = sha256Hex(request.apiKey);
  const cached = request.fresh ? undefined : tokens.get(cacheKey);
  if (cached) {
    const token = await waitForSignal(cached, request.signal);
    if (Date.now() < token.renewAt && token.value !== request.rejectedToken) {
      return token;
    }
    // Another caller may already have started the renewal while this one waited.
    const current = tokens.get(cacheKey);
    if (current !== undefined && current !== cached) {
      return getGarminConnectAccessToken(request);
    }
  }

  const pending = exchangeApiKey(request.apiKey, request.fetcher);
  // Re-insert so the renewed key moves to the end of the eviction order.
  tokens.delete(cacheKey);
  tokens.set(cacheKey, pending);
  if (tokens.size > maxCachedTokens) {
    const oldest = tokens.keys().next().value;
    if (oldest !== undefined) tokens.delete(oldest);
  }
  // Drop a failed exchange so the next caller retries, even when the caller
  // that started it stopped waiting.
  pending.catch(() => {
    if (tokens.get(cacheKey) === pending) tokens.delete(cacheKey);
  });
  return waitForSignal(pending, request.signal);
}

/** Remove only the rejected cached token, preserving tokens renewed by concurrent requests. */
export async function invalidateGarminConnectAccessToken(apiKey: string, rejectedToken: string): Promise<void> {
  const cacheKey = sha256Hex(apiKey);
  const pending = tokens.get(cacheKey);
  if (!pending) return;
  const token = await pending.catch(() => undefined);
  if (token?.value === rejectedToken && tokens.get(cacheKey) === pending) tokens.delete(cacheKey);
}

/**
 * Prove a Personal API key works by exchanging it for a token and reading the
 * user settings, and describe the Garmin account it belongs to.
 */
export async function validateGarminConnectApiKey(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const token = await getGarminConnectAccessToken({ apiKey, fetcher, signal, fresh: true });
  const settings = requiredResponseRecord(
    await sendGarminConnectGet(new URL(userSettingsPath, garminConnectApiBaseUrl), token.value, { fetcher, signal }),
    "Garmin Connect user settings",
  );
  return {
    profile: {
      accountId: token.accountId,
      displayName: readableDisplayName(settings.displayName),
    },
  };
}

/**
 * Turn a failed Personal API response into a provider error. Garmin often
 * answers errors with an empty body or `{}`, so each status carries a message
 * that says what to check.
 */
export async function readGarminConnectError(response: Response, signal?: AbortSignal): Promise<ProviderRequestError> {
  const body = await readProviderErrorBody(response, "Garmin Connect", signal);
  const message = optionalString(optionalRecord(body)?.message);
  switch (response.status) {
    case 400:
      return new ProviderRequestError(
        400,
        message ?? "Garmin Connect rejected the request. Check the dates and filters.",
      );
    case 401:
    case 403:
      return new ProviderRequestError(
        response.status,
        message ?? "Garmin Connect rejected the request.",
        body,
        "provider_error",
      );
    case 404:
      return new ProviderRequestError(404, message ?? "Garmin Connect found no data for this identifier.");
    case 429:
      return new ProviderRequestError(
        429,
        message ?? "Garmin Connect rate limit reached. Wait before sending more requests.",
        withRetryAfterSeconds(response, body),
      );
    default:
      return new ProviderRequestError(
        response.status,
        message ?? `Garmin Connect request failed with HTTP ${response.status}.`,
      );
  }
}

async function exchangeApiKey(apiKey: string, fetcher: ProviderFetch): Promise<GarminConnectAccessToken> {
  return runProviderRequest({ label: "Garmin Connect token" }, async (signal) => {
    const response = await fetcher(new URL(tokenPath, garminConnectApiBaseUrl), {
      method: "POST",
      headers: { accept: "*/*", authorization: `ApiKey ${apiKey}`, "user-agent": providerUserAgent },
      signal,
    });
    if (!response.ok) {
      throw await readGarminConnectError(response, signal);
    }
    // The token endpoint answers with the bare JWT as text/plain.
    return readAccessToken(
      (await readProviderTextBody(response, "Garmin Connect access token", undefined, signal)).trim(),
    );
  });
}

function readAccessToken(value: string): GarminConnectAccessToken {
  let claims: ReturnType<typeof decodeJwt>;
  try {
    claims = decodeJwt(value);
  } catch {
    throw providerResponseError("Garmin Connect returned an access token that is not a JWT.");
  }
  if (typeof claims.exp !== "number") {
    throw providerResponseError("Garmin Connect returned an access token without an expiry.");
  }
  const expiresAt = claims.exp * 1000;
  const lifetime = Math.max(0, expiresAt - Date.now());
  return {
    value,
    renewAt: expiresAt - Math.min(tokenRenewalWindowMs, lifetime / 2),
    accountId: optionalString(claims.garmin_guid),
  };
}

async function getGarminConnect(context: ApiKeyProviderContext, request: GarminConnectGetRequest): Promise<unknown> {
  const url = new URL(request.path, garminConnectApiBaseUrl);
  if (request.query) setSearchParams(url, queryParams(request.query));

  const tokenRequest = { apiKey: context.apiKey, fetcher: context.fetcher, signal: context.signal };
  const token = await getGarminConnectAccessToken(tokenRequest);
  try {
    return await sendGarminConnectGet(url, token.value, context);
  } catch (error) {
    if (!(error instanceof ProviderRequestError) || error.status !== 401) throw error;
    // Garmin can reject a token before its expiry, for example when the local
    // clock runs behind. Get a new token once; when the key itself was deleted,
    // the exchange fails with the reconnect message instead.
    const renewed = await getGarminConnectAccessToken({ ...tokenRequest, rejectedToken: token.value });
    return sendGarminConnectGet(url, renewed.value, context);
  }
}

async function sendGarminConnectGet(url: URL, accessToken: string, context: ProviderRequestContext): Promise<unknown> {
  return runProviderRequest({ label: "Garmin Connect", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(url, {
      headers: { accept: "application/json", authorization: `Bearer ${accessToken}`, "user-agent": providerUserAgent },
      signal,
    });
    if (!response.ok) {
      throw await readGarminConnectError(response, signal);
    }
    const body = await readProviderTextBody(response, "Garmin Connect response", undefined, signal);
    return parseProviderJsonBodyText(body, {
      emptyBody: null,
      invalidJsonMessage: "Garmin Connect returned invalid JSON",
    });
  });
}

/** Read an inclusive date range and check the span Garmin accepts. */
function readDateRange(input: Record<string, unknown>, maxDays?: number): GarminConnectDateRange {
  const startDate = requiredInputString(input.startDate, "startDate");
  const endDate = requiredInputString(input.endDate, "endDate");
  const days = (Date.parse(endDate) - Date.parse(startDate)) / dayMs + 1;
  if (Number.isNaN(days)) {
    throw providerInputError("startDate and endDate must be calendar dates in YYYY-MM-DD.");
  }
  if (days < 1) {
    throw providerInputError("endDate must not be before startDate.");
  }
  if (maxDays !== undefined && days > maxDays) {
    throw providerInputError(
      `Garmin Connect accepts at most ${maxDays} days per request, both ends included; split the range into shorter requests.`,
    );
  }
  return { startDate, endDate };
}

/**
 * The account's display name, unless it is the random UUID Garmin can assign
 * as a display name, which tells a person nothing about the account.
 */
function readableDisplayName(value: unknown): string {
  const name = optionalString(value);
  return name && !generatedDisplayNamePattern.test(name) ? name : "Garmin Connect account";
}

/**
 * A list response, or the list in one field of an object response. An empty
 * body or a 204 means an empty list; any other shape is a provider error.
 */
function responseList(response: unknown, label: string, field?: string): unknown[] {
  if (response === null) return [];
  const list = field === undefined ? response : requiredResponseRecord(response, `Garmin Connect ${label}`)[field];
  if (!Array.isArray(list)) throw providerResponseError(`Garmin Connect ${label} response is not a list.`);
  return list;
}

/** An object response, where an empty body or a 204 means there is no record. */
function nullableResponseRecord(response: unknown, label: string): Record<string, unknown> | null {
  return response === null ? null : requiredResponseRecord(response, `Garmin Connect ${label}`);
}
