import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "football_charts";

const league = s.string(
  "Competition key returned by list_leagues, such as premier, spain1, germany1, brazil1, sweden1 or wgermany1.",
  { pattern: "^[a-z0-9_-]+$" },
);
const season = s.string(
  "Season identifier returned by list_leagues, such as 2026-2027 for winter-calendar leagues or 2026 for summer-calendar leagues. Omit for the current season.",
  { pattern: "^\\d{4}(-\\d{4})?$" },
);
const teamFilter = s.nonWhitespaceString(
  "Case-insensitive team name substring used to filter rows, such as Arsenal or Flamengo.",
);
const teamSlug = s.string("Lowercase hyphenated team slug within the league, such as arsenal or manchester-city.", {
  pattern: "^[a-z0-9-]+$",
});
const matchSlug = s.string(
  "Match slug in country/league-slug/YYYY-MM-DD-home-vs-away format, as returned by get_fixtures.",
  { pattern: "^[a-z0-9-]+/[a-z0-9-]+/\\d{4}-\\d{2}-\\d{2}-[a-z0-9-]+$" },
);
const tableView = s.stringEnum(
  "Table ordering mode: classic (points), luck (points minus expected points), or goals (goals scored).",
  ["classic", "luck", "goals"],
  { default: "classic" },
);

const attributionFields = {
  attribution: s.nullableString("Data attribution notice."),
  source_url: s.nullableString("Canonical football-charts.com page displaying the same dataset."),
};

const seasonContextFields = {
  league: s.string("The competition key."),
  season: s.string("The resolved season identifier."),
  season_state: s.nullableString("Whether the season is in_season or finished."),
  current_season: s.nullableString("The current season identifier for the league."),
};

const tableRowSchema = s.looseObject("One team standings row.", {
  team: s.string("Team display name."),
  position: s.nullableInteger("Current table position."),
  played: s.nullableInteger("Matches played."),
  won: s.nullableInteger("Matches won."),
  drawn: s.nullableInteger("Matches drawn."),
  lost: s.nullableInteger("Matches lost."),
  goals_for: s.nullableInteger("Goals scored."),
  goals_against: s.nullableInteger("Goals conceded."),
  goal_difference: s.nullableInteger("Goal difference."),
  points: s.nullableInteger("Total points."),
  last_5_form: s.nullableString("Five-match form string, such as WWDLW."),
  last_5_points: s.nullableInteger("Points earned across the last five matches."),
  expected_points: s.nullableNumber("Expected points estimated from underlying performance."),
  luck_difference: s.nullableNumber("Actual points minus expected points."),
  luck_category: s.nullableString("Performance classification: lucky, fair, or unlucky."),
  expected_position: s.nullableInteger("Table rank ordered by expected points."),
});

const probabilitiesSchema = s.looseObject(
  "Calibrated model probabilities in the 0 to 1 range. Draw probability equals 1 minus home minus away.",
  {
    home: s.nullableNumber("Home win probability."),
    away: s.nullableNumber("Away win probability."),
    btts_yes: s.nullableNumber("Both teams to score probability."),
    "over_0.5": s.nullableNumber("Probability of more than 0.5 total goals."),
    "over_1.5": s.nullableNumber("Probability of more than 1.5 total goals."),
    "over_2.5": s.nullableNumber("Probability of more than 2.5 total goals."),
    "over_3.5": s.nullableNumber("Probability of more than 3.5 total goals."),
    "over_4.5": s.nullableNumber("Probability of more than 4.5 total goals."),
    "ht_over_0.5": s.nullableNumber("Probability of more than 0.5 first-half goals."),
    "ht_over_1.5": s.nullableNumber("Probability of more than 1.5 first-half goals."),
    expected_home_goals: s.nullableNumber("Expected goals for the home side."),
    expected_away_goals: s.nullableNumber("Expected goals for the away side."),
    expected_ht_goals: s.nullableNumber("Expected first-half goals."),
  },
);

const modelPredictionsSchema = s.nullable(
  s.looseObject("Dixon-Coles baseline model output.", {
    dc_v2: s.nullable(
      s.looseObject("Dixon-Coles v2 model block.", {
        model: s.nullableString("Model version identifier."),
        calibrated: s.nullable(probabilitiesSchema),
        data_through: s.nullableString("Last match date included in the model fit."),
        computed_at: s.nullableString("Timestamp when probabilities were computed."),
      }),
    ),
  }),
);

function action(
  name: string,
  description: string,
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
): ActionDefinition {
  return defineProviderAction(service, {
    name,
    operationType: "read",
    description,
    requiredScopes: [],
    inputSchema,
    outputSchema,
  });
}

export const footballChartsActions: ActionDefinition[] = [
  action(
    "list_leagues",
    "List all 98 football leagues covered across 44 countries with their competition key, display name, country, and available season strings.",
    s.actionInput({}, [], "No parameters required."),
    s.looseObject("Covered football leagues and available seasons.", {
      count: s.integer("Number of leagues returned."),
      season_window: s.nullableString("Season coverage window for the active tier."),
      leagues: s.array(
        "Covered competitions ordered by key.",
        s.looseObject("One league entry.", {
          league: s.string("Competition key passed to other actions."),
          name: s.string("Competition display name."),
          country: s.string("Country or confederation name."),
          seasons: s.array("Available season strings, newest first.", s.string("Season identifier.")),
          url: s.nullableString("Canonical league hub page on football-charts.com."),
        }),
      ),
      ...attributionFields,
    }),
  ),
  action(
    "get_league_table",
    "Get the standings table for a league season, including form, expected points, luck category, and goal averages. Supports ordering by points (classic), over/under-performance (luck), or goals scored (goals).",
    s.actionInput(
      { league, season, view: tableView },
      ["league"],
      "The league key, optional season string, and optional ordering view.",
    ),
    s.looseObject("League standings table.", {
      ...seasonContextFields,
      view: s.string("The applied table ordering mode."),
      table: s.array("Standings rows in rank order.", tableRowSchema),
      ...attributionFields,
    }),
  ),
  action(
    "get_results",
    "Get finished matches for a league season in chronological order with full-time and half-time scores, first-goal minute, and kickoff timestamps. Optionally filter by team name substring.",
    s.actionInput(
      { league, season, team: teamFilter },
      ["league"],
      "The league key and optional season and team substring filter.",
    ),
    s.looseObject("Finished matches for the league season.", {
      ...seasonContextFields,
      count: s.integer("Number of finished matches returned."),
      matches: s.array(
        "Finished matches.",
        s.looseObject("One completed match.", {
          date: s.nullableString("Match date in YYYY-MM-DD format (UTC)."),
          time: s.nullableString("Kickoff time in HH:MM format (UTC)."),
          kickoff_utc: s.nullableString("ISO 8601 UTC kickoff timestamp."),
          homeTeam: s.string("Home team name."),
          awayTeam: s.string("Away team name."),
          score: s.nullableString("Full-time score formatted as home:away."),
          ht_result: s.nullableString("Half-time score formatted as home:away."),
          first_goal_time: s.nullableInteger("Minute of the first goal, or null if goalless."),
          first_goal_time_extra: s.nullableInteger("Stoppage-time minutes on the first goal."),
          goalless: s.nullableBoolean("Whether the match finished 0:0."),
        }),
      ),
      ...attributionFields,
    }),
  ),
  action(
    "get_fixtures",
    "Get upcoming fixtures for a league with kickoff times, match slugs, and calibrated Dixon-Coles model probabilities across match result, over/under goal lines, and both-teams-to-score markets.",
    s.actionInput({ league }, ["league"], "The league key to query."),
    s.looseObject("Upcoming fixtures and calibrated probabilities.", {
      league: s.string("The competition key."),
      count: s.integer("Number of upcoming fixtures in the active window."),
      note: s.nullableString("Explanation when no fixtures are scheduled in the immediate window."),
      next_fixture_date: s.nullableString("Next scheduled fixture date when the immediate window is empty."),
      matches: s.array(
        "Upcoming matches ordered by kickoff time.",
        s.looseObject("One scheduled fixture.", {
          slug: s.string("Match slug accepted by get_match."),
          home_team: s.string("Home team name."),
          away_team: s.string("Away team name."),
          match_date: s.nullableString("Scheduled date in YYYY-MM-DD format (UTC)."),
          time: s.nullableString("Scheduled kickoff time in HH:MM format (UTC)."),
          status: s.nullableString("Match status code."),
          league: s.nullableString("Competition key."),
          country: s.nullableString("Country name."),
          real_league_name: s.nullableString("Competition display name."),
          model_predictions: modelPredictionsSchema,
          url: s.nullableString("Canonical match prediction page URL."),
        }),
      ),
      ...attributionFields,
    }),
  ),
  action(
    "get_season_projection",
    "Get the daily 10,000-run Monte Carlo season projection for a league, returning each team's title, top-four, and relegation (bottom-three) probabilities, mean projected points, 10th-to-90th percentile points range, and finishing-position matrix.",
    s.actionInput({ league }, ["league"], "The league key to query."),
    s.looseObject("Monte Carlo season projection.", {
      projection: s.nullable(
        s.looseObject("Simulation summary and per-team probabilities.", {
          league: s.nullableString("Competition key."),
          season: s.nullableString("Projected season identifier."),
          run_date: s.nullableString("Simulation run date."),
          n_sims: s.nullableInteger("Number of Monte Carlo simulation runs."),
          scheduled_remaining: s.nullableInteger("Remaining scheduled fixtures."),
          expected_remaining: s.nullableInteger("Expected remaining fixtures in the season."),
          teams: s.record(
            "Projected outcomes keyed by team name.",
            s.looseObject("Projected outcomes for one team.", {
              title: s.nullableNumber("Probability of winning the league title (0 to 1)."),
              top4: s.nullableNumber("Probability of finishing in the top four (0 to 1)."),
              bottom3: s.nullableNumber("Probability of finishing in the bottom three (0 to 1)."),
              pts_now: s.nullableInteger("Current points."),
              played: s.nullableInteger("Matches played so far."),
              gd_now: s.nullableInteger("Current goal difference."),
              mean_pts: s.nullableNumber("Mean simulated final points."),
              p10_pts: s.nullableInteger("10th percentile final points."),
              p90_pts: s.nullableInteger("90th percentile final points."),
            }),
          ),
        }),
      ),
      ...attributionFields,
    }),
  ),
  action(
    "get_goal_timing",
    "Get goals scored across 15-minute match intervals (0-15 through 90+) for every team in a league season, including peak scoring periods, late-goal share, and first-half share. Optionally filter by team name substring.",
    s.actionInput(
      { league, season, team: teamFilter },
      ["league"],
      "The league key and optional season and team substring filter.",
    ),
    s.looseObject("Goal-timing distribution by team.", {
      league: s.nullableString("The competition key."),
      season: s.nullableString("The resolved season identifier."),
      time_bins: s.array("Ordered match interval labels.", s.string("Interval label.")),
      data: s.array(
        "Per-team goal timing rows.",
        s.looseObject("One team's goal timing distribution.", {
          team: s.string("Team display name."),
          total: s.nullableInteger("Total goals scored in the season."),
          bins: s.record("Goals scored per interval label.", s.number("Goal count.")),
          peak_bins: s.array("Interval label(s) with the highest goal count.", s.string("Interval label.")),
          peak_goals: s.nullableInteger("Goals scored in the peak interval(s)."),
          late_share_pct: s.nullableNumber("Percentage of goals scored from minute 75 onward."),
          first_half_pct: s.nullableNumber("Percentage of goals scored in the first half."),
        }),
      ),
      ...attributionFields,
    }),
  ),
  action(
    "list_teams",
    "List all teams competing in a league season in standings order with their slugs and summary records.",
    s.actionInput({ league, season }, ["league"], "The league key and optional season string."),
    s.looseObject("Teams competing in the league season.", {
      league: s.nullableString("The competition key."),
      season: s.nullableString("The resolved season identifier."),
      teams: s.array("Teams in the league season.", s.unknownObject("One team summary entry.")),
      ...attributionFields,
    }),
  ),
  action(
    "get_team",
    "Get a single team's season profile in a league, including its standings row, full match log, 15-minute goal-timing breakdown, first-goal distribution, and per-match statistical averages where covered.",
    s.actionInput(
      { league, team: teamSlug, season },
      ["league", "team"],
      "The league key, hyphenated team slug, and optional season string.",
    ),
    s.looseObject("Single team season profile.", {
      team: s.nullableString("Team display name."),
      slug: s.nullableString("Team slug."),
      league: s.nullableString("Competition key."),
      season: s.nullableString("Resolved season identifier."),
      ranking: s.nullable(tableRowSchema),
      matches: s.array("Team match log for the season.", s.unknownObject("One team match entry.")),
      ...attributionFields,
    }),
  ),
  action(
    "get_match",
    "Get full details and calibrated Dixon-Coles probabilities for one match identified by its slug (country/league-slug/YYYY-MM-DD-home-vs-away).",
    s.actionInput({ slug: matchSlug }, ["slug"], "The match slug from get_fixtures."),
    s.looseObject("Single match detail and probability breakdown.", {
      match: s.looseObject("Match details, scores, and model probabilities.", {
        slug: s.nullableString("Match slug."),
        league: s.nullableString("Competition key."),
        real_league_name: s.nullableString("Competition display name."),
        country: s.nullableString("Country name."),
        season: s.nullableString("Season identifier."),
        match_date: s.nullableString("Match date in YYYY-MM-DD format (UTC)."),
        time: s.nullableString("Kickoff time in HH:MM format (UTC)."),
        home_team: s.nullableString("Home team name."),
        away_team: s.nullableString("Away team name."),
        match_status: s.nullableString("Match status, such as scheduled or ft."),
        home_score: s.nullableInteger("Home team full-time goals."),
        away_score: s.nullableInteger("Away team full-time goals."),
        ht_result: s.nullableString("Half-time score."),
        model_predictions: modelPredictionsSchema,
      }),
      ...attributionFields,
    }),
  ),
  action(
    "get_track_record",
    "Get the public calibration track record of the Football Charts probability model over settled matches, including overall hit rate, Brier score, reliability buckets, and recent scored predictions.",
    s.actionInput(
      {
        days: s.positiveInteger("Lookback window in days (1 to 365). Defaults to 90.", {
          maximum: 365,
          default: 90,
        }),
      },
      [],
      "Optional lookback window in days.",
    ),
    s.looseObject("Public model calibration track record.", {
      track_record: s.unknownObject(
        "Aggregated calibration metrics, reliability buckets, and recent settled predictions.",
      ),
      ...attributionFields,
    }),
  ),
];
