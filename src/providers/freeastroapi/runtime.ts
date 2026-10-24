import type { CredentialValidationResult } from "../../core/types.ts";
import type {
  ProviderActionHandlers,
  ProviderActionSources,
  ApiKeyProviderContext,
  ProviderRuntimeHandler,
  ProviderActionName,
} from "../provider-executors.ts";

import {
  optionalNumber,
  optionalRecord,
  rawStringOrNull,
  optionalRawString,
  requiredNumber,
  requiredString,
} from "../../core/cast.ts";
import { mapProviderActionSources } from "../provider-executors.ts";
import {
  readProviderTextBody,
  providerResponseError,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
  runProviderRequest,
} from "../provider-runtime.ts";
import { validateCalendarDate, validateExpansionInput } from "./input-validation.ts";

interface FreeastroapiRequest {
  path: string;
  method: "GET" | "POST";
  apiKey: string;
  fetcher: typeof fetch;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  idempotencyKey?: string;
  validating?: boolean;
  signal?: AbortSignal;
}

interface FreeastroapiRoute {
  path: string;
  output: string;
  method: "GET" | "POST";
}

export const freeastroapiBaseUrl = "https://api.freeastroapi.com";
const routes: ProviderActionSources<"freeastroapi", FreeastroapiRoute> = {
  calculate_bazi: { path: "/api/v1/chinese/bazi", output: "chart", method: "POST" },
  calculate_bazi_synastry: {
    path: "/api/v1/chinese/bazi/synastry",
    output: "compatibility",
    method: "POST",
  },
  correct_bazi_time: {
    path: "/api/v1/chinese/bazi/time-correction",
    output: "correction",
    method: "POST",
  },
  calculate_bazi_flow: { path: "/api/v1/chinese/bazi/flow", output: "flow", method: "POST" },
  calculate_bazi_life_curve: {
    path: "/api/v1/chinese/bazi/lifespan",
    output: "lifeCurve",
    method: "POST",
  },
  analyze_bazi_constitution: {
    path: "/api/v1/chinese/bazi/health",
    output: "analysis",
    method: "POST",
  },
  get_chinese_calendar: { path: "/api/v1/chinese/calendar", output: "calendar", method: "GET" },
  get_current_pillars: { path: "/api/v1/chinese/today", output: "pillars", method: "GET" },
  get_bazi_dictionary: {
    path: "/api/v1/chinese/bazi/dictionary",
    output: "dictionary",
    method: "GET",
  },
  search_cities: { path: "/api/v2/geo/search", output: "cities", method: "GET" },
  get_moon_phase: { path: "/api/v1/moon/phase", output: "moon", method: "GET" },
  get_moon_calendar: { path: "/api/v1/moon/month", output: "calendar", method: "GET" },
  list_sky_events: { path: "/api/v1/sky-events", output: "events", method: "GET" },
  calculate_ephemeris: { path: "/api/v1/ephemeris/calculate", output: "ephemeris", method: "POST" },
  calculate_transit_timeline: {
    path: "/api/v1/western/transits/timeline",
    output: "timeline",
    method: "POST",
  },
  calculate_vedic_chart: { path: "/api/v2/vedic/calculate", output: "calculation", method: "POST" },
  calculate_numerology_profile: {
    path: "/api/v1/numerology/profile",
    output: "profile",
    method: "POST",
  },
};
const upstreamFields: Record<string, string> = {
  latitude: "lat",
  longitude: "lng",
  timezone: "tz_str",
  timeStandard: "time_standard",
  language: "lang",
  includeTenGods: "include_ten_gods",
  includePinyin: "include_pinyin",
  includeStars: "include_stars",
  includeInteractions: "include_interactions",
  includeProfessional: "include_professional",
  includeDebug: "include_debug",
  includeCurrentFlow: "include_current_flow",
  personA: "person_a",
  personB: "person_b",
  targetYear: "target_year",
  targetYearEnd: "target_year_end",
  dictionaryResponse: "dictionary_response",
  maxAge: "max_age",
  cultivationFactor: "cultivation_factor",
  includeTiming: "include_timing",
  timingYearsAhead: "timing_years_ahead",
  includeZodiac: "include_zodiac",
  includeRiseSet: "include_rise_set",
  includeVisuals: "include_visuals",
  includeSpecial: "include_special",
  includeEclipse: "include_eclipse",
  includeForecast: "include_forecast",
  includeInterpretation: "include_interpretation",
  includeTraditionalMoon: "include_traditional_moon",
  includeSignTimeline: "include_sign_timeline",
  moonColor: "style_moon_color",
  shadowColor: "style_shadow_color",
  includeMoon: "include_moon",
  includeExactHits: "include_exact_hits",
  includeMoonExactHits: "include_moon_exact_hits",
  includeIngresses: "include_ingresses",
  includeRetrogrades: "include_retrogrades",
  includeLunations: "include_lunations",
  includeFormulation: "include_formulation",
  tableStyle: "table_style",
  zodiacType: "zodiac_type",
  siderealAyanamsa: "sidereal_ayanamsa",
  houseSystem: "house_system",
  includeAspects: "include_aspects",
  includeMinorAspects: "include_minor_aspects",
  includeMoonVoidOfCourse: "include_moon_void_of_course",
  includeFixedStars: "include_fixed_stars",
  fixedStars: "fixed_stars",
  includeHouses: "include_houses",
  includeAngles: "include_angles",
  timeKnown: "time_known",
  rangeStart: "range_start",
  rangeEnd: "range_end",
  transitCategories: "transit_categories",
  transitPlanets: "transit_planets",
  natalPoints: "natal_points",
  aspectTypes: "aspect_types",
  orbSettings: "orb_settings",
  byAspect: "by_aspect",
  byCategory: "by_category",
  byPlanet: "by_planet",
  nodeType: "node_type",
  includeAvastha: "include_avastha",
  includeYogas: "include_yogas",
  includePanchang: "include_panchang",
  includeShadbala: "include_shadbala",
  includeAshtakavarga: "include_ashtakavarga",
  dashaLevels: "dasha_levels",
  referenceDate: "reference_date",
  masterPolicy: "master_policy",
  compoundPolicy: "compound_policy",
  nameSource: "name_source",
  birthDate: "birth_date",
  dateContext: "date_context",
  yearAnchor: "year_anchor",
  includeInterpretations: "include_interpretations",
};
function mapFields(input: Record<string, unknown>, fieldMap = upstreamFields): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(input)
      .filter(([key]) => key !== "idempotencyKey")
      .map(([key, value]) => {
        const object = optionalRecord(value);
        return [fieldMap[key] ?? key, object ? mapFields(object) : value];
      }),
  );
}
function normalizeCities(payload: Record<string, unknown>) {
  if (!Array.isArray(payload.results)) throw providerResponseError("FreeAstroAPI city results must be an array");
  const cities = payload.results.map((value) => {
    const city = requiredResponseRecord(value, "FreeAstroAPI city");
    return {
      name: requiredString(city.name, "FreeAstroAPI city name", providerResponseError),
      country: requiredString(city.country, "FreeAstroAPI city country", providerResponseError),
      state: rawStringOrNull(city.state),
      district: rawStringOrNull(city.district),
      latitude: requiredNumber(city.lat, "FreeAstroAPI city latitude", providerResponseError),
      longitude: requiredNumber(city.lng, "FreeAstroAPI city longitude", providerResponseError),
      timezone: rawStringOrNull(city.timezone),
      population: optionalNumber(city.population) ?? null,
      raw: city,
    };
  });
  return { cities, count: cities.length, raw: payload };
}
function normalizeActionInput(actionName: ProviderActionName<"freeastroapi">, input: Record<string, unknown>) {
  if (actionName === "search_cities") {
    const query = optionalRawString(input.query)?.trim();
    if (query === undefined || query.length < 2 || query.length > 100)
      throw providerInputError("query must contain 2-100 characters after trimming");
    return { ...input, query, country: optionalRawString(input.country)?.trim().toUpperCase() };
  }
  // Null location fields mean omitted; explicit zero coordinates remain available to the API.
  if (actionName === "calculate_vedic_chart")
    return {
      ...input,
      city: input.city ?? undefined,
      latitude: input.latitude ?? undefined,
      longitude: input.longitude ?? undefined,
    };
  if (actionName !== "calculate_ephemeris") return input;
  const start = input.start as string;
  const end = optionalRawString(input.end);
  return {
    ...input,
    start: start.length === 10 ? `${start}T00:00:00` : start,
    end: end?.length === 10 ? `${end}T00:00:00` : end,
  };
}
async function executeFreeastroapiAction(
  actionName: ProviderActionName<"freeastroapi">,
  rawInput: Record<string, unknown>,
  apiKey: string,
  fetcher: typeof fetch,
  callerSignal?: AbortSignal,
) {
  const route = routes[actionName];
  const input = normalizeActionInput(actionName, rawInput);
  validateExpansionInput(actionName, actionName === "calculate_ephemeris" ? rawInput : input);
  if (actionName === "calculate_bazi_synastry") {
    validateCalendarDate(input.personA as Record<string, unknown>);
    validateCalendarDate(input.personB as Record<string, unknown>);
  } else if (route.path.startsWith("/api/v1/chinese/") && route.method === "POST") {
    validateCalendarDate(input);
  }
  if (actionName === "calculate_bazi_flow") {
    const start = input.targetYear as number | undefined;
    const end = input.targetYearEnd as number | null | undefined;
    if (start !== undefined && end !== undefined && end !== null && end !== start) {
      throw providerInputError("targetYearEnd must equal targetYear; each request supports one prediction year");
    }
  }
  const path =
    actionName === "get_chinese_calendar" ? `${route.path}/${encodeURIComponent(input.date as string)}` : route.path;
  const payload = await requestFreeastroapi({
    path,
    method: route.method,
    apiKey,
    fetcher,
    body: route.method === "POST" ? mapFields(input) : undefined,
    query:
      route.method === "GET"
        ? mapFields(actionName === "get_chinese_calendar" ? { language: input.language } : input, {
            ...upstreamFields,
            query: "q",
            longitude: actionName === "get_moon_phase" || actionName === "get_moon_calendar" ? "lon" : "lng",
            timezone: actionName === "list_sky_events" ? "timezone" : "tz_str",
          })
        : undefined,
    idempotencyKey: optionalRawString(input.idempotencyKey),
    signal: callerSignal,
  });
  return actionName === "search_cities" ? normalizeCities(payload) : { [route.output]: payload };
}
export async function validateFreeastroapiCredential(
  apiKey: string,
  fetcher: typeof fetch,
  callerSignal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestFreeastroapi({
    path: "/api/v1/chinese/bazi/dictionary",
    method: "GET",
    apiKey,
    fetcher,
    validating: true,
    signal: callerSignal,
  });
  return {
    profile: { displayName: "FreeAstroAPI API Key" },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: freeastroapiBaseUrl,
      validationEndpoint: "/api/v1/chinese/bazi/dictionary",
    },
  };
}
async function requestFreeastroapi(input: FreeastroapiRequest) {
  return runProviderRequest({ signal: input.signal, label: "FreeAstroAPI" }, async (signal) => {
    const url = new URL(input.path, freeastroapiBaseUrl);
    for (const [key, value] of Object.entries(input.query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const headers = new Headers({
      accept: "application/json",
      "x-api-key": input.apiKey,
      "user-agent": providerUserAgent,
    });
    if (input.body) headers.set("content-type", "application/json");
    if (input.idempotencyKey) headers.set("Idempotency-Key", input.idempotencyKey);
    const response = await input.fetcher(url.toString(), {
      method: input.method,
      headers,
      signal,
      body: input.body ? JSON.stringify(input.body) : undefined,
    });
    const text = await readProviderTextBody(response, "FreeAstroAPI response");
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      if (response.ok) throw providerResponseError("FreeAstroAPI returned invalid JSON");
    }
    if (!response.ok) {
      const record = optionalRecord(payload);
      const validationDetails = Array.isArray(record?.detail)
        ? record.detail
            .map((item) => optionalRawString(optionalRecord(item)?.msg))
            .filter(Boolean)
            .join("; ")
        : undefined;
      const detail =
        optionalRawString(record?.detail) ??
        optionalRawString(record?.message) ??
        optionalRawString(record?.error) ??
        (validationDetails || undefined);
      const providerCode = optionalRawString(record?.code);
      const upstreamMessage = detail ?? `FreeAstroAPI request failed with status ${response.status}`;
      const message = providerCode ? `${upstreamMessage} (${providerCode})` : upstreamMessage;
      if ((response.status === 401 || response.status === 403) && detail?.trim().toLowerCase() === "invalid api key") {
        throw new ProviderRequestError(
          input.validating ? 400 : response.status,
          message,
          undefined,
          input.validating ? "invalid_input" : "authorization_failed",
        );
      }
      if (response.status === 429) throw new ProviderRequestError(429, message, undefined, "rate_limited");
      throw new ProviderRequestError(response.status, message, undefined, "provider_error");
    }
    return requiredResponseRecord(payload, "FreeAstroAPI response");
  });
}
export const freeastroapiActionHandlers: ProviderActionHandlers<
  "freeastroapi",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = mapProviderActionSources(
  "freeastroapi",
  routes,
  (name): ProviderRuntimeHandler<ApiKeyProviderContext> =>
    (input, context) =>
      executeFreeastroapiAction(name, input, context.apiKey, context.fetcher, context.signal),
);
