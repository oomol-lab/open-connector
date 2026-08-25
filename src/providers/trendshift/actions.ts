import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "trendshift";

const dateSchema = s.date("A calendar date in YYYY-MM-DD format.");
const languageSchema = s.nonEmptyString("A repository language filter, or all to include every language.");
const cursorSchema = s.nonEmptyString("The opaque cursor returned by the previous page.");
const limitSchema = s.integer("The maximum number of repositories to return per page.", {
  minimum: 1,
  maximum: 100,
});
const yearSchema = s.integer("The calendar year, from 1 through 9999.", { minimum: 1, maximum: 9999 });
const monthSchema = s.integer("The calendar month, from 1 through 12.", { minimum: 1, maximum: 12 });
const weekSchema = s.integer("The ISO 8601 week number, from 1 through 53.", { minimum: 1, maximum: 53 });

const trendingRepositorySchema = s.object("A repository in a Trendshift trending list.", {
  id: s.integer("Trendshift's internal repository identifier."),
  ghr_id: s.integer("The GitHub repository identifier."),
  full_name: s.string("The GitHub repository name in owner/repository form."),
  language: s.string("The repository's primary language as reported by GitHub."),
  stars_now: s.integer("The repository's total star count at query time."),
  forks_now: s.integer("The repository's total fork count at query time."),
  stars_gained: s.integer("The stars gained during the ranking period."),
  forks_gained: s.integer("The forks gained during the ranking period."),
  score: s.integer("Trendshift's trending score for the period."),
});

const trendingOutputSchema = s.object("A cursor-paginated Trendshift trending list.", {
  data: s.nullable(s.array("The ranked repositories, or null when unavailable.", trendingRepositorySchema)),
  next_cursor: s.nullableString("The cursor for the next page, or null at the end."),
});

const githubTrendingRepositorySchema = s.object("A repository in a captured GitHub Trending list.", {
  rank: s.integer("GitHub's rank for the repository in the captured list."),
  id: s.integer("Trendshift's internal repository identifier."),
  ghr_id: s.integer("The GitHub repository identifier."),
  full_name: s.string("The GitHub repository name in owner/repository form."),
  language: s.string("The repository's primary language as reported by GitHub."),
  stars_now: s.integer("The repository's total star count at query time."),
  forks_now: s.integer("The repository's total fork count at query time."),
});

const githubTrendingOutputSchema = s.object("A captured GitHub Trending list.", {
  trend_date: s.nullableString("The local scrape date in YYYY-MM-DD format."),
  language: s.nullableString("The lowercased list language, or null for all languages."),
  data: s.nullable(s.array("The repositories in GitHub's captured rank order.", githubTrendingRepositorySchema)),
});

const listTrendingInputSchema = s.object(
  "Filters and pagination for the current Trendshift ranking period.",
  { language: languageSchema, limit: limitSchema, cursor: cursorSchema },
  { optional: ["language", "limit", "cursor"] },
);

const datedTrendingInputSchema = s.object(
  "The date, filters, and pagination for a historical daily Trendshift ranking.",
  { date: dateSchema, language: languageSchema, limit: limitSchema, cursor: cursorSchema },
  { optional: ["language", "limit", "cursor"] },
);

const engagementSpikesInputSchema = s.object(
  "Filters and pagination for finding Trendshift engagement spikes.",
  {
    metric: s.stringEnum("The engagement metric used to rank repositories.", [
      "stars",
      "forks",
      "merged_prs",
      "issues",
      "closed_issues",
    ]),
    minGain: s.nonNegativeInteger("The inclusive minimum engagement gain."),
    maxGain: s.nonNegativeInteger("The inclusive maximum engagement gain."),
    startDate: dateSchema,
    endDate: dateSchema,
    limit: limitSchema,
    cursor: cursorSchema,
  },
  { optional: ["minGain", "maxGain", "startDate", "endDate", "limit", "cursor"] },
);

function listTrendingAction(name: string, period: string): ActionDefinition {
  return defineProviderAction(service, {
    name,
    description: `List repositories in Trendshift's current ${period} trending ranking.`,
    inputSchema: listTrendingInputSchema,
    outputSchema: trendingOutputSchema,
  });
}

export const trendshiftActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_engagement_spikes",
    description: "List repositories whose engagement increased within a requested date window.",
    inputSchema: engagementSpikesInputSchema,
    outputSchema: s.object("A cursor-paginated list of repository engagement spikes.", {
      data: s.nullable(
        s.array(
          "The repositories ranked by engagement gain, or null when unavailable.",
          s.object("A repository whose engagement increased in the requested window.", {
            id: s.integer("Trendshift's internal repository identifier."),
            full_name: s.string("The GitHub repository name in owner/repository form."),
            ghr_id: s.integer("The GitHub repository identifier."),
            gain: s.integer("The engagement gain during the requested window."),
          }),
        ),
      ),
      next_cursor: s.nullableString("The cursor for the next page, or null at the end."),
    }),
  }),
  listTrendingAction("list_trending_daily", "daily"),
  defineProviderAction(service, {
    name: "get_trending_daily_by_date",
    description: "Get Trendshift's daily trending ranking for a specific UTC date.",
    inputSchema: datedTrendingInputSchema,
    outputSchema: trendingOutputSchema,
  }),
  listTrendingAction("list_trending_weekly", "weekly"),
  defineProviderAction(service, {
    name: "get_trending_weekly_by_period",
    description: "Get Trendshift's trending ranking for a specific ISO year and week.",
    inputSchema: s.object(
      "The ISO week, filters, and pagination for a historical weekly ranking.",
      { year: yearSchema, week: weekSchema, language: languageSchema, limit: limitSchema, cursor: cursorSchema },
      { optional: ["language", "limit", "cursor"] },
    ),
    outputSchema: trendingOutputSchema,
  }),
  listTrendingAction("list_trending_monthly", "monthly"),
  defineProviderAction(service, {
    name: "get_trending_monthly_by_period",
    description: "Get Trendshift's trending ranking for a specific calendar year and month.",
    inputSchema: s.object(
      "The month, filters, and pagination for a historical monthly ranking.",
      { year: yearSchema, month: monthSchema, language: languageSchema, limit: limitSchema, cursor: cursorSchema },
      { optional: ["language", "limit", "cursor"] },
    ),
    outputSchema: trendingOutputSchema,
  }),
  listTrendingAction("list_trending_yearly", "yearly"),
  defineProviderAction(service, {
    name: "get_trending_yearly_by_period",
    description: "Get Trendshift's trending ranking for a specific calendar year.",
    inputSchema: s.object(
      "The year, filters, and pagination for a historical yearly ranking.",
      { year: yearSchema, language: languageSchema, limit: limitSchema, cursor: cursorSchema },
      { optional: ["language", "limit", "cursor"] },
    ),
    outputSchema: trendingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_github_trending",
    description: "Get Trendshift's latest captured GitHub Trending list.",
    inputSchema: s.object(
      "The optional language for the latest captured GitHub Trending list.",
      { language: languageSchema },
      { optional: ["language"] },
    ),
    outputSchema: githubTrendingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_github_trending_by_date",
    description: "Get Trendshift's captured GitHub Trending list for a specific scrape date.",
    inputSchema: s.object(
      "The scrape date and optional language for a captured GitHub Trending list.",
      { date: dateSchema, language: languageSchema },
      { optional: ["language"] },
    ),
    outputSchema: githubTrendingOutputSchema,
  }),
];
