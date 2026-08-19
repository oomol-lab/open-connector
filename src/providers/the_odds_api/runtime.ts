import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { createProviderTimeout, isAbortLikeError, ProviderRequestError } from "../provider-runtime.ts";

export const theOddsApiBaseUrl = "https://api.the-odds-api.com/v4/";
const defaultRequestTimeoutMs = 30_000;

type TheOddsApiHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const theOddsApiActionHandlers: ProviderActionHandlers<"the_odds_api", TheOddsApiHandler> = {
  async list_sports(input, context) {
    const response = await theOddsApiRequestJson("sports", context, compactObject({ all: booleanParam(input.all) }));
    return { sports: arrayPayload(response.payload, "The Odds API sports response"), quota: response.quota };
  },
  async get_odds(input, context) {
    const response = await theOddsApiRequestJson(
      `sports/${encodeURIComponent(readRequiredString(input.sport, "sport"))}/odds`,
      context,
      compactObject({
        regions: commaParam(input.regions),
        markets: commaParam(input.markets),
        dateFormat: optionalString(input.dateFormat),
        oddsFormat: optionalString(input.oddsFormat),
        eventIds: commaParam(input.eventIds),
        bookmakers: commaParam(input.bookmakers),
        commenceTimeFrom: optionalString(input.commenceTimeFrom),
        commenceTimeTo: optionalString(input.commenceTimeTo),
        includeLinks: booleanParam(input.includeLinks),
        includeSids: booleanParam(input.includeSids),
        includeBetLimits: booleanParam(input.includeBetLimits),
        includeRotationNumbers: booleanParam(input.includeRotationNumbers),
      }),
    );
    return { odds: arrayPayload(response.payload, "The Odds API odds response"), quota: response.quota };
  },
  async get_scores(input, context) {
    const response = await theOddsApiRequestJson(
      `sports/${encodeURIComponent(readRequiredString(input.sport, "sport"))}/scores`,
      context,
      compactObject({
        daysFrom: numberParam(input.daysFrom),
        dateFormat: optionalString(input.dateFormat),
        eventIds: commaParam(input.eventIds),
      }),
    );
    return { scores: arrayPayload(response.payload, "The Odds API scores response"), quota: response.quota };
  },
  async list_events(input, context) {
    const response = await theOddsApiRequestJson(
      `sports/${encodeURIComponent(readRequiredString(input.sport, "sport"))}/events`,
      context,
      compactObject({
        dateFormat: optionalString(input.dateFormat),
        eventIds: commaParam(input.eventIds),
        commenceTimeFrom: optionalString(input.commenceTimeFrom),
        commenceTimeTo: optionalString(input.commenceTimeTo),
        includeRotationNumbers: booleanParam(input.includeRotationNumbers),
      }),
    );
    return { events: arrayPayload(response.payload, "The Odds API events response"), quota: response.quota };
  },
  async get_event_odds(input, context) {
    const response = await theOddsApiRequestJson(
      `sports/${encodeURIComponent(readRequiredString(input.sport, "sport"))}/events/${encodeURIComponent(readRequiredString(input.eventId, "eventId"))}/odds`,
      context,
      compactObject({
        regions: commaParam(input.regions),
        markets: commaParam(input.markets),
        dateFormat: optionalString(input.dateFormat),
        oddsFormat: optionalString(input.oddsFormat),
        bookmakers: commaParam(input.bookmakers),
        includeLinks: booleanParam(input.includeLinks),
        includeSids: booleanParam(input.includeSids),
        includeBetLimits: booleanParam(input.includeBetLimits),
        includeMultipliers: booleanParam(input.includeMultipliers),
      }),
    );
    return { eventOdds: objectPayload(response.payload, "The Odds API event odds response"), quota: response.quota };
  },
  async list_event_markets(input, context) {
    const response = await theOddsApiRequestJson(
      `sports/${encodeURIComponent(readRequiredString(input.sport, "sport"))}/events/${encodeURIComponent(readRequiredString(input.eventId, "eventId"))}/markets`,
      context,
      compactObject({
        regions: commaParam(input.regions),
        bookmakers: commaParam(input.bookmakers),
        dateFormat: optionalString(input.dateFormat),
      }),
    );
    return {
      eventMarkets: objectPayload(response.payload, "The Odds API event markets response"),
      quota: response.quota,
    };
  },
  async list_participants(input, context) {
    const response = await theOddsApiRequestJson(
      `sports/${encodeURIComponent(readRequiredString(input.sport, "sport"))}/participants`,
      context,
      {},
    );
    return {
      participants: arrayPayload(response.payload, "The Odds API participants response"),
      quota: response.quota,
    };
  },
};

export async function validateTheOddsApiCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const response = await theOddsApiRequestJson(
    "sports",
    { apiKey: input.apiKey, fetcher: options.fetcher, signal: options.signal },
    {},
    "validate",
  );
  const firstSport = optionalRecord(arrayPayload(response.payload, "The Odds API sports response")[0]);
  const firstSportKey = optionalString(firstSport?.key);
  const firstSportTitle = optionalString(firstSport?.title);
  return {
    profile: { accountId: firstSportKey ?? "the_odds_api:api-key", displayName: "The Odds API Key" },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/v4/sports",
      firstSportKey,
      firstSportTitle,
      ...response.quota,
    }),
  };
}

export function theOddsApiRequestUrl(path: string, apiKey: string, params: Record<string, string | undefined>): URL {
  const url = new URL(path, theOddsApiBaseUrl);
  url.searchParams.set("apiKey", apiKey);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url;
}

async function theOddsApiRequestJson(
  path: string,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  params: Record<string, string | undefined>,
  phase: "validate" | "execute" = "execute",
): Promise<{ payload: unknown; quota: Record<string, unknown> }> {
  const timeout = createProviderTimeout(context.signal, defaultRequestTimeoutMs);
  let response: Response;
  let payload: unknown;
  try {
    response = await context.fetcher(theOddsApiRequestUrl(path, context.apiKey, params), {
      method: "GET",
      signal: timeout.signal,
    });
    payload = await readPayload(response);
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(
        502,
        `The Odds API ${path} request timed out after ${Math.ceil(defaultRequestTimeoutMs / 1000)} seconds`,
      );
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `The Odds API request failed: ${error.message}` : "The Odds API request failed",
    );
  } finally {
    timeout.cleanup();
  }
  if (!response.ok) throw createTheOddsApiError(response.status, payload, phase);
  return {
    payload,
    quota: compactObject({
      requestsRemaining: response.headers.get("x-requests-remaining") ?? undefined,
      requestsUsed: response.headers.get("x-requests-used") ?? undefined,
      requestsLast: response.headers.get("x-requests-last") ?? undefined,
    }),
  };
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "The Odds API returned invalid JSON");
  }
}

function createTheOddsApiError(status: number, payload: unknown, phase: "validate" | "execute"): ProviderRequestError {
  const message = extractErrorMessage(payload) ?? `The Odds API request failed with ${status || 500}`;
  if (status === 401 && phase === "validate") return new ProviderRequestError(401, message, payload);
  if (status === 400 || status === 422) return new ProviderRequestError(400, message, payload);
  if (status === 429) return new ProviderRequestError(429, message, payload);
  return new ProviderRequestError(status || 500, message, payload);
}

function extractErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error) ?? optionalString(record?.detail);
}

function arrayPayload(payload: unknown, name: string): unknown[] {
  if (!Array.isArray(payload)) throw new ProviderRequestError(502, `${name} was not an array`);
  return payload;
}

function objectPayload(payload: unknown, name: string): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) throw new ProviderRequestError(502, `${name} was not an object`);
  return record;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const parsed = optionalString(value);
  if (!parsed) throw new ProviderRequestError(400, `${fieldName} is required`);
  return parsed;
}

function booleanParam(value: unknown): string | undefined {
  return typeof value === "boolean" ? String(value) : undefined;
}

function numberParam(value: unknown): string | undefined {
  return typeof value === "number" ? String(value) : undefined;
}

function commaParam(value: unknown): string | undefined {
  return Array.isArray(value) ? value.map((item) => String(item)).join(",") : undefined;
}
