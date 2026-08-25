import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "search_api";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const positiveInteger = (description: string) => s.integer(description, { minimum: 1 });
const binaryInteger = (description: string) => s.integer(description, { minimum: 0, maximum: 1 });
const searchApiJsonValueSchema = s.unknown("A JSON-compatible value returned by SearchApi.");
const searchDataSchema = s.record("Engine-specific result payload returned by SearchApi.", searchApiJsonValueSchema);

const accountInfoOutputSchema = s.object(
  "Account information payload returned by SearchApi.",
  {
    account: s.object("Account usage information returned by SearchApi.", {
      monthly_allowance: s.integer("Maximum allowable searches per month."),
      remaining_credits: s.integer("Search credits available for the current period."),
      current_month_usage: s.integer("Total searches performed in the current month."),
    }),
    api_usage: s.object("Hourly API usage information returned by SearchApi.", {
      hourly_rate_limit: s.integer("Maximum searches permitted per hour."),
      searches_this_hour: s.integer("Count of searches made within the current hour."),
    }),
    subscription: s.object(
      "Subscription period information returned by SearchApi.",
      {
        period_start: nonEmptyString("Subscription period start timestamp."),
        period_end: nonEmptyString("Subscription period end timestamp."),
      },
      { optional: [] },
    ),
  },
  { optional: ["subscription"] },
);

const locationItemSchema = s.object(
  "One location match returned by SearchApi.",
  {
    name: nonEmptyString("Common display name of the location."),
    canonical_name: nonEmptyString("Canonical location string accepted by SearchApi."),
    target_type: nonEmptyString("Location target type returned by SearchApi."),
    country_code: nonEmptyString("Two-letter country code returned by SearchApi."),
    google_id: s.anyOf("Google location identifier returned by SearchApi.", [
      s.integer("Integer google location identifier."),
      nonEmptyString("String google location identifier."),
    ]),
    google_parent_id: s.anyOf("Google parent location identifier returned by SearchApi.", [
      s.integer("Integer parent location identifier."),
      nonEmptyString("String parent location identifier."),
    ]),
    reach: s.integer("Reach estimate returned by SearchApi."),
    lat: s.number("Latitude coordinate of the location."),
    lon: s.number("Longitude coordinate of the location."),
  },
  { optional: ["google_parent_id", "reach", "lat", "lon"] },
);

const searchResultOutputSchema = s.object(
  "Normalized search result payload returned by SearchApi.",
  {
    search_metadata: s.looseObject("Search metadata returned by SearchApi."),
    search_parameters: s.looseObject("Search parameters returned by SearchApi."),
    search_information: s.looseObject("Optional search information returned by SearchApi."),
    data: searchDataSchema,
  },
  { optional: ["search_information"] },
);

const searchIdInputSchema = {
  ...s.object("Input parameters for retrieving one cached SearchApi result.", {
    searchId: s.string({
      minLength: 1,
      pattern: "^search_",
      description: "Search identifier returned by SearchApi.",
    }),
  }),
};

export const searchApiActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_account_info",
    description: "Retrieve account usage statistics for the connected SearchApi API key.",
    inputSchema: s.object("The input payload for retrieving SearchApi account usage.", {}),
    outputSchema: accountInfoOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search",
    description: "Run one SearchApi search request with the first-pass common query parameters.",
    inputSchema: s.object(
      "Input parameters for executing a SearchApi search request.",
      {
        engine: nonEmptyString("Search engine identifier accepted by SearchApi."),
        q: nonEmptyString("Search query sent to SearchApi."),
        location: nonEmptyString("Canonical search location accepted by SearchApi."),
        gl: nonEmptyString("Two-letter country code used for localized results."),
        hl: nonEmptyString("Two-letter language code used for localized results."),
        lr: nonEmptyString("Document language restriction sent to SearchApi."),
        cr: nonEmptyString("Country restriction sent to SearchApi."),
        num: s.integer("Maximum number of results to request.", { minimum: 1, maximum: 100 }),
        page: positiveInteger("Result page number for pagination."),
        safe: s.stringEnum("Safe search mode sent to SearchApi.", ["active", "blur", "off"]),
        uule: nonEmptyString("Google encoded location parameter sent to SearchApi."),
        kgmid: nonEmptyString("Knowledge Graph identifier sent to SearchApi."),
        device: s.stringEnum("Device type used for the search request.", ["desktop", "mobile", "tablet"]),
        filter: binaryInteger("Duplicate filtering mode sent to SearchApi."),
        nfpr: binaryInteger("Whether to exclude auto-corrected results."),
        googleDomain: nonEmptyString("Google domain override sent to SearchApi."),
        timePeriod: s.stringEnum("Relative date filter sent to SearchApi.", [
          "last_hour",
          "last_day",
          "last_week",
          "last_month",
          "last_year",
        ]),
        timePeriodMin: nonEmptyString("Custom date range start in MM/DD/YYYY format."),
        timePeriodMax: nonEmptyString("Custom date range end in MM/DD/YYYY format."),
        optimizationStrategy: s.stringEnum("Optimization strategy sent to SearchApi.", ["performance", "ads"]),
        zeroRetention: s.boolean("Whether SearchApi should disable logging for the request."),
      },
      {
        optional: [
          "location",
          "gl",
          "hl",
          "lr",
          "cr",
          "num",
          "page",
          "safe",
          "uule",
          "kgmid",
          "device",
          "filter",
          "nfpr",
          "googleDomain",
          "timePeriod",
          "timePeriodMin",
          "timePeriodMax",
          "optimizationStrategy",
          "zeroRetention",
        ],
      },
    ),
    outputSchema: searchResultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_locations",
    description: "Look up canonical SearchApi locations for geo-targeted search queries.",
    inputSchema: s.object(
      "Input parameters for retrieving SearchApi locations.",
      {
        q: nonEmptyString("Search query used to match locations."),
        limit: s.integer("Maximum number of location matches to return.", { minimum: 1, maximum: 100 }),
        zeroRetention: s.boolean("Whether SearchApi should disable logging for the request."),
      },
      { optional: ["limit", "zeroRetention"] },
    ),
    outputSchema: s.object("Location lookup payload returned by SearchApi.", {
      locations: s.array("Location matches returned by SearchApi.", locationItemSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_cached_search_json",
    description: "Retrieve one cached SearchApi search result in JSON format by search identifier.",
    inputSchema: searchIdInputSchema,
    outputSchema: searchResultOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_cached_search_html",
    description: "Retrieve one cached SearchApi search result in HTML format by search identifier.",
    inputSchema: searchIdInputSchema,
    outputSchema: s.object("Cached HTML payload returned by SearchApi.", {
      search_id: nonEmptyString("Search identifier that was retrieved."),
      html_content: nonEmptyString("Cached HTML content returned by SearchApi."),
    }),
  }),
];
