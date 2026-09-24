import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aisa";

const domain = s.string("The target domain without a path, such as example.com.");
const startMonth = s.string("The first complete data month in YYYY-MM format.", {
  pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$",
});
const endMonth = s.string("The last complete data month in YYYY-MM format.", {
  pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$",
});
const country = s.stringEnum("The geography available on the current AIsa plan.", ["us", "ww"]);
const webSource = s.stringEnum("The device segment used to measure web traffic.", ["desktop", "mobile_web", "total"]);
const mainDomainOnly = s.boolean("Whether to exclude subdomains from the measurement.");
const limit = s.integer("The maximum number of billed rows to return.", {
  minimum: 1,
  maximum: 20,
});
const offset = s.integer("The number of rows to skip before returning results.", { minimum: 0 });

function similarwebOutput(description: string) {
  return s.looseObject(description, {
    meta: s.looseObject("The request, billing, and data-period metadata returned by AIsa."),
    data: s.unknown("The Similarweb measurements returned for this request."),
  });
}

export const similarwebTrafficEngagementAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_traffic_engagement",
  operationType: "read",
  description: "Get monthly visits and engagement metrics for a website from Similarweb.",
  requiredScopes: [],
  inputSchema: s.object(
    "The website, month range, and metrics for a Similarweb traffic query.",
    {
      domain,
      startMonth,
      endMonth,
      metrics: s.string("Comma-separated metrics, such as visits,pages_per_visit."),
      country,
      webSource,
      mainDomainOnly,
      monthToDate: s.boolean("Whether to request month-to-date measurements."),
    },
    { optional: ["country", "webSource", "mainDomainOnly", "monthToDate"] },
  ),
  outputSchema: similarwebOutput("Monthly Similarweb traffic and engagement measurements."),
});

export const similarwebRankingAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_ranking",
  operationType: "read",
  description: "Get monthly global, country, and category rankings for a website.",
  requiredScopes: [],
  inputSchema: s.object(
    "The website and month range for a Similarweb ranking query.",
    { domain, startMonth, endMonth, country, webSource, mainDomainOnly },
    { optional: ["country", "webSource", "mainDomainOnly"] },
  ),
  outputSchema: similarwebOutput("Monthly Similarweb ranking measurements."),
});

export const similarwebPpcSpendAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_ppc_spend",
  operationType: "read",
  description: "Get estimated monthly paid-search spending for a website.",
  requiredScopes: [],
  inputSchema: s.object(
    "The website and month range for a Similarweb paid-search spending query.",
    { domain, startMonth, endMonth, country, webSource, mainDomainOnly },
    { optional: ["country", "webSource", "mainDomainOnly"] },
  ),
  outputSchema: similarwebOutput("Monthly Similarweb paid-search spending estimates."),
});

export const similarwebTopSitesAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_top_sites",
  operationType: "read",
  description: "List the highest-ranked websites in an industry category.",
  requiredScopes: [],
  inputSchema: s.object(
    "The category, geography, and page for a Similarweb top-sites query.",
    {
      category: s.string("The industry category to rank, such as Finance."),
      limit,
      country,
      offset,
    },
    { optional: ["country", "offset"] },
  ),
  outputSchema: similarwebOutput("A ranked page of websites in the requested category."),
});

export const similarwebMarketingChannelsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_marketing_channels",
  operationType: "read",
  description: "Get direct, search, social, referral, mail, and display traffic shares.",
  requiredScopes: [],
  inputSchema: s.object(
    "The website and month range for a Similarweb marketing-channel query.",
    { domain, startMonth, endMonth, country, webSource, mainDomainOnly },
    { optional: ["country", "webSource", "mainDomainOnly"] },
  ),
  outputSchema: similarwebOutput("Monthly Similarweb marketing-channel measurements."),
});

const rowQueryFields = {
  domain,
  startMonth,
  endMonth,
  limit,
  country,
  webSource,
  mainDomainOnly,
  offset,
  trafficSource: s.string("The traffic-source segment used to filter the results."),
};

const optionalRowQueryFields = ["country", "webSource", "mainDomainOnly", "offset", "trafficSource"];

export const similarwebReferralsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_referrals",
  operationType: "read",
  description: "List websites that send referral traffic to the target domain.",
  requiredScopes: [],
  inputSchema: s.object("Filters for a Similarweb referral-sources query.", rowQueryFields, {
    optional: optionalRowQueryFields,
  }),
  outputSchema: similarwebOutput("Similarweb referral sources and their traffic measurements."),
});

export const similarwebAdNetworksAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_ad_networks",
  operationType: "read",
  description: "List display-ad networks associated with a website.",
  requiredScopes: [],
  inputSchema: s.object("Filters for a Similarweb ad-networks query.", rowQueryFields, {
    optional: optionalRowQueryFields,
  }),
  outputSchema: similarwebOutput("Similarweb ad networks and their traffic measurements."),
});

export const similarwebSimilarSitesAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_similar_sites",
  operationType: "read",
  description: "List websites whose audience and traffic profile resemble a target website.",
  requiredScopes: [],
  inputSchema: s.object("Filters for a Similarweb similar-sites query.", rowQueryFields, {
    optional: optionalRowQueryFields,
  }),
  outputSchema: similarwebOutput("Similar websites and their affinity measurements."),
});

export const similarwebDemographicsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_demographics",
  operationType: "read",
  description: "Get age and gender distributions for a website's audience in one month.",
  requiredScopes: [],
  inputSchema: s.object(
    "The website and single month for a Similarweb demographics query.",
    {
      domain,
      month: s.string("The complete data month in YYYY-MM format.", {
        pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$",
      }),
      country,
      mainDomainOnly,
    },
    { optional: ["country", "mainDomainOnly"] },
  ),
  outputSchema: similarwebOutput("Similarweb audience age and gender measurements."),
});

export const similarwebDeduplicatedAudienceAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_deduplicated_audience",
  operationType: "read",
  description: "Get deduplicated desktop and mobile-web audience measurements.",
  requiredScopes: [],
  inputSchema: s.object(
    "The website and month range for a Similarweb deduplicated-audience query.",
    { domain, startMonth, endMonth, country, webSource, mainDomainOnly },
    { optional: ["country", "webSource", "mainDomainOnly"] },
  ),
  outputSchema: similarwebOutput("Similarweb deduplicated audience measurements."),
});

export const similarwebAudienceInterestAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_audience_interests",
  operationType: "read",
  description: "List topics and categories that interest a website's audience.",
  requiredScopes: [],
  inputSchema: s.object("Filters for a Similarweb audience-interests query.", rowQueryFields, {
    optional: optionalRowQueryFields,
  }),
  outputSchema: similarwebOutput("Similarweb audience interests and affinity measurements."),
});

export const similarwebAudienceOverlapAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_audience_overlap",
  operationType: "read",
  description: "Compare duplicated and exclusive audiences across two to five websites.",
  requiredScopes: [],
  inputSchema: s.object(
    "The websites and month range for a Similarweb audience-overlap query.",
    {
      domains: s.array("The two to five domains to compare.", domain, {
        minItems: 2,
        maxItems: 5,
        uniqueItems: true,
      }),
      startMonth,
      endMonth,
      country,
    },
    { optional: ["country"] },
  ),
  outputSchema: similarwebOutput("Similarweb audience-overlap measurements for the domains."),
});

export const similarwebTechnologiesAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_technologies",
  operationType: "read",
  description: "List technologies detected on a website for the latest available month.",
  requiredScopes: [],
  inputSchema: s.object(
    "The website, latest data month, and row limit for a Similarweb technologies query.",
    {
      domain,
      month: s.string("The latest available complete month in YYYY-MM format.", {
        pattern: "^[0-9]{4}-(0[1-9]|1[0-2])$",
      }),
      limit,
      country,
      mainDomainOnly,
    },
    { optional: ["country", "mainDomainOnly"] },
  ),
  outputSchema: similarwebOutput("Technologies detected by Similarweb on the website."),
});

export const similarwebPopularPagesAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_popular_pages",
  operationType: "read",
  description: "List the pages that receive the most traffic on a website.",
  requiredScopes: [],
  inputSchema: s.object("Filters for a Similarweb popular-pages query.", rowQueryFields, {
    optional: optionalRowQueryFields,
  }),
  outputSchema: similarwebOutput("Popular pages and their Similarweb traffic measurements."),
});

export const similarwebSubdomainsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_subdomains",
  operationType: "read",
  description: "List the subdomains that receive traffic for a website.",
  requiredScopes: [],
  inputSchema: s.object("Filters for a Similarweb subdomains query.", rowQueryFields, {
    optional: optionalRowQueryFields,
  }),
  outputSchema: similarwebOutput("Subdomains and their Similarweb traffic measurements."),
});

export const similarwebKeywordCompetitorsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_keyword_competitors",
  operationType: "read",
  description: "List domains competing with a website for organic and paid search clicks.",
  requiredScopes: [],
  inputSchema: s.object(
    "Filters for a Similarweb keyword-competitors query.",
    {
      domain,
      startMonth,
      endMonth,
      limit,
      country,
      offset,
      mainDomainOnly,
      trafficSource: rowQueryFields.trafficSource,
    },
    { optional: ["country", "offset", "mainDomainOnly", "trafficSource"] },
  ),
  outputSchema: similarwebOutput("Search competitors and their Similarweb click measurements."),
});

export const similarwebWebsiteKeywordsAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_website_keywords",
  operationType: "read",
  description: "List organic and paid keywords that send search traffic to a website.",
  requiredScopes: [],
  inputSchema: s.object(
    "The website, one-to-three-month range, and row limit for a keywords query.",
    { domain, startMonth, endMonth, limit, country, mainDomainOnly },
    { optional: ["country", "mainDomainOnly"] },
  ),
  outputSchema: similarwebOutput("Website keywords and their Similarweb search measurements."),
});

const serpInputFields = {
  keyword: s.string("The search keyword to analyze."),
  startMonth,
  endMonth,
  limit,
  country,
  offset,
};

export const similarwebSerpPlayersTimeseriesAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_serp_players_timeseries",
  operationType: "read",
  description: "Track how search clicks shift among domains competing for a keyword over time.",
  requiredScopes: [],
  inputSchema: s.object("Filters for a Similarweb SERP-player time series.", serpInputFields, {
    optional: ["country", "offset"],
  }),
  outputSchema: similarwebOutput("Monthly click measurements for domains competing for the keyword."),
});

export const similarwebSerpPlayersAggregatedAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_serp_players_aggregated",
  operationType: "read",
  description: "Compare domains capturing the most search clicks for a keyword.",
  requiredScopes: [],
  inputSchema: s.object("Filters for an aggregated Similarweb SERP-player query.", serpInputFields, {
    optional: ["country", "offset"],
  }),
  outputSchema: similarwebOutput("Aggregated click measurements for domains competing for the keyword."),
});

export const similarwebLandingPagesAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_landing_pages",
  operationType: "read",
  description: "List pages receiving organic or paid search traffic for a website.",
  requiredScopes: [],
  inputSchema: s.object("Filters for a Similarweb landing-pages query.", rowQueryFields, {
    optional: optionalRowQueryFields,
  }),
  outputSchema: similarwebOutput("Search landing pages and their Similarweb traffic measurements."),
});

export const similarwebTrafficSnapshotAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_traffic_snapshot",
  operationType: "read",
  description: "Get the latest visits and engagement snapshot for a website.",
  requiredScopes: [],
  inputSchema: s.object(
    "The website and geography for a Similarweb traffic snapshot.",
    { domain, country },
    { optional: ["country"] },
  ),
  outputSchema: similarwebOutput("The latest Similarweb traffic and engagement snapshot."),
});

export const similarwebTrafficTrendAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_traffic_trend",
  operationType: "read",
  description: "Get the recent monthly traffic trend for a website.",
  requiredScopes: [],
  inputSchema: s.object(
    "The website and geography for a Similarweb traffic trend.",
    { domain, country },
    { optional: ["country"] },
  ),
  outputSchema: similarwebOutput("The recent Similarweb monthly traffic time series."),
});

export const similarwebTopGeographiesAction: ActionDefinition = defineProviderAction(service, {
  name: "get_similarweb_top_geographies",
  operationType: "read",
  description: "Get the top countries by share of a website's traffic for the latest month.",
  requiredScopes: [],
  inputSchema: s.requiredObject("The website for a Similarweb top-geographies query.", { domain }),
  outputSchema: similarwebOutput("The top countries in the website's latest Similarweb traffic."),
});

export const similarwebActions: ActionDefinition[] = [
  similarwebTrafficEngagementAction,
  similarwebRankingAction,
  similarwebPpcSpendAction,
  similarwebTopSitesAction,
  similarwebMarketingChannelsAction,
  similarwebReferralsAction,
  similarwebAdNetworksAction,
  similarwebSimilarSitesAction,
  similarwebDemographicsAction,
  similarwebDeduplicatedAudienceAction,
  similarwebAudienceInterestAction,
  similarwebAudienceOverlapAction,
  similarwebTechnologiesAction,
  similarwebPopularPagesAction,
  similarwebSubdomainsAction,
  similarwebKeywordCompetitorsAction,
  similarwebWebsiteKeywordsAction,
  similarwebSerpPlayersTimeseriesAction,
  similarwebSerpPlayersAggregatedAction,
  similarwebLandingPagesAction,
  similarwebTrafficSnapshotAction,
  similarwebTrafficTrendAction,
  similarwebTopGeographiesAction,
];
