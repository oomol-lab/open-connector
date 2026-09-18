import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

const service = "apple_ads";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
import { bidStrategyGoals, bidStrategyTypes, promotedObjectTypes } from "./actions-campaigns.ts";
import {
  adAccountIdInput,
  appleAdsDateTimeOutput,
  identifierInput,
  looseResource,
  manageCampaignsRoles,
  moneyInput,
  moneyOutput,
  nonEmptyString,
  nullableEnum,
  offsetInput,
  paginationOutput,
  readCampaignsRoles,
  sortOrders,
} from "./schemas.ts";

const impressionShareGranularities = ["DAILY", "WEEKLY_SUN_SAT"];
const impressionShareReportTypes = ["FIRST_SLOT", "ALL_SLOTS"];
const searchTermPopularityGranularities = ["WEEKLY_SUN_SAT", "MONTHLY"];
const searchTermPopularityOptionalFields = [
  "rankInGenre",
  "searchPopularityInGenre",
  "searchPopularity1to100",
  "searchPopularity1to5",
];
const searchTermPopularityFilterFields = [
  "week",
  "month",
  "countryOrRegion",
  "genre",
  "searchTerm",
  "rankInGenre",
  "searchPopularityInGenre",
  "searchPopularity1to100",
  "searchPopularity1to5",
];
const searchTermPopularitySortFields = searchTermPopularityFilterFields;
const insightsFilterOperators = [
  "EQUALS",
  "NOT_EQUALS",
  "IN",
  "CONTAINS",
  "CONTAINS_ANY",
  "CONTAINS_ALL",
  "STARTS_WITH",
  "ENDS_WITH",
  "LIKE",
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL_TO",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL_TO",
  "BETWEEN",
];
const appStoreGenres = [
  "BUSINESS",
  "EDUCATION",
  "ENTERTAINMENT",
  "FINANCE",
  "FOOD_DRINK",
  "GAMES",
  "HEALTH_FITNESS",
  "LIFESTYLE",
  "NEW_PUBLICATION",
  "PHOTO_VIDEO",
  "PRODUCTIVITY_UTILITIES",
  "SHOPPING",
  "SOCIAL_NETWORKING",
  "SPORTS",
  "TRAVEL",
];
const recommendationStates = ["AVAILABLE", "APPLIED", "DISMISSED", "DELETE"];
const recommendationStatuses = ["ENABLED", "DISABLED", "DELETED"];
const recommendationCategories = ["KEYWORD", "SKEYWORD", "DAILYCAP", "SDAILYCAP", "TCPA", "STCPA", "BID", "SBID"];
const suggestionQueryTypes = ["SUGGESTION", "SEARCH"];

const countryOrRegionCodeDescription = "An ISO 3166-1 alpha-2 code such as US, CA or GB.";

const suggestionPageSizeInput = s.positiveInteger(
  "Number of suggestions to return on this page. Apple Ads defaults to 20 and caps it at 1000.",
);

const sortingInput = (description: string, fieldDescription: string) =>
  s.array(
    description,
    s.object(
      "A single sort directive.",
      {
        field: nonEmptyString(fieldDescription),
        order: s.stringEnum("Sort direction. Apple Ads defaults to ASC.", sortOrders),
      },
      { required: ["field"] },
    ),
  );

const impressionShareTimeRangeInput = s.object(
  "Date window to aggregate impression share over. The timezone is fixed to UTC.",
  {
    start: s.date(
      "First day of the window in YYYY-MM-DD format. It must be a Sunday when granularity is WEEKLY_SUN_SAT.",
    ),
    end: s.date("Last day of the window in YYYY-MM-DD format."),
    granularity: s.stringEnum(
      "Aggregation period. DAILY covers at most 30 days and fills the day field of each row; WEEKLY_SUN_SAT covers at most 4 weeks and fills the week field with the Sunday start date.",
      impressionShareGranularities,
    ),
  },
  { required: ["start", "end", "granularity"] },
);

const searchTermPopularityTimeRangeInput = s.object(
  "Date window to aggregate search term popularity over. The timezone is fixed to UTC.",
  {
    start: s.date("First day of the window in YYYY-MM-DD format."),
    end: s.date("Last day of the window in YYYY-MM-DD format."),
    granularity: s.stringEnum(
      "Aggregation period. WEEKLY_SUN_SAT uses fixed Sunday to Saturday weeks and keeps 65 weeks of history; MONTHLY uses calendar months, keeps 15 months of history and truncates the date field to YYYY-MM.",
      searchTermPopularityGranularities,
    ),
  },
  { required: ["start", "end", "granularity"] },
);

const impressionShareRow = looseResource(
  "One combination of date, search term and country or region in an impression share report.",
  {
    day: s.nullableString("Date of the row in YYYY-MM-DD format. Present when granularity is DAILY."),
    week: s.nullableString(
      "Sunday that starts the week, in YYYY-MM-DD format. Present when granularity is WEEKLY_SUN_SAT.",
    ),
    appName: s.nullableString("Display name of the promoted app."),
    promotedObjectId: s.nullableString("Adam ID of the promoted app, as a decimal string."),
    countryOrRegion: s.nullableString("ISO 3166-1 alpha-2 country or region code."),
    searchTerm: s.nullableString(
      "The search term. Apple Ads suppresses terms with fewer than 10 impressions in the aggregation period.",
    ),
    lowImpressionShare: s.nullableNumber(
      "Lower bound of the impression share, from 0 to 1. For 1% to 90% it equals highImpressionShare; above 90% it is 0.91.",
    ),
    highImpressionShare: s.nullableNumber(
      "Upper bound of the impression share, from 0 to 1. A value of 1 means the app holds more than 90% impression share.",
    ),
    rank: s.nullableInteger(
      "Stack-ranked position by impression share for this search term and country or region, where 1 is the highest share.",
    ),
    searchPopularity1to5: s.nullableInteger(
      "Relative search volume for the term on a 1 to 5 scale, where 5 is the most popular.",
    ),
  },
);

const searchTermPopularityRow = looseResource(
  "One combination of time period, country or region, genre and search term in a search term popularity report.",
  {
    week: s.nullableString(
      "The date immediately following the completed week, in YYYY-MM-DD format. Present when granularity is WEEKLY_SUN_SAT.",
    ),
    month: s.nullableString("Calendar month of the snapshot in YYYY-MM format. Present when granularity is MONTHLY."),
    countryOrRegion: s.nullableString("ISO 3166-1 alpha-2 country or region code."),
    genre: s.nullableString("App Store genre classification."),
    searchTerm: s.nullableString(
      "The search term. Only terms with at least 500 searches and at least 10 impressions in the period are included.",
    ),
    rankInGenre: s.nullableInteger(
      "Rank of the term by search volume within its country or region and genre, where 1 is the highest volume. Returned only when requested in fields.",
    ),
    searchPopularityInGenre: s.nullableInteger(
      "Popularity within the country or region and genre on a 1 to 100 scale. Returned only when requested in fields.",
    ),
    searchPopularity1to100: s.nullableInteger(
      "Popularity across all genres within the country or region on a 1 to 100 scale. Returned only when requested in fields.",
    ),
    searchPopularity1to5: s.nullableInteger(
      "Popularity across all genres within the country or region on a 1 to 5 scale. Returned only when requested in fields.",
    ),
  },
);

const recommendationBidStrategyOutput = s.nullable(
  looseResource("Bid strategy the campaign was using when the recommendation was produced.", {
    bidStrategyType: nullableEnum("The bid strategy type.", bidStrategyTypes),
    bidStrategyGoal: nullableEnum("The optimization goal of the bid strategy.", bidStrategyGoals),
    bidAmount: moneyOutput("Bid amount associated with the strategy."),
  }),
);

const recommendationCommonFields = {
  recommendationType: nullableEnum("Optimization area of the recommendation.", recommendationCategories),
  promotedObjectId: s.nullableString(
    "Identifier of the promoted object: the app Adam ID for APPSTORE_APP, or the brand identifier for BUSINESS_BRAND.",
  ),
  promotedObjectType: nullableEnum("Type of the promoted object.", promotedObjectTypes),
  campaignId: s.nullableInteger("Campaign the recommendation applies to."),
  campaignName: s.nullableString("Display name of that campaign."),
  status: nullableEnum(
    "Operational status of the recommendation record itself, independent of state.",
    recommendationStatuses,
  ),
  installs: s.nullableInteger("Historical install count."),
  spend: moneyOutput("Historical spend."),
  averageCPA: moneyOutput("Historical average cost per acquisition."),
  averageCPT: moneyOutput("Historical average cost per tap."),
  impression: s.nullableInteger("Historical impression count."),
  taps: s.nullableInteger("Historical tap count."),
  ttr: s.nullableNumber("Historical tap-through rate."),
  creationTime: appleAdsDateTimeOutput("When the recommendation was created."),
  modificationTime: appleAdsDateTimeOutput("When the record was last modified."),
  expirationTime: appleAdsDateTimeOutput("When the recommendation expires."),
};

const targetCpaRecommendation = looseResource(
  "A target CPA recommendation for a campaign using a Maximize Conversions bid strategy.",
  {
    id: s.nullableString("Identifier of the recommendation, used when applying or dismissing it."),
    state: nullableEnum(
      "Lifecycle state tracking the advertiser response. It is terminal once APPLIED, DISMISSED or DELETE.",
      recommendationStates,
    ),
    recommendedTargetCPA: moneyOutput("The suggested new target CPA."),
    bidStrategy: recommendationBidStrategyOutput,
    expectedTaps: s.nullableInteger("Taps projected over seven days if the recommendation is applied."),
    expectedCPA: moneyOutput(
      "Average cost per acquisition projected over seven days if the recommendation is applied.",
    ),
    expectedInstalls: s.nullableInteger("Installs projected over seven days if the recommendation is applied."),
    expectedSpend: moneyOutput("Spend projected over seven days if the recommendation is applied."),
    ...recommendationCommonFields,
  },
);

const targetCpaRecommendationHistory = looseResource(
  "An immutable record Apple Ads creates when a target CPA recommendation is applied or dismissed.",
  {
    recommendationId: s.nullableString("Identifier of the original recommendation."),
    state: nullableEnum(
      "Terminal state reached by the recommendation, either APPLIED or DISMISSED.",
      recommendationStates,
    ),
    appliedTargetCPA: moneyOutput("The target CPA actually applied, or null when it was dismissed."),
    recommendedTargetCPA: moneyOutput("The target CPA originally recommended."),
    rank: s.nullableInteger("Rank of the recommendation when the action was taken."),
    expectedInstalls: s.nullableInteger("Installs the original recommendation projected."),
    expectedSpend: moneyOutput("Spend the original recommendation projected."),
    expectedTaps: s.nullableInteger("Taps the original recommendation projected."),
    expectedCPA: moneyOutput("Cost per acquisition the original recommendation projected."),
    appliedTime: appleAdsDateTimeOutput("When the apply or dismiss action was taken."),
    ...recommendationCommonFields,
  },
);

const dailyBudgetRecommendation = looseResource(
  "A daily budget recommendation for a campaign that keeps exhausting its spending ceiling.",
  {
    id: s.nullableString("Identifier of the recommendation, used when applying or dismissing it."),
    state: nullableEnum(
      "Lifecycle state tracking the advertiser response. It is terminal once APPLIED, DISMISSED or DELETE.",
      recommendationStates,
    ),
    suggestedDailyBudgetAmount: moneyOutput("The recommended new daily budget."),
    dailyBudget: moneyOutput("The campaign's current daily budget, for comparison."),
    bidStrategy: recommendationBidStrategyOutput,
    expectedImpressions: s.nullableInteger("Impressions projected over seven days if the recommendation is applied."),
    expectedInstalls: s.nullableInteger("Installs projected over seven days if the recommendation is applied."),
    expectedSpend: moneyOutput("Spend projected over seven days if the recommendation is applied."),
    expectedTaps: s.nullableInteger("Taps projected over seven days if the recommendation is applied."),
    expectedCpa: moneyOutput(
      "Average cost per acquisition projected over seven days if the recommendation is applied.",
    ),
    ...recommendationCommonFields,
  },
);

const dailyBudgetRecommendationHistory = looseResource(
  "An immutable record Apple Ads creates when a daily budget recommendation is applied or dismissed.",
  {
    recommendationId: s.nullableString("Identifier of the original recommendation."),
    state: nullableEnum(
      "Terminal state reached by the recommendation, either APPLIED or DISMISSED.",
      recommendationStates,
    ),
    appliedDailyBudgetAmount: moneyOutput(
      "The daily budget actually applied, or null when the recommendation was dismissed.",
    ),
    suggestedDailyBudgetAmount: moneyOutput("The daily budget originally suggested."),
    rank: s.nullableInteger("Rank of the recommendation when the action was taken."),
    expectedImpressions: s.nullableInteger("Impressions the original recommendation projected."),
    expectedImpressionsLow: s.nullableInteger("Lower bound of the projected impressions confidence interval."),
    expectedImpressionsHigh: s.nullableInteger("Upper bound of the projected impressions confidence interval."),
    expectedInstalls: s.nullableInteger("Installs the original recommendation projected."),
    expectedInstallsLow: s.nullableInteger("Lower bound of the projected installs confidence interval."),
    expectedInstallsHigh: s.nullableInteger("Upper bound of the projected installs confidence interval."),
    expectedSpend: moneyOutput("Spend the original recommendation projected."),
    expectedSpendLow: moneyOutput("Lower bound of the projected spend confidence interval."),
    expectedSpendHigh: moneyOutput("Upper bound of the projected spend confidence interval."),
    expectedTaps: s.nullableInteger("Taps the original recommendation projected."),
    expectedTapsLow: s.nullableInteger("Lower bound of the projected taps confidence interval."),
    expectedTapsHigh: s.nullableInteger("Upper bound of the projected taps confidence interval."),
    expectedCpa: moneyOutput("Cost per acquisition the original recommendation projected."),
    expectedCpaLow: moneyOutput("Lower bound of the projected cost per acquisition confidence interval."),
    expectedCpaHigh: moneyOutput("Upper bound of the projected cost per acquisition confidence interval."),
    appliedTime: appleAdsDateTimeOutput("When the apply or dismiss action was taken."),
    ...recommendationCommonFields,
  },
);

const keywordSuggestion = looseResource("A suggested keyword for an App Store app campaign.", {
  text: s.nullableString("The suggested keyword text."),
  popularity: s.nullableInteger(
    "Relative popularity score on a 0 to 100 scale. It is a ranking signal, not an absolute search volume.",
  ),
});

const phraseSuggestion = looseResource(
  "A suggested natural-language search phrase, typically a longer-tail query than a single keyword.",
  {
    phrase: s.nullableString("The suggested phrase text."),
    popularity: s.nullableInteger("Relative popularity score on a 0 to 100 scale."),
  },
);

const categorySuggestion = looseResource(
  "A suggested category: an App Store app category for APPSTORE_APP, or a brand category for BUSINESS_BRAND.",
  {
    category: s.nullableString("The category name, for example Productivity or Restaurants."),
    popularity: s.nullableInteger("Relative popularity score on a 0 to 100 scale."),
  },
);

const targetCpaSuggestion = looseResource(
  "The suggested target CPA for a new Maximize Conversions campaign, derived from the app's tap-install CPI over the last 28 days.",
  {
    suggestedTargetCPA: moneyOutput(
      "The suggested target CPA: the highest tap-install CPI among the evaluated countries or regions with at least 10 installs in the window.",
    ),
    countryOrRegion: s.nullable(
      s.stringArray("Countries or regions the suggestion applies to.", {
        itemDescription: countryOrRegionCodeDescription,
      }),
    ),
    promotedObjectId: s.nullableString("Identifier of the app the suggestion was calculated for."),
    appCategory: s.nullableString("App Store category used to scope the performance data behind the suggestion."),
  },
);

const ignoreCaseInput = (subject: string) =>
  s.boolean(
    `Whether to match ${subject} case-insensitively on the SEARCH route. It applies to both the exact lookup and the pattern match, and Apple Ads defaults to case-sensitive matching.`,
  );

const promotedObjectInputs = {
  promotedObjectId: identifierInput(
    "Identifier of the promoted object this request applies to: the app Adam ID when promotedObjectType is APPSTORE_APP, or the brand identifier when it is BUSINESS_BRAND.",
  ),
  promotedObjectType: s.stringEnum("Type of the promoted object.", promotedObjectTypes),
};

const recommendationStateInput = s.stringEnum(
  "Return only recommendations in this lifecycle state. Pass AVAILABLE to get the ones still worth acting on.",
  recommendationStates,
);

const recommendationActionItemFields = {
  id: nonEmptyString("Identifier of the recommendation to act on, taken from the query response."),
  historyId: nonEmptyString("Optional reference to a prior history record."),
};

const applyTargetCpaItems = s.array(
  "Target CPA recommendations to apply. Apple Ads requires every entry to belong to the same promoted object.",
  s.object(
    "A single target CPA recommendation to apply.",
    {
      ...recommendationActionItemFields,
      appliedTargetCPA: moneyInput(
        "Target CPA to apply instead of the recommended value. Omit it to apply recommendedTargetCPA unchanged.",
      ),
    },
    { required: ["id"] },
  ),
  { minItems: 1 },
);

const dismissTargetCpaItems = s.array(
  "Target CPA recommendations to dismiss. Apple Ads requires every entry to belong to the same promoted object.",
  s.object(
    "A single target CPA recommendation to dismiss.",
    { ...recommendationActionItemFields },
    { required: ["id"] },
  ),
  { minItems: 1 },
);

const applyDailyBudgetItems = s.array(
  "Daily budget recommendations to apply. Apple Ads requires every entry to belong to the same promoted object.",
  s.object(
    "A single daily budget recommendation to apply.",
    {
      ...recommendationActionItemFields,
      appliedDailyBudget: moneyInput(
        "Daily budget to apply instead of the suggested amount. Omit it to apply suggestedDailyBudgetAmount unchanged.",
      ),
    },
    { required: ["id"] },
  ),
  { minItems: 1 },
);

const dismissDailyBudgetItems = s.array(
  "Daily budget recommendations to dismiss. Apple Ads requires every entry to belong to the same promoted object.",
  s.object(
    "A single daily budget recommendation to dismiss.",
    { ...recommendationActionItemFields },
    { required: ["id"] },
  ),
  { minItems: 1 },
);

const historyOutput = (items: JsonSchema, description: string) =>
  s.actionOutput(
    {
      histories: s.array("History records Apple Ads created for the acted-on recommendations.", items),
    },
    description,
  );

export const appleAdsInsightActions: readonly ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "query_impression_share",
    operationType: "read",
    description:
      "Measure what share of the available impressions one App Store app captured for each search term and country or region. Apple Maps brand campaigns have no impression share equivalent.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Impression share query for one promoted App Store app.",
      {
        adAccountId: adAccountIdInput,
        promotedObjectId: identifierInput(
          "Adam ID of the promoted App Store app. Apple Ads rejects the request with a 400 error when it is missing.",
        ),
        countryOrRegion: nonEmptyString(
          `Return only rows for this App Store country or region. ${countryOrRegionCodeDescription}`,
        ),
        timeRange: impressionShareTimeRangeInput,
        impressionShareReportType: s.stringEnum(
          "Ad positions the calculation covers. FIRST_SLOT, the default, measures the first ad position only; ALL_SLOTS aggregates across every ad position.",
          impressionShareReportTypes,
        ),
        sorting: sortingInput(
          "Sort directives applied in order. Apple Ads accepts at most two.",
          "Row field to sort on, for example highImpressionShare, rank, searchTerm or searchPopularity1to5.",
        ),
        offset: offsetInput,
        pageSize: s.positiveInteger(
          "Number of rows to return on this page. Apple Ads defaults to 100 and caps it at 5000.",
        ),
      },
      { required: ["promotedObjectId", "timeRange"] },
    ),
    outputSchema: s.actionOutput(
      {
        rows: s.array("Impression share rows on this page.", impressionShareRow),
        pagination: paginationOutput,
      },
      "A page of impression share rows.",
    ),
  }),
  defineProviderAction(service, {
    name: "query_search_term_popularity",
    operationType: "read",
    description:
      "Rank App Store search terms by relative search volume within a country or region and genre, to discover high-volume terms worth targeting.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Search term popularity query.",
      {
        adAccountId: adAccountIdInput,
        timeRange: searchTermPopularityTimeRangeInput,
        fields: s.array(
          "Optional metrics to include on every row. countryOrRegion, genre, searchTerm and the date field for the chosen granularity are always returned.",
          s.stringEnum("An optional popularity metric.", searchTermPopularityOptionalFields),
        ),
        filters: s.array(
          "Filter conditions combined with logical AND.",
          s.object(
            "A single filter condition.",
            {
              field: s.stringEnum(
                `Field to filter on. week accepts IN and is available only for WEEKLY_SUN_SAT; month accepts IN and is available only for MONTHLY; countryOrRegion and genre accept EQUALS and IN; searchTerm accepts EQUALS, IN, CONTAINS and STARTS_WITH, matching case-insensitively for the last two; the four numeric popularity fields accept EQUALS, the comparison operators and BETWEEN. Genre values are ${appStoreGenres.join(", ")}.`,
                searchTermPopularityFilterFields,
              ),
              operator: s.stringEnum(
                "Comparison operator. Which operators a field accepts is documented per field.",
                insightsFilterOperators,
              ),
              value: s.unknown(
                "Value to compare against. Pass an array for IN and an array of exactly two values ordered as [minimum, maximum] for BETWEEN; pass a scalar for the single-value operators.",
              ),
            },
            { required: ["field", "operator", "value"] },
          ),
        ),
        sorting: s.array(
          "Sort directives applied in order. Apple Ads accepts at most two and defaults to genre ascending then rankInGenre ascending.",
          s.object(
            "A single sort directive.",
            {
              field: s.stringEnum("Field to sort on.", searchTermPopularitySortFields),
              order: s.stringEnum("Sort direction.", sortOrders),
            },
            { required: ["field"] },
          ),
        ),
        offset: offsetInput,
        pageSize: s.positiveInteger("Number of rows to return on this page. Apple Ads caps it at 5000."),
      },
      { required: ["timeRange"] },
    ),
    outputSchema: s.actionOutput(
      {
        rows: s.array("Search term popularity rows on this page.", searchTermPopularityRow),
        pagination: paginationOutput,
      },
      "A page of search term popularity rows.",
    ),
  }),
  defineProviderAction(service, {
    name: "query_target_cpa_recommendations",
    operationType: "read",
    description:
      "List the target CPA adjustments Apple Ads recommends for one promoted object. Only campaigns on a Maximize Conversions bid strategy receive them, and a target CPA is a goal the auto-bidder optimizes toward rather than a bid.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Target CPA recommendation query.",
      {
        adAccountId: adAccountIdInput,
        ...promotedObjectInputs,
        state: recommendationStateInput,
        sorting: sortingInput(
          "Sort directives applied in order, the first being the primary sort.",
          "Recommendation field to sort on, for example creationTime or expirationTime.",
        ),
        offset: offsetInput,
        pageSize: s.positiveInteger(
          "Number of recommendations to return on this page. Apple Ads defaults to 20 and caps it at 1000.",
        ),
      },
      { required: ["promotedObjectId", "promotedObjectType"] },
    ),
    outputSchema: s.actionOutput(
      {
        recommendations: s.array("Target CPA recommendations on this page.", targetCpaRecommendation),
        pagination: paginationOutput,
      },
      "A page of target CPA recommendations.",
    ),
  }),
  defineProviderAction(service, {
    name: "apply_target_cpa_recommendations",
    operationType: "destructive",
    description:
      "Accept one or more target CPA recommendations. Apple Ads changes the target the campaign's Maximize Conversions bidding optimizes toward and moves each recommendation to the terminal APPLIED state.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "Target CPA recommendations to apply.",
      {
        adAccountId: adAccountIdInput,
        ...promotedObjectInputs,
        recommendations: applyTargetCpaItems,
      },
      { required: ["promotedObjectId", "promotedObjectType", "recommendations"] },
    ),
    outputSchema: historyOutput(
      targetCpaRecommendationHistory,
      "History records for the applied target CPA recommendations. The applied target CPA is visible only here, not on the campaign.",
    ),
  }),
  defineProviderAction(service, {
    name: "dismiss_target_cpa_recommendations",
    operationType: "destructive",
    description:
      "Reject one or more target CPA recommendations. The campaign keeps its current target, but each recommendation moves to the terminal DISMISSED state and never returns to AVAILABLE.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "Target CPA recommendations to dismiss.",
      {
        adAccountId: adAccountIdInput,
        ...promotedObjectInputs,
        recommendations: dismissTargetCpaItems,
      },
      { required: ["promotedObjectId", "promotedObjectType", "recommendations"] },
    ),
    outputSchema: historyOutput(
      targetCpaRecommendationHistory,
      "History records for the dismissed target CPA recommendations.",
    ),
  }),
  defineProviderAction(service, {
    name: "query_daily_budget_recommendations",
    operationType: "read",
    description:
      "List the daily budget increases Apple Ads recommends for one promoted object, with the historical and projected performance behind each one. This is the only recommendation type available for Apple Maps brand campaigns.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Daily budget recommendation query.",
      {
        adAccountId: adAccountIdInput,
        ...promotedObjectInputs,
        state: recommendationStateInput,
        campaignIds: s.array(
          "Return only recommendations for these campaigns.",
          identifierInput("Identifier of a campaign under the promoted object."),
        ),
        sorting: sortingInput(
          "Sort directives applied in order, the first being the primary sort.",
          "Recommendation field to sort on, for example suggestedDailyBudgetAmount, creationTime or expirationTime.",
        ),
        offset: offsetInput,
        pageSize: s.positiveInteger(
          "Number of recommendations to return on this page. Apple Ads defaults to 20 and caps it at 1000.",
        ),
      },
      { required: ["promotedObjectId", "promotedObjectType"] },
    ),
    outputSchema: s.actionOutput(
      {
        recommendations: s.array("Daily budget recommendations on this page.", dailyBudgetRecommendation),
        pagination: paginationOutput,
      },
      "A page of daily budget recommendations.",
    ),
  }),
  defineProviderAction(service, {
    name: "apply_daily_budget_recommendations",
    operationType: "destructive",
    description:
      "Accept one or more daily budget recommendations. Apple Ads raises each campaign's daily budget and moves the recommendation to the terminal APPLIED state.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "Daily budget recommendations to apply.",
      {
        adAccountId: adAccountIdInput,
        ...promotedObjectInputs,
        recommendations: applyDailyBudgetItems,
      },
      { required: ["promotedObjectId", "promotedObjectType", "recommendations"] },
    ),
    outputSchema: historyOutput(
      dailyBudgetRecommendationHistory,
      "History records for the applied daily budget recommendations.",
    ),
  }),
  defineProviderAction(service, {
    name: "dismiss_daily_budget_recommendations",
    operationType: "destructive",
    description:
      "Reject one or more daily budget recommendations. Each campaign keeps its current daily budget, but the recommendation moves to the terminal DISMISSED state and never returns to AVAILABLE.",
    requiredScopes: [],
    providerPermissions: [...manageCampaignsRoles],
    inputSchema: s.object(
      "Daily budget recommendations to dismiss.",
      {
        adAccountId: adAccountIdInput,
        ...promotedObjectInputs,
        recommendations: dismissDailyBudgetItems,
      },
      { required: ["promotedObjectId", "promotedObjectType", "recommendations"] },
    ),
    outputSchema: historyOutput(
      dailyBudgetRecommendationHistory,
      "History records for the dismissed daily budget recommendations.",
    ),
  }),
  defineProviderAction(service, {
    name: "query_keyword_suggestions",
    operationType: "read",
    description:
      "Discover keywords worth targeting for one promoted object, ranked by relative popularity. Suggestions are stateless: turn one into a live keyword with create_keyword.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Keyword suggestion query.",
      {
        adAccountId: adAccountIdInput,
        ...promotedObjectInputs,
        terms: s.stringArray("Seed search terms to get related suggestions for.", {
          itemDescription: "A search term to seed suggestions with.",
        }),
        countriesOrRegions: s.stringArray("Scope suggestions to these App Store countries or regions.", {
          itemDescription: countryOrRegionCodeDescription,
        }),
        sorting: sortingInput(
          "Sort directives applied in order. Sort by popularity descending to see the highest-impact candidates first.",
          "Suggestion field to sort on, for example popularity.",
        ),
        offset: offsetInput,
        pageSize: suggestionPageSizeInput,
      },
      { required: ["promotedObjectId", "promotedObjectType"] },
    ),
    outputSchema: s.actionOutput(
      {
        keywords: s.array("Keyword suggestions on this page.", keywordSuggestion),
        pagination: paginationOutput,
      },
      "A page of keyword suggestions.",
    ),
  }),
  defineProviderAction(service, {
    name: "query_phrase_suggestions",
    operationType: "read",
    description:
      "Discover natural-language search phrases for one promoted object, or look up how popular known phrases are. Pick exactly one route: SUGGESTION needs the promoted object, SEARCH needs phrases or phraseLike.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Phrase suggestion query.",
      {
        adAccountId: adAccountIdInput,
        queryType: s.stringEnum(
          "Which route to take. SUGGESTION discovers phrases for an app or brand; SEARCH looks up or pattern-matches specific phrases.",
          suggestionQueryTypes,
        ),
        promotedObjectId: identifierInput(
          "Identifier of the promoted object, required on the SUGGESTION route: the app Adam ID for APPSTORE_APP, or the brand identifier for BUSINESS_BRAND.",
        ),
        promotedObjectType: s.stringEnum(
          "Type of the promoted object, required on the SUGGESTION route.",
          promotedObjectTypes,
        ),
        phrases: s.stringArray("Exact phrases to fetch popularity for. Use it on the SEARCH route.", {
          itemDescription: "A phrase to look up.",
        }),
        phraseLike: nonEmptyString(
          "Pattern to match phrases against, with % as the wildcard character. Use it on the SEARCH route.",
        ),
        ignoreCase: ignoreCaseInput("phrases"),
        sorting: sortingInput(
          "Sort directives applied in order. Sort by popularity descending to see the highest-impact candidates first.",
          "Suggestion field to sort on, for example popularity.",
        ),
        offset: offsetInput,
        pageSize: suggestionPageSizeInput,
      },
      { required: ["queryType"] },
    ),
    outputSchema: s.actionOutput(
      {
        phrases: s.array("Phrase suggestions on this page.", phraseSuggestion),
        pagination: paginationOutput,
      },
      "A page of phrase suggestions.",
    ),
  }),
  defineProviderAction(service, {
    name: "query_category_suggestions",
    operationType: "read",
    description:
      "Discover the categories associated with one promoted object, or look up how popular known category names are. Pick exactly one route: SUGGESTION needs the promoted object, SEARCH needs categories or categoryLike.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Category suggestion query.",
      {
        adAccountId: adAccountIdInput,
        queryType: s.stringEnum(
          "Which route to take. SUGGESTION discovers categories for an app or brand; SEARCH looks up or pattern-matches category names.",
          suggestionQueryTypes,
        ),
        promotedObjectId: identifierInput(
          "Identifier of the promoted object, required on the SUGGESTION route: the app Adam ID for APPSTORE_APP, or the brand identifier for BUSINESS_BRAND.",
        ),
        promotedObjectType: s.stringEnum(
          "Type of the promoted object, required on the SUGGESTION route.",
          promotedObjectTypes,
        ),
        categories: s.stringArray("Exact category names to fetch popularity for. Use it on the SEARCH route.", {
          itemDescription: "A category name to look up.",
        }),
        categoryLike: nonEmptyString(
          "Pattern to match category names against, with % as the wildcard character. Use it on the SEARCH route.",
        ),
        ignoreCase: ignoreCaseInput("category names"),
        sorting: sortingInput(
          "Sort directives applied in order. Sort by popularity descending to see the highest-impact candidates first.",
          "Suggestion field to sort on, for example popularity.",
        ),
        offset: offsetInput,
        pageSize: suggestionPageSizeInput,
      },
      { required: ["queryType"] },
    ),
    outputSchema: s.actionOutput(
      {
        categories: s.array("Category suggestions on this page.", categorySuggestion),
        pagination: paginationOutput,
      },
      "A page of category suggestions.",
    ),
  }),
  defineProviderAction(service, {
    name: "query_target_cpa_suggestion",
    operationType: "read",
    description:
      "Read the target CPA Apple Ads suggests as the starting point for a new Maximize Conversions campaign, computed from the app's tap-install CPI over the last 28 days. It applies to App Store apps only, so the request always asks for promotedObjectType APPSTORE_APP.",
    requiredScopes: [],
    providerPermissions: [...readCampaignsRoles],
    inputSchema: s.object(
      "Target CPA suggestion query for one App Store app.",
      {
        adAccountId: adAccountIdInput,
        promotedObjectId: identifierInput("Adam ID of the App Store app to size a target CPA for."),
        countryOrRegion: s.stringArray(
          "Consider only these App Store countries or regions. Omit it to consider every eligible market.",
          { itemDescription: countryOrRegionCodeDescription },
        ),
      },
      { required: ["promotedObjectId"] },
    ),
    outputSchema: s.actionOutput(
      {
        suggestion: s.nullable(targetCpaSuggestion),
      },
      "The single suggested target CPA, or null when Apple Ads has no eligible market for the app.",
    ),
  }),
];
