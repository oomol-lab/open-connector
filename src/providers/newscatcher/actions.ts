import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "newscatcher" as const;

const stringList = (description: string, itemDescription: string) =>
  s.array(description, s.nonEmptyString(itemDescription), { minItems: 1 });

const pageSchema = s.integer("The one-based result page to return.", { minimum: 1 });
const pageSizeSchema = s.integer("The number of results per page, up to 1000.", {
  minimum: 1,
  maximum: 1000,
});
const sortBySchema = s.stringEnum("The order used for matching articles.", ["relevancy", "date", "rank"]);

const articleSchema = s.looseRequiredObject(
  "One NewsCatcher article. Fields vary with the subscription plan and requested enrichments.",
  {
    id: s.string("The NewsCatcher article identifier."),
    title: s.string("The article title."),
    link: s.string("The canonical article URL."),
    published_date: s.string("The article publication timestamp."),
  },
  { optional: ["id", "title", "link", "published_date"] },
);

const articleResponseSchema = s.looseRequiredObject(
  "A paginated NewsCatcher article response.",
  {
    status: s.string("The response status reported by NewsCatcher."),
    total_hits: s.integer("The number of matching articles, capped by the API search window."),
    page: s.integer("The returned page number."),
    total_pages: s.integer("The number of available pages."),
    page_size: s.integer("The requested page size."),
    articles: s.array("The matching articles.", articleSchema),
    user_input: s.looseObject("The effective filters reported by NewsCatcher."),
  },
  { optional: ["articles", "user_input"] },
);

const commonArticleFilters = {
  lang: stringList("The article language codes to include.", "One ISO 639-1 language code."),
  countries: stringList("The publisher country codes to include.", "One ISO 3166-1 alpha-2 country code."),
  sources: stringList("The source domains to include.", "One source domain."),
  not_sources: stringList("The source domains to exclude.", "One excluded source domain."),
  from_: s.string("The earliest publication date or relative time accepted by NewsCatcher."),
  to_: s.string("The latest publication date or relative time accepted by NewsCatcher."),
  sort_by: sortBySchema,
  page: pageSchema,
  page_size: pageSizeSchema,
  include_nlp_data: s.boolean("Whether to include available NewsCatcher NLP enrichments."),
  exclude_duplicates: s.boolean("Whether to exclude duplicate articles."),
} as const;

const commonArticleOptionalFields = [
  "lang",
  "countries",
  "sources",
  "not_sources",
  "from_",
  "to_",
  "sort_by",
  "page",
  "page_size",
  "include_nlp_data",
  "exclude_duplicates",
] as const;

const searchArticlesAction = defineProviderAction(service, {
  name: "search_articles",
  operationType: "read",
  description: "Search NewsCatcher's global news index with practical publication filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for searching NewsCatcher articles.",
    {
      q: s.nonEmptyString("The keyword, phrase, or Boolean query to search for."),
      ...commonArticleFilters,
    },
    { optional: [...commonArticleOptionalFields] },
  ),
  outputSchema: articleResponseSchema,
});

const latestHeadlinesAction = defineProviderAction(service, {
  name: "get_latest_headlines",
  operationType: "read",
  description: "Retrieve recent NewsCatcher headlines with source and publication filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for retrieving NewsCatcher latest headlines.",
    {
      when: s.string("The recent time window, such as 1h, 24h, 7d, or 30d."),
      lang: commonArticleFilters.lang,
      countries: commonArticleFilters.countries,
      sources: commonArticleFilters.sources,
      not_sources: commonArticleFilters.not_sources,
      page: commonArticleFilters.page,
      page_size: commonArticleFilters.page_size,
      include_nlp_data: commonArticleFilters.include_nlp_data,
    },
    {
      optional: ["when", "lang", "countries", "sources", "not_sources", "page", "page_size", "include_nlp_data"],
    },
  ),
  outputSchema: articleResponseSchema,
});

const sourceSchema = s.looseRequiredObject(
  "One news source indexed by NewsCatcher.",
  {
    domain_url: s.string("The source domain URL."),
    name_source: s.string("The source display name."),
  },
  { optional: ["name_source"] },
);

const listSourcesAction = defineProviderAction(service, {
  name: "list_sources",
  operationType: "read",
  description: "List news sources indexed by NewsCatcher using language and country filters.",
  requiredScopes: [],
  inputSchema: s.object(
    "The input payload for listing NewsCatcher sources.",
    {
      lang: stringList("The source language codes to include.", "One ISO 639-1 language code."),
      countries: stringList("The source country codes to include.", "One ISO 3166-1 alpha-2 country code."),
      predefined_sources: s.string("A documented NewsCatcher predefined source collection."),
      source_name: s.string("A source name to match."),
      source_url: s.string("A source domain URL to match."),
      include_additional_info: s.boolean("Whether to include rank, country, and domain classification metadata."),
    },
    {
      optional: ["lang", "countries", "predefined_sources", "source_name", "source_url", "include_additional_info"],
    },
  ),
  outputSchema: s.looseRequiredObject("A NewsCatcher source response.", {
    message: s.string("The result message reported by NewsCatcher."),
    sources: s.array(
      "The matching news sources.",
      s.anyOf("A detailed source object or a source domain string.", [
        sourceSchema,
        s.string("A source domain returned by NewsCatcher."),
      ]),
    ),
    user_input: s.looseObject("The effective source filters reported by NewsCatcher."),
  }),
});

const getSubscriptionAction = defineProviderAction(service, {
  name: "get_subscription",
  operationType: "read",
  description: "Retrieve the active NewsCatcher subscription plan and remaining API allowance.",
  requiredScopes: [],
  inputSchema: s.object("The input payload for retrieving the NewsCatcher subscription.", {}),
  outputSchema: s.looseRequiredObject("The current NewsCatcher subscription details.", {
    active: s.boolean("Whether the NewsCatcher subscription is active."),
    concurrent_calls: s.integer("The plan's concurrent request allowance."),
    plan: s.string("The subscription plan name."),
    plan_calls: s.integer("The plan's total call allowance."),
    remaining_calls: s.integer("The number of calls remaining in the current allowance."),
    historical_days: s.integer("The number of historical news days available to the plan."),
  }),
});

export const newscatcherActions: ActionDefinition[] = [
  searchArticlesAction,
  latestHeadlinesAction,
  listSourcesAction,
  getSubscriptionAction,
];
