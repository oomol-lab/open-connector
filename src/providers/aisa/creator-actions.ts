import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aisa";

const adFormat = s.stringEnum("A Foreplay ad display format to include.", [
  "carousel",
  "dco",
  "dpa",
  "event",
  "image",
  "multi_images",
  "multi_medias",
  "multi_videos",
  "page_like",
  "text",
  "video",
]);
const publisherPlatform = s.stringEnum("A publisher platform to include.", [
  "facebook",
  "instagram",
  "audience_network",
  "messenger",
  "tiktok",
  "youtube",
  "linkedin",
  "threads",
  "whatsapp",
]);
const date = (description: string) => s.string(description, { format: "date" });
const foreplayLimit = s.integer("The maximum number of billed ads to return.", {
  minimum: 1,
  maximum: 250,
});
const foreplayOrder = s.stringEnum("How to order the returned ads.", [
  "newest",
  "oldest",
  "longest_running",
  "most_relevant",
]);

const adFilters = {
  live: s.boolean("Whether to return only currently active or inactive ads."),
  displayFormats: s.array("The ad display formats to include.", adFormat, { uniqueItems: true }),
  publisherPlatforms: s.array("The publisher platforms to include.", publisherPlatform, {
    uniqueItems: true,
  }),
  niches: s.array("The advertising niches to include.", s.string("An advertising niche."), {
    uniqueItems: true,
  }),
  marketTarget: s.stringEnum("The intended market type for the ads.", ["b2b", "b2c"]),
  languages: s.array("The ad languages to include.", s.string("A language name or code."), {
    uniqueItems: true,
  }),
  minVideoDurationSeconds: s.integer("The minimum video duration in seconds.", { minimum: 0 }),
  maxVideoDurationSeconds: s.integer("The maximum video duration in seconds.", { minimum: 0 }),
  minRunningDays: s.integer("The minimum number of days the ad has run.", { minimum: 1 }),
  maxRunningDays: s.integer("The maximum number of days the ad has run.", { minimum: 1 }),
  startDate: date("Return ads first observed on or after this date."),
  endDate: date("Return ads first observed on or before this date."),
  cursor: s.string("The cursor returned by the previous Foreplay response."),
  limit: foreplayLimit,
  order: foreplayOrder,
};

const optionalAdFilters = [
  "live",
  "displayFormats",
  "publisherPlatforms",
  "niches",
  "marketTarget",
  "languages",
  "minVideoDurationSeconds",
  "maxVideoDurationSeconds",
  "minRunningDays",
  "maxRunningDays",
  "startDate",
  "endDate",
  "cursor",
  "limit",
  "order",
];

function foreplayOutput(description: string) {
  return s.looseObject(description, {
    data: s.array("The records returned by Foreplay.", s.looseObject("A Foreplay record.")),
    metadata: s.looseObject("Pagination and request metadata returned by Foreplay."),
  });
}

export const searchForeplayAdsAction: ActionDefinition = defineProviderAction(service, {
  name: "search_foreplay_ads",
  operationType: "read",
  description: "Search the Foreplay ad index by text, platform, format, niche, and activity.",
  requiredScopes: [],
  inputSchema: s.object(
    "Search text and filters for the Foreplay ad index.",
    {
      query: s.string("Text to find in ad names or descriptions."),
      ...adFilters,
    },
    { optional: ["query", ...optionalAdFilters] },
  ),
  outputSchema: foreplayOutput("Foreplay ads matching the search and filters."),
});

export const getForeplayBrandAdsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_foreplay_brand_ads",
  operationType: "read",
  description: "List ads for one or more known Foreplay brand IDs.",
  requiredScopes: [],
  inputSchema: s.object(
    "Foreplay brand IDs and filters for retrieving their ads.",
    {
      brandIds: s.array("The Foreplay brand IDs whose ads should be returned.", s.string("A Foreplay brand ID."), {
        minItems: 1,
        uniqueItems: true,
      }),
      ...adFilters,
      collect: s.boolean(
        "Whether to try a slower live collection when cached results are empty; use only as a fallback.",
      ),
    },
    { optional: [...optionalAdFilters, "collect"] },
  ),
  outputSchema: foreplayOutput("Foreplay ads associated with the requested brand IDs."),
});

export const findForeplayBrandsAction: ActionDefinition = defineProviderAction(service, {
  name: "find_foreplay_brands",
  operationType: "read",
  description: "Find candidate advertising brands associated with a domain.",
  requiredScopes: [],
  inputSchema: s.object(
    "A domain and result ordering for finding Foreplay brands.",
    {
      domain: s.string("The domain or full website URL used to find candidate brands."),
      limit: s.integer("The maximum number of billed brand candidates to return.", {
        minimum: 1,
        maximum: 10,
      }),
      order: s.stringEnum("How to order candidate brands by relevance rank.", ["most_ranked", "least_ranked"]),
    },
    { optional: ["limit", "order"] },
  ),
  outputSchema: foreplayOutput("Candidate Foreplay brands, including brand IDs and ad-library page IDs."),
});

export const getForeplayBrandAnalyticsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_foreplay_brand_analytics",
  operationType: "read",
  description: "Get daily running-ad distribution and creative velocity for a brand page.",
  requiredScopes: [],
  inputSchema: s.object(
    "An ad-library page ID and an optional date window of at most 30 days.",
    {
      adLibraryId: s.string(
        "The numeric page_id or ad_library_id returned by find_foreplay_brands; a Foreplay brand_id is not accepted.",
      ),
      startDate: date("The first analytics date; the complete window must not exceed 30 days."),
      endDate: date("The last analytics date; the complete window must not exceed 30 days."),
      order: foreplayOrder,
    },
    { optional: ["startDate", "endDate", "order"] },
  ),
  outputSchema: foreplayOutput("Daily Foreplay ad counts and creative-velocity measurements."),
});

const creatorPlatform = s.stringEnum("The social platform to search.", ["instagram", "tiktok", "youtube"]);

const creatorFilters = s.object(
  "Optional filters applied before WaveInflu matches creators.",
  {
    regions: s.array("The ISO country codes to include.", s.string("An ISO country code."), {
      uniqueItems: true,
    }),
    languages: s.array("The creator languages to include.", s.string("A language code."), {
      uniqueItems: true,
    }),
    minFollowers: s.number("The minimum follower or subscriber count.", { minimum: 0 }),
    maxFollowers: s.number("The maximum follower or subscriber count.", { minimum: 0 }),
    minPlayCount: s.number("The minimum median or average play count.", { minimum: 0 }),
    maxPlayCount: s.number("The maximum median or average play count.", { minimum: 0 }),
    playCountMetric: s.stringEnum("The play-count statistic used by the range filters.", ["median", "average"]),
    genders: s.array("The inferred creator genders to include.", s.string("A gender value."), {
      uniqueItems: true,
    }),
    ethnicities: s.array("The inferred creator ethnicities to include.", s.string("An ethnicity value."), {
      uniqueItems: true,
    }),
    creatorTypes: s.array("The creator account types to include.", s.string("A creator account type."), {
      uniqueItems: true,
    }),
    faceVisibilities: s.array(
      "The face-visibility classifications to include.",
      s.string("A face-visibility classification."),
      { uniqueItems: true },
    ),
    workspaceDeduplicationEnabled: s.boolean("Whether to exclude creators already saved in the WaveInflu workspace."),
  },
  {
    optional: [
      "regions",
      "languages",
      "minFollowers",
      "maxFollowers",
      "minPlayCount",
      "maxPlayCount",
      "playCountMetric",
      "genders",
      "ethnicities",
      "creatorTypes",
      "faceVisibilities",
      "workspaceDeduplicationEnabled",
    ],
  },
);

const waveInfluOutput = s.looseObject("The WaveInflu response returned through AIsa.", {
  data: s.unknown("The creator matches or contact result returned by WaveInflu."),
});

export const findSimilarCreatorsAction: ActionDefinition = defineProviderAction(service, {
  name: "find_similar_creators",
  operationType: "read",
  description: "Find creators similar to a seed account with optional audience filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "A seed creator, platform, billed result limit, and optional matching filters.",
    {
      platform: creatorPlatform,
      targetAccount: s.string("A creator handle or profile URL used as the similarity seed."),
      limit: s.integer("The maximum number of billed creators to return.", {
        minimum: 1,
        maximum: 100,
      }),
      filters: creatorFilters,
    },
    { optional: ["limit", "filters"] },
  ),
  outputSchema: waveInfluOutput,
});

export const searchCreatorsAction: ActionDefinition = defineProviderAction(service, {
  name: "search_creators",
  operationType: "read",
  description: "Find creators from a natural-language brief and optional audience filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "A creator brief, platform, billed result limit, and optional matching filters.",
    {
      platform: creatorPlatform,
      query: s.string("A natural-language description of the creators to find."),
      limit: s.integer("The maximum number of billed creators to return.", {
        minimum: 1,
        maximum: 100,
      }),
      filters: creatorFilters,
    },
    { optional: ["limit", "filters"] },
  ),
  outputSchema: waveInfluOutput,
});

export const lookupCreatorEmailAction: ActionDefinition = defineProviderAction(service, {
  name: "lookup_creator_email",
  operationType: "read",
  description: "Look up the public contact email for one creator profile; not-found results are billed.",
  requiredScopes: [],
  inputSchema: s.requiredObject("The creator profile used for a WaveInflu email lookup.", {
    profileUrl: s.string("An Instagram, TikTok, or YouTube creator profile URL.", {
      format: "uri",
    }),
  }),
  outputSchema: waveInfluOutput,
});

export const creatorActions: ActionDefinition[] = [
  searchForeplayAdsAction,
  getForeplayBrandAdsAction,
  findForeplayBrandsAction,
  getForeplayBrandAnalyticsAction,
  findSimilarCreatorsAction,
  searchCreatorsAction,
  lookupCreatorEmailAction,
];
