import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { FootballDataActionName } from "./actions.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "football_data";
const footballDataBaseUrl = "https://api.football-data.org/v4";
const footballDataApiOrigin = "https://api.football-data.org";
const defaultRequestTimeoutMs = 30_000;

type FootballDataContext = ApiKeyProviderContext;
type FootballDataPhase = "validate" | "execute";
type FootballDataActionHandler = (input: Record<string, unknown>, context: FootballDataContext) => Promise<unknown>;

interface FootballDataRequestInput {
  path: string;
  query: Record<string, string | undefined>;
  phase: FootballDataPhase;
}

export const footballDataActionHandlers: Record<FootballDataActionName, FootballDataActionHandler> = {
  async list_competitions(_input, context) {
    const payload = await footballDataRequestJson(context, {
      path: "/competitions",
      query: {},
      phase: "execute",
    });
    const record = readObjectPayload(payload, "football-data.org competitions response");
    const competitions = Array.isArray(record.competitions) ? record.competitions : [];
    return {
      count: readCount(record, competitions),
      competitions,
      raw: record,
    };
  },
  async list_all_matches(input, context) {
    const payload = await footballDataRequestJson(context, {
      path: "/matches",
      query: compactObject({
        dateFrom: stringParam(input.dateFrom),
        dateTo: stringParam(input.dateTo),
        status: stringParam(input.status),
        competitions: codeListParam(input.competitions),
      }),
      phase: "execute",
    });
    const record = readObjectPayload(payload, "football-data.org global matches response");
    const matches = Array.isArray(record.matches) ? record.matches : [];
    return {
      count: readCount(record, matches),
      filters: optionalRecord(record.filters) ?? {},
      resultSet: optionalRecord(record.resultSet) ?? {},
      matches,
      raw: record,
    };
  },
  async get_match(input, context) {
    const payload = await footballDataRequestJson(context, {
      path: `/matches/${readRequiredInteger(input.matchId, "matchId")}`,
      query: {},
      phase: "execute",
    });
    const record = readObjectPayload(payload, "football-data.org match response");
    return {
      match: record,
      raw: record,
    };
  },
  async list_matches(input, context) {
    const competition = readCompetition(input);
    const payload = await footballDataRequestJson(context, {
      path: `/competitions/${encodeURIComponent(competition)}/matches`,
      query: compactObject({
        season: numberParam(input.season),
        dateFrom: stringParam(input.dateFrom),
        dateTo: stringParam(input.dateTo),
        status: stringParam(input.status),
        stage: stringParam(input.stage),
        group: stringParam(input.group),
      }),
      phase: "execute",
    });
    const record = readObjectPayload(payload, "football-data.org matches response");
    const matches = Array.isArray(record.matches) ? record.matches : [];
    return {
      count: readCount(record, matches),
      filters: optionalRecord(record.filters) ?? {},
      competition: optionalRecord(record.competition) ?? {},
      matches,
      raw: record,
    };
  },
  async get_standings(input, context) {
    const competition = readCompetition(input);
    const payload = await footballDataRequestJson(context, {
      path: `/competitions/${encodeURIComponent(competition)}/standings`,
      query: compactObject({
        season: numberParam(input.season),
      }),
      phase: "execute",
    });
    const record = readObjectPayload(payload, "football-data.org standings response");
    return {
      filters: optionalRecord(record.filters) ?? {},
      competition: optionalRecord(record.competition) ?? {},
      season: optionalRecord(record.season) ?? {},
      standings: Array.isArray(record.standings) ? record.standings : [],
      raw: record,
    };
  },
  async list_teams(input, context) {
    const competition = readCompetition(input);
    const payload = await footballDataRequestJson(context, {
      path: `/competitions/${encodeURIComponent(competition)}/teams`,
      query: compactObject({
        season: numberParam(input.season),
      }),
      phase: "execute",
    });
    const record = readObjectPayload(payload, "football-data.org teams response");
    const teams = Array.isArray(record.teams) ? record.teams : [];
    return {
      count: readCount(record, teams),
      competition: optionalRecord(record.competition) ?? {},
      season: optionalRecord(record.season) ?? {},
      teams,
      raw: record,
    };
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, footballDataActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await footballDataRequestJson(
      {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      {
        path: "/competitions",
        query: {},
        phase: "validate",
      },
    );
    const record = optionalRecord(payload);
    const competitions = Array.isArray(record?.competitions) ? record.competitions : [];
    const firstCompetition = optionalRecord(competitions[0]);
    const firstCompetitionCode = optionalString(firstCompetition?.code);
    if (!firstCompetitionCode) {
      throw new ProviderRequestError(400, "No competitions available for this API token", payload);
    }

    return {
      profile: {
        accountId: firstCompetitionCode,
        displayName: "football-data.org API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: footballDataBaseUrl,
        validationEndpoint: "/competitions",
        firstCompetitionCode,
        firstCompetitionName: optionalString(firstCompetition?.name),
      }),
    };
  },
};

async function footballDataRequestJson(
  context: FootballDataContext,
  input: FootballDataRequestInput,
): Promise<unknown> {
  const url = new URL(`/v4${input.path}`, footballDataApiOrigin);
  for (const [key, value] of Object.entries(input.query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const timeoutSignal = AbortSignal.timeout(defaultRequestTimeoutMs);
  const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-auth-token": context.apiKey,
      },
      signal,
    });
    const payload = await readJson(response, "football-data.org");
    if (!response.ok) {
      throw buildFootballDataError(response.status, payload, input.phase);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutSignal.aborted && isAbortError(error)) {
      throw new ProviderRequestError(504, "football-data.org request timed out", error);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `football-data.org request failed: ${error.message}`
        : "football-data.org request failed",
      error,
    );
  }
}

async function readJson(response: Response, label: string): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, `${label} returned invalid JSON`);
  }
}

function buildFootballDataError(status: number, payload: unknown, phase: FootballDataPhase): ProviderRequestError {
  const message = extractMessage(payload) ?? `football-data.org request failed with ${status}`;
  if ((status === 401 || status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(status, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function readCompetition(input: Record<string, unknown>): string {
  const competition = codeParam(input.competition);
  if (!competition) {
    throw new ProviderRequestError(400, "competition is required");
  }
  return competition;
}

function readObjectPayload(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} was not an object`);
  }
  return record;
}

function extractMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function numberParam(value: unknown): string | undefined {
  return optionalInteger(value)?.toString();
}

function stringParam(value: unknown): string | undefined {
  return optionalString(value);
}

function codeParam(value: unknown): string | undefined {
  return optionalString(value)?.toUpperCase();
}

function codeListParam(value: unknown): string | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim())
    ? value.map((item) => item.trim().toUpperCase()).join(",")
    : undefined;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  const parsed = optionalInteger(value);
  if (parsed === undefined) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return parsed;
}

function readCount(record: Record<string, unknown>, items: unknown[]): number {
  return optionalInteger(record.count) ?? optionalInteger(optionalRecord(record.resultSet)?.count) ?? items.length;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
