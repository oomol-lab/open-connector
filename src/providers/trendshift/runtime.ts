import { createHash } from "node:crypto";
import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const trendshiftApiBaseUrl = "https://api.trendshift.io";
export const trendshiftValidationPath = "/v1/trending/daily";

type TrendshiftRequestMode = "validate" | "execute";
type QueryValue = number | string | undefined;

interface TrendshiftRequest {
  path: string;
  query?: Record<string, QueryValue>;
}

export interface TrendshiftContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type TrendshiftHandler = (input: Record<string, unknown>, context: TrendshiftContext) => Promise<unknown>;

function createHandler(actionName: string): TrendshiftHandler {
  return async (input, context) => executeTrendshiftAction(actionName, input, context);
}

export const trendshiftActionHandlers: Record<string, TrendshiftHandler> = {
  list_engagement_spikes: createHandler("list_engagement_spikes"),
  list_trending_daily: createHandler("list_trending_daily"),
  get_trending_daily_by_date: createHandler("get_trending_daily_by_date"),
  list_trending_weekly: createHandler("list_trending_weekly"),
  get_trending_weekly_by_period: createHandler("get_trending_weekly_by_period"),
  list_trending_monthly: createHandler("list_trending_monthly"),
  get_trending_monthly_by_period: createHandler("get_trending_monthly_by_period"),
  list_trending_yearly: createHandler("list_trending_yearly"),
  get_trending_yearly_by_period: createHandler("get_trending_yearly_by_period"),
  list_github_trending: createHandler("list_github_trending"),
  get_github_trending_by_date: createHandler("get_github_trending_by_date"),
};

export async function validateTrendshiftCredential(context: TrendshiftContext): Promise<void> {
  await requestTrendshiftJson({
    context,
    request: { path: trendshiftValidationPath, query: { limit: 1 } },
    mode: "validate",
  });
}

export function trendshiftCredentialId(apiKey: string): string {
  return `trendshift:api_token:${createHash("sha256").update(apiKey).digest("hex").slice(0, 16)}`;
}

async function executeTrendshiftAction(
  actionName: string,
  input: Record<string, unknown>,
  context: TrendshiftContext,
): Promise<Record<string, unknown>> {
  if (actionName === "list_engagement_spikes") validateGainRange(input);
  const payload = await requestTrendshiftJson({
    context,
    request: buildTrendshiftRequest(actionName, input),
    mode: "execute",
  });
  const body = optionalRecord(payload);
  if (!body) throw new ProviderRequestError(502, "Trendshift returned an invalid JSON object");
  if (actionName === "list_github_trending" || actionName === "get_github_trending_by_date") {
    return { trend_date: body.trend_date, language: body.language, data: body.data };
  }
  return { data: body.data, next_cursor: body.next_cursor };
}

function buildTrendshiftRequest(actionName: string, input: Record<string, unknown>): TrendshiftRequest {
  const commonQuery = compactObject({
    language: optionalString(input.language),
    limit: optionalInteger(input.limit),
    cursor: optionalString(input.cursor),
  });
  switch (actionName) {
    case "list_engagement_spikes":
      return {
        path: `/v1/engagement-spikes/${encodeURIComponent(requireInputString(input.metric, "metric"))}`,
        query: compactObject({
          min_gain: optionalInteger(input.minGain),
          max_gain: optionalInteger(input.maxGain),
          start_date: optionalString(input.startDate),
          end_date: optionalString(input.endDate),
          limit: optionalInteger(input.limit),
          cursor: optionalString(input.cursor),
        }),
      };
    case "list_trending_daily":
      return { path: "/v1/trending/daily", query: commonQuery };
    case "get_trending_daily_by_date":
      return {
        path: `/v1/trending/daily/${encodeURIComponent(requireInputString(input.date, "date"))}`,
        query: commonQuery,
      };
    case "list_trending_weekly":
      return { path: "/v1/trending/weekly", query: commonQuery };
    case "get_trending_weekly_by_period":
      return {
        path: `/v1/trending/weekly/${requireInputInteger(input.year, "year")}/${requireInputInteger(input.week, "week")}`,
        query: commonQuery,
      };
    case "list_trending_monthly":
      return { path: "/v1/trending/monthly", query: commonQuery };
    case "get_trending_monthly_by_period":
      return {
        path: `/v1/trending/monthly/${requireInputInteger(input.year, "year")}/${requireInputInteger(input.month, "month")}`,
        query: commonQuery,
      };
    case "list_trending_yearly":
      return { path: "/v1/trending/yearly", query: commonQuery };
    case "get_trending_yearly_by_period":
      return { path: `/v1/trending/yearly/${requireInputInteger(input.year, "year")}`, query: commonQuery };
    case "list_github_trending":
      return { path: "/v1/github-trending", query: { language: optionalString(input.language) } };
    case "get_github_trending_by_date":
      return {
        path: `/v1/github-trending/${encodeURIComponent(requireInputString(input.date, "date"))}`,
        query: { language: optionalString(input.language) },
      };
    default:
      throw new ProviderRequestError(400, `unknown trendshift action: ${actionName}`);
  }
}

async function requestTrendshiftJson(input: {
  context: TrendshiftContext;
  request: TrendshiftRequest;
  mode: TrendshiftRequestMode;
}): Promise<unknown> {
  const url = new URL(input.request.path, trendshiftApiBaseUrl);
  for (const [name, value] of Object.entries(input.request.query ?? {})) {
    if (value !== undefined) url.searchParams.set(name, String(value));
  }
  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${input.context.apiKey}`,
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const result = await readTrendshiftPayload(response);
    if (!response.ok) throw createTrendshiftError(response.status, result.payload, input.mode);
    if (!result.isJson) throw new ProviderRequestError(502, "Trendshift returned invalid JSON");
    return result.payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Trendshift request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Trendshift request failed: ${error.message}` : "Trendshift request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readTrendshiftPayload(response: Response): Promise<{ payload: unknown; isJson: boolean }> {
  const text = await response.text();
  if (!text) return { payload: {}, isJson: true };
  try {
    return { payload: JSON.parse(text) as unknown, isJson: true };
  } catch {
    return { payload: { message: text }, isJson: false };
  }
}

function createTrendshiftError(status: number, payload: unknown, mode: TrendshiftRequestMode): ProviderRequestError {
  const body = optionalRecord(payload);
  const message =
    optionalString(body?.detail) ??
    optionalString(body?.title) ??
    optionalString(body?.message) ??
    `Trendshift request failed with status ${status}`;
  if (status === 401 || status === 403) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  if (status === 429) return new ProviderRequestError(429, message, payload);
  if (status === 400 || status === 422) return new ProviderRequestError(400, message, payload);
  return new ProviderRequestError(502, message, payload);
}

function requireInputString(value: unknown, fieldName: string): string {
  const string = optionalString(value);
  if (!string) throw new ProviderRequestError(400, `Trendshift requires ${fieldName}`);
  return string;
}

function requireInputInteger(value: unknown, fieldName: string): number {
  const integer = optionalInteger(value);
  if (integer === undefined) throw new ProviderRequestError(400, `Trendshift requires ${fieldName}`);
  return integer;
}

function validateGainRange(input: Record<string, unknown>): void {
  const minimum = optionalInteger(input.minGain);
  const maximum = optionalInteger(input.maxGain);
  if (minimum !== undefined && maximum !== undefined && maximum < minimum) {
    throw new ProviderRequestError(400, "maxGain must be greater than or equal to minGain");
  }
}
