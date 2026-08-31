import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
} from "../provider-runtime.ts";

export const sportsdataApiBaseUrl = "https://api.sportsdata.io";

const apiKeyHeader = "Ocp-Apim-Subscription-Key";

type RequestPhase = "validate" | "execute";
type SportsdataActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;

export const sportsdataActionHandlers: ProviderActionHandlers<"sportsdata", SportsdataActionHandler> = {
  list_sports(_input, context) {
    return executeList("/sports", "sports", context);
  },
  list_competitions(input, context) {
    return executeList(`/${segment(input.sport)}/competitions`, "competitions", context);
  },
  list_seasons(input, context) {
    return executeList(`/${segment(input.sport)}/${segment(input.competition)}/seasons`, "seasons", context);
  },
  list_phases(input, context) {
    return executeList(
      `/${segment(input.sport)}/${segment(input.competition)}/phases/${segment(input.seasonId)}`,
      "phases",
      context,
    );
  },
  list_teams(input, context) {
    return executeList(
      `/${segment(input.sport)}/${segment(input.competition)}/teams/${segment(input.seasonId)}`,
      "teams",
      context,
    );
  },
  list_athletes(input, context) {
    return executeList(`/${segment(input.sport)}/${segment(input.competition)}/athletes`, "athletes", context);
  },
  list_venues(input, context) {
    return executeList(`/${segment(input.sport)}/${segment(input.competition)}/venues`, "venues", context);
  },
  list_event_schedule_by_date(input, context) {
    return executeList(
      `/${segment(input.sport)}/${segment(input.competition)}/event-schedules/by-date/${segment(input.date)}`,
      "events",
      context,
    );
  },
  list_event_schedule_by_phase(input, context) {
    return executeList(
      `/${segment(input.sport)}/${segment(input.competition)}/event-schedules/by-phase/${segment(input.phaseId)}`,
      "events",
      context,
    );
  },
  list_event_results_by_date(input, context) {
    return executeList(
      `/${segment(input.sport)}/${segment(input.competition)}/event-results/by-date/${segment(input.date)}`,
      "events",
      context,
    );
  },
  list_live_event_results_by_date(input, context) {
    return executeList(
      `/${segment(input.sport)}/${segment(input.competition)}/event-results-live/by-date/${segment(input.date)}`,
      "events",
      context,
    );
  },
};

export async function validateSportsdataCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const sports = await requestSportsdata(apiKey, "/sports", fetcher, signal, "validate");
  return {
    profile: { accountId: "api_key", displayName: "SportsDataIO API Key", grantedScopes: [] },
    metadata: {
      apiBaseUrl: sportsdataApiBaseUrl,
      validationEndpoint: "/sports",
      availableSportCount: sports.length,
    },
  };
}

async function executeList(path: string, outputField: string, context: ApiKeyProviderContext): Promise<unknown> {
  const items = await requestSportsdata(context.apiKey, path, context.fetcher, context.signal, "execute");
  return { [outputField]: items };
}

async function requestSportsdata(
  apiKey: string,
  path: string,
  fetcher: ProviderFetch,
  signal: AbortSignal | undefined,
  phase: RequestPhase,
): Promise<unknown[]> {
  const timeout = createProviderTimeout(signal);
  try {
    const response = await fetcher(new URL(path, sportsdataApiBaseUrl), {
      headers: { accept: "application/json", [apiKeyHeader]: apiKey, "user-agent": providerUserAgent },
      signal: timeout.signal,
    });
    const payload = await readProviderJsonBody(response, {
      emptyBody: null,
      invalidJsonMessage: "SportsDataIO returned invalid JSON",
      invalidJsonFallback: response.ok ? undefined : (text) => text,
    });
    if (!response.ok) throw createSportsdataError(response.status, payload, phase);
    if (!Array.isArray(payload)) throw new ProviderRequestError(502, "SportsDataIO returned a non-array response");
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "SportsDataIO request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `SportsDataIO request failed: ${error.message}` : "SportsDataIO request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function createSportsdataError(status: number, payload: unknown, phase: RequestPhase): ProviderRequestError {
  const record = optionalRecord(payload);
  const message =
    optionalString(payload) ??
    optionalString(record?.message) ??
    optionalString(record?.Message) ??
    optionalString(record?.error) ??
    optionalString(record?.Error) ??
    `SportsDataIO request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && 400 <= status && status < 500) return new ProviderRequestError(400, message);
  if (status === 401 || status === 403) return new ProviderRequestError(status, message);
  if (400 <= status && status < 500) return new ProviderRequestError(400, message);
  return new ProviderRequestError(502, message);
}

function segment(value: unknown): string {
  return encodeURIComponent(String(value));
}
