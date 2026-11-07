import type { CredentialValidationResult, ExecutionContext } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-executors.ts";
import type { ProviderFetch } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { queryParams } from "../../core/request.ts";
import {
  parseProviderJsonBodyText,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderErrorTextBody,
  readProviderTextBody,
  requiredInputString,
  requiredResponseRecord,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";

export const footballChartsApiBaseUrl = "https://footballcharts-backend.onrender.com/api/v1";

export interface FootballChartsContext {
  apiKey?: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type FootballChartsPhase = "validate" | "execute";

interface FootballChartsRequest {
  context: FootballChartsContext;
  path: string;
  query?: Record<string, string | number | undefined>;
  phase?: FootballChartsPhase;
}

type FootballChartsActionHandler = (input: Record<string, unknown>, context: FootballChartsContext) => Promise<unknown>;

export const footballChartsActionHandlers: ProviderActionHandlers<"football_charts", FootballChartsActionHandler> = {
  async list_leagues(_input, context) {
    return requestFootballCharts({
      context,
      path: "/leagues/",
    });
  },
  async get_league_table(input, context) {
    const view = optionalString(input.view);
    if (view !== undefined && view !== "classic" && view !== "luck" && view !== "goals") {
      throw providerInputError("view must be classic, luck, or goals.");
    }
    return requestFootballCharts({
      context,
      path: `/leagues/${leagueCode(input.league)}/table/`,
      query: {
        season: seasonCode(input.season),
        view: view && view !== "classic" ? view : undefined,
      },
    });
  },
  async get_results(input, context) {
    return requestFootballCharts({
      context,
      path: `/leagues/${leagueCode(input.league)}/results/`,
      query: {
        season: seasonCode(input.season),
        team: optionalString(input.team),
      },
    });
  },
  async get_fixtures(input, context) {
    return requestFootballCharts({
      context,
      path: `/leagues/${leagueCode(input.league)}/fixtures/`,
    });
  },
  async get_season_projection(input, context) {
    return requestFootballCharts({
      context,
      path: `/leagues/${leagueCode(input.league)}/projection/`,
    });
  },
  async get_goal_timing(input, context) {
    return requestFootballCharts({
      context,
      path: `/leagues/${leagueCode(input.league)}/goal-timing/`,
      query: {
        season: seasonCode(input.season),
        team: optionalString(input.team),
      },
    });
  },
  async list_teams(input, context) {
    return requestFootballCharts({
      context,
      path: `/leagues/${leagueCode(input.league)}/teams/`,
      query: {
        season: seasonCode(input.season),
      },
    });
  },
  async get_team(input, context) {
    return requestFootballCharts({
      context,
      path: `/leagues/${leagueCode(input.league)}/teams/${teamSlugCode(input.team)}/`,
      query: {
        season: seasonCode(input.season),
      },
    });
  },
  async get_match(input, context) {
    return requestFootballCharts({
      context,
      path: `/matches/${matchSlugPath(input.slug)}/`,
    });
  },
  async get_track_record(input, context) {
    const days = optionalInteger(input.days);
    if (days !== undefined && (days < 1 || days > 365)) {
      throw providerInputError("days must be an integer between 1 and 365.");
    }
    return requestFootballCharts({
      context,
      path: "/track-record/",
      query: {
        days,
      },
    });
  },
};

export async function createFootballChartsContext(
  context: ExecutionContext,
  fetcher: ProviderFetch,
): Promise<FootballChartsContext> {
  const credential = await context.getCredential("football_charts");
  return {
    apiKey: credential?.authType === "api_key" ? credential.apiKey : undefined,
    fetcher,
    signal: context.signal,
  };
}

export async function validateFootballChartsCredential(
  input: { apiKey: string },
  options: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  const apiKey = bearerTokenValue(input.apiKey);
  const payload = await requestFootballCharts({
    context: { apiKey, fetcher: options.fetcher, signal: options.signal },
    path: "/leagues/",
    phase: "validate",
  });
  const count = optionalInteger(payload.count);
  return {
    profile: {
      accountId: `football_charts:${apiKey.slice(0, 8)}`,
      displayName: "Football Charts API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: footballChartsApiBaseUrl,
      validationEndpoint: "/leagues/",
      ...(count !== undefined ? { leagueCount: count } : {}),
    },
  };
}

export async function readFootballChartsError(
  response: Response,
  phase: FootballChartsPhase = "execute",
  apiKey?: string,
): Promise<ProviderRequestError> {
  const status = response.status;
  const payload = parseProviderJsonBodyText(
    await readProviderErrorTextBody(response, "Football Charts error response"),
    {
      emptyBody: {},
      invalidJsonMessage: "Football Charts returned malformed JSON",
      invalidJsonFallback: () => ({}),
    },
  );
  const body = optionalRecord(payload);
  const errorObj = optionalRecord(body?.error);
  const errorCode = optionalString(errorObj?.code) ?? optionalString(body?.code);
  const upstreamMessage =
    optionalString(errorObj?.message) ??
    optionalString(body?.message) ??
    `Football Charts request failed with HTTP ${status}`;
  const secret = apiKey?.trim();
  const message = secret ? upstreamMessage.replaceAll(secret, "[REDACTED]") : upstreamMessage;
  const containsApiKey = secret && JSON.stringify(payload).includes(JSON.stringify(secret).slice(1, -1));
  const details = withRetryAfterSeconds(response, containsApiKey ? {} : payload);

  if (status === 403 && errorCode === "season_gated") {
    return new ProviderRequestError(400, message, details);
  }
  if ((status === 401 || status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, details);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message, details, "provider_error");
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, details, "rate_limited");
  }
  if (status === 404) {
    return new ProviderRequestError(404, message, details);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, details);
  }
  return new ProviderRequestError(status || 500, message, details);
}

function bearerTokenValue(apiKey: string): string {
  const trimmed = apiKey.trim();
  if (!trimmed || !/^[!-~]+$/.test(trimmed)) {
    throw providerInputError("The Football Charts API key contains invalid characters.");
  }
  return trimmed;
}

function leagueCode(value: unknown): string {
  const code = requiredInputString(value, "league").toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(code)) {
    throw providerInputError("league must be a valid competition key such as premier or spain1.");
  }
  return code;
}

function seasonCode(value: unknown): string | undefined {
  const season = optionalString(value);
  if (season === undefined) {
    return undefined;
  }
  if (!/^\d{4}(-\d{4})?$/.test(season)) {
    throw providerInputError("season must be in YYYY or YYYY-YYYY format, such as 2026 or 2026-2027.");
  }
  return season;
}

function teamSlugCode(value: unknown): string {
  const slug = requiredInputString(value, "team").toLowerCase();
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw providerInputError("team must be a lowercase hyphenated team slug such as arsenal or manchester-city.");
  }
  return slug;
}

function matchSlugPath(value: unknown): string {
  const slug = requiredInputString(value, "slug").toLowerCase();
  if (!/^[a-z0-9-]+\/[a-z0-9-]+\/\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(slug)) {
    throw providerInputError(
      "slug must be in country/league-slug/YYYY-MM-DD-home-vs-away format, as returned by get_fixtures.",
    );
  }
  return slug;
}

async function requestFootballCharts(input: FootballChartsRequest): Promise<Record<string, unknown>> {
  const { context, phase = "execute" } = input;
  const url = new URL(`${footballChartsApiBaseUrl}${input.path}`);
  for (const [key, value] of Object.entries(queryParams(input.query ?? {}))) {
    url.searchParams.set(key, value);
  }
  const headers = new Headers({
    accept: "application/json",
    "user-agent": providerUserAgent,
  });
  if (context.apiKey) {
    headers.set("authorization", `Bearer ${bearerTokenValue(context.apiKey)}`);
  }

  return runProviderRequest({ signal: context.signal, label: "Football Charts" }, async (signal) => {
    const response = await context.fetcher(url, { method: "GET", headers, signal });
    if (!response.ok) {
      throw await readFootballChartsError(response, phase, context.apiKey);
    }
    const payload = parseProviderJsonBodyText(await readProviderTextBody(response, "Football Charts response"), {
      emptyBody: {},
      invalidJsonMessage: "Football Charts returned malformed JSON",
    });
    return requiredResponseRecord(payload, "Football Charts response");
  });
}
