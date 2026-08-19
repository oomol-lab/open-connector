import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "the_odds_api";

const trimmedNonEmptyString = (description: string) => s.string(description, { minLength: 1 });

const commaListField = (description: string) =>
  s.array(description, trimmedNonEmptyString("A single The Odds API comma-list value."), {
    minItems: 1,
  });

const sportKeyField = trimmedNonEmptyString(
  "The sport key returned by The Odds API sports endpoint, or upcoming for the next live and upcoming games across all sports.",
);

const eventIdField = trimmedNonEmptyString("The event ID returned by The Odds API.");

const dateFormatField = s.stringEnum("Timestamp format returned by The Odds API.", ["iso", "unix"]);

const oddsFormatField = s.stringEnum("Odds format returned by The Odds API.", ["decimal", "american"]);

const commenceTimeField = trimmedNonEmptyString(
  "ISO 8601 timestamp used by The Odds API to filter event commence time.",
);

const quotaSchema = s.object(
  "The Odds API quota headers returned with the response, when available.",
  {
    requestsRemaining: s.string("The x-requests-remaining response header value."),
    requestsUsed: s.string("The x-requests-used response header value."),
    requestsLast: s.string("The x-requests-last response header value."),
  },
  { optional: ["requestsRemaining", "requestsUsed", "requestsLast"] },
);

const sportSchema = s.looseObject("A sport object returned by The Odds API.", {
  key: s.string("The sport key used in downstream requests."),
  group: s.string("The sport group name."),
  title: s.string("The sport title."),
  description: s.string("The sport description."),
  active: s.boolean("Whether the sport is currently in season."),
  has_outrights: s.boolean("Whether the sport has outright markets."),
});

const eventSchema = s.looseObject("An event object returned by The Odds API.", {
  id: s.string("The event ID."),
  sport_key: s.string("The sport key for this event."),
  sport_title: s.string("The sport title for this event."),
  commence_time: s.anyOf("The event commence time in the requested date format.", [
    s.string("The ISO 8601 event commence time."),
    s.number("The UNIX event commence time."),
  ]),
  home_team: s.string("The home team name."),
  away_team: s.string("The away team name."),
});

const participantSchema = s.looseObject("A participant returned by The Odds API.", {
  full_name: s.string("The participant full name."),
});

const marketSchema = s.looseObject("A market key object returned by The Odds API.", {
  key: s.string("The market key."),
  last_update: s.string("When this market was last seen by The Odds API."),
});

const listSportsInputSchema = s.object(
  "Input parameters for listing sports from The Odds API.",
  {
    all: s.boolean("Whether to include both in-season and out-of-season sports."),
  },
  { optional: ["all"] },
);

const listSportsOutputSchema = s.object("Sports returned by The Odds API.", {
  sports: s.array("Sport objects returned by The Odds API.", sportSchema),
  quota: quotaSchema,
});

const getOddsInputSchema = s.object(
  "Input parameters for reading odds from The Odds API.",
  {
    sport: sportKeyField,
    regions: commaListField("Bookmaker regions to request, such as us, us2, uk, au, or eu."),
    markets: commaListField("Betting market keys to request, such as h2h, spreads, or totals."),
    dateFormat: dateFormatField,
    oddsFormat: oddsFormatField,
    eventIds: commaListField("Event IDs used to filter odds."),
    bookmakers: commaListField("Bookmaker keys used to filter odds."),
    commenceTimeFrom: commenceTimeField,
    commenceTimeTo: commenceTimeField,
    includeLinks: s.boolean("Whether bookmaker event, market, and betslip links are included."),
    includeSids: s.boolean("Whether source IDs are included when available."),
    includeBetLimits: s.boolean("Whether bet limits are included when available."),
    includeRotationNumbers: s.boolean("Whether home and away rotation numbers are included."),
  },
  {
    optional: [
      "markets",
      "dateFormat",
      "oddsFormat",
      "eventIds",
      "bookmakers",
      "commenceTimeFrom",
      "commenceTimeTo",
      "includeLinks",
      "includeSids",
      "includeBetLimits",
      "includeRotationNumbers",
    ],
  },
);

const oddsOutputSchema = s.object("Odds returned by The Odds API.", {
  odds: s.array("Event odds returned by The Odds API.", s.looseObject("An event odds payload.")),
  quota: quotaSchema,
});

const getScoresInputSchema = s.object(
  "Input parameters for reading scores from The Odds API.",
  {
    sport: sportKeyField,
    daysFrom: s.nonNegativeInteger("Number of days in the past from which to return completed scores."),
    dateFormat: dateFormatField,
    eventIds: commaListField("Event IDs used to filter scores."),
  },
  { optional: ["daysFrom", "dateFormat", "eventIds"] },
);

const scoresOutputSchema = s.object("Scores returned by The Odds API.", {
  scores: s.array("Event scores returned by The Odds API.", s.looseObject("An event score payload.")),
  quota: quotaSchema,
});

const listEventsInputSchema = s.object(
  "Input parameters for listing events from The Odds API.",
  {
    sport: sportKeyField,
    dateFormat: dateFormatField,
    eventIds: commaListField("Event IDs used to filter events."),
    commenceTimeFrom: commenceTimeField,
    commenceTimeTo: commenceTimeField,
    includeRotationNumbers: s.boolean("Whether home and away rotation numbers are included."),
  },
  {
    optional: ["dateFormat", "eventIds", "commenceTimeFrom", "commenceTimeTo", "includeRotationNumbers"],
  },
);

const eventsOutputSchema = s.object("Events returned by The Odds API.", {
  events: s.array("Event objects returned by The Odds API.", eventSchema),
  quota: quotaSchema,
});

const getEventOddsInputSchema = s.object(
  "Input parameters for reading odds for a single The Odds API event.",
  {
    sport: sportKeyField,
    eventId: eventIdField,
    regions: commaListField("Bookmaker regions to request, such as us, us2, uk, au, or eu."),
    markets: commaListField("Betting market keys to request, such as h2h, spreads, or totals."),
    dateFormat: dateFormatField,
    oddsFormat: oddsFormatField,
    bookmakers: commaListField("Bookmaker keys used to filter event odds."),
    includeLinks: s.boolean("Whether bookmaker event, market, and betslip links are included."),
    includeSids: s.boolean("Whether source IDs are included when available."),
    includeBetLimits: s.boolean("Whether bet limits are included when available."),
    includeMultipliers: s.boolean("Whether DFS multipliers are included when available."),
  },
  {
    optional: [
      "markets",
      "dateFormat",
      "oddsFormat",
      "bookmakers",
      "includeLinks",
      "includeSids",
      "includeBetLimits",
      "includeMultipliers",
    ],
  },
);

const eventOddsOutputSchema = s.object("Single-event odds returned by The Odds API.", {
  eventOdds: s.looseObject("Single-event odds payload returned by The Odds API."),
  quota: quotaSchema,
});

const listEventMarketsInputSchema = s.object(
  "Input parameters for listing recently seen markets for a The Odds API event.",
  {
    sport: sportKeyField,
    eventId: eventIdField,
    regions: commaListField("Bookmaker regions to request, such as us, us2, uk, au, or eu."),
    bookmakers: commaListField("Bookmaker keys used to filter event markets."),
    dateFormat: dateFormatField,
  },
  { optional: ["bookmakers", "dateFormat"] },
);

const eventMarketsOutputSchema = s.object("Event markets returned by The Odds API.", {
  eventMarkets: s.looseObject("Event market payload returned by The Odds API.", {
    id: s.string("The event ID."),
    sport_key: s.string("The sport key for this event."),
    sport_title: s.string("The sport title for this event."),
    commence_time: s.anyOf("The event commence time in the requested date format.", [
      s.string("The ISO 8601 event commence time."),
      s.number("The UNIX event commence time."),
    ]),
    home_team: s.string("The home team name."),
    away_team: s.string("The away team name."),
    bookmakers: s.array(
      "Bookmakers with recently seen markets for this event.",
      s.looseObject("A bookmaker with recently seen markets.", {
        key: s.string("The bookmaker key."),
        title: s.string("The bookmaker title."),
        markets: s.array("Recently seen market keys for this bookmaker.", marketSchema),
      }),
    ),
  }),
  quota: quotaSchema,
});

const listParticipantsInputSchema = s.object("Input parameters for listing participants from The Odds API.", {
  sport: sportKeyField,
});

const participantsOutputSchema = s.object("Participants returned by The Odds API.", {
  participants: s.array("Participant objects returned by The Odds API.", participantSchema),
  quota: quotaSchema,
});

export const theOddsApiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_sports",
    description: "List sports supported by The Odds API.",
    requiredScopes: [],
    inputSchema: listSportsInputSchema,
    outputSchema: listSportsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_odds",
    description: "Get live and upcoming odds for a sport from The Odds API.",
    requiredScopes: [],
    inputSchema: getOddsInputSchema,
    outputSchema: oddsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_scores",
    description: "Get live and recent completed scores for a sport from The Odds API.",
    requiredScopes: [],
    inputSchema: getScoresInputSchema,
    outputSchema: scoresOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_events",
    description: "List live and upcoming events for a sport from The Odds API.",
    requiredScopes: [],
    inputSchema: listEventsInputSchema,
    outputSchema: eventsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_event_odds",
    description: "Get odds for one The Odds API event.",
    requiredScopes: [],
    inputSchema: getEventOddsInputSchema,
    outputSchema: eventOddsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_event_markets",
    description: "List recently seen market keys for one The Odds API event.",
    requiredScopes: [],
    inputSchema: listEventMarketsInputSchema,
    outputSchema: eventMarketsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_participants",
    description: "List participants for a sport from The Odds API.",
    requiredScopes: [],
    inputSchema: listParticipantsInputSchema,
    outputSchema: participantsOutputSchema,
  }),
];
