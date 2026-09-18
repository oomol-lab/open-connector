import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "sportsdata";

const sportSchema = s.nonEmptyString("The SportsDataIO sport slug, such as soccer or tennis.");
const competitionSchema = s.nonEmptyString("The SportsDataIO competition slug within the selected sport.");
const seasonIdSchema = s.integer("The SportsDataIO season identifier.", { minimum: 1 });
const phaseIdSchema = s.integer("The SportsDataIO phase identifier.", { minimum: 1 });
const dateSchema = s.string("The UTC calendar date in YYYY-MM-DD format.", {
  format: "date",
});
const itemSchema = s.looseObject(
  "One SportsDataIO record. Fields retain the official API's names and nested structure.",
);

function listAction(input: {
  name:
    | "list_sports"
    | "list_competitions"
    | "list_seasons"
    | "list_phases"
    | "list_teams"
    | "list_athletes"
    | "list_venues"
    | "list_event_schedule_by_date"
    | "list_event_schedule_by_phase"
    | "list_event_results_by_date"
    | "list_live_event_results_by_date";
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: ReturnType<typeof s.object>;
  outputField: string;
  outputDescription: string;
}) {
  return defineProviderAction(service, {
    name: input.name,
    operationType: input.operationType,
    description: input.description,
    requiredScopes: [],
    inputSchema: input.inputSchema,
    outputSchema: s.object(`The response returned by SportsDataIO ${input.name}.`, {
      [input.outputField]: s.array(input.outputDescription, itemSchema),
    }),
  });
}

const emptyInputSchema = s.object("The input payload for listing SportsDataIO sports.", {});
const sportInputSchema = s.object("A SportsDataIO sport lookup.", { sport: sportSchema });
const competitionInputSchema = s.object("A SportsDataIO competition lookup.", {
  sport: sportSchema,
  competition: competitionSchema,
});
const seasonInputSchema = s.object("A SportsDataIO season lookup.", {
  sport: sportSchema,
  competition: competitionSchema,
  seasonId: seasonIdSchema,
});
const phaseInputSchema = s.object("A SportsDataIO phase lookup.", {
  sport: sportSchema,
  competition: competitionSchema,
  phaseId: phaseIdSchema,
});
const dateInputSchema = s.object("A SportsDataIO event date lookup.", {
  sport: sportSchema,
  competition: competitionSchema,
  date: dateSchema,
});

export const sportsdataActions: ActionDefinition[] = [
  listAction({
    name: "list_sports",
    operationType: "read",
    description: "List sports available in the SportsDataIO Global Sports API.",
    inputSchema: emptyInputSchema,
    outputField: "sports",
    outputDescription: "The sports returned by SportsDataIO.",
  }),
  listAction({
    name: "list_competitions",
    operationType: "read",
    description: "List SportsDataIO competitions for a sport.",
    inputSchema: sportInputSchema,
    outputField: "competitions",
    outputDescription: "The competitions returned by SportsDataIO.",
  }),
  listAction({
    name: "list_seasons",
    operationType: "read",
    description: "List SportsDataIO seasons for a competition.",
    inputSchema: competitionInputSchema,
    outputField: "seasons",
    outputDescription: "The seasons returned by SportsDataIO.",
  }),
  listAction({
    name: "list_phases",
    operationType: "read",
    description: "List SportsDataIO phases for a competition season.",
    inputSchema: seasonInputSchema,
    outputField: "phases",
    outputDescription: "The phases returned by SportsDataIO.",
  }),
  listAction({
    name: "list_teams",
    operationType: "read",
    description: "List SportsDataIO teams active in a competition season.",
    inputSchema: seasonInputSchema,
    outputField: "teams",
    outputDescription: "The teams returned by SportsDataIO.",
  }),
  listAction({
    name: "list_athletes",
    operationType: "read",
    description: "List SportsDataIO athletes for a competition.",
    inputSchema: competitionInputSchema,
    outputField: "athletes",
    outputDescription: "The athletes returned by SportsDataIO.",
  }),
  listAction({
    name: "list_venues",
    operationType: "read",
    description: "List SportsDataIO venues used by a competition.",
    inputSchema: competitionInputSchema,
    outputField: "venues",
    outputDescription: "The venues returned by SportsDataIO.",
  }),
  listAction({
    name: "list_event_schedule_by_date",
    operationType: "read",
    description: "List SportsDataIO scheduled events for a competition on a UTC date.",
    inputSchema: dateInputSchema,
    outputField: "events",
    outputDescription: "The scheduled events returned by SportsDataIO.",
  }),
  listAction({
    name: "list_event_schedule_by_phase",
    operationType: "read",
    description: "List SportsDataIO scheduled events for a competition phase.",
    inputSchema: phaseInputSchema,
    outputField: "events",
    outputDescription: "The scheduled events returned by SportsDataIO.",
  }),
  listAction({
    name: "list_event_results_by_date",
    operationType: "read",
    description: "List final SportsDataIO event results for a competition on a UTC date.",
    inputSchema: dateInputSchema,
    outputField: "events",
    outputDescription: "The final event results returned by SportsDataIO.",
  }),
  listAction({
    name: "list_live_event_results_by_date",
    operationType: "read",
    description: "List live and final SportsDataIO event results for a competition on a UTC date.",
    inputSchema: dateInputSchema,
    outputField: "events",
    outputDescription: "The live and final event results returned by SportsDataIO.",
  }),
];
