import type { ExecutionContext, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { OpenfootballWorldcupActionName } from "./actions.ts";

import {
  createProviderTimeout,
  defineProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "openfootball_worldcup";
const openfootballRawBaseUrl = "https://raw.githubusercontent.com/openfootball/worldcup.json/master";
const openfootballJsdelivrBaseUrl = "https://cdn.jsdelivr.net/gh/openfootball/worldcup.json@master";
const openfootballEsmBaseUrl = "https://esm.sh/gh/openfootball/worldcup.json@master";
const defaultRequestTimeoutMs = 30_000;

type DatasetKind = "matches" | "groups" | "teams" | "stadiums" | "squads" | "qualiPlayoffs";

interface OpenfootballWorldcupContext {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type OpenfootballWorldcupActionHandler = (
  input: Record<string, unknown>,
  context: OpenfootballWorldcupContext,
) => Promise<unknown>;

export const openfootballWorldcupActionHandlers: Record<
  OpenfootballWorldcupActionName,
  OpenfootballWorldcupActionHandler
> = {
  async list_matches(input, context) {
    const season = readSeason(input.season);
    const { payload, sourceUrl } = await requestDataset(season, "matches", context);
    const record = readObjectPayload(payload, "OpenFootball matches response");
    return {
      tournament: { name: readString(record.name) ?? `World Cup ${season}` },
      matches: Array.isArray(record.matches) ? record.matches : [],
      sourceUrl,
    };
  },
  async list_groups(input, context) {
    const season = readSeason(input.season);
    const { payload, sourceUrl } = await requestDataset(season, "groups", context);
    const record = readObjectPayload(payload, "OpenFootball groups response");
    return {
      tournament: { name: readString(record.name) ?? `World Cup ${season}` },
      groups: Array.isArray(record.groups) ? record.groups : [],
      sourceUrl,
    };
  },
  async list_teams(input, context) {
    const season = readSeason(input.season);
    const { payload, sourceUrl } = await requestDataset(season, "teams", context);
    return {
      teams: Array.isArray(payload) ? payload : [],
      sourceUrl,
    };
  },
  async list_stadiums(input, context) {
    const season = readSeason(input.season);
    const { payload, sourceUrl } = await requestDataset(season, "stadiums", context);
    const record = readObjectPayload(payload, "OpenFootball stadiums response");
    return {
      tournament: { name: readString(record.name) ?? `World Cup ${season}` },
      stadiums: Array.isArray(record.stadiums) ? record.stadiums : [],
      sourceUrl,
    };
  },
  async list_squads(input, context) {
    const season = readSeason(input.season);
    const { payload, sourceUrl } = await requestDataset(season, "squads", context);
    return {
      squads: Array.isArray(payload) ? payload : [],
      sourceUrl,
    };
  },
  async list_qualification_playoffs(input, context) {
    const season = readSeason(input.season);
    const { payload, sourceUrl } = await requestDataset(season, "qualiPlayoffs", context);
    const record = readObjectPayload(payload, "OpenFootball qualification playoffs response");
    return {
      tournament: { name: readString(record.name) ?? `World Cup ${season} Qualifying` },
      matches: Array.isArray(record.matches) ? record.matches : [],
      sourceUrl,
    };
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<OpenfootballWorldcupContext>({
  service,
  handlers: openfootballWorldcupActionHandlers,
  createContext(context: ExecutionContext, fetcher: typeof fetch): OpenfootballWorldcupContext {
    return {
      fetcher,
      signal: context.signal,
    };
  },
});

async function requestDataset(
  season: number,
  kind: DatasetKind,
  context: OpenfootballWorldcupContext,
): Promise<{ payload: unknown; sourceUrl: string }> {
  const urls = buildDatasetUrls(season, kind);
  let lastError: unknown;
  for (const sourceUrl of urls) {
    try {
      const payload = await requestJson(sourceUrl, context, `OpenFootball ${kind}`);
      return { payload, sourceUrl };
    } catch (error) {
      lastError = error;
      if (error instanceof ProviderRequestError && error.status === 400) {
        throw error;
      }
    }
  }

  if (lastError instanceof ProviderRequestError) {
    throw lastError;
  }
  throw new ProviderRequestError(502, `OpenFootball ${kind} request failed`);
}

function buildDatasetUrls(season: number, kind: DatasetKind): string[] {
  const fileName =
    kind === "matches"
      ? "worldcup.json"
      : kind === "groups"
        ? "worldcup.groups.json"
        : kind === "teams"
          ? "worldcup.teams.json"
          : kind === "stadiums"
            ? "worldcup.stadiums.json"
            : kind === "squads"
              ? "worldcup.squads.json"
              : "worldcup.quali_playoffs.json";
  const path = `${season}/${fileName}`;
  return [
    `${openfootballJsdelivrBaseUrl}/${path}`,
    `${openfootballEsmBaseUrl}/${path}`,
    `${openfootballRawBaseUrl}/${path}`,
  ];
}

async function requestJson(url: string, context: OpenfootballWorldcupContext, label: string): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, defaultRequestTimeoutMs);
  try {
    const response = await context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status === 404 ? 400 : response.status,
        `${label} request failed with ${response.status}`,
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new ProviderRequestError(502, `${label} returned invalid JSON`);
    }
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, `${label} request timed out`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `${label} request failed: ${error.message}` : `${label} request failed`,
    );
  } finally {
    timeout.cleanup();
  }
}

function readSeason(value: unknown): number {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  throw new ProviderRequestError(400, "season is required");
}

function readObjectPayload(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ProviderRequestError(502, `${label} was not an object`);
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://raw.githubusercontent.com/openfootball/worldcup.json/master",
  auth: { type: "none" },
});
