import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "football_data";

const competitionCodeSchema = s.string({
  minLength: 1,
  pattern: "\\S",
  description: "The football-data.org competition code, such as WC for the World Cup.",
});
const seasonSchema = s.integer("The season year used by football-data.org.", { minimum: 1930 });
const dateSchema = s.date("A date filter in YYYY-MM-DD format.");
const matchStatusSchema = s.stringEnum("The football-data.org match status filter.", [
  "SCHEDULED",
  "LIVE",
  "IN_PLAY",
  "PAUSED",
  "FINISHED",
  "POSTPONED",
  "SUSPENDED",
  "CANCELED",
]);
const stageSchema = s.string({ minLength: 1, description: "The football-data.org stage filter." });
const groupSchema = s.string({ minLength: 1, description: "The football-data.org group filter." });
const matchIdSchema = s.integer("The football-data.org match identifier.", { minimum: 1 });
const competitionSchema = s.object(
  "A competition returned by football-data.org.",
  {
    id: s.integer("The competition ID."),
    name: s.string("The competition name."),
    code: s.string("The competition code."),
    type: s.string("The competition type."),
  },
  { additionalProperties: true },
);
const listMatchesInputSchema = s.object(
  "The input payload for listing football-data.org competition matches.",
  {
    competition: competitionCodeSchema,
    season: seasonSchema,
    dateFrom: dateSchema,
    dateTo: dateSchema,
    status: matchStatusSchema,
    stage: stageSchema,
    group: groupSchema,
  },
  { optional: ["season", "dateFrom", "dateTo", "status", "stage", "group"] },
);
const listAllMatchesInputSchema = s.object(
  "The input payload for listing football-data.org matches across visible competitions.",
  {
    dateFrom: dateSchema,
    dateTo: dateSchema,
    status: matchStatusSchema,
    competitions: s.array("Competition codes used to filter matches, such as WC.", competitionCodeSchema, {
      minItems: 1,
    }),
  },
  { optional: ["dateFrom", "dateTo", "status", "competitions"] },
);
const competitionInputSchema = s.object(
  "The input payload for reading a football-data.org competition resource.",
  {
    competition: competitionCodeSchema,
    season: seasonSchema,
  },
  { optional: ["season"] },
);

export const footballDataActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_competitions",
    description: "List football competitions visible to the connected football-data.org API token.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for listing football-data.org competitions.", {}),
    outputSchema: s.object("The football-data.org competitions response.", {
      count: s.integer("The number of competitions returned."),
      competitions: s.array("The competitions returned by football-data.org.", competitionSchema),
      raw: s.unknownObject("The raw football-data.org response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_matches",
    description:
      "List football-data.org matches for a competition such as WC, with optional season, date, status, stage, and group filters.",
    requiredScopes: [],
    inputSchema: listMatchesInputSchema,
    outputSchema: s.object("The football-data.org matches response.", {
      count: s.integer("The number of matches returned."),
      filters: s.unknownObject("The filters returned by football-data.org."),
      competition: competitionSchema,
      matches: s.array("The matches returned by football-data.org.", s.unknownObject("One match.")),
      raw: s.unknownObject("The raw football-data.org response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_all_matches",
    description:
      "List football-data.org matches across visible competitions with optional date, status, and competition filters.",
    requiredScopes: [],
    inputSchema: listAllMatchesInputSchema,
    outputSchema: s.object("The football-data.org global matches response.", {
      count: s.integer("The number of matches returned."),
      filters: s.unknownObject("The filters returned by football-data.org."),
      resultSet: s.unknownObject("The result set metadata returned by football-data.org."),
      matches: s.array("The matches returned by football-data.org.", s.unknownObject("One match.")),
      raw: s.unknownObject("The raw football-data.org response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_match",
    description: "Retrieve one football-data.org match by identifier.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for retrieving a football-data.org match.", {
      matchId: matchIdSchema,
    }),
    outputSchema: s.object("The football-data.org match response.", {
      match: s.unknownObject("The match returned by football-data.org."),
      raw: s.unknownObject("The raw football-data.org response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_standings",
    description: "Get football-data.org standings for a competition such as WC.",
    requiredScopes: [],
    inputSchema: competitionInputSchema,
    outputSchema: s.object("The football-data.org standings response.", {
      filters: s.unknownObject("The filters returned by football-data.org."),
      competition: competitionSchema,
      season: s.unknownObject("The season returned by football-data.org."),
      standings: s.array(
        "The standings tables returned by football-data.org.",
        s.unknownObject("One standings table."),
      ),
      raw: s.unknownObject("The raw football-data.org response payload."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_teams",
    description: "List football-data.org teams for a competition such as WC.",
    requiredScopes: [],
    inputSchema: competitionInputSchema,
    outputSchema: s.object("The football-data.org teams response.", {
      count: s.integer("The number of teams returned."),
      competition: competitionSchema,
      season: s.unknownObject("The season returned by football-data.org."),
      teams: s.array("The teams returned by football-data.org.", s.unknownObject("One team.")),
      raw: s.unknownObject("The raw football-data.org response payload."),
    }),
  }),
];

export type FootballDataActionName =
  | "list_competitions"
  | "list_matches"
  | "list_all_matches"
  | "get_match"
  | "get_standings"
  | "list_teams";
