import type { CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";
import type { BalldontlieWorldcupActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "balldontlie_worldcup";
const balldontlieWorldcupBaseUrl = "https://api.balldontlie.io/fifa/worldcup/v1";
const balldontlieWorldcupApiOrigin = "https://api.balldontlie.io";

const balldontlieListEndpoints = {
  list_stadiums: { path: "/stadiums", outputField: "stadiums" },
  list_odds: { path: "/odds", outputField: "odds" },
  list_player_props: { path: "/odds/player_props", outputField: "playerProps" },
  list_futures_odds: { path: "/odds/futures", outputField: "futuresOdds" },
  list_players: { path: "/players", outputField: "players" },
  list_player_injuries: { path: "/player_injuries", outputField: "playerInjuries" },
  list_rosters: { path: "/rosters", outputField: "rosters" },
  list_match_lineups: { path: "/match_lineups", outputField: "lineups" },
  list_match_events: { path: "/match_events", outputField: "events" },
  list_player_match_stats: { path: "/player_match_stats", outputField: "playerMatchStats" },
  list_team_match_stats: { path: "/team_match_stats", outputField: "teamMatchStats" },
  list_match_shots: { path: "/match_shots", outputField: "shots" },
  list_match_momentum: { path: "/match_momentum", outputField: "momentum" },
  list_match_best_players: { path: "/match_best_players", outputField: "bestPlayers" },
  list_match_avg_positions: { path: "/match_avg_positions", outputField: "avgPositions" },
  list_match_team_form: { path: "/match_team_form", outputField: "teamForm" },
};

type BalldontlieActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type BalldontliePhase = "validate" | "execute";

export const balldontlieWorldcupActionHandlers: Record<BalldontlieWorldcupActionName, BalldontlieActionHandler> = {
  async list_teams(input, context) {
    const payload = await balldontlieRequestJson({
      path: "/teams",
      query: pagedQuery(input),
      context,
      phase: "execute",
    });
    return { teams: readDataArray(payload), meta: readMeta(payload) };
  },
  async list_matches(input, context) {
    const payload = await balldontlieRequestJson({
      path: "/matches",
      query: compactObject({
        ...pagedQuery(input),
        team_id: numberParam(input.teamId),
      }),
      context,
      phase: "execute",
    });
    return { matches: readDataArray(payload), meta: readMeta(payload) };
  },
  async get_match(input, context) {
    const payload = await balldontlieRequestJson({
      path: `/matches/${readRequiredInteger(input.matchId, "matchId")}`,
      query: {},
      context,
      phase: "execute",
    });
    return { match: readDataObject(payload) };
  },
  async list_standings(input, context) {
    const payload = await balldontlieRequestJson({
      path: "/group_standings",
      query: pagedQuery(input),
      context,
      phase: "execute",
    });
    return { standings: readDataArray(payload), meta: readMeta(payload) };
  },
  list_stadiums: createListHandler("list_stadiums"),
  list_odds: createListHandler("list_odds"),
  list_player_props: createListHandler("list_player_props"),
  list_futures_odds: createListHandler("list_futures_odds"),
  list_players: createListHandler("list_players"),
  list_player_injuries: createListHandler("list_player_injuries"),
  list_rosters: createListHandler("list_rosters"),
  list_match_lineups: createListHandler("list_match_lineups"),
  list_match_events: createListHandler("list_match_events"),
  list_player_match_stats: createListHandler("list_player_match_stats"),
  list_team_match_stats: createListHandler("list_team_match_stats"),
  list_match_shots: createListHandler("list_match_shots"),
  list_match_momentum: createListHandler("list_match_momentum"),
  list_match_best_players: createListHandler("list_match_best_players"),
  list_match_avg_positions: createListHandler("list_match_avg_positions"),
  list_match_team_form: createListHandler("list_match_team_form"),
};

export const executors: ProviderExecutors = defineProviderExecutors<ApiKeyProviderContext>({
  service,
  handlers: balldontlieWorldcupActionHandlers,
  async createContext(context, fetcher): Promise<ApiKeyProviderContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
      transitFiles: context.transitFiles,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await balldontlieRequestJson({
      path: "/teams",
      query: { "seasons[]": "2026", per_page: "1" },
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      phase: "validate",
    });
    const firstTeam = optionalRecord(readDataArray(payload)[0]);

    return {
      profile: {
        accountId: readString(firstTeam?.id),
        displayName: "BALLDONTLIE World Cup API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        apiBaseUrl: balldontlieWorldcupBaseUrl,
        validationEndpoint: "/teams",
        firstTeam: readString(firstTeam?.name),
      }),
    };
  },
};

function createListHandler(
  actionName: keyof typeof balldontlieListEndpoints,
): BalldontlieActionHandler {
  return async (input, context) => {
    const endpoint = balldontlieListEndpoints[actionName];
    const payload = await balldontlieRequestJson({
      path: endpoint.path,
      query: filteredQuery(input),
      context,
      phase: "execute",
    });
    return { [endpoint.outputField]: readDataArray(payload), meta: readMeta(payload) };
  };
}

function pagedQuery(input: Record<string, unknown>): Record<string, string | string[] | undefined> {
  return compactObject({
    "seasons[]": numberParam(input.season),
    page: numberParam(input.page),
    per_page: numberParam(input.perPage),
  });
}

function filteredQuery(input: Record<string, unknown>): Record<string, string | string[] | undefined> {
  return compactObject({
    ...pagedQuery(input),
    match_id: numberParam(input.matchId),
    team_id: numberParam(input.teamId),
    player_id: numberParam(input.playerId),
    search: stringParam(input.search),
    prop_type: stringParam(input.propType),
    "match_ids[]": numberArrayParam(input.matchIds),
    "team_ids[]": numberArrayParam(input.teamIds),
    "player_ids[]": numberArrayParam(input.playerIds),
    "statuses[]": stringArrayParam(input.statuses),
    "vendors[]": stringArrayParam(input.vendors),
  });
}

async function balldontlieRequestJson(input: {
  path: string;
  query: Record<string, string | string[] | undefined>;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: BalldontliePhase;
}): Promise<unknown> {
  const url = new URL(`/fifa/worldcup/v1${input.path}`, balldontlieWorldcupApiOrigin);
  for (const [key, value] of Object.entries(input.query)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(key, item);
      }
    } else if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  try {
    response = await input.context.fetcher(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: input.context.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: input.context.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      isAbortError(error) ? 504 : 502,
      error instanceof Error ? `BALLDONTLIE request failed: ${error.message}` : "BALLDONTLIE request failed",
    );
  }

  const payload = await readJson(response);
  if (!response.ok) {
    throw createBalldontlieError(response.status, payload, input.phase);
  }
  return payload;
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    if (!response.ok) {
      return { error: errorTextMessage(text, response.statusText) };
    }
    throw new ProviderRequestError(502, "BALLDONTLIE returned invalid JSON");
  }
}

function errorTextMessage(text: string, statusText: string): string {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("<")) {
    return statusText || "Upstream request failed";
  }
  return trimmed.slice(0, 300);
}

function createBalldontlieError(status: number, payload: unknown, phase: BalldontliePhase): ProviderRequestError {
  const message = extractMessage(payload) ?? `BALLDONTLIE request failed with ${status}`;
  if ((status === 401 || status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (status >= 400 && status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function readDataArray(payload: unknown): unknown[] {
  const record = optionalRecord(payload);
  return Array.isArray(record?.data) ? record.data : [];
}

function readDataObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  const data = optionalRecord(record?.data);
  if (!data) {
    throw new ProviderRequestError(502, "BALLDONTLIE data was not an object");
  }
  return data;
}

function readMeta(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  return optionalRecord(record?.meta) ?? {};
}

function extractMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.error);
}

function numberParam(value: unknown): string | undefined {
  return typeof value === "number" ? String(value) : undefined;
}

function numberArrayParam(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "number")
    ? value.map((item) => String(item))
    : undefined;
}

function stringParam(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayParam(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === "string" && item.trim())
    ? value.map((item) => item.trim())
    : undefined;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
