import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "scrapingdog";

const jsonValueSchema = s.unknown("A JSON-compatible value returned by Scrapingdog.");
const loosePayloadSchema = s.record("The JSON object returned by Scrapingdog for this request.", jsonValueSchema);
const twoLetterCountrySchema = s.string({
  minLength: 2,
  maxLength: 2,
  description: "The two-letter country code used for localized results.",
});

const optionalSearchFields = [
  "domain",
  "country",
  "cr",
  "uule",
  "location",
  "language",
  "lr",
  "ludocid",
  "lsig",
  "kgmid",
  "si",
  "ibp",
  "uds",
  "tbs",
  "safe",
  "nfpr",
  "filter",
  "page",
  "results",
  "advanceSearch",
  "mobSearch",
  "html",
];

const googleMapsPlaceInputSchema: JsonSchema = {
  ...s.object(
    "The input payload for retrieving one Google Maps place through Scrapingdog.",
    {
      dataId: s.nonEmptyString("The Google Maps data ID for a place."),
      placeId: s.nonEmptyString("The Google Maps place ID."),
      country: twoLetterCountrySchema,
      type: s.stringEnum("The Google Maps place request type.", ["place"]),
    },
    { optional: ["dataId", "placeId", "country", "type"] },
  ),
  anyOf: [{ required: ["dataId"] }, { required: ["placeId"] }],
};

export const scrapingdogActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "fetch_html",
    description: "Fetch the HTML response for one target URL through the Scrapingdog Web Scraping API.",
    inputSchema: s.object(
      "The input payload for fetching a web page through Scrapingdog.",
      {
        url: s.url("The decoded target URL to scrape."),
        dynamic: s.boolean("Whether Scrapingdog should render JavaScript for the target page."),
      },
      { optional: ["dynamic"] },
    ),
    outputSchema: s.object(
      "The output payload for fetching a web page through Scrapingdog.",
      {
        html: s.string("The HTML or text content returned by Scrapingdog."),
        statusCode: s.integer("The HTTP status code returned by Scrapingdog."),
        contentType: s.string("The response content type returned by Scrapingdog."),
      },
      { optional: ["contentType"] },
    ),
  }),
  defineProviderAction(service, {
    name: "google_search",
    description: "Run a Google Search request through Scrapingdog and return parsed results.",
    inputSchema: s.object(
      "The input payload for running a Google Search request through Scrapingdog.",
      {
        query: s.nonEmptyString("The Google search query."),
        domain: s.nonEmptyString("The Google domain to use, such as google.com or google.co.uk."),
        country: twoLetterCountrySchema,
        cr: s.nonEmptyString("The Google country restriction filter, such as countryUS."),
        uule: s.nonEmptyString("The encoded Google location parameter."),
        location: s.nonEmptyString("The origin location for the Google search."),
        language: s.nonEmptyString("The Google language code for result localization."),
        lr: s.nonEmptyString("The Google language restriction value, such as lang_en."),
        ludocid: s.nonEmptyString("The Google Business listing ID to extract."),
        lsig: s.nonEmptyString("The Google lsig parameter used for some knowledge graph views."),
        kgmid: s.nonEmptyString("The Google Knowledge Graph ID to scrape."),
        si: s.nonEmptyString("The cached Google search parameter string."),
        ibp: s.nonEmptyString("The Google layout expansion parameter."),
        uds: s.nonEmptyString("The Google filtering string."),
        tbs: s.nonEmptyString("The advanced Google search filter string."),
        safe: s.stringEnum("The Google safe search setting.", ["active", "off"]),
        nfpr: s.boolean("Whether to exclude results for an auto-corrected query."),
        filter: s.boolean("Whether to enable Google's similar and omitted result filters."),
        page: s.integer("The Google Search page number, starting at 0.", { minimum: 0 }),
        results: s.positiveInteger("The number of Google Search results to request."),
        advanceSearch: s.boolean("Whether to request Scrapingdog advanced Google Search parsing."),
        mobSearch: s.boolean("Whether to request mobile Google Search results."),
        html: s.boolean("Whether Scrapingdog should return full Google result page HTML."),
      },
      { optional: optionalSearchFields },
    ),
    outputSchema: s.object("The output payload for a Scrapingdog Google Search request.", {
      data: loosePayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "google_maps_search",
    description: "Run a Google Maps Search request through Scrapingdog.",
    inputSchema: s.object(
      "The input payload for running a Google Maps Search request through Scrapingdog.",
      {
        query: s.nonEmptyString("The Google Maps search query."),
        ll: s.nonEmptyString("The GPS coordinate origin used by Google Maps, such as @40.745,-74,15z."),
        domain: s.nonEmptyString("The Google domain to use for Google Maps results."),
        language: s.nonEmptyString("The language code for localized Google Maps results."),
        country: twoLetterCountrySchema,
        page: s.integer("The Google Maps Search page number, starting at 0.", { minimum: 0 }),
      },
      { optional: ["ll", "domain", "language", "country", "page"] },
    ),
    outputSchema: s.object("The output payload for a Scrapingdog Google Maps Search request.", {
      data: loosePayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "google_maps_place",
    description: "Retrieve details for one Google Maps place through Scrapingdog.",
    inputSchema: googleMapsPlaceInputSchema,
    outputSchema: s.object("The output payload for a Scrapingdog Google Maps Places request.", {
      data: loosePayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "google_scholar_search",
    description: "Run a Google Scholar search request through Scrapingdog.",
    inputSchema: s.object(
      "The input payload for running a Google Scholar search request through Scrapingdog.",
      {
        query: s.nonEmptyString("The Google Scholar search query."),
        html: s.boolean("Whether Scrapingdog should return raw Google Scholar HTML."),
        country: twoLetterCountrySchema,
        language: s.nonEmptyString("The language code for localized Google Scholar results."),
        lr: s.nonEmptyString("The Google Scholar language restriction value, such as lang_en."),
        cites: s.nonEmptyString("The Google Scholar cited-by article ID."),
        cluster: s.nonEmptyString("The Google Scholar article cluster ID."),
        asYlo: s.nonEmptyString("The starting publication year filter."),
        asYhi: s.nonEmptyString("The ending publication year filter."),
        asSdt: s.nonEmptyString("The Google Scholar search type or patent/case law filter."),
        safe: s.stringEnum("The Google Scholar safe search setting.", ["active", "off"]),
        filter: s.boolean("Whether to enable Google's similar and omitted result filters."),
        asVis: s.boolean("Whether citations should be excluded from Scholar results."),
        asRr: s.boolean("Whether only review articles should be returned."),
        page: s.integer("The Google Scholar page number, starting at 0.", { minimum: 0 }),
        results: s.positiveInteger("The number of Google Scholar results to request."),
      },
      {
        optional: [
          "html",
          "country",
          "language",
          "lr",
          "cites",
          "cluster",
          "asYlo",
          "asYhi",
          "asSdt",
          "safe",
          "filter",
          "asVis",
          "asRr",
          "page",
          "results",
        ],
      },
    ),
    outputSchema: s.object("The output payload for a Scrapingdog Google Scholar Search request.", {
      data: loosePayloadSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_account_usage",
    description: "Retrieve Scrapingdog account usage and credit information for the API key.",
    inputSchema: s.object("The input payload for retrieving Scrapingdog account usage.", {}),
    outputSchema: s.object("The output payload for Scrapingdog account usage.", {
      usage: loosePayloadSchema,
    }),
  }),
];
