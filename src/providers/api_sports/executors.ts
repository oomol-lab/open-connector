import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ApiSportsActionName } from "./actions.ts";

import { compactObject, optionalBoolean, optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "api_sports";
const apiSportsApiBaseUrl = "https://v3.football.api-sports.io";
const apiSportsDefaultRequestTimeoutMs = 30_000;

type QueryValue = string | number | boolean | Array<string | number> | undefined;
type ApiSportsRequestMode = "validate" | "execute";

interface ApiSportsResponsePayload {
  get?: unknown;
  parameters?: unknown;
  errors?: unknown;
  results?: unknown;
  paging?: unknown;
  response?: unknown;
  message?: unknown;
}

interface ApiSportsActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ApiSportsActionHandler = (input: Record<string, unknown>, context: ApiSportsActionContext) => Promise<unknown>;

export const apiSportsActionHandlers: Record<ApiSportsActionName, ApiSportsActionHandler> = {
  football_list_leagues(input, context) {
    return listLeagues(input, context);
  },
  football_list_teams(input, context) {
    return listTeams(input, context);
  },
  football_list_players_profiles(input, context) {
    return listPlayersProfiles(input, context);
  },
  football_list_fixtures(input, context) {
    return listFixtures(input, context);
  },
  football_get_standings(input, context) {
    return getStandings(input, context);
  },
  football_get_fixture_events(input, context) {
    return getFixtureEvents(input, context);
  },
  football_get_fixture_lineups(input, context) {
    return getFixtureLineups(input, context);
  },
  football_get_fixture_statistics(input, context) {
    return getFixtureStatistics(input, context);
  },
  football_get_team_statistics(input, context) {
    return getTeamStatistics(input, context);
  },
  football_list_team_squad(input, context) {
    return listTeamSquad(input, context);
  },
  football_list_players_statistics(input, context) {
    return listPlayersStatistics(input, context);
  },
  football_list_top_scorers(input, context) {
    return listTopScorers(input, context);
  },
  football_list_injuries(input, context) {
    return listInjuries(input, context);
  },
  football_get_predictions(input, context) {
    return getPredictions(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ApiSportsActionContext>({
  service,
  handlers: apiSportsActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ApiSportsActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await apiSportsGet("/timezone", {}, { apiKey: input.apiKey, fetcher, signal }, "validate");
    return {
      profile: {
        accountId: "api_key",
        displayName: "API-SPORTS API Key",
      },
      grantedScopes: [],
      metadata: {
        validationEndpoint: "/timezone",
        apiBaseUrl: apiSportsApiBaseUrl,
      },
    };
  },
};

function listLeagues(input: Record<string, unknown>, context: ApiSportsActionContext): Promise<unknown> {
  return apiSportsGet(
    "/leagues",
    compactObject({
      id: optionalInteger(input.id),
      name: optionalString(input.name),
      country: optionalString(input.country),
      code: optionalString(input.code),
      season: optionalInteger(input.season),
      team: optionalInteger(input.team),
      type: optionalString(input.type),
      current: optionalBoolean(input.current),
      search: optionalString(input.search),
      last: optionalInteger(input.last),
    }),
    context,
  ).then((payload) => ({
    leagues: readApiSportsResponseArray(payload).map(mapLeagueSummary),
    pagination: toPagination(payload),
  }));
}

function listTeams(input: Record<string, unknown>, context: ApiSportsActionContext): Promise<unknown> {
  requireAnyField(input, ["id", "name", "league", "season", "country", "code", "venue", "search"], "Provide at least one team filter");
  return apiSportsGet(
    "/teams",
    compactObject({
      id: optionalInteger(input.id),
      name: optionalString(input.name),
      league: optionalInteger(input.league),
      season: optionalInteger(input.season),
      country: optionalString(input.country),
      code: optionalString(input.code),
      venue: optionalInteger(input.venue),
      search: optionalString(input.search),
    }),
    context,
  ).then((payload) => ({
    teams: readApiSportsResponseArray(payload).map(mapTeamSummary),
    pagination: toPagination(payload),
  }));
}

function listPlayersProfiles(input: Record<string, unknown>, context: ApiSportsActionContext): Promise<unknown> {
  return apiSportsGet(
    "/players/profiles",
    compactObject({
      player: optionalInteger(input.player),
      search: optionalString(input.search),
      page: optionalInteger(input.page),
    }),
    context,
  ).then((payload) => ({
    players: readApiSportsResponseArray(payload).map(mapPlayerProfileResult),
    pagination: toPagination(payload),
  }));
}

function listFixtures(input: Record<string, unknown>, context: ApiSportsActionContext): Promise<unknown> {
  requireAnyField(
    input,
    ["id", "ids", "live", "date", "league", "team", "last", "next", "venue", "from", "to"],
    "Provide at least one main filter",
  );
  return apiSportsGet(
    "/fixtures",
    compactObject({
      id: optionalInteger(input.id),
      ids: optionalIntegerArray(input.ids),
      live: normalizeLiveInput(input.live),
      date: optionalString(input.date),
      league: optionalInteger(input.league),
      season: optionalInteger(input.season),
      team: optionalInteger(input.team),
      last: optionalInteger(input.last),
      next: optionalInteger(input.next),
      from: optionalString(input.from),
      to: optionalString(input.to),
      round: optionalString(input.round),
      status: optionalStringArray(input.status),
      venue: optionalInteger(input.venue),
      timezone: optionalString(input.timezone),
    }),
    context,
  ).then((payload) => ({
    fixtures: readApiSportsResponseArray(payload).map(mapFixture),
    pagination: toPagination(payload),
  }));
}

async function getStandings(input: Record<string, unknown>, context: ApiSportsActionContext): Promise<unknown> {
  requireAnyField(input, ["league", "team"], "league or team provides at least one");
  const payload = await apiSportsGet(
    "/standings",
    compactObject({
      league: optionalInteger(input.league),
      team: optionalInteger(input.team),
      season: optionalInteger(input.season),
    }),
    context,
  );

  const firstItem = readObject(readApiSportsResponseArray(payload)[0]);
  const league = readObject(firstItem?.league);
  const standings = Array.isArray(league?.standings) ? league.standings : [];

  return {
    league: mapFixtureLeagueSummary(league),
    tables: standings.map((table) => readObjectArray(table).map(mapStandingRow)),
  };
}

function getFixtureEvents(input: Record<string, unknown>, context: ApiSportsActionContext): Promise<unknown> {
  return apiSportsGet(
    "/fixtures/events",
    compactObject({
      fixture: optionalInteger(input.fixture),
      team: optionalInteger(input.team),
      player: optionalInteger(input.player),
      type: optionalString(input.type),
    }),
    context,
  ).then((payload) => ({
    events: readApiSportsResponseArray(payload).map(mapEvent),
  }));
}

function getFixtureLineups(input: Record<string, unknown>, context: ApiSportsActionContext): Promise<unknown> {
  return apiSportsGet(
    "/fixtures/lineups",
    compactObject({
      fixture: optionalInteger(input.fixture),
      team: optionalInteger(input.team),
      player: optionalInteger(input.player),
      type: optionalString(input.type),
    }),
    context,
  ).then((payload) => ({
    lineups: readApiSportsResponseArray(payload).map(mapLineup),
  }));
}

function getFixtureStatistics(input: Record<string, unknown>, context: ApiSportsActionContext): Promise<unknown> {
  return apiSportsGet(
    "/fixtures/statistics",
    compactObject({
      fixture: optionalInteger(input.fixture),
      team: optionalInteger(input.team),
      type: optionalString(input.type),
      half: optionalBoolean(input.half),
    }),
    context,
  ).then((payload) => ({
    statistics: readApiSportsResponseArray(payload).map(mapFixtureStatistics),
  }));
}

async function getTeamStatistics(input: Record<string, unknown>, context: ApiSportsActionContext): Promise<unknown> {
  const payload = await apiSportsGet(
    "/teams/statistics",
    compactObject({
      league: optionalInteger(input.league),
      season: optionalInteger(input.season),
      team: optionalInteger(input.team),
      date: optionalString(input.date),
    }),
    context,
  );

  return {
    teamStatistics: readApiSportsResponseObject(payload) ?? {},
  };
}

async function listTeamSquad(input: Record<string, unknown>, context: ApiSportsActionContext): Promise<unknown> {
  const payload = await apiSportsGet(
    "/players/squads",
    compactObject({
      team: optionalInteger(input.team),
    }),
    context,
  );

  const firstItem = readObject(readApiSportsResponseArray(payload)[0]);
  return {
    squad: readObjectArray(firstItem?.players).map(mapSquadPlayer),
  };
}

function listPlayersStatistics(input: Record<string, unknown>, context: ApiSportsActionContext): Promise<unknown> {
  validatePlayersStatisticsInput(input);
  return apiSportsGet(
    "/players",
    compactObject({
      id: optionalInteger(input.id),
      team: optionalInteger(input.team),
      league: optionalInteger(input.league),
      season: optionalInteger(input.season),
      search: optionalString(input.search),
      page: optionalInteger(input.page),
    }),
    context,
  ).then((payload) => ({
    players: readApiSportsResponseArray(payload).map(mapPlayerStatisticsResult),
    pagination: toPagination(payload),
  }));
}

function listTopScorers(input: Record<string, unknown>, context: ApiSportsActionContext): Promise<unknown> {
  return apiSportsGet(
    "/players/topscorers",
    compactObject({
      league: optionalInteger(input.league),
      season: optionalInteger(input.season),
    }),
    context,
  ).then((payload) => ({
    players: readApiSportsResponseArray(payload).map(mapPlayerStatisticsResult),
  }));
}

function listInjuries(input: Record<string, unknown>, context: ApiSportsActionContext): Promise<unknown> {
  validateInjuriesInput(input);
  return apiSportsGet(
    "/injuries",
    compactObject({
      league: optionalInteger(input.league),
      season: optionalInteger(input.season),
      fixture: optionalInteger(input.fixture),
      team: optionalInteger(input.team),
      player: optionalInteger(input.player),
      date: optionalString(input.date),
      ids: optionalIntegerArray(input.ids),
      timezone: optionalString(input.timezone),
    }),
    context,
  ).then((payload) => ({
    injuries: readApiSportsResponseArray(payload).map(mapInjury),
    pagination: toPagination(payload),
  }));
}

async function getPredictions(input: Record<string, unknown>, context: ApiSportsActionContext): Promise<unknown> {
  const payload = await apiSportsGet(
    "/predictions",
    compactObject({
      fixture: optionalInteger(input.fixture),
    }),
    context,
  );

  return {
    prediction: readObject(readApiSportsResponseArray(payload)[0]) ?? {},
  };
}

async function apiSportsGet<T extends ApiSportsResponsePayload>(
  path: string,
  query: Record<string, QueryValue>,
  context: ApiSportsActionContext,
  mode: ApiSportsRequestMode = "execute",
): Promise<T> {
  const timeoutSignal = AbortSignal.timeout(apiSportsDefaultRequestTimeoutMs);
  const signal = context.signal ? AbortSignal.any([context.signal, timeoutSignal]) : timeoutSignal;

  try {
    const response = await context.fetcher(buildApiSportsUrl(path, query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-apisports-key": context.apiKey,
      },
      signal,
    });
    const payload = await readApiSportsJson<T>(response);
    if (!response.ok || hasApiSportsErrors(payload)) {
      throw normalizeApiSportsError(response, payload, mode);
    }
    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (isAbortLikeError(error)) {
      throw new ProviderRequestError(
        502,
        `api_sports ${path} request timed out after ${Math.max(1, Math.ceil(apiSportsDefaultRequestTimeoutMs / 1000))} seconds`,
      );
    }
    throw new ProviderRequestError(502, error instanceof Error ? error.message : "api_sports request failed");
  }
}

function buildApiSportsUrl(path: string, query: Record<string, QueryValue>): URL {
  const url = new URL(path, apiSportsApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      url.searchParams.set(key, value.join("-"));
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function readApiSportsJson<T extends ApiSportsResponsePayload>(response: Response): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw new ProviderRequestError(
      response.status >= 400 ? response.status : 502,
      `invalid JSON: ${readUnexpectedMessage(error)}`,
    );
  }
}

function hasApiSportsErrors(payload: ApiSportsResponsePayload): boolean {
  const errors = payload.errors;
  if (Array.isArray(errors)) {
    return errors.length > 0;
  }

  const record = readObject(errors);
  return record ? Object.keys(record).length > 0 : false;
}

function normalizeApiSportsError(
  response: Response,
  payload: ApiSportsResponsePayload,
  mode: ApiSportsRequestMode,
): ProviderRequestError {
  const message = buildApiSportsErrorMessage(response.status, payload);
  const errors = readObject(payload.errors);

  if (response.status === 429 || errors?.rateLimit) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status === 401 || response.status === 403 || errors?.token || errors?.auth) {
    return new ProviderRequestError(mode === "validate" ? 400 : 401, message, payload);
  }
  if (errors?.plan || errors?.subscription) {
    return new ProviderRequestError(response.status >= 400 ? response.status : 500, message, payload);
  }
  if (hasApiSportsErrors(payload) || (response.status >= 400 && response.status < 500)) {
    return new ProviderRequestError(400, message, payload);
  }

  return new ProviderRequestError(response.status >= 400 ? response.status : 500, message, payload);
}

function buildApiSportsErrorMessage(status: number, payload: ApiSportsResponsePayload): string {
  if (typeof payload.message === "string" && payload.message.trim()) {
    return payload.message;
  }

  const errors = payload.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.map((item) => (typeof item === "string" ? item : JSON.stringify(item))).join("; ");
  }

  const record = readObject(errors);
  if (record) {
    const parts = Object.entries(record).map(([key, value]) => {
      const rendered =
        typeof value === "string"
          ? value
          : typeof value === "number" || typeof value === "boolean"
            ? String(value)
            : JSON.stringify(value);
      return `${key}: ${rendered}`;
    });
    if (parts.length > 0) {
      return parts.join("; ");
    }
  }

  return `api_sports request failed with ${status}`;
}

function toPagination(payload: ApiSportsResponsePayload): Record<string, number> {
  const paging = readObject(payload.paging);
  return {
    current: typeof paging?.current === "number" ? paging.current : 1,
    total: typeof paging?.total === "number" ? paging.total : 1,
    results: typeof payload.results === "number" ? payload.results : 0,
  };
}

function readApiSportsResponseArray(payload: ApiSportsResponsePayload): Array<Record<string, unknown>> {
  return readObjectArray(payload.response);
}

function readApiSportsResponseObject(payload: ApiSportsResponsePayload): Record<string, unknown> | null {
  return readObject(payload.response);
}

function readObject(value: unknown): Record<string, unknown> | null {
  return optionalRecord(value) ?? null;
}

function readObjectArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => optionalRecord(item) != null) : [];
}

function readString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function mapLeagueSummary(item: Record<string, unknown>): Record<string, unknown> {
  const league = readObject(item.league);
  const country = readObject(item.country);
  const seasons = readObjectArray(item.seasons);
  const selectedSeason = seasons.find((season) => readBoolean(season.current) === true) ?? seasons[0] ?? null;
  const coverage = readObject(selectedSeason?.coverage);
  const fixtures = readObject(coverage?.fixtures);

  return {
    leagueId: readNumber(league?.id) ?? 0,
    name: readString(league?.name) ?? "",
    type: readString(league?.type) ?? "",
    country: readString(country?.name),
    countryCode: readString(country?.code),
    logoUrl: readString(league?.logo),
    currentSeason: readNumber(selectedSeason?.year),
    coverage: {
      standings: readBoolean(coverage?.standings) ?? undefined,
      players: readBoolean(coverage?.players) ?? undefined,
      topScorers: readBoolean(coverage?.top_scorers) ?? undefined,
      predictions: readBoolean(coverage?.predictions) ?? undefined,
      odds: readBoolean(coverage?.odds) ?? undefined,
      events: readBoolean(fixtures?.events) ?? undefined,
      lineups: readBoolean(fixtures?.lineups) ?? undefined,
      statisticsFixtures: readBoolean(fixtures?.statistics_fixtures) ?? undefined,
      statisticsPlayers: readBoolean(fixtures?.statistics_players) ?? undefined,
      injuries: readBoolean(coverage?.injuries) ?? undefined,
    },
  };
}

function mapTeamSummary(item: Record<string, unknown>): Record<string, unknown> {
  const team = readObject(item.team);
  const venue = readObject(item.venue);
  const venueId = readNumber(venue?.id);

  return {
    teamId: readNumber(team?.id) ?? 0,
    name: readString(team?.name) ?? "",
    code: readString(team?.code),
    country: readString(team?.country),
    national: readBoolean(team?.national),
    logoUrl: readString(team?.logo),
    venue: venueId ? { venueId, name: readString(venue?.name), city: readString(venue?.city) } : null,
  };
}

function mapPlayerProfileResult(item: Record<string, unknown>): Record<string, unknown> {
  return mapPlayerProfile(readObject(item.player) ?? item);
}

function mapPlayerProfile(player: Record<string, unknown>): Record<string, unknown> {
  return {
    playerId: readNumber(player.id) ?? 0,
    name: readString(player.name) ?? "",
    firstName: readString(player.firstname),
    lastName: readString(player.lastname),
    age: readNumber(player.age),
    nationality: readString(player.nationality),
    position: readString(player.position),
    number: readNumber(player.number),
    photoUrl: readString(player.photo),
  };
}

function mapPlayerSummary(player: Record<string, unknown>): Record<string, unknown> {
  return {
    playerId: readNumber(player.id) ?? 0,
    name: readString(player.name) ?? "",
    firstName: readString(player.firstname),
    lastName: readString(player.lastname),
    age: readNumber(player.age),
    nationality: readString(player.nationality),
    photoUrl: readString(player.photo),
  };
}

function mapFixture(item: Record<string, unknown>): Record<string, unknown> {
  const fixture = readObject(item.fixture);
  const league = readObject(item.league);
  const teams = readObject(item.teams);
  const goals = readObject(item.goals);
  const score = readObject(item.score);

  return {
    fixtureId: readNumber(fixture?.id) ?? 0,
    date: readString(fixture?.date) ?? "",
    timestamp: readNumber(fixture?.timestamp) ?? 0,
    status: {
      short: readString(readObject(fixture?.status)?.short),
      long: readString(readObject(fixture?.status)?.long),
      elapsed: readNumber(readObject(fixture?.status)?.elapsed),
    },
    league: mapFixtureLeagueSummary(league),
    teams: {
      home: mapFixtureTeam(readObject(teams?.home)),
      away: mapFixtureTeam(readObject(teams?.away)),
    },
    goals: {
      home: readNumber(goals?.home),
      away: readNumber(goals?.away),
    },
    score: {
      halftime: mapFixtureScore(readObject(score?.halftime)),
      fulltime: mapFixtureScore(readObject(score?.fulltime)),
      extratime: mapFixtureScore(readObject(score?.extratime)),
      penalty: mapFixtureScore(readObject(score?.penalty)),
    },
  };
}

function mapFixtureLeagueSummary(league: Record<string, unknown> | null): Record<string, unknown> {
  return {
    leagueId: readNumber(league?.id) ?? 0,
    name: readString(league?.name) ?? "",
    country: readString(league?.country),
    season: readNumber(league?.season) ?? 0,
    round: readString(league?.round),
  };
}

function mapFixtureTeam(team: Record<string, unknown> | null): Record<string, unknown> {
  return {
    teamId: readNumber(team?.id) ?? 0,
    name: readString(team?.name) ?? "",
    logoUrl: readString(team?.logo),
    winner: readBoolean(team?.winner),
  };
}

function mapFixtureScore(score: Record<string, unknown> | null): Record<string, number | null> {
  return {
    home: readNumber(score?.home),
    away: readNumber(score?.away),
  };
}

function mapStandingRow(item: Record<string, unknown>): Record<string, unknown> {
  return {
    rank: readNumber(item.rank) ?? 0,
    team: {
      teamId: readNumber(readObject(item.team)?.id) ?? 0,
      name: readString(readObject(item.team)?.name) ?? "",
      logoUrl: readString(readObject(item.team)?.logo),
    },
    points: readNumber(item.points),
    goalsDiff: readNumber(item.goalsDiff),
    group: readString(item.group),
    form: readString(item.form),
    status: readString(item.status),
    description: readString(item.description),
    all: mapStandingTotals(readObject(item.all)),
    home: mapStandingTotals(readObject(item.home)),
    away: mapStandingTotals(readObject(item.away)),
    updatedAt: readString(item.update),
  };
}

function mapStandingTotals(item: Record<string, unknown> | null): Record<string, number | null> {
  const goals = readObject(item?.goals);
  return {
    played: readNumber(item?.played),
    win: readNumber(item?.win),
    draw: readNumber(item?.draw),
    lose: readNumber(item?.lose),
    goalsFor: readNumber(goals?.for),
    goalsAgainst: readNumber(goals?.against),
  };
}

function mapEvent(item: Record<string, unknown>): Record<string, unknown> {
  const time = readObject(item.time);
  const team = readObject(item.team);
  const player = readObject(item.player);
  const assist = readObject(item.assist);

  return {
    elapsed: readNumber(time?.elapsed),
    extra: readNumber(time?.extra),
    team: {
      teamId: readNumber(team?.id) ?? 0,
      name: readString(team?.name) ?? "",
      logoUrl: readString(team?.logo),
    },
    player: {
      id: readNumber(player?.id),
      name: readString(player?.name),
    },
    assist: {
      id: readNumber(assist?.id),
      name: readString(assist?.name),
    },
    type: readString(item.type),
    detail: readString(item.detail),
    comments: readString(item.comments),
  };
}

function mapLineup(item: Record<string, unknown>): Record<string, unknown> {
  const team = readObject(item.team);
  const coach = readObject(item.coach);
  return {
    team: {
      teamId: readNumber(team?.id) ?? 0,
      name: readString(team?.name) ?? "",
      logoUrl: readString(team?.logo),
    },
    formation: readString(item.formation),
    startXI: readObjectArray(item.startXI).map(mapLineupPlayer),
    substitutes: readObjectArray(item.substitutes).map(mapLineupPlayer),
    coach: coach ? { id: readNumber(coach.id), name: readString(coach.name), photoUrl: readString(coach.photo) } : null,
  };
}

function mapLineupPlayer(item: Record<string, unknown>): Record<string, unknown> {
  const player = readObject(item.player);
  return {
    playerId: readNumber(player?.id),
    name: readString(player?.name),
    number: readNumber(player?.number),
    position: readString(player?.pos),
    grid: readString(player?.grid),
  };
}

function mapFixtureStatistics(item: Record<string, unknown>): Record<string, unknown> {
  const team = readObject(item.team);
  return {
    team: {
      teamId: readNumber(team?.id) ?? 0,
      name: readString(team?.name) ?? "",
      logoUrl: readString(team?.logo),
    },
    statistics: readObjectArray(item.statistics).map(mapStatisticEntry),
    statistics1h: readObjectArray(item.statistics_1h).map(mapStatisticEntry),
    statistics2h: readObjectArray(item.statistics_2h).map(mapStatisticEntry),
  };
}

function mapStatisticEntry(item: Record<string, unknown>): Record<string, unknown> {
  return {
    type: readString(item.type) ?? "",
    value: item.value ?? null,
  };
}

function mapSquadPlayer(item: Record<string, unknown>): Record<string, unknown> {
  return {
    playerId: readNumber(item.id) ?? 0,
    name: readString(item.name) ?? "",
    age: readNumber(item.age),
    number: readNumber(item.number),
    position: readString(item.position),
    photoUrl: readString(item.photo),
  };
}

function mapPlayerStatisticsResult(item: Record<string, unknown>): Record<string, unknown> {
  const player = readObject(item.player);
  return {
    player: mapPlayerSummary(player ?? {}),
    statistics: Array.isArray(item.statistics) ? item.statistics : [],
  };
}

function mapInjury(item: Record<string, unknown>): Record<string, unknown> {
  const player = readObject(item.player);
  const team = readObject(item.team);
  const fixture = readObject(item.fixture);
  return {
    player: {
      playerId: readNumber(player?.id) ?? 0,
      name: readString(player?.name) ?? "",
      photoUrl: readString(player?.photo),
    },
    team: {
      teamId: readNumber(team?.id) ?? 0,
      name: readString(team?.name) ?? "",
      logoUrl: readString(team?.logo),
    },
    fixture: {
      fixtureId: readNumber(fixture?.id) ?? 0,
      date: readString(fixture?.date) ?? "",
    },
    reason: readString(player?.reason),
    type: readString(player?.type),
  };
}

function optionalIntegerArray(value: unknown): number[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === "number" && Number.isInteger(item))
    : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : undefined;
}

function normalizeLiveInput(value: unknown): string | number[] | undefined {
  if (value === "all") {
    return "all";
  }
  return optionalIntegerArray(value);
}

function requireAnyField(input: Record<string, unknown>, fields: string[], message: string): void {
  if (fields.every((field) => input[field] == null)) {
    throw new ProviderRequestError(400, message);
  }
}

function validatePlayersStatisticsInput(input: Record<string, unknown>): void {
  if (!input.id && !input.team && !input.league) {
    throw new ProviderRequestError(400, "Provide at least one of id, team and league.");
  }
  if (optionalString(input.search) && !input.team && !input.league) {
    throw new ProviderRequestError(400, "search can only be used with team or league");
  }
  if (!optionalString(input.search) && !input.season) {
    throw new ProviderRequestError(400, "season is required when querying without search");
  }
}

function validateInjuriesInput(input: Record<string, unknown>): void {
  requireAnyField(input, ["fixture", "ids", "date", "league", "team", "player"], "Provide at least one injury query condition");
  if ((input.league || input.team || input.player) && !input.season) {
    throw new ProviderRequestError(400, "Season must be provided when querying using league, team, or player");
  }
}

function readUnexpectedMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "api_sports request failed";
}

function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}
