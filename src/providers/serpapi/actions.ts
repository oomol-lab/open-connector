import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "serpapi";

const commonOutputSchema = {
  search_metadata: s.looseObject("Search metadata returned by SerpApi."),
  search_parameters: s.looseObject("Search parameters returned by SerpApi."),
  search_information: s.looseObject("Search information returned by SerpApi."),
};

const googleSearchInputSchema = s.actionInput(
  {
    q: s.nonEmptyString("Search query for Google web search."),
    location: s.nonEmptyString("Location used by SerpApi to localize results."),
    hl: s.nonEmptyString("Language code for localized results."),
    gl: s.nonEmptyString("Country code for localized results."),
    start: s.nonNegativeInteger("Zero-based result offset for pagination."),
    num: s.integer("Maximum number of results to return.", { minimum: 1, maximum: 100 }),
    safe: s.nonEmptyString("Safe search setting passed to SerpApi."),
  },
  ["q"],
  "Input parameters for running a Google web search through SerpApi.",
);

const googleNewsInputSchema = s.actionInput(
  {
    q: s.nonEmptyString("Search query for Google News search."),
    hl: s.nonEmptyString("Language code for localized news results."),
    gl: s.nonEmptyString("Country code for localized news results."),
    start: s.nonNegativeInteger("Zero-based result offset for pagination."),
    so: s.nonEmptyString("Sorting option passed to Google News through SerpApi."),
  },
  ["q"],
  "Input parameters for running a Google News search through SerpApi.",
);

const googleMapsInputSchema = s.actionInput(
  {
    q: s.nonEmptyString("Search query for Google Maps search."),
    ll: s.nonEmptyString("Latitude and longitude search context formatted for SerpApi."),
    hl: s.nonEmptyString("Language code for localized maps results."),
    gl: s.nonEmptyString("Country code for localized maps results."),
    start: s.nonNegativeInteger("Zero-based result offset for pagination."),
  },
  ["q"],
  "Input parameters for running a Google Maps search through SerpApi.",
);

export const serpapiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "google_search",
    description: "Run a Google web search through SerpApi.",
    inputSchema: googleSearchInputSchema,
    outputSchema: s.object(
      "Normalized output payload for google_search.",
      {
        ...commonOutputSchema,
        organic_results: s.array(
          "Organic search results returned by SerpApi.",
          s.looseObject("One organic Google search result."),
        ),
        knowledge_graph: s.looseObject("Knowledge graph returned by SerpApi when available."),
        related_questions: s.array(
          "Related questions returned by SerpApi when available.",
          s.looseObject("One related question item."),
        ),
        related_searches: s.array(
          "Related searches returned by SerpApi when available.",
          s.looseObject("One related search item."),
        ),
        top_stories: s.array("Top stories returned by SerpApi when available.", s.looseObject("One top story item.")),
      },
      {
        required: ["search_metadata", "search_parameters", "search_information", "organic_results"],
        optional: ["knowledge_graph", "related_questions", "related_searches", "top_stories"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "google_news_search",
    description: "Run a Google News search through SerpApi.",
    inputSchema: googleNewsInputSchema,
    outputSchema: s.object(
      "Normalized output payload for google_news_search.",
      {
        ...commonOutputSchema,
        news_results: s.array(
          "News search results returned by SerpApi.",
          s.looseObject("One Google News result item."),
        ),
        stories: s.array(
          "Story clusters returned by SerpApi when available.",
          s.looseObject("One Google News story cluster item."),
        ),
        pagination: s.looseObject("Pagination metadata returned by SerpApi when available."),
      },
      {
        required: ["search_metadata", "search_parameters", "search_information", "news_results"],
        optional: ["stories", "pagination"],
      },
    ),
  }),
  defineProviderAction(service, {
    name: "google_maps_search",
    description: "Run a Google Maps search through SerpApi.",
    inputSchema: googleMapsInputSchema,
    outputSchema: s.object(
      "Normalized output payload for google_maps_search.",
      {
        ...commonOutputSchema,
        local_results: s.array(
          "Local search results returned by SerpApi.",
          s.looseObject("One Google Maps local result item."),
        ),
        place_results: s.looseObject("Place details returned by SerpApi when available."),
        pagination: s.looseObject("Pagination metadata returned by SerpApi when available."),
      },
      {
        required: ["search_metadata", "search_parameters", "search_information", "local_results"],
        optional: ["place_results", "pagination"],
      },
    ),
  }),
];
