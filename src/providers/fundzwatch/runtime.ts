import type { CredentialValidationResult, ExecutionContext } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

interface FundzwatchContext {
  apiKey?: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface RequestInput {
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  body?: Record<string, unknown>;
  requireApiKey?: boolean;
}

const baseUrl = "https://api.fundz.net";
type FundzwatchActionHandler = (input: Record<string, unknown>, context: FundzwatchContext) => Promise<unknown>;

export const fundzwatchActionHandlers: ProviderActionHandlers<"fundzwatch", FundzwatchActionHandler> = {
  get_funded_and_hiring: cohort("/v1/funded_hiring", "funded_hiring"),
  get_renewal_radar: cohort("/v1/renewal_radar", "renewal_radar"),
  get_stacked_borrowers: cohort("/v1/stacked_borrowers", "stacked_borrowers"),
  get_benefit_plans: cohort("/v1/benefit_plans", "benefit_plans"),
  get_money_in_motion: cohort("/v1/money_in_motion", "money_in_motion"),
  async get_lenders(input, context) {
    const payload = await request(context, {
      path: "/v1/lenders",
      query: { q: optionalString(input.query), page: optionalInteger(input.page) },
    });
    return attributed(payload, { lenders: array(payload.lenders, "lenders"), meta: record(payload.meta, "meta") });
  },
  async get_brokers(input, context) {
    const payload = await request(context, {
      path: "/v1/brokers",
      query: {
        q: optionalString(input.query),
        state: optionalString(input.state)?.toUpperCase(),
        page: optionalInteger(input.page),
      },
    });
    return attributed(payload, { brokers: array(payload.brokers, "brokers"), meta: record(payload.meta, "meta") });
  },
  async get_scored_leads(input, context) {
    const payload = await request(context, {
      path: "/v1/watch/signals",
      method: "POST",
      requireApiKey: true,
      body: {
        min_score: optionalInteger(input.minScore),
        max_results: optionalInteger(input.maxResults),
        buying_stages: stringArray(input.buyingStages),
        industries: stringArray(input.industries),
      },
    });
    return attributed(payload, {
      signalsFound: integer(payload.signals_found, "signals_found"),
      signals: array(payload.signals, "signals"),
    });
  },
  async get_events(input, context) {
    const payload = await request(context, {
      path: "/v1/watch/events",
      requireApiKey: true,
      query: {
        types: join(input.types),
        days: optionalInteger(input.days),
        limit: optionalInteger(input.limit),
        offset: optionalInteger(input.offset),
        industries: join(input.industries),
        locations: join(input.locations),
      },
    });
    return attributed(payload, { total: integer(payload.total, "total"), events: array(payload.events, "events") });
  },
  get_market_pulse: wrapper("/v1/watch/market/pulse", "pulse"),
  get_market_brief: wrapper("/v1/watch/market/brief", "brief"),
  async get_usage(_input, context) {
    const payload = await request(context, { path: "/v1/watch/usage", requireApiKey: true });
    return attributed(payload, {
      tier: requiredString(payload.tier, "tier", invalidResponse),
      currentPeriod: requiredString(payload.current_period, "current_period", invalidResponse),
      apiCallsUsed: integer(payload.api_calls_used, "api_calls_used"),
      aiScoreCallsUsed: integer(payload.ai_score_calls_used, "ai_score_calls_used"),
      limits: record(payload.limits, "limits"),
      lastApiCall: optionalString(payload.last_api_call) ?? null,
    });
  },
  async get_watchlist(_input, context) {
    const payload = await request(context, { path: "/v1/watch/watchlist", requireApiKey: true });
    return attributed(payload, {
      companies: array(payload.companies, "companies"),
      total: integer(payload.total, "total"),
      limit: integer(payload.limit, "limit"),
    });
  },
  async add_to_watchlist(input, context) {
    const payload = await request(context, {
      path: "/v1/watch/watchlist",
      method: "POST",
      requireApiKey: true,
      body: { domains: requiredStringArray(input.domains, "domains") },
    });
    return attributed(payload, {
      added: integer(payload.added, "added"),
      alreadyTracked: integer(payload.already_tracked, "already_tracked"),
      notFound: integer(payload.not_found, "not_found"),
      totalTracked: integer(payload.total_tracked, "total_tracked"),
    });
  },
  async get_watchlist_events(input, context) {
    const payload = await request(context, {
      path: "/v1/watch/watchlist/events",
      requireApiKey: true,
      query: { days: optionalInteger(input.days), types: join(input.types) },
    });
    return attributed(payload, {
      events: array(payload.events, "events"),
      total: integer(payload.total, "total"),
      trackedCompanies: integer(payload.tracked_companies, "tracked_companies"),
      periodDays: integer(payload.period_days, "period_days"),
    });
  },
};

export async function createFundzwatchContext(
  context: ExecutionContext,
  fetcher: typeof fetch,
): Promise<FundzwatchContext> {
  const credential = await context.getCredential("fundzwatch");
  return {
    apiKey: credential?.authType === "api_key" ? credential.apiKey : undefined,
    fetcher,
    signal: context.signal,
  };
}

export async function validateFundzwatchCredential(
  input: { apiKey: string },
  { fetcher, signal }: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const payload = await request(
    { apiKey: input.apiKey, fetcher, signal },
    { path: "/v1/watch/usage", requireApiKey: true },
  );
  return {
    profile: { accountId: "fundzwatch", displayName: "FundzWatch API Key" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: baseUrl,
      validationEndpoint: "/v1/watch/usage",
      tier: optionalString(payload.tier),
      limits: optionalRecord(payload.limits),
    },
  };
}

function cohort(path: string, field: string): FundzwatchActionHandler {
  return async (input, context) => {
    const payload = await request(context, {
      path,
      query: { query: optionalString(input.query), state: optionalString(input.state)?.toUpperCase() },
    });
    return attributed(payload, {
      companies: array(payload[field], field),
      summary: record(payload.summary, "summary"),
      meta: record(payload.meta, "meta"),
    });
  };
}

function wrapper(path: string, field: string): FundzwatchActionHandler {
  return async (_input: Record<string, unknown>, context: FundzwatchContext): Promise<unknown> => {
    const payload = await request(context, { path, requireApiKey: true });
    return attributed(payload, { [field]: record(payload[field], field) });
  };
}

async function request(context: FundzwatchContext, input: RequestInput): Promise<Record<string, unknown>> {
  if (input.requireApiKey && !context.apiKey)
    throw new ProviderRequestError(401, "Configure a FundzWatch API key for this action.");
  const url = new URL(input.path, baseUrl);
  for (const [key, value] of Object.entries(input.query ?? {}))
    if (value !== undefined) url.searchParams.set(key, String(value));
  const headers = new Headers({ accept: "application/json", "user-agent": providerUserAgent });
  if (context.apiKey) headers.set("authorization", `Bearer ${context.apiKey}`);
  if (input.body) headers.set("content-type", "application/json");
  const response = await context.fetcher(url, {
    method: input.method ?? "GET",
    headers,
    body: input.body ? JSON.stringify(input.body) : undefined,
    signal: context.signal,
  });
  const payload = await response.json().catch(() => {
    throw new ProviderRequestError(502, "FundzWatch returned invalid JSON");
  });
  if (!response.ok) throw mapError(response.status, payload, Boolean(context.apiKey));
  return record(payload, "response");
}

function mapError(status: number, payload: unknown, authenticated: boolean): ProviderRequestError {
  const object = optionalRecord(payload);
  const message =
    optionalString(object?.message) ?? optionalString(object?.error) ?? `FundzWatch request failed (${status})`;
  if (status === 401 || status === 403) return new ProviderRequestError(authenticated ? 401 : 400, message, payload);
  if (status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(status >= 500 ? 502 : 400, message, payload);
}

function attributed(payload: Record<string, unknown>, value: Record<string, unknown>): Record<string, unknown> {
  const attribution = optionalRecord(payload.attribution) ?? optionalRecord(optionalRecord(payload.meta)?.attribution);
  return { ...value, attribution };
}
function record(value: unknown, field: string): Record<string, unknown> {
  const result = optionalRecord(value);
  if (!result) throw invalidResponse(`${field} must be an object`);
  return result;
}
function array(value: unknown, field: string): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.some((item) => !optionalRecord(item)))
    throw invalidResponse(`${field} must be an array of objects`);
  return value as Record<string, unknown>[];
}
function integer(value: unknown, field: string): number {
  const result = optionalInteger(value);
  if (result === undefined) throw invalidResponse(`${field} must be an integer`);
  return result;
}
function stringArray(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  return requiredStringArray(value, "array");
}
function requiredStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new ProviderRequestError(400, `${field} must be an array of strings`);
  return value as string[];
}
function join(value: unknown): string | undefined {
  return stringArray(value)?.join(",");
}
function invalidResponse(message: string): ProviderRequestError {
  return new ProviderRequestError(502, `Invalid FundzWatch response: ${message}`);
}
