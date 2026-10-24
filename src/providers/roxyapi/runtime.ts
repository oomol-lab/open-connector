import type {
  ProviderActionSources,
  ProviderActionHandlers,
  ApiKeyProviderContext,
  ProviderRuntimeHandler,
  ProviderActionName,
} from "../provider-executors.ts";

import { optionalRecord, optionalRawString } from "../../core/cast.ts";
import { mapProviderActionSources } from "../provider-executors.ts";
import {
  readProviderTextBody,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  parseProviderJsonBodyText,
  readProviderErrorTextBody,
  requiredResponseRecord,
  requiredInputString,
  runProviderRequest,
} from "../provider-runtime.ts";

interface RoxyapiRoute {
  path: string;
  method: "GET" | "POST";
  pathKeys: readonly string[];
  queryKeys: readonly string[];
}

const roxyapiRoutes: ProviderActionSources<"roxyapi", RoxyapiRoute> = {
  get_forecast_timeline: {
    method: "POST",
    path: "/forecast/timeline",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  get_forecast_digest: {
    method: "POST",
    path: "/forecast/digest",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  get_bazi_luck_pillars: {
    method: "POST",
    path: "/chinese-astrology/bazi/luck-pillars",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  get_bazi_day_master_strength: {
    method: "POST",
    path: "/chinese-astrology/bazi/day-master",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  get_bazi_annual_forecast: {
    method: "POST",
    path: "/chinese-astrology/bazi/annual-forecast",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  convert_lunar_date: {
    method: "POST",
    path: "/chinese-astrology/calendar/lunar-date",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  get_almanac_day: {
    method: "GET",
    path: "/chinese-astrology/calendar/day/{date}",
    pathKeys: ["date"],
    queryKeys: ["lang"],
  },
  find_auspicious_days: {
    method: "POST",
    path: "/chinese-astrology/calendar/auspicious-days",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  get_usage: { method: "GET", path: "/usage", pathKeys: [], queryKeys: [] },
  search_cities: {
    method: "GET",
    path: "/location/search",
    pathKeys: [],
    queryKeys: ["q", "limit", "offset"],
  },
  get_natal_chart: {
    method: "POST",
    path: "/astrology/natal-chart",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  get_synastry: { method: "POST", path: "/astrology/synastry", pathKeys: [], queryKeys: ["lang"] },
  get_daily_horoscope: {
    method: "GET",
    path: "/astrology/horoscope/{sign}/daily",
    pathKeys: ["sign"],
    queryKeys: ["lang", "date", "timezone"],
  },
  get_weekly_horoscope: {
    method: "GET",
    path: "/astrology/horoscope/{sign}/weekly",
    pathKeys: ["sign"],
    queryKeys: ["lang", "date", "timezone"],
  },
  get_monthly_horoscope: {
    method: "GET",
    path: "/astrology/horoscope/{sign}/monthly",
    pathKeys: ["sign"],
    queryKeys: ["lang", "date", "timezone"],
  },
  get_yearly_horoscope: {
    method: "GET",
    path: "/astrology/horoscope/{sign}/yearly",
    pathKeys: ["sign"],
    queryKeys: ["lang", "year", "timezone"],
  },
  get_bazi_chart: {
    method: "POST",
    path: "/chinese-astrology/bazi/chart",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  get_bazi_compatibility: {
    method: "POST",
    path: "/chinese-astrology/bazi/compatibility",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  get_bodygraph: {
    method: "POST",
    path: "/human-design/bodygraph",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  get_human_design_connection: {
    method: "POST",
    path: "/human-design/connection",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  get_numerology_chart: {
    method: "POST",
    path: "/numerology/chart",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  get_numerology_compatibility: {
    method: "POST",
    path: "/numerology/compatibility",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  list_tarot_cards: {
    method: "GET",
    path: "/tarot/cards",
    pathKeys: [],
    queryKeys: ["lang", "limit", "offset", "arcana", "suit", "number"],
  },
  get_tarot_card: {
    method: "GET",
    path: "/tarot/cards/{id}",
    pathKeys: ["id"],
    queryKeys: ["lang"],
  },
  draw_tarot_cards: { method: "POST", path: "/tarot/draw", pathKeys: [], queryKeys: ["lang"] },
  get_daily_tarot: { method: "POST", path: "/tarot/daily", pathKeys: [], queryKeys: ["lang"] },
  cast_yes_no_tarot: { method: "POST", path: "/tarot/yes-no", pathKeys: [], queryKeys: ["lang"] },
  cast_three_card_tarot: {
    method: "POST",
    path: "/tarot/spreads/three-card",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  cast_celtic_cross_tarot: {
    method: "POST",
    path: "/tarot/spreads/celtic-cross",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  cast_love_tarot: {
    method: "POST",
    path: "/tarot/spreads/love",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  cast_career_tarot: {
    method: "POST",
    path: "/tarot/spreads/career",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  cast_custom_tarot: {
    method: "POST",
    path: "/tarot/spreads/custom",
    pathKeys: [],
    queryKeys: ["lang"],
  },
  cast_iching: { method: "GET", path: "/iching/cast", pathKeys: [], queryKeys: ["lang", "seed"] },
};
export const roxyapiBaseUrl = "https://roxyapi.com/api/v2";
type RequestPhase = "validate" | "execute";
export function requireRoxyapiServerKey(apiKey: string): string {
  const key = requiredInputString(apiKey, "apiKey");
  if (key.startsWith("pk_")) {
    throw providerInputError(
      "RoxyAPI requires a server-side secret key (sk_), not a publishable browser key (pk_). Get a secret key at https://roxyapi.com/account.",
    );
  }
  return key;
}
async function executeRoxyapiAction(
  actionName: ProviderActionName<"roxyapi">,
  input: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  callerSignal?: AbortSignal,
): Promise<Record<string, unknown>> {
  input = normalizeRoxyapiInput(actionName, input);
  const route = roxyapiRoutes[actionName];
  let path: string = route.path;
  for (const key of route.pathKeys) {
    path = path.replace(`{${key}}`, encodeURIComponent(String(input[key])));
  }
  const url = new URL(`${roxyapiBaseUrl}${path}`);
  for (const key of route.queryKeys) {
    if (input[key] !== undefined) {
      url.searchParams.set(key, String(input[key]));
    }
  }
  const body = Object.fromEntries(
    Object.entries(input).filter(([key]) => !route.pathKeys.includes(key) && !route.queryKeys.includes(key)),
  );
  return requestRoxyapiJson(url, apiKey, fetcher, "execute", route.method === "POST" ? body : undefined, callerSignal);
}
export async function requestRoxyapiJson(
  url: URL,
  apiKey: string,
  fetcher: typeof fetch,
  phase: RequestPhase,
  body?: Record<string, unknown>,
  callerSignal?: AbortSignal,
): Promise<Record<string, unknown>> {
  return runProviderRequest({ label: "RoxyAPI", signal: callerSignal }, async (signal) => {
    const response = await fetcher(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        "X-API-Key": apiKey,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      throw await readRoxyapiError(response, phase);
    }
    const text = await readProviderTextBody(response, "RoxyAPI response");
    const payload = parseProviderJsonBodyText(text, {
      emptyBody: null,
      invalidJsonMessage: "RoxyAPI returned invalid JSON",
    });
    return requiredResponseRecord(payload, "RoxyAPI response");
  });
}

/** Interpret failed action, validation and proxy responses with the same provider error signals. */
export async function readRoxyapiError(
  response: Response,
  phase: RequestPhase = "execute",
): Promise<ProviderRequestError> {
  const text = await readProviderErrorTextBody(response, "RoxyAPI error response");
  let payload: unknown;
  try {
    payload = parseProviderJsonBodyText(text, { emptyBody: null, invalidJsonMessage: "RoxyAPI returned invalid JSON" });
  } catch {
    // Non-JSON denials have no documented credential signal and keep the upstream status.
  }
  return createRoxyapiError(response.status, payload, phase);
}

function createRoxyapiError(status: number, payload: unknown, phase: RequestPhase) {
  const record = optionalRecord(payload);
  const code = optionalRawString(record?.code);
  const upstreamMessage = optionalRawString(record?.error);
  const message = `${code ? `${code}: ` : ""}${upstreamMessage ?? `RoxyAPI request failed with status ${status}`}`;
  const data = {
    upstreamCode: code,
    docUrl: optionalRawString(record?.doc_url),
    issues: Array.isArray(record?.issues) ? record.issues : undefined,
  };
  // Only documented key failures ask callers to reconnect; plan and origin failures keep their status.
  if (status === 401 && (code === "invalid_api_key" || code === "api_key_revoked")) {
    return new ProviderRequestError(
      phase === "validate" ? 400 : 401,
      message,
      data,
      phase === "validate" ? "invalid_input" : "authorization_failed",
    );
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, data, "rate_limited");
  }
  if (status === 400 && ["validation_error", "bad_request", "date_out_of_range"].includes(code ?? "")) {
    return new ProviderRequestError(400, message, data, "invalid_input");
  }
  return new ProviderRequestError(status, message, data, "provider_error");
}
export const roxyapiActionHandlers: ProviderActionHandlers<
  "roxyapi",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = mapProviderActionSources(
  "roxyapi",
  roxyapiRoutes,
  (name): ProviderRuntimeHandler<ApiKeyProviderContext> =>
    (input, context) =>
      executeRoxyapiAction(name, input, requireRoxyapiServerKey(context.apiKey), context.fetcher, context.signal),
);

function normalizeRoxyapiInput(
  actionName: ProviderActionName<"roxyapi">,
  input: Record<string, unknown>,
): Record<string, unknown> {
  const normalized = { ...input };
  const sign = optionalRawString(input.sign);
  if (sign !== undefined) normalized.sign = sign.trim().toLowerCase();
  const activity = optionalRawString(input.activity);
  if (activity !== undefined) normalized.activity = activity.trim().toLowerCase().split("_").join("-");
  const start = optionalRawString(input.startDate);
  const end = optionalRawString(input.endDate);
  if (
    ["get_forecast_timeline", "find_auspicious_days"].includes(actionName) &&
    start !== undefined &&
    end !== undefined &&
    end < start
  )
    throw providerInputError("endDate must be on or after startDate");
  if (actionName === "get_almanac_day" && (String(input.date) < "1900-01-01" || String(input.date) > "2100-12-31"))
    throw providerInputError("almanac date must be within years 1900 through 2100");
  if (
    ["get_bazi_luck_pillars", "get_bazi_day_master_strength", "get_bazi_annual_forecast"].includes(actionName) &&
    input.hourClock !== undefined &&
    input.hourClock !== "clock" &&
    input.longitude === undefined
  )
    throw providerInputError("longitude is required when hourClock is local-mean or solar");
  return normalized;
}
