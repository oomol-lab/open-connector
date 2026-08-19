import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "openfootball_worldcup";

const seasonSchema = s.integer("The World Cup season year to read from OpenFootball.", { minimum: 1930 });
const tournamentSchema = s.object("The OpenFootball tournament wrapper.", {
  name: s.string("The tournament name returned by OpenFootball."),
});

const goalSchema = s.looseObject("A goal entry returned by OpenFootball.", {
  name: s.string("The scorer name."),
  minute: s.string("The goal minute."),
  penalty: s.boolean("Whether the goal was a penalty."),
  owngoal: s.boolean("Whether the goal was an own goal."),
});

const matchSchema = s.looseObject("A World Cup match returned by OpenFootball.", {
  round: s.string("The match round or matchday."),
  date: s.date("The match date."),
  time: s.string("The local or UTC-offset match time."),
  team1: s.string("The first team name."),
  team2: s.string("The second team name."),
  group: s.string("The group name when this is a group-stage match."),
  ground: s.string("The host city or ground label."),
  goals1: s.array("The goals scored by the first team.", goalSchema),
  goals2: s.array("The goals scored by the second team.", goalSchema),
});

const groupSchema = s.object("A World Cup group returned by OpenFootball.", {
  name: s.string("The group name."),
  teams: s.array("The teams in the group.", s.string("One team name.")),
});

const teamSchema = s.looseObject("A World Cup team returned by OpenFootball.", {
  name: s.string("The team name."),
  fifa_code: s.string("The FIFA team code."),
  group: s.string("The group letter."),
  confed: s.string("The confederation code."),
  continent: s.string("The continent name."),
});

const stadiumSchema = s.looseObject("A World Cup stadium returned by OpenFootball.", {
  city: s.string("The host city label."),
  timezone: s.string("The city timezone label."),
  cc: s.string("The lowercase country code."),
  name: s.string("The stadium name."),
  capacity: s.integer("The stadium capacity."),
  coords: s.string("The stadium coordinates."),
});

const squadSchema = s.looseObject("A World Cup squad returned by OpenFootball.", {
  name: s.string("The team name."),
  fifa_code: s.string("The FIFA team code."),
  group: s.string("The group letter."),
  players: s.array("The squad players returned by OpenFootball.", s.looseObject("One squad player.")),
});

const inputSchema = s.object(
  "The input payload for reading an OpenFootball World Cup dataset.",
  {
    season: seasonSchema,
  },
  { required: ["season"] },
);

export const openfootballWorldcupActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_matches",
    description:
      "List World Cup matches from the public OpenFootball JSON dataset. This community dataset is not a real-time or official results source.",
    requiredScopes: [],
    inputSchema,
    outputSchema: s.object("The OpenFootball World Cup matches response.", {
      tournament: tournamentSchema,
      matches: s.array("The matches returned by OpenFootball.", matchSchema),
      sourceUrl: s.url("The source URL used to fetch the dataset."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_groups",
    description: "List World Cup groups from the public OpenFootball JSON dataset.",
    requiredScopes: [],
    inputSchema,
    outputSchema: s.object("The OpenFootball World Cup groups response.", {
      tournament: tournamentSchema,
      groups: s.array("The groups returned by OpenFootball.", groupSchema),
      sourceUrl: s.url("The source URL used to fetch the dataset."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_teams",
    description: "List World Cup teams from the public OpenFootball JSON dataset.",
    requiredScopes: [],
    inputSchema,
    outputSchema: s.object("The OpenFootball World Cup teams response.", {
      teams: s.array("The teams returned by OpenFootball.", teamSchema),
      sourceUrl: s.url("The source URL used to fetch the dataset."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_stadiums",
    description: "List World Cup stadiums from the public OpenFootball JSON dataset.",
    requiredScopes: [],
    inputSchema,
    outputSchema: s.object("The OpenFootball World Cup stadiums response.", {
      tournament: tournamentSchema,
      stadiums: s.array("The stadiums returned by OpenFootball.", stadiumSchema),
      sourceUrl: s.url("The source URL used to fetch the dataset."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_squads",
    description: "List World Cup squads from the public OpenFootball JSON dataset when a season publishes squad files.",
    requiredScopes: [],
    inputSchema,
    outputSchema: s.object("The OpenFootball World Cup squads response.", {
      squads: s.array("The squads returned by OpenFootball.", squadSchema),
      sourceUrl: s.url("The source URL used to fetch the dataset."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_qualification_playoffs",
    description:
      "List World Cup qualification playoff matches from the public OpenFootball JSON dataset when a season publishes playoff files.",
    requiredScopes: [],
    inputSchema,
    outputSchema: s.object("The OpenFootball World Cup qualification playoffs response.", {
      tournament: tournamentSchema,
      matches: s.array("The qualification playoff matches returned by OpenFootball.", matchSchema),
      sourceUrl: s.url("The source URL used to fetch the dataset."),
    }),
  }),
];
