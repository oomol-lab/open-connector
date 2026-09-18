import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ossinsight";

export type OssinsightActionName =
  | "list_collections"
  | "list_hot_collections"
  | "list_collection_repos"
  | "rank_collection_repos_by_stars"
  | "rank_collection_repos_by_pull_requests"
  | "rank_collection_repos_by_issues"
  | "list_trending_repos"
  | "list_issue_creators"
  | "list_issue_creator_countries"
  | "list_issue_creator_organizations"
  | "get_issue_creators_history"
  | "list_pull_request_creators"
  | "list_pull_request_creator_countries"
  | "list_pull_request_creator_organizations"
  | "get_pull_request_creators_history"
  | "list_stargazer_countries"
  | "list_stargazer_organizations"
  | "get_stargazers_history";

interface OssinsightActionDefinition {
  name: OssinsightActionName;
  operationType: ActionDefinition["operationType"];
  description: string;
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
}

const noInputSchema = s.actionInput({}, [], "No input parameters are required for this action.");
const nonEmptyString = (description: string): JsonSchema => s.nonEmptyString(description);
const dateString = (description: string, defaultValue: string): JsonSchema =>
  s.string({ format: "date", description, default: defaultValue });

const collectionIdSchema = s.anyOf("The OSS Insight collection ID.", [
  s.nonEmptyString("The OSS Insight collection ID as a string."),
  s.integer("The OSS Insight collection ID as a number."),
]);
const trendPeriodSchema = s.stringEnum("The time period used to calculate trending repositories.", [
  "past_24_hours",
  "past_week",
  "past_month",
]);
const historyIntervalSchema = s.stringEnum("The time interval of the returned history points.", [
  "day",
  "week",
  "month",
]);
const collectionRankingPeriodSchema = s.nonEmptyString(
  "The OSS Insight collection ranking period, such as past_7_days or past_28_days.",
  { default: "past_28_days" },
);
const creatorSortSchema = s.nonEmptyString("The OSS Insight sort option for the creator list endpoint.");

const repoInputFields: Record<string, JsonSchema> = {
  owner: nonEmptyString("The owner of the GitHub repository."),
  repo: nonEmptyString("The name of the GitHub repository."),
};
const timeRangeInputFields: Record<string, JsonSchema> = {
  from: dateString("The start date of the time range.", "2000-01-01"),
  to: dateString("The end date of the time range.", "2099-01-01"),
};
const excludeUnknownInputFields: Record<string, JsonSchema> = {
  exclude_unknown: s.boolean({
    default: true,
    description: "Whether to exclude rows with unknown country or organization information.",
  }),
};
const paginationInputFields: Record<string, JsonSchema> = {
  page: s.positiveInteger("The 1-based page number to fetch.", { default: 1 }),
  page_size: s.positiveInteger("The number of rows to fetch per page.", { default: 30 }),
};

const sqlColumnSchema = s.object("A column descriptor from the OSS Insight SQL endpoint response.", {
  col: s.string("The column name returned by OSS Insight."),
  data_type: s.string("The SQL data type of the column."),
  nullable: s.boolean("Whether the column can be null."),
});
const sqlResultSchema = s.object("Execution metadata returned by OSS Insight.", {
  code: s.integer("The OSS Insight result code."),
  message: s.string("The OSS Insight result message."),
  start_ms: s.number("The query start timestamp in milliseconds."),
  end_ms: s.number("The query end timestamp in milliseconds."),
  latency: s.string("The query latency text returned by OSS Insight."),
  row_count: s.integer("The number of rows returned."),
  row_affect: s.integer("The number of affected rows."),
  limit: s.integer("The row limit applied by OSS Insight."),
});
const sqlMetadataSchema = s.object("SQL metadata returned by OSS Insight.", {
  columns: s.array("The SQL columns returned by the upstream endpoint.", sqlColumnSchema),
  result: sqlResultSchema,
});

const collectionSchema = s.object("One OSS Insight collection.", {
  id: s.string("The OSS Insight collection ID."),
  name: s.string("The OSS Insight collection name."),
});
const hotCollectionSchema = s.object("One hot OSS Insight collection row.", {
  id: s.string("The OSS Insight collection ID."),
  name: s.string("The OSS Insight collection name."),
  repos: s.nullableInteger("The number of repositories in the collection."),
  repo_id: s.string("The GitHub repository ID for the representative hot repo."),
  repo_name: s.string("The representative hot repository name in owner/repo format."),
  repo_current_period_rank: s.nullableInteger("The repository rank in the current period."),
  repo_past_period_rank: s.nullableInteger("The repository rank in the previous period."),
  repo_rank_changes: s.nullableInteger("The repository rank change between periods."),
});
const collectionRepositorySchema = s.object("One repository in an OSS Insight collection.", {
  repo_id: s.string("The GitHub repository ID."),
  repo_name: s.string("The repository name in owner/repo format."),
});
const collectionRankingSchema = s.object("One repository ranking row in an OSS Insight collection.", {
  repo_id: s.string("The GitHub repository ID."),
  repo_name: s.string("The repository name in owner/repo format."),
  current_period_growth: s.integer("The metric growth in the current period."),
  current_period_rank: s.integer("The repository rank in the current period."),
  past_period_growth: s.integer("The metric growth in the previous period."),
  past_period_rank: s.integer("The repository rank in the previous period."),
  growth_pop: s.number("The period-over-period metric growth percentage."),
  rank_pop: s.integer("The period-over-period rank change."),
  total: s.integer("The repository total metric value."),
});
const trendingRepositorySchema = s.object("One trending GitHub repository returned by OSS Insight.", {
  repo_id: s.string("The GitHub repository ID."),
  repo_name: s.string("The full repository name in owner/repo format."),
  primary_language: s.nullableString("The repository primary programming language, or null when unknown."),
  description: s.nullableString("The repository description, or null when not available."),
  stars: s.nullableInteger("The repository star count."),
  forks: s.nullableInteger("The repository fork count."),
  pull_requests: s.nullableInteger("The number of pull requests used by the trending score."),
  pushes: s.nullableInteger("The number of pushes used by the trending score."),
  total_score: s.nullableNumber("The OSS Insight trending score."),
  contributor_logins: s.stringArray("Contributor logins returned by OSS Insight.", {
    itemDescription: "A GitHub login that contributed during the trend window.",
  }),
  collection_names: s.stringArray("OSS Insight collection names returned for the repository.", {
    itemDescription: "A collection name associated with the repository.",
  }),
});
const stargazerCountrySchema = s.object("One stargazer country or region row returned by OSS Insight.", {
  country_code: s.nullableString("The country or region code of stargazers, or null when unknown."),
  stargazers: s.integer("The number of stargazers in this country or region."),
  percentage: s.nullableNumber("The share of stargazers represented by this country or region."),
});
const stargazerOrganizationSchema = s.object("One stargazer organization row returned by OSS Insight.", {
  org_name: s.nullableString("The GitHub organization name, or null when unknown."),
  stargazers: s.integer("The number of stargazers in this organization."),
  percentage: s.nullableNumber("The share of stargazers represented by this organization."),
});
const stargazerHistoryPointSchema = s.object("One stargazer history point returned by OSS Insight.", {
  date: s.string("The history point date returned by OSS Insight."),
  stargazers: s.integer("The cumulative stargazer count for the date."),
});
const issueCreatorSchema = s.object("One issue creator row returned by OSS Insight.", {
  id: s.string("The GitHub user ID."),
  login: s.string("The GitHub login."),
  name: s.nullableString("The GitHub user display name, or null when unknown."),
  issues: s.nullableInteger("The number of issues created by this user."),
  first_issue_opened_at: s.nullableString("The first issue open timestamp for this user."),
});
const issueCreatorCountrySchema = s.object("One issue creator country or region row returned by OSS Insight.", {
  country_code: s.nullableString("The country or region code of issue creators, or null when unknown."),
  issue_creators: s.integer("The number of issue creators in this country or region."),
  percentage: s.nullableNumber("The share of issue creators represented by this country or region."),
});
const issueCreatorOrganizationSchema = s.object("One issue creator organization row returned by OSS Insight.", {
  org_name: s.nullableString("The GitHub organization name, or null when unknown."),
  issue_creators: s.integer("The number of issue creators in this organization."),
  percentage: s.nullableNumber("The share of issue creators represented by this organization."),
});
const issueCreatorHistoryPointSchema = s.object("One issue creator history point returned by OSS Insight.", {
  date: s.string("The history point date returned by OSS Insight."),
  issue_creators: s.integer("The cumulative issue creator count for the date."),
});
const pullRequestCreatorSchema = s.object("One pull request creator row returned by OSS Insight.", {
  id: s.string("The GitHub user ID."),
  login: s.string("The GitHub login."),
  name: s.nullableString("The GitHub user display name, or null when unknown."),
  prs: s.nullableInteger("The number of pull requests created by this user."),
  first_pr_opened_at: s.nullableString("The first pull request open timestamp for this user."),
  first_pr_merged_at: s.nullableString("The first pull request merge timestamp for this user."),
});
const pullRequestCreatorCountrySchema = s.object(
  "One pull request creator country or region row returned by OSS Insight.",
  {
    country_code: s.nullableString("The country or region code of pull request creators, or null when unknown."),
    pull_request_creators: s.integer("The number of pull request creators in this country or region."),
    percentage: s.nullableNumber("The share of pull request creators represented by this country or region."),
  },
);
const pullRequestCreatorOrganizationSchema = s.object(
  "One pull request creator organization row returned by OSS Insight.",
  {
    org_name: s.nullableString("The GitHub organization name, or null when unknown."),
    pull_request_creators: s.integer("The number of pull request creators in this organization."),
    percentage: s.nullableNumber("The share of pull request creators represented by this organization."),
  },
);
const pullRequestCreatorHistoryPointSchema = s.object(
  "One pull request creator history point returned by OSS Insight.",
  {
    date: s.string("The history point date returned by OSS Insight."),
    pull_request_creators: s.integer("The cumulative pull request creator count for the date."),
  },
);

const actions: OssinsightActionDefinition[] = [
  {
    name: "list_collections",
    operationType: "read",
    description: "List all OSS Insight repository collections.",
    inputSchema: noInputSchema,
    outputSchema: collectionsOutputSchema(collectionSchema, "Collections returned by OSS Insight."),
  },
  {
    name: "list_hot_collections",
    operationType: "read",
    description: "List hot OSS Insight collections with representative repositories.",
    inputSchema: noInputSchema,
    outputSchema: collectionsOutputSchema(hotCollectionSchema, "Hot collections returned by OSS Insight."),
  },
  {
    name: "list_collection_repos",
    operationType: "read",
    description: "List repositories in an OSS Insight collection.",
    inputSchema: s.actionInput(
      { collection_id: collectionIdSchema },
      ["collection_id"],
      "The input payload for this action.",
    ),
    outputSchema: s.actionOutput({
      repositories: s.array("Repositories returned by OSS Insight.", collectionRepositorySchema),
      metadata: sqlMetadataSchema,
    }),
  },
  {
    name: "rank_collection_repos_by_stars",
    operationType: "write",
    description: "Rank repositories in an OSS Insight collection by star growth.",
    inputSchema: collectionRankingInputSchema(),
    outputSchema: collectionRankingOutputSchema("Repository star-growth rankings returned by OSS Insight."),
  },
  {
    name: "rank_collection_repos_by_pull_requests",
    operationType: "write",
    description: "Rank repositories in an OSS Insight collection by pull request growth.",
    inputSchema: collectionRankingInputSchema(),
    outputSchema: collectionRankingOutputSchema("Repository pull-request-growth rankings returned by OSS Insight."),
  },
  {
    name: "rank_collection_repos_by_issues",
    operationType: "write",
    description: "Rank repositories in an OSS Insight collection by issue growth.",
    inputSchema: collectionRankingInputSchema(),
    outputSchema: collectionRankingOutputSchema("Repository issue-growth rankings returned by OSS Insight."),
  },
  {
    name: "list_trending_repos",
    operationType: "read",
    description: "List recently trending GitHub repositories from OSS Insight.",
    inputSchema: s.object(
      "The input payload for this action.",
      {
        period: withDefault(trendPeriodSchema, "past_24_hours"),
        language: s.nonEmptyString("The programming language filter. Use All to include every language.", {
          default: "All",
        }),
      },
      { optional: ["period", "language"] },
    ),
    outputSchema: s.actionOutput({
      repositories: s.array("Trending repositories returned by OSS Insight.", trendingRepositorySchema),
      metadata: sqlMetadataSchema,
    }),
  },
  {
    name: "list_issue_creators",
    operationType: "read",
    description: "List issue creators for a GitHub repository.",
    inputSchema: creatorListInputSchema("issues-desc"),
    outputSchema: s.actionOutput({
      creators: s.array("Issue creators returned by OSS Insight.", issueCreatorSchema),
      metadata: sqlMetadataSchema,
    }),
  },
  {
    name: "list_issue_creator_countries",
    operationType: "read",
    description: "List countries or regions of issue creators for a GitHub repository.",
    inputSchema: repoAnalysisInputSchema(),
    outputSchema: s.actionOutput({
      countries: s.array("Issue creator countries or regions returned by OSS Insight.", issueCreatorCountrySchema),
      metadata: sqlMetadataSchema,
    }),
  },
  {
    name: "list_issue_creator_organizations",
    operationType: "read",
    description: "List organizations of issue creators for a GitHub repository.",
    inputSchema: repoAnalysisInputSchema(),
    outputSchema: s.actionOutput({
      organizations: s.array("Issue creator organizations returned by OSS Insight.", issueCreatorOrganizationSchema),
      metadata: sqlMetadataSchema,
    }),
  },
  {
    name: "get_issue_creators_history",
    operationType: "read",
    description: "Get historical issue creator counts for a GitHub repository.",
    inputSchema: repoHistoryInputSchema(),
    outputSchema: s.actionOutput({
      history: s.array("Issue creator history returned by OSS Insight.", issueCreatorHistoryPointSchema),
      metadata: sqlMetadataSchema,
    }),
  },
  {
    name: "list_pull_request_creators",
    operationType: "read",
    description: "List pull request creators for a GitHub repository.",
    inputSchema: creatorListInputSchema("prs-desc"),
    outputSchema: s.actionOutput({
      creators: s.array("Pull request creators returned by OSS Insight.", pullRequestCreatorSchema),
      metadata: sqlMetadataSchema,
    }),
  },
  {
    name: "list_pull_request_creator_countries",
    operationType: "read",
    description: "List countries or regions of pull request creators for a GitHub repository.",
    inputSchema: repoAnalysisInputSchema(),
    outputSchema: s.actionOutput({
      countries: s.array(
        "Pull request creator countries or regions returned by OSS Insight.",
        pullRequestCreatorCountrySchema,
      ),
      metadata: sqlMetadataSchema,
    }),
  },
  {
    name: "list_pull_request_creator_organizations",
    operationType: "read",
    description: "List organizations of pull request creators for a GitHub repository.",
    inputSchema: repoAnalysisInputSchema(),
    outputSchema: s.actionOutput({
      organizations: s.array(
        "Pull request creator organizations returned by OSS Insight.",
        pullRequestCreatorOrganizationSchema,
      ),
      metadata: sqlMetadataSchema,
    }),
  },
  {
    name: "get_pull_request_creators_history",
    operationType: "read",
    description: "Get historical pull request creator counts for a GitHub repository.",
    inputSchema: repoHistoryInputSchema(),
    outputSchema: s.actionOutput({
      history: s.array("Pull request creator history returned by OSS Insight.", pullRequestCreatorHistoryPointSchema),
      metadata: sqlMetadataSchema,
    }),
  },
  {
    name: "list_stargazer_countries",
    operationType: "read",
    description: "List countries or regions of stargazers for a GitHub repository.",
    inputSchema: repoAnalysisInputSchema(),
    outputSchema: s.actionOutput({
      countries: s.array("Countries or regions of stargazers returned by OSS Insight.", stargazerCountrySchema),
      metadata: sqlMetadataSchema,
    }),
  },
  {
    name: "list_stargazer_organizations",
    operationType: "read",
    description: "List organizations of stargazers for a GitHub repository.",
    inputSchema: repoAnalysisInputSchema(),
    outputSchema: s.actionOutput({
      organizations: s.array("Stargazer organizations returned by OSS Insight.", stargazerOrganizationSchema),
      metadata: sqlMetadataSchema,
    }),
  },
  {
    name: "get_stargazers_history",
    operationType: "read",
    description: "Get the historical stargazer count for a GitHub repository.",
    inputSchema: repoHistoryInputSchema(),
    outputSchema: s.actionOutput({
      history: s.array("Historical stargazer counts returned by OSS Insight.", stargazerHistoryPointSchema),
      metadata: sqlMetadataSchema,
    }),
  },
];

export const ossinsightActions: ActionDefinition[] = actions.map((definition) =>
  defineProviderAction(service, definition),
);

function collectionsOutputSchema(collectionItemSchema: JsonSchema, description: string): JsonSchema {
  return s.actionOutput({
    collections: s.array(description, collectionItemSchema),
    metadata: sqlMetadataSchema,
  });
}

function collectionRankingInputSchema(): JsonSchema {
  return s.object(
    "The input payload for this action.",
    {
      collection_id: collectionIdSchema,
      period: collectionRankingPeriodSchema,
    },
    { required: ["collection_id"], optional: ["period"] },
  );
}

function collectionRankingOutputSchema(description: string): JsonSchema {
  return s.actionOutput({
    rankings: s.array(description, collectionRankingSchema),
    metadata: sqlMetadataSchema,
  });
}

function creatorListInputSchema(defaultSort: string): JsonSchema {
  return s.object(
    "The input payload for this action.",
    {
      ...repoInputFields,
      sort: withDefault(creatorSortSchema, defaultSort),
      exclude_bots: s.boolean({ default: true, description: "Whether to exclude bot accounts." }),
      ...paginationInputFields,
    },
    { required: ["owner", "repo"], optional: ["sort", "exclude_bots", "page", "page_size"] },
  );
}

function repoAnalysisInputSchema(): JsonSchema {
  return s.object(
    "The input payload for this action.",
    {
      ...repoInputFields,
      ...excludeUnknownInputFields,
      ...timeRangeInputFields,
    },
    { required: ["owner", "repo"], optional: ["exclude_unknown", "from", "to"] },
  );
}

function repoHistoryInputSchema(): JsonSchema {
  return s.object(
    "The input payload for this action.",
    {
      ...repoInputFields,
      per: withDefault(historyIntervalSchema, "month"),
      ...timeRangeInputFields,
    },
    { required: ["owner", "repo"], optional: ["per", "from", "to"] },
  );
}

function withDefault(schema: JsonSchema, defaultValue: string): JsonSchema {
  return {
    ...schema,
    default: defaultValue,
  };
}
