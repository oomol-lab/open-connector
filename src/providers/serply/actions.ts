import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "serply";

const proxyLocationSchema = s.stringEnum("The Serply proxy location used for the request.", [
  "EU",
  "CA",
  "US",
  "IE",
  "GB",
  "FR",
  "DE",
  "SE",
  "IN",
  "JP",
  "KR",
  "SG",
  "AU",
  "BR",
]);

const userAgentSchema = s.stringEnum("The Serply X-User-Agent device mode used for the request.", [
  "desktop",
  "mobile",
]);

const searchLikeInputSchema = s.actionInput(
  {
    query: s.string({
      description: "A URL-encoded query string such as q=openai or q=stock+market&num=10.",
      minLength: 1,
      pattern: "^q=[^?#]+$",
    }),
    proxyLocation: proxyLocationSchema,
    userAgent: userAgentSchema,
  },
  ["query"],
  "Input parameters for one Serply search-style request.",
);

const searchResultItemSchema = s.looseObject("One Serply search result item.", {
  title: s.string("The result title returned by Serply."),
  link: s.string("The result URL returned by Serply."),
  description: s.string("The result description returned by Serply."),
});

const searchLikeOutputSchema = s.object(
  "Normalized output for a Serply search-style response.",
  {
    results: s.array("The search results returned by Serply.", searchResultItemSchema),
    total: s.number("The total number of results returned by Serply."),
    answer: s.nullable(
      s.array("The answer box strings returned by Serply.", s.string("One answer string returned by Serply.")),
    ),
    ts: s.number("The request timestamp returned by Serply."),
    device_region: s.string("The device region returned by Serply."),
    device_type: s.string("The device type returned by Serply."),
  },
  { optional: ["answer", "ts", "device_region", "device_type"] },
);

const newsFeedSchema = s.looseObject("The Google News feed object returned by Serply.", {
  title: s.string("The feed title returned by Serply."),
  generator: s.string("The feed generator returned by Serply."),
  link: s.string("The feed URL returned by Serply."),
  language: s.string("The feed language returned by Serply."),
  publisher: s.string("The feed publisher returned by Serply."),
  updated: s.string("The feed updated timestamp returned by Serply."),
  entries: s.array(
    "The news entries returned by Serply.",
    s.looseObject("One news entry returned by Serply.", {
      title: s.string("The article title returned by Serply."),
      link: s.string("The article URL returned by Serply."),
      summary: s.string("The article summary returned by Serply."),
      published: s.string("The article published timestamp returned by Serply."),
      source: s.string("The article source returned by Serply."),
    }),
  ),
});

export const serplyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "google_search",
    description: "Search Google through Serply and return web search results in JSON format.",
    requiredScopes: [],
    inputSchema: searchLikeInputSchema,
    outputSchema: searchLikeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "google_news_search",
    description: "Search Google News through Serply and return feed-style article results.",
    requiredScopes: [],
    inputSchema: searchLikeInputSchema,
    outputSchema: s.object(
      "Normalized output for a Serply Google News response.",
      {
        feed: newsFeedSchema,
        entities: s.array(
          "The entity objects returned by Serply.",
          s.looseObject("One entity object returned by Serply for the news query."),
        ),
      },
      { optional: ["entities"] },
    ),
  }),
  defineProviderAction(service, {
    name: "google_video_search",
    description: "Search Google Video through Serply and return video search results.",
    requiredScopes: [],
    inputSchema: searchLikeInputSchema,
    outputSchema: searchLikeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "google_scholar_search",
    description: "Search Google Scholar through Serply and return academic result entries.",
    requiredScopes: [],
    inputSchema: searchLikeInputSchema,
    outputSchema: searchLikeOutputSchema,
  }),
];
