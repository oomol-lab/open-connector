import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "college_football_data";

const seasonYearSchema = s.integer("The college football season year.", { minimum: 1869 });
const optionalYearSchema = s.integer("The optional college football season year.", { minimum: 1869 });
const weekSchema = s.positiveInteger("The optional season week filter.");
const conferenceSchema = s.nonEmptyString("The optional conference abbreviation filter.");
const teamSchema = s.nonEmptyString("The optional school name filter.");
const gameIdSchema = s.positiveInteger("The CollegeFootballData game identifier.");
const seasonTypeSchema = s.stringEnum("The season segment to query.", ["regular", "postseason"]);
const classificationSchema = s.stringEnum("The NCAA division classification filter.", ["fbs", "fcs", "ii", "iii"]);
const looseRecordSchema = s.looseObject("The upstream CollegeFootballData object returned by the API.");

const userInfoSchema = s.object("The authenticated CollegeFootballData account information.", {
  patronLevel: s.nullableNumber("The Patreon subscription level reported by the API."),
  remainingCalls: s.nullableNumber("The number of API calls remaining in the current rate-limit window."),
});

export const collegeFootballDataActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_info",
    description: "Get CollegeFootballData account information including patron level and remaining calls.",
    inputSchema: s.object("Input parameters for getting CollegeFootballData account info.", {}),
    outputSchema: s.object("The CollegeFootballData account info response.", {
      info: s.nullable(userInfoSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_conferences",
    description: "List college football conferences from CollegeFootballData.",
    inputSchema: s.object("Input parameters for listing CollegeFootballData conferences.", {}),
    outputSchema: s.object("The CollegeFootballData conferences response.", {
      conferences: s.array("The conferences returned by CollegeFootballData.", looseRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_teams",
    description: "List college football teams from CollegeFootballData with optional year and conference filters.",
    inputSchema: s.object(
      "Input parameters for listing CollegeFootballData teams.",
      {
        year: seasonYearSchema,
        conference: conferenceSchema,
      },
      { optional: ["year", "conference"] },
    ),
    outputSchema: s.object("The CollegeFootballData teams response.", {
      teams: s.array("The teams returned by CollegeFootballData.", looseRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_venues",
    description: "List college football venues from CollegeFootballData.",
    inputSchema: s.object("Input parameters for listing CollegeFootballData venues.", {}),
    outputSchema: s.object("The CollegeFootballData venues response.", {
      venues: s.array("The venues returned by CollegeFootballData.", looseRecordSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_games",
    description:
      "List college football games and results from CollegeFootballData by year, game id, and optional filters.",
    inputSchema: s.object(
      "Input parameters for listing CollegeFootballData games and results. Provide year or id.",
      {
        year: optionalYearSchema,
        week: weekSchema,
        seasonType: seasonTypeSchema,
        classification: classificationSchema,
        team: teamSchema,
        home: s.nonEmptyString("The optional home school name filter."),
        away: s.nonEmptyString("The optional away school name filter."),
        conference: conferenceSchema,
        id: gameIdSchema,
      },
      { optional: ["year", "week", "seasonType", "classification", "team", "home", "away", "conference", "id"] },
    ),
    outputSchema: s.object("The CollegeFootballData games response.", {
      games: s.array("The games returned by CollegeFootballData.", looseRecordSchema),
    }),
  }),
];
