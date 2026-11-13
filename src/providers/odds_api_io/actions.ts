import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "odds_api_io";

const sportSlugField = s.nonEmptyString('Sport slug from list_sports (e.g., "football" or "basketball").');
const eventIdField = s.positiveInteger("Odds-API.io event ID, as returned by list_events.");
const eventStatuses = ["pending", "live", "settled", "cancelled"];
const bookmakersField = s.stringArray('Bookmaker names from list_bookmakers (e.g., "Bet365"). Up to 30 names.', {
  minItems: 1,
  maxItems: 30,
});

const nameSlugSchema = (description: string) =>
  s.looseObject(
    description,
    {
      name: s.string("Display name."),
      slug: s.string("Slug used in request filters."),
    },
    { optional: ["name", "slug"] },
  );

const scoresSchema = s.looseObject(
  "Current or final score, when available.",
  {
    home: s.nullableInteger("Home side score."),
    away: s.nullableInteger("Away side score."),
    periods: s.unknownObject("Scores per period, keyed by period name."),
  },
  { optional: ["home", "away", "periods"] },
);

const eventProperties = {
  id: s.integer("Event ID."),
  home: s.string("Home participant name."),
  away: s.string("Away participant name."),
  homeId: s.nullableInteger("Home participant ID."),
  awayId: s.nullableInteger("Away participant ID."),
  date: s.string("Scheduled start time in ISO 8601 format."),
  status: s.string("Event status: pending, live, settled or cancelled."),
  sport: nameSlugSchema("Sport of the event."),
  league: nameSlugSchema("League of the event."),
  scores: scoresSchema,
};

const eventOptional = ["home", "away", "homeId", "awayId", "date", "status", "sport", "league", "scores"];

const eventSchema = s.looseObject(
  "One sports event.",
  { ...eventProperties, bookmakerCount: s.nullableInteger("Number of bookmakers with odds for the event.") },
  { optional: [...eventOptional, "bookmakerCount"] },
);

const marketSchema = s.looseObject(
  "One market offered by a bookmaker.",
  {
    name: s.string('Market name (e.g., "ML", "Totals" or "Spread").'),
    odds: s.array("Prices for the market, one entry per line.", s.unknownObject("Prices for one line.")),
    updatedAt: s.string("When the market was last updated."),
  },
  { optional: ["name", "odds", "updatedAt"] },
);

const eventOddsSchema = s.looseObject(
  "An event with odds grouped by bookmaker.",
  {
    ...eventProperties,
    bookmakers: s.record("Markets keyed by bookmaker name.", s.array("Markets from one bookmaker.", marketSchema)),
    urls: s.record("Event page links keyed by bookmaker name.", s.string("Link to the event at the bookmaker.")),
  },
  { optional: [...eventOptional, "bookmakers", "urls"] },
);

export const oddsApiIoActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_sports",
    operationType: "read",
    description: "List the sports covered by Odds-API.io with the slugs used to filter leagues and events.",
    inputSchema: s.actionInput({}, [], "Input for List Sports."),
    outputSchema: s.actionOutput(
      { sports: s.array("Covered sports.", nameSlugSchema("One sport.")) },
      "Sports covered by Odds-API.io.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_bookmakers",
    operationType: "read",
    description: "List the bookmakers available on Odds-API.io and whether each one is currently active.",
    inputSchema: s.actionInput({}, [], "Input for List Bookmakers."),
    outputSchema: s.actionOutput(
      {
        bookmakers: s.array(
          "Available bookmakers.",
          s.looseObject(
            "One bookmaker.",
            {
              name: s.string("Bookmaker name used in odds requests."),
              active: s.boolean("Whether the bookmaker is currently active."),
            },
            { optional: ["name", "active"] },
          ),
        ),
      },
      "Bookmakers available on Odds-API.io.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_leagues",
    operationType: "read",
    description: "List the leagues of a sport, with the number of events each one currently has.",
    inputSchema: s.actionInput(
      {
        sport: sportSlugField,
        all: s.boolean("Also include leagues that have no active events."),
      },
      ["sport"],
      "Input for List Leagues.",
    ),
    outputSchema: s.actionOutput(
      {
        leagues: s.array(
          "Leagues of the sport.",
          s.looseObject(
            "One league.",
            {
              name: s.string("League name."),
              slug: s.string("League slug used to filter events."),
              eventsCount: s.nullableInteger("Number of events in the league."),
            },
            { optional: ["name", "slug", "eventsCount"] },
          ),
        ),
      },
      "Leagues returned by Odds-API.io.",
    ),
  }),
  defineProviderAction(service, {
    name: "list_events",
    operationType: "read",
    description:
      "List upcoming, live or finished events for a sport, optionally narrowed by league, participant, status, time window or bookmaker.",
    inputSchema: s.actionInput(
      {
        sport: sportSlugField,
        league: s.nonEmptyString('League slug from list_leagues (e.g., "england-premier-league").'),
        participantId: s.positiveInteger("Only return events where this participant plays home or away."),
        status: s.array("Event statuses to include.", s.stringEnum(eventStatuses), { minItems: 1, uniqueItems: true }),
        from: s.dateTime('Earliest start time, in RFC 3339 format (e.g., "2026-11-14T00:00:00Z").'),
        to: s.dateTime("Latest start time, in RFC 3339 format. Defaults to 14 days from now."),
        bookmaker: s.nonEmptyString("Only return events that have odds from this bookmaker."),
        limit: s.positiveInteger("Maximum number of events to return (at most 5000 per response)."),
        skip: s.nonNegativeInteger("Number of events to skip, for paging through larger ranges."),
      },
      ["sport"],
      "Input for List Events.",
    ),
    outputSchema: s.actionOutput(
      { events: s.array("Matching events.", eventSchema) },
      "Events returned by Odds-API.io.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_event",
    operationType: "read",
    description: "Get one event by ID, with its participants, start time, status and score.",
    inputSchema: s.actionInput({ eventId: eventIdField }, ["eventId"], "Input for Get Event."),
    outputSchema: eventSchema,
  }),
  defineProviderAction(service, {
    name: "get_odds",
    operationType: "read",
    description:
      "Get pre-match or live odds for one event from the chosen bookmakers, grouped by bookmaker and market.",
    inputSchema: s.actionInput(
      { eventId: eventIdField, bookmakers: bookmakersField },
      ["eventId", "bookmakers"],
      "Input for Get Odds.",
    ),
    outputSchema: eventOddsSchema,
  }),
  defineProviderAction(service, {
    name: "get_multi_odds",
    operationType: "read",
    description: "Get odds for up to 10 events in one request from the chosen bookmakers.",
    inputSchema: s.actionInput(
      {
        eventIds: s.array("Event IDs from list_events. Up to 10 IDs.", eventIdField, { minItems: 1, maxItems: 10 }),
        bookmakers: bookmakersField,
      },
      ["eventIds", "bookmakers"],
      "Input for Get Multi Odds.",
    ),
    outputSchema: s.actionOutput(
      { events: s.array("Events with their odds.", eventOddsSchema) },
      "Odds for several events returned by Odds-API.io.",
    ),
  }),
];
