import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "balldontlie_worldcup";

const seasonSchema = s.integer("The FIFA World Cup season year, such as 2018, 2022, or 2026.", { minimum: 2018 });
const pageSchema = s.integer("The page number to request from BALLDONTLIE.", { minimum: 1 });
const perPageSchema = s.integer("The number of records per page to request from BALLDONTLIE.", {
  minimum: 1,
  maximum: 100,
});
const teamIdSchema = s.positiveInteger("The BALLDONTLIE team identifier.");
const matchIdSchema = s.positiveInteger("The BALLDONTLIE match identifier.");
const playerIdSchema = s.positiveInteger("The BALLDONTLIE player identifier.");
const searchSchema = s.nonEmptyString("Search text used by BALLDONTLIE to filter players.");
const statusSchema = s.nonEmptyString("A BALLDONTLIE player injury status filter.");
const vendorSchema = s.nonEmptyString("A BALLDONTLIE betting odds vendor filter.");
const propTypeSchema = s.nonEmptyString("A BALLDONTLIE player prop market type.");

const metaSchema = s.looseObject("The BALLDONTLIE pagination metadata.", {
  current_page: s.integer("The current page number."),
  next_page: s.nullable(s.integer("The next page number when available.")),
  per_page: s.integer("The page size."),
});
const pagedInputSchema = s.object(
  "The input payload for a paged BALLDONTLIE World Cup request.",
  {
    season: seasonSchema,
    page: pageSchema,
    perPage: perPageSchema,
  },
  { optional: ["season", "page", "perPage"] },
);
const matchesInputSchema = s.object(
  "The input payload for listing BALLDONTLIE World Cup matches.",
  {
    season: seasonSchema,
    teamId: teamIdSchema,
    page: pageSchema,
    perPage: perPageSchema,
  },
  { optional: ["season", "teamId", "page", "perPage"] },
);
const filteredInputSchema = s.object(
  "The input payload for filtering BALLDONTLIE World Cup resources.",
  {
    season: seasonSchema,
    matchId: matchIdSchema,
    matchIds: s.array("BALLDONTLIE match identifiers.", matchIdSchema, { minItems: 1 }),
    teamId: teamIdSchema,
    teamIds: s.array("BALLDONTLIE team identifiers.", teamIdSchema, { minItems: 1 }),
    playerId: playerIdSchema,
    playerIds: s.array("BALLDONTLIE player identifiers.", playerIdSchema, { minItems: 1 }),
    search: searchSchema,
    statuses: s.array("BALLDONTLIE injury status filters.", statusSchema, { minItems: 1 }),
    vendors: s.array("BALLDONTLIE betting odds vendors.", vendorSchema, { minItems: 1 }),
    propType: propTypeSchema,
    page: pageSchema,
    perPage: perPageSchema,
  },
  {
    optional: [
      "season",
      "matchId",
      "matchIds",
      "teamId",
      "teamIds",
      "playerId",
      "playerIds",
      "search",
      "statuses",
      "vendors",
      "propType",
      "page",
      "perPage",
    ],
  },
);

function listAction(input: {
  name: string;
  description: string;
  outputField: string;
  outputDescription: string;
}): ActionDefinition {
  return defineProviderAction(service, {
    name: input.name,
    description: input.description,
    requiredScopes: [],
    inputSchema: filteredInputSchema,
    outputSchema: s.object(`The BALLDONTLIE World Cup ${input.outputField} response.`, {
      [input.outputField]: s.array(input.outputDescription, s.looseObject(`One ${input.outputField} payload.`)),
      meta: metaSchema,
    }),
  });
}

export const balldontlieWorldcupActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_teams",
    description: "List FIFA World Cup teams from BALLDONTLIE for the selected season.",
    requiredScopes: [],
    inputSchema: pagedInputSchema,
    outputSchema: s.object("The BALLDONTLIE World Cup teams response.", {
      teams: s.array("The teams returned by BALLDONTLIE.", s.looseObject("One team payload.")),
      meta: metaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "list_matches",
    description:
      "List FIFA World Cup matches from BALLDONTLIE for the selected season, optionally filtered by team.",
    requiredScopes: [],
    inputSchema: matchesInputSchema,
    outputSchema: s.object("The BALLDONTLIE World Cup matches response.", {
      matches: s.array("The matches returned by BALLDONTLIE.", s.looseObject("One match payload.")),
      meta: metaSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_match",
    description: "Retrieve one FIFA World Cup match from BALLDONTLIE.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving one BALLDONTLIE World Cup match.", {
      matchId: matchIdSchema,
    }),
    outputSchema: s.object("The BALLDONTLIE World Cup match response.", {
      match: s.looseObject("The match returned by BALLDONTLIE."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_standings",
    description: "List FIFA World Cup standings from BALLDONTLIE for the selected season.",
    requiredScopes: [],
    inputSchema: pagedInputSchema,
    outputSchema: s.object("The BALLDONTLIE World Cup standings response.", {
      standings: s.array("The standings rows returned by BALLDONTLIE.", s.looseObject("One standing row payload.")),
      meta: metaSchema,
    }),
  }),
  listAction({
    name: "list_stadiums",
    description: "List FIFA World Cup stadiums from BALLDONTLIE for the selected season.",
    outputField: "stadiums",
    outputDescription: "The stadiums returned by BALLDONTLIE.",
  }),
  listAction({
    name: "list_odds",
    description: "List FIFA World Cup betting odds from BALLDONTLIE.",
    outputField: "odds",
    outputDescription: "The betting odds returned by BALLDONTLIE.",
  }),
  listAction({
    name: "list_player_props",
    description: "List FIFA World Cup player prop odds from BALLDONTLIE.",
    outputField: "playerProps",
    outputDescription: "The player prop odds returned by BALLDONTLIE.",
  }),
  listAction({
    name: "list_futures_odds",
    description: "List FIFA World Cup futures odds from BALLDONTLIE.",
    outputField: "futuresOdds",
    outputDescription: "The futures odds returned by BALLDONTLIE.",
  }),
  listAction({
    name: "list_players",
    description: "List FIFA World Cup players from BALLDONTLIE.",
    outputField: "players",
    outputDescription: "The players returned by BALLDONTLIE.",
  }),
  listAction({
    name: "list_player_injuries",
    description: "List FIFA World Cup player injuries from BALLDONTLIE.",
    outputField: "playerInjuries",
    outputDescription: "The player injuries returned by BALLDONTLIE.",
  }),
  listAction({
    name: "list_rosters",
    description: "List FIFA World Cup rosters from BALLDONTLIE.",
    outputField: "rosters",
    outputDescription: "The rosters returned by BALLDONTLIE.",
  }),
  listAction({
    name: "list_match_lineups",
    description: "List FIFA World Cup match lineups from BALLDONTLIE.",
    outputField: "lineups",
    outputDescription: "The match lineups returned by BALLDONTLIE.",
  }),
  listAction({
    name: "list_match_events",
    description: "List FIFA World Cup match events from BALLDONTLIE.",
    outputField: "events",
    outputDescription: "The match events returned by BALLDONTLIE.",
  }),
  listAction({
    name: "list_player_match_stats",
    description: "List FIFA World Cup player match statistics from BALLDONTLIE.",
    outputField: "playerMatchStats",
    outputDescription: "The player match statistics returned by BALLDONTLIE.",
  }),
  listAction({
    name: "list_team_match_stats",
    description: "List FIFA World Cup team match statistics from BALLDONTLIE.",
    outputField: "teamMatchStats",
    outputDescription: "The team match statistics returned by BALLDONTLIE.",
  }),
  listAction({
    name: "list_match_shots",
    description: "List FIFA World Cup match shot maps from BALLDONTLIE.",
    outputField: "shots",
    outputDescription: "The match shots returned by BALLDONTLIE.",
  }),
  listAction({
    name: "list_match_momentum",
    description: "List FIFA World Cup match momentum data from BALLDONTLIE.",
    outputField: "momentum",
    outputDescription: "The match momentum rows returned by BALLDONTLIE.",
  }),
  listAction({
    name: "list_match_best_players",
    description: "List FIFA World Cup match best-player data from BALLDONTLIE.",
    outputField: "bestPlayers",
    outputDescription: "The match best-player rows returned by BALLDONTLIE.",
  }),
  listAction({
    name: "list_match_avg_positions",
    description: "List FIFA World Cup average-position data from BALLDONTLIE.",
    outputField: "avgPositions",
    outputDescription: "The average-position rows returned by BALLDONTLIE.",
  }),
  listAction({
    name: "list_match_team_form",
    description: "List FIFA World Cup team form data from BALLDONTLIE.",
    outputField: "teamForm",
    outputDescription: "The team form rows returned by BALLDONTLIE.",
  }),
];

export type BalldontlieWorldcupActionName = (typeof balldontlieWorldcupActions)[number]["name"];
