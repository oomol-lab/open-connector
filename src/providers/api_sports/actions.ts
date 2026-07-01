import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "api_sports";

const positiveIntegerField = (description: string): JsonSchema => s.positiveInteger(description);
const optionalText = (description: string): JsonSchema => s.string({ minLength: 1, description });
const dateField = s.string({ format: "date", description: "Date in YYYY-MM-DD format." });
const timezoneField = s.string("IANA time zone name.");
const seasonField = s.integer({
  minimum: 1000,
  maximum: 9999,
  description: "Season year, represented by a four-digit number.",
});
const pageField = s.positiveInteger("Pagination page number, starting from 1.");
const statusListField = s.array(
  "One or more game status short codes.",
  s.string("Match status short code, such as NS, LIVE, FT."),
  { minItems: 1 },
);
const fixtureIdsField = s.array("One or more contest IDs, up to 20.", positiveIntegerField("Contest ID."), {
  minItems: 1,
  maxItems: 20,
});
const liveField = s.anyOf("Live match filters.", [
  s.literal("all", { description: "View all ongoing competitions." }),
  s.array("Limited to live matches in certain leagues.", positiveIntegerField("League ID."), { minItems: 1 }),
]);
const statisticValueSchema = s.anyOf("The value of the statistical item, or null if there is none.", [
  s.string("String statistic value."),
  s.number("Numeric statistic value."),
  s.boolean("Boolean statistic value."),
  { type: "null" },
]);

const paginationSchema = s.object("Pagination information.", {
  current: s.integer("Current page number."),
  total: s.integer("Total number of pages."),
  results: s.integer("The number of results in the current response."),
});

const leagueCoverageSchema = s.object(
  "The data coverage capabilities currently available to the league.",
  {
    standings: s.boolean("Whether the league currently supports standings data."),
    players: s.boolean("Whether the league currently supports player statistics."),
    topScorers: s.boolean("Whether the league currently supports top scorer data."),
    predictions: s.boolean("Whether the league currently supports predictive data."),
    odds: s.boolean("Whether the league currently supports odds data."),
    events: s.boolean("Whether the league currently supports match event data."),
    lineups: s.boolean("Whether the league currently supports match lineup data."),
    statisticsFixtures: s.boolean("Whether the league currently supports match statistics."),
    statisticsPlayers: s.boolean("Whether the league currently supports player single-game statistics."),
    injuries: s.boolean("Whether the league currently supports injury statistics."),
  },
  {
    optional: [
      "standings",
      "players",
      "topScorers",
      "predictions",
      "odds",
      "events",
      "lineups",
      "statisticsFixtures",
      "statisticsPlayers",
      "injuries",
    ],
  },
);

const venueSchema = s.object("Team home field information, null if not available.", {
  venueId: positiveIntegerField("Stadium ID."),
  name: s.nullableString("Stadium name, or null if not available."),
  city: s.nullableString("The city where the stadium is located, or null if not available."),
});

const leagueSummarySchema = s.object("One football league returned by API-SPORTS.", {
  leagueId: positiveIntegerField("League ID."),
  name: s.string("League name."),
  type: s.string("League type, such as league or cup."),
  country: s.nullableString("The name of the country to which the league belongs, or null if not available."),
  countryCode: s.nullableString("The country code of the league, or null if not available."),
  logoUrl: s.nullableString("League logo address, null if not available."),
  currentSeason: s.nullableInteger("The current season year, or null if none."),
  coverage: leagueCoverageSchema,
});

const teamSummarySchema = s.object("Team summary returned by API-SPORTS.", {
  teamId: positiveIntegerField("Team ID."),
  name: s.string("Team name."),
  code: s.nullableString("Team code, or null if none."),
  country: s.nullableString("The country to which the team belongs, or null if not available."),
  national: s.nullableBoolean("Whether it is a national team, or null if not."),
  logoUrl: s.nullableString("Team logo address, null if not available."),
  venue: s.nullable(venueSchema),
});

const playerSummaryProperties: Record<string, JsonSchema> = {
  playerId: positiveIntegerField("Player ID."),
  name: s.string("Player name."),
  firstName: s.nullableString("Player first name, null if not available."),
  lastName: s.nullableString("The player's last name, or null if none."),
  age: s.nullableInteger("Player's age, or null if none."),
  nationality: s.nullableString("Player nationality, null if not available."),
  photoUrl: s.nullableString("Player avatar address, null if not available."),
};

const playerSummarySchema = s.object("Basic player information.", playerSummaryProperties);

const playerProfileSchema = s.object("Player profile information.", {
  ...playerSummaryProperties,
  position: s.nullableString("Player position on the field, null if not available."),
  number: s.nullableInteger("Jersey number, or null if not available."),
});

const fixtureScoreSchema = s.object("Stage score.", {
  home: s.nullableInteger("Home team score, or null if none."),
  away: s.nullableInteger("The away team's score, or null if not available."),
});

const fixtureLeagueSchema = s.object("Information about the league to which the match belongs.", {
  leagueId: positiveIntegerField("League ID."),
  name: s.string("League name."),
  country: s.nullableString("The country to which the league belongs, or null if not available."),
  season: seasonField,
  round: s.nullableString("Round name, null if not available."),
});

const standingTeamSchema = s.object("Team information.", {
  teamId: positiveIntegerField("Team ID."),
  name: s.string("Team name."),
  logoUrl: s.nullableString("Team logo address, null if not available."),
});

const fixtureCompetitorSchema = s.object("Home or away team information.", {
  teamId: positiveIntegerField("Team ID."),
  name: s.string("Team name."),
  logoUrl: s.nullableString("Team logo address, null if not available."),
  winner: s.nullableBoolean("Whether the team won, or null if there is no result."),
});

const fixtureSchema = s.object("One football fixture returned by API-SPORTS.", {
  fixtureId: positiveIntegerField("Contest ID."),
  date: s.string("Game time."),
  timestamp: s.integer("Match timestamp."),
  status: s.object("Game status information.", {
    short: s.nullableString("Game status short code, null if not available."),
    long: s.nullableString("Long text for match status, or null if none."),
    elapsed: s.nullableInteger("Number of minutes elapsed, or null if none."),
  }),
  league: fixtureLeagueSchema,
  teams: s.object("Home and away team information.", {
    home: fixtureCompetitorSchema,
    away: fixtureCompetitorSchema,
  }),
  goals: fixtureScoreSchema,
  score: s.object("The game is divided into stages.", {
    halftime: fixtureScoreSchema,
    fulltime: fixtureScoreSchema,
    extratime: fixtureScoreSchema,
    penalty: fixtureScoreSchema,
  }),
});

const standingTotalsSchema = s.object("Standing aggregate totals.", {
  played: s.nullableInteger("The number of games played, or null if there are none."),
  win: s.nullableInteger("Victory, or null if there is no win."),
  draw: s.nullableInteger("Draws, or null if none."),
  lose: s.nullableInteger("Losses, null if not present."),
  goalsFor: s.nullableInteger("The number of goals scored, or null if none."),
  goalsAgainst: s.nullableInteger("Number of goals conceded, null if not available."),
});

const standingRowSchema = s.object("One standings row.", {
  rank: s.integer("Ranking."),
  team: standingTeamSchema,
  points: s.nullableInteger("Points, null if none."),
  goalsDiff: s.nullableInteger("Goal difference, or null if not available."),
  group: s.nullableString("Group name, null if not available."),
  form: s.nullableString("A string of recent achievements, or null if there is none."),
  status: s.nullableString("Ranking change status, null if none."),
  description: s.nullableString("Ranking description, null if not available."),
  all: standingTotalsSchema,
  home: standingTotalsSchema,
  away: standingTotalsSchema,
  updatedAt: s.nullableString("Update time, null if not available."),
});

const eventParticipantSchema = s.object("Event participant information.", {
  id: s.nullableInteger("Participant ID, or null if none."),
  name: s.nullableString("Participant name, or null if none."),
});

const eventSchema = s.object("One match event.", {
  elapsed: s.nullableInteger("The number of minutes when the event occurred, or null if none."),
  extra: s.nullableInteger("The minute of added time, or null if none."),
  team: standingTeamSchema,
  player: eventParticipantSchema,
  assist: eventParticipantSchema,
  type: s.nullableString("Event type, null if none."),
  detail: s.nullableString("Event details, or null if none."),
  comments: s.nullableString("Event remarks, null if none."),
});

const lineupPlayerSchema = s.object("Lineup player information.", {
  playerId: s.nullableInteger("Player ID, or null if none."),
  name: s.nullableString("Player name, or null if none."),
  number: s.nullableInteger("Jersey number, or null if not available."),
  position: s.nullableString("Player position, null if none."),
  grid: s.nullableString("Formation grid coordinates, null if not available."),
});

const lineupSchema = s.object("One match lineup.", {
  team: standingTeamSchema,
  formation: s.nullableString("Team formation, null if not available."),
  startXI: s.array("Starting list of players.", lineupPlayerSchema),
  substitutes: s.array("Substitute player list.", lineupPlayerSchema),
  coach: s.nullable(
    s.object("Coach information, null if not available.", {
      id: s.nullableInteger("Coach ID, or null if none."),
      name: s.nullableString("Coach name, null if not available."),
      photoUrl: s.nullableString("Coach avatar address, null if not available."),
    }),
  ),
});

const statisticEntrySchema = s.object("One statistic entry.", {
  type: s.string("Statistical item name."),
  value: statisticValueSchema,
});

const fixtureStatisticsSchema = s.object(
  "Fixture statistics for one team.",
  {
    team: standingTeamSchema,
    statistics: s.array("Full game statistics list.", statisticEntrySchema),
    statistics1h: s.array("First half statistics list.", statisticEntrySchema),
    statistics2h: s.array("Second half statistics list.", statisticEntrySchema),
  },
  { optional: ["statistics1h", "statistics2h"] },
);

const squadPlayerSchema = s.object("Team squad player.", {
  playerId: positiveIntegerField("Player ID."),
  name: s.string("Player name."),
  age: s.nullableInteger("Player's age, or null if none."),
  number: s.nullableInteger("Jersey number, or null if not available."),
  position: s.nullableString("Player position, null if none."),
  photoUrl: s.nullableString("Player avatar address, null if not available."),
});

const playerStatisticsResultSchema = s.object("Player season statistics result.", {
  player: playerSummarySchema,
  statistics: s.array("Player season statistics list, retaining upstream statistical objects.", s.unknownObject("Player statistics object.")),
});

const injurySchema = s.object("One injury or suspension record.", {
  player: s.object("Injured player information.", {
    playerId: positiveIntegerField("Player ID."),
    name: s.string("Player name."),
    photoUrl: s.nullableString("Player avatar address, null if not available."),
  }),
  team: standingTeamSchema,
  fixture: s.object("Associated competition information.", {
    fixtureId: positiveIntegerField("Contest ID."),
    date: s.string("Game time."),
  }),
  reason: s.nullableString("Reason for injury, null if not available."),
  type: s.nullableString("Injury type, null if not available."),
});

const listLeaguesInputSchema = s.object(
  "Query input for league list.",
  {
    id: positiveIntegerField("League ID."),
    name: optionalText("League name."),
    country: optionalText("The name of the country to which the league belongs."),
    code: optionalText("The country code of the league."),
    season: seasonField,
    team: positiveIntegerField("Team ID."),
    type: s.stringEnum("League type.", ["league", "cup"]),
    current: s.boolean("Whether to return only the current season league."),
    search: s.string({ minLength: 3, description: "League or country search keywords." }),
    last: s.positiveInteger("Number of recently added leagues."),
  },
  { optional: ["id", "name", "country", "code", "season", "team", "type", "current", "search", "last"] },
);

const listTeamsInputSchema = s.object(
  "Query input for team list.",
  {
    id: positiveIntegerField("Team ID."),
    name: optionalText("Team name."),
    league: positiveIntegerField("League ID."),
    season: seasonField,
    country: optionalText("The name of the country to which the team belongs."),
    code: optionalText("Team code."),
    venue: positiveIntegerField("Stadium ID."),
    search: s.string({ minLength: 3, description: "Team or country search keywords." }),
  },
  { optional: ["id", "name", "league", "season", "country", "code", "venue", "search"] },
);
listTeamsInputSchema.anyOf = [
  { required: ["id"] },
  { required: ["name"] },
  { required: ["league"] },
  { required: ["season"] },
  { required: ["country"] },
  { required: ["code"] },
  { required: ["venue"] },
  { required: ["search"] },
];

const listFixturesInputSchema = s.object(
  "Query the input for the match list.",
  {
    id: positiveIntegerField("Contest ID."),
    ids: fixtureIdsField,
    live: liveField,
    date: dateField,
    league: positiveIntegerField("League ID."),
    season: seasonField,
    team: positiveIntegerField("Team ID."),
    last: s.integer({ minimum: 1, maximum: 20, description: "The number of recent games." }),
    next: s.integer({ minimum: 1, maximum: 20, description: "Number of games in the future." }),
    from: dateField,
    to: dateField,
    round: optionalText("Round name."),
    status: statusListField,
    venue: positiveIntegerField("Stadium ID."),
    timezone: timezoneField,
  },
  {
    optional: [
      "id",
      "ids",
      "live",
      "date",
      "league",
      "season",
      "team",
      "last",
      "next",
      "from",
      "to",
      "round",
      "status",
      "venue",
      "timezone",
    ],
  },
);
listFixturesInputSchema.anyOf = [
  { required: ["id"] },
  { required: ["ids"] },
  { required: ["live"] },
  { required: ["date"] },
  { required: ["league"] },
  { required: ["team"] },
  { required: ["last"] },
  { required: ["next"] },
  { required: ["venue"] },
  { required: ["from"] },
  { required: ["to"] },
];

const standingsInputSchema = s.object(
  "Query the input of the standings.",
  {
    league: positiveIntegerField("League ID."),
    team: positiveIntegerField("Team ID."),
    season: seasonField,
  },
  { required: ["season"], optional: ["league", "team"] },
);
standingsInputSchema.anyOf = [{ required: ["league"] }, { required: ["team"] }];

const fixtureFilterInputSchema = s.object(
  "Query the input of single game details.",
  {
    fixture: positiveIntegerField("Contest ID."),
    team: positiveIntegerField("Team ID."),
    player: positiveIntegerField("Player ID."),
    type: optionalText("Event or lineup filter type."),
  },
  { required: ["fixture"], optional: ["team", "player", "type"] },
);

const fixtureStatisticsInputSchema = s.object(
  "Query the input of single game statistics.",
  {
    fixture: positiveIntegerField("Contest ID."),
    team: positiveIntegerField("Team ID."),
    type: optionalText("Statistical item type."),
    half: s.boolean("Whether to return first and second half statistics."),
  },
  { required: ["fixture"], optional: ["team", "type", "half"] },
);

const playersStatisticsInputSchema = s.object(
  "Input to query player season statistics.",
  {
    id: positiveIntegerField("Player ID."),
    team: positiveIntegerField("Team ID."),
    league: positiveIntegerField("League ID."),
    season: seasonField,
    search: s.string({ minLength: 4, description: "Player name search keyword." }),
    page: pageField,
  },
  { optional: ["id", "team", "league", "season", "search", "page"] },
);
playersStatisticsInputSchema.anyOf = [{ required: ["id"] }, { required: ["team"] }, { required: ["league"] }];

const injuriesInputSchema = s.object(
  "Query the input of injury and suspension information.",
  {
    league: positiveIntegerField("League ID."),
    season: seasonField,
    fixture: positiveIntegerField("Contest ID."),
    team: positiveIntegerField("Team ID."),
    player: positiveIntegerField("Player ID."),
    date: dateField,
    ids: fixtureIdsField,
    timezone: timezoneField,
  },
  { optional: ["league", "season", "fixture", "team", "player", "date", "ids", "timezone"] },
);
injuriesInputSchema.anyOf = [
  { required: ["fixture"] },
  { required: ["ids"] },
  { required: ["date"] },
  { required: ["league"] },
  { required: ["team"] },
  { required: ["player"] },
];

export const apiSportsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "football_list_leagues",
    description:
      "Query football leagues by league, country, season or search keyword and return the current available data coverage capabilities.",
    inputSchema: listLeaguesInputSchema,
    outputSchema: s.object("League list output.", {
      leagues: s.array("League list.", leagueSummarySchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "football_list_teams",
    description: "Search football teams by league, season, country, stadium or search keyword.",
    inputSchema: listTeamsInputSchema,
    outputSchema: s.object("Team list output.", {
      teams: s.array("Team list.", teamSummarySchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "football_list_players_profiles",
    description: "Search football player profiles by player ID, search keyword or pagination page number.",
    inputSchema: s.object(
      "Query input for player profile list.",
      {
        player: positiveIntegerField("Player ID."),
        search: s.string({ minLength: 3, description: "Player name search keyword." }),
        page: pageField,
      },
      { optional: ["player", "search", "page"] },
    ),
    outputSchema: s.object("Player profile list output.", {
      players: s.array("List of player profiles.", playerProfileSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "football_list_fixtures",
    description: "Check football schedules and scores by game, league, team, date, live status or time range.",
    inputSchema: listFixturesInputSchema,
    outputSchema: s.object("Match list output.", {
      fixtures: s.array("Competition list.", fixtureSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "football_get_standings",
    description:
      "Query the football standings for a specified season, and the results can be converged by league or team.",
    inputSchema: standingsInputSchema,
    outputSchema: s.object("Scoreboard output.", {
      league: fixtureLeagueSchema,
      tables: s.array("Scoreboard list.", s.array("Single standings grouping.", standingRowSchema)),
    }),
  }),
  defineProviderAction(service, {
    name: "football_get_fixture_events",
    description:
      "Query the event stream for a specified football match, such as goals, red and yellow cards, substitutions, and VAR.",
    inputSchema: fixtureFilterInputSchema,
    outputSchema: s.object("Match event output.", {
      events: s.array("List of match events.", eventSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "football_get_fixture_lineups",
    description:
      "Query the lineup, formation, starting lineup, substitutes and coaching information for a specified football game.",
    inputSchema: fixtureFilterInputSchema,
    outputSchema: s.object("Match lineup output.", {
      lineups: s.array("Match lineup list.", lineupSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "football_get_fixture_statistics",
    description:
      "Query the technical statistics of the specified football match, optionally returning the statistics of the first and second halves.",
    inputSchema: fixtureStatisticsInputSchema,
    outputSchema: s.object("Match statistics output.", {
      statistics: s.array("List of match statistics.", fixtureStatisticsSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "football_get_team_statistics",
    description: "Query the overall statistical performance of a specified team in a certain league season.",
    inputSchema: s.object(
      "Query input for team season statistics.",
      {
        league: positiveIntegerField("League ID."),
        season: seasonField,
        team: positiveIntegerField("Team ID."),
        date: dateField,
      },
      { required: ["league", "season", "team"], optional: ["date"] },
    ),
    outputSchema: s.object("Team season statistics output.", {
      teamStatistics: s.unknownObject("Team season statistics object."),
    }),
  }),
  defineProviderAction(service, {
    name: "football_list_team_squad",
    description: "Query the current lineup of the specified team.",
    inputSchema: s.object(
      "Input to query the team's current lineup.",
      { team: positiveIntegerField("Team ID.") },
      { required: ["team"] },
    ),
    outputSchema: s.object("Team lineup output.", {
      squad: s.array("Team lineup list.", squadPlayerSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "football_list_players_statistics",
    description: "Query player season statistics by player, team or league, support paging and search.",
    inputSchema: playersStatisticsInputSchema,
    outputSchema: s.object("Player season statistics list output.", {
      players: s.array("List of player season statistics.", playerStatisticsResultSchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "football_list_top_scorers",
    description: "Query the scorer list of the specified league season.",
    inputSchema: s.object(
      "Query the input of the league's scorer list.",
      {
        league: positiveIntegerField("League ID."),
        season: seasonField,
      },
      { required: ["league", "season"] },
    ),
    outputSchema: s.object("Scorer output.", {
      players: s.array("Scorer list of players.", playerStatisticsResultSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "football_list_injuries",
    description: "Check football injury information by game, league, team, player or date.",
    inputSchema: injuriesInputSchema,
    outputSchema: s.object("Injury list output.", {
      injuries: s.array("Injury list.", injurySchema),
      pagination: paginationSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "football_get_predictions",
    description: "Check official predictions and recommendations for selected football matches.",
    inputSchema: s.object(
      "Input for querying match predictions.",
      { fixture: positiveIntegerField("Contest ID.") },
      { required: ["fixture"] },
    ),
    outputSchema: s.object("Match prediction output.", {
      prediction: s.unknownObject("Match prediction object."),
    }),
  }),
];

export type ApiSportsActionName = (typeof apiSportsActions)[number]["name"];
