import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "newsdata_io";

const zeroOrOne = s.integer("Boolean-like NewsData.io flag, where 1 means yes and 0 means no.", {
  minimum: 0,
  maximum: 1,
});
const priorityDomain = s.stringEnum("News source reputation tier filter.", ["top", "medium", "low"]);
const sentiment = s.stringEnum("AI sentiment label used to filter articles.", ["positive", "negative", "neutral"]);
const size = s.integer("Number of articles to request, from 1 to 50.", { minimum: 1, maximum: 50 });

const articleSchema = s.looseObject("A NewsData.io article object.", {
  article_id: s.string("Unique NewsData.io article identifier."),
  title: s.string("Article headline."),
  link: s.url("Canonical article URL."),
  keywords: s.array("Keywords associated with the article.", s.string("One keyword.")),
  creator: s.array("Article creators or authors.", s.string("One creator or author.")),
  video_url: s.nullableString("Video URL associated with the article."),
  description: s.nullableString("Article summary or description."),
  content: s.nullableString("Article content returned by NewsData.io."),
  pubDate: s.string("Publication date-time string returned by NewsData.io."),
  image_url: s.nullableString("Featured image URL for the article."),
  source_id: s.string("NewsData.io source identifier."),
  source_name: s.string("Display name of the news source."),
  language: s.string("Article language."),
  country: s.array("Countries associated with the article.", s.string("One country.")),
  category: s.array("Categories associated with the article.", s.string("One category.")),
  sentiment: s.string("Sentiment label returned for the article."),
  duplicate: s.boolean("Whether NewsData.io marked this article as a duplicate."),
});
const newsCollectionOutput = s.looseRequiredObject(
  "NewsData.io article collection response.",
  {
    status: s.string("Top-level request status returned by NewsData.io."),
    totalResults: s.integer("Total number of matching articles available."),
    results: s.array("Articles returned for this request.", articleSchema),
    nextPage: s.string("Cursor token to request the next page."),
  },
  { optional: ["totalResults", "nextPage"] },
);
const sourceOutput = s.looseObject("A NewsData.io source object.", {
  id: s.string("Source domain identifier."),
  name: s.string("Source display name."),
  url: s.url("Source homepage URL."),
  category: s.array("Categories associated with the source.", s.string("One source category.")),
  language: s.array("Languages associated with the source.", s.string("One language code.")),
  country: s.array("Countries associated with the source.", s.string("One country code.")),
});
const sourcesOutput = s.looseRequiredObject("NewsData.io source listing response.", {
  status: s.string("Top-level request status returned by NewsData.io."),
  results: s.array("Sources returned for this request.", sourceOutput),
});

const baseArticleFilterProperties = {
  id: s.nonEmptyString("Comma-separated NewsData.io article IDs to fetch."),
  q: s.string("Keyword or phrase search across article title, content, URL, and metadata.", {
    minLength: 1,
    maxLength: 512,
  }),
  qInTitle: s.string("Keyword or phrase search restricted to article titles.", { minLength: 1, maxLength: 512 }),
  qInMeta: s.string("Keyword or phrase search restricted to article title, URL, and metadata.", {
    minLength: 1,
    maxLength: 512,
  }),
  country: s.nonEmptyString("Comma-separated country codes, up to 5 values."),
  category: s.nonEmptyString("Comma-separated categories to include, up to 5 values."),
  excludecategory: s.nonEmptyString("Comma-separated categories to exclude, up to 5 values."),
  language: s.nonEmptyString("Comma-separated language codes, up to 5 values."),
  domain: s.nonEmptyString("Comma-separated source domain names, up to 5 values."),
  domainurl: s.nonEmptyString("Comma-separated source domain URLs, up to 5 values."),
  excludedomain: s.nonEmptyString("Comma-separated source domain URLs to exclude."),
  excludefield: s.nonEmptyString("Comma-separated response fields to exclude."),
  prioritydomain: priorityDomain,
  timezone: s.nonEmptyString("Timezone filter such as America/New_York or Europe/Berlin."),
  full_content: zeroOrOne,
  image: zeroOrOne,
  video: zeroOrOne,
  size,
  page: s.nonEmptyString("Pagination cursor returned as nextPage from a previous response."),
};
const baseArticleFilterKeys = Object.keys(baseArticleFilterProperties);

function articleFiltersInput(
  description: string,
  extraProperties: Record<string, JsonSchema>,
  extraOptional: string[],
): JsonSchema {
  return s.object(
    description,
    { ...baseArticleFilterProperties, ...extraProperties },
    {
      optional: [...baseArticleFilterKeys, ...extraOptional],
    },
  );
}

const latestNewsInput = articleFiltersInput(
  "Input parameters for retrieving latest NewsData.io articles.",
  {
    timeframe: s.nonEmptyString("Latest-news time window in hours, 1 to 48, or minutes such as 15m."),
    tag: s.nonEmptyString("Comma-separated AI-classified tags, up to 5 values."),
    sentiment,
    region: s.nonEmptyString("Comma-separated geographic regions on supported plans."),
    removeduplicate: zeroOrOne,
  },
  ["timeframe", "tag", "sentiment", "region", "removeduplicate"],
);
const archiveInput = {
  ...articleFiltersInput(
    "Input parameters for searching NewsData.io historical archive articles.",
    {
      from_date: s.nonEmptyString("Archive start date or date-time."),
      to_date: s.nonEmptyString("Archive end date or date-time."),
    },
    ["from_date", "to_date"],
  ),
  anyOf: [
    { required: ["q"] },
    { required: ["qInTitle"] },
    { required: ["qInMeta"] },
    { required: ["domain"] },
    { required: ["country"] },
    { required: ["category"] },
    { required: ["language"] },
    { required: ["full_content"] },
    { required: ["image"] },
    { required: ["video"] },
    { required: ["prioritydomain"] },
    { required: ["domainurl"] },
  ],
} satisfies JsonSchema;
const cryptoInput = articleFiltersInput(
  "Input parameters for retrieving NewsData.io crypto news articles.",
  {
    coin: s.nonEmptyString("Comma-separated crypto coin symbols, up to 5 values."),
    from_date: s.nonEmptyString("Crypto news start date or date-time."),
    to_date: s.nonEmptyString("Crypto news end date or date-time."),
    timeframe: s.nonEmptyString("Crypto news time window in hours, 1 to 48, or minutes such as 15m."),
    tag: s.nonEmptyString("Comma-separated crypto AI-classified tags, up to 5 values."),
    sentiment,
    removeduplicate: zeroOrOne,
  },
  ["coin", "from_date", "to_date", "timeframe", "tag", "sentiment", "removeduplicate"],
);
const sourcesInput = s.object(
  "Input parameters for listing NewsData.io sources.",
  {
    country: s.nonEmptyString("Comma-separated country codes, up to 5 values."),
    category: s.nonEmptyString("Comma-separated categories, up to 5 values."),
    language: s.nonEmptyString("Comma-separated language codes, up to 5 values."),
    prioritydomain: priorityDomain,
    domainurl: s.nonEmptyString("Single source domain URL to look up."),
  },
  { optional: ["country", "category", "language", "prioritydomain", "domainurl"] },
);

export const newsdataIoActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_latest_news",
    description: "Retrieve the latest and breaking news from NewsData.io with optional filters.",
    inputSchema: latestNewsInput,
    outputSchema: newsCollectionOutput,
  }),
  defineProviderAction(service, {
    name: "search_news_archive",
    description: "Search historical NewsData.io archive articles with keyword, taxonomy, and date filters.",
    inputSchema: archiveInput,
    outputSchema: newsCollectionOutput,
  }),
  defineProviderAction(service, {
    name: "list_crypto_news",
    description: "Retrieve cryptocurrency-related news articles from NewsData.io.",
    inputSchema: cryptoInput,
    outputSchema: newsCollectionOutput,
  }),
  defineProviderAction(service, {
    name: "list_news_sources",
    description: "List NewsData.io source domains with optional country, category, and language filters.",
    inputSchema: sourcesInput,
    outputSchema: sourcesOutput,
  }),
];
