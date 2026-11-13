import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "autom";

const finderInputSchema = s.actionInput(
  {
    query: s.nonEmptyString("Search text used to filter Autom finder results."),
  },
  ["query"],
  "Input parameters for an Autom finder lookup.",
);

const periodSchema = s.actionOutput(
  {
    start: s.string("The start date of the current billing period."),
    end: s.string("The end date of the current billing period."),
  },
  "The current Autom billing period.",
);

const subscriptionSchema = s.actionOutput(
  {
    used: s.integer("The number of subscription calls used in the current billing period."),
    total: s.integer("The subscription call quota for the current billing period."),
    remaining: s.integer("The number of subscription calls remaining."),
    percent_used: s.number("The percentage of subscription quota consumed."),
  },
  "Autom subscription quota usage.",
);

const creditsSchema = s.looseRequiredObject(
  "Autom extra credit usage.",
  {
    given: s.integer("The number of extra credits added to the account."),
    consumed: s.integer("The number of extra credits consumed."),
    remaining: s.integer("The number of extra credits remaining."),
    percent_used: s.number("The percentage of extra credits consumed when returned."),
  },
  { optional: ["percent_used"] },
);

const rateLimitSchema = s.actionOutput(
  {
    per_minute: s.nullableInteger("The requests-per-minute limit, or null when unlimited."),
    per_second: s.nullableInteger("The requests-per-second limit, or null when unlimited."),
  },
  "Autom account rate limits.",
);

const accountSchema = s.actionOutput(
  {
    name: s.string("The Autom account name."),
    slug: s.string("The Autom account slug."),
  },
  "Autom account metadata.",
);

const quotaSchema = s.nullableInteger("The configured per-key quota, or null when unlimited.");

const apiKeySchema = s.actionOutput(
  {
    alias: s.string("The friendly API key alias."),
    active: s.boolean("Whether the API key is active."),
    category: s.string("The API key category."),
    expires: s.nullableString("The API key expiry date, or null when it never expires."),
    quotas: s.looseObject(
      {
        total: quotaSchema,
        daily: quotaSchema,
        weekly: quotaSchema,
        monthly: quotaSchema,
      },
      { description: "Custom per-key quotas." },
    ),
  },
  "Autom API key metadata.",
);

const usageOutputSchema = s.actionOutput(
  {
    remaining: s.integer("Credits available right now."),
    total_used: s.integer("Credits consumed in the current billing period."),
    renewal_date: s.string("The ISO 8601 date when the subscription renews."),
    period: periodSchema,
    subscription: subscriptionSchema,
    credits: creditsSchema,
    rate_limit: rateLimitSchema,
    account: accountSchema,
    api_key: apiKeySchema,
  },
  "Autom usage, account, and API key details.",
);

const googleCountrySchema = s.actionOutput(
  {
    country_code: s.string("The Google country code."),
    country_name: s.string("The Google country name."),
  },
  "One Google country supported by Autom.",
);

const googleLanguageSchema = s.actionOutput(
  {
    language_code: s.string("The Google language code."),
    language_name: s.string("The Google language name."),
  },
  "One Google language supported by Autom.",
);

const googleLocationSchema = s.actionOutput(
  {
    id: s.string("The Autom location identifier."),
    gps: s.array("The location GPS coordinates as latitude and longitude.", s.number("One GPS coordinate.")),
    name: s.string("The location name."),
    reach: s.integer("The estimated Google reach for the location."),
    google_id: s.integer("The Google location identifier."),
    target_type: s.string("The Google target type."),
    country_code: s.string("The Google country code for the location."),
    canonical_name: s.string("The canonical Google location name."),
  },
  "One Google location supported by Autom.",
);

const automSearchResultSchema = s.looseObject(
  "One search result returned by Autom.",
  {
    position: s.nullableNumber("Position of the result on the page."),
    title: s.nullableString("Title of the result."),
    link: s.nullableString("URL of the result."),
    domain: s.nullableString("Domain of the result."),
    displayed_link: s.nullableString("Link as the search engine displays it."),
    source: s.nullableString("Source or site name."),
    snippet: s.nullableString("Snippet shown under the title."),
    date: s.nullableString("Date shown with the result, when there is one."),
  },
  { optional: ["position", "title", "link", "domain", "displayed_link", "source", "snippet", "date"] },
);

const automKnowledgeGraphSchema = s.looseObject(
  "Knowledge graph panel, when Google shows one.",
  {
    title: s.nullableString("Title of the entity."),
    type: s.nullableString("Type of the entity."),
    website: s.nullableString("Website of the entity."),
  },
  { optional: ["title", "type", "website"] },
);

const automPlaceSchema = s.looseObject(
  "One place returned by Autom.",
  {
    title: s.nullableString("Name of the place."),
    address: s.nullableString("Address of the place."),
    website: s.nullableString("Website of the place."),
    phone_number: s.nullableString("Phone number of the place."),
    lat: s.nullableNumber("Latitude."),
    long: s.nullableNumber("Longitude."),
    fid: s.nullableString("Google Maps feature ID of the place."),
  },
  { optional: ["title", "address", "website", "phone_number", "lat", "long", "fid"] },
);

export const automActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_usage",
    operationType: "read",
    description:
      "Get current Autom credit usage, subscription quota, rate limits, account metadata, and API key metadata.",
    inputSchema: s.actionInput({}, [], "Input parameters for getting Autom usage."),
    outputSchema: usageOutputSchema,
  }),
  defineProviderAction(service, {
    name: "find_google_countries",
    operationType: "read",
    description: "Search supported Google countries in Autom and return matching country codes.",
    inputSchema: finderInputSchema,
    outputSchema: s.actionOutput(
      {
        countries: s.array("The matching Google countries.", googleCountrySchema),
      },
      "Matching Google countries returned by Autom.",
    ),
  }),
  defineProviderAction(service, {
    name: "find_google_languages",
    operationType: "read",
    description: "Search supported Google languages in Autom and return matching language codes.",
    inputSchema: finderInputSchema,
    outputSchema: s.actionOutput(
      {
        languages: s.array("The matching Google languages.", googleLanguageSchema),
      },
      "Matching Google languages returned by Autom.",
    ),
  }),
  defineProviderAction(service, {
    name: "find_google_locations",
    operationType: "read",
    description: "Search supported Google locations in Autom and return matching location IDs.",
    inputSchema: finderInputSchema,
    outputSchema: s.actionOutput(
      {
        locations: s.array("The matching Google locations.", googleLocationSchema),
      },
      "Matching Google locations returned by Autom.",
    ),
  }),
  defineProviderAction(service, {
    name: "google_search",
    operationType: "read",
    description:
      "Search Google and get organic results with their position, title, link and snippet, the knowledge graph and the estimated total.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString('Search query (e.g., "best electric cars").'),
        country: s.nonEmptyString('Two-letter country code to search from (e.g., "us").'),
        language: s.nonEmptyString('Two-letter language code of the results (e.g., "en").'),
        tbs: s.nonEmptyString('Google advanced filters, such as "qdr:d" for the past day.'),
        safe: s.stringEnum("Google SafeSearch setting. Omit to use Google's default.", ["active", "off"]),
        location: s.nonEmptyString(
          'Google location name to search from, as Find Google Locations returns it (e.g., "Paris,Paris,Ile-de-France,France").',
        ),
        page: s.integer("Page of results, starting at 1.", { minimum: 1 }),
        numResults: s.integer("Number of results per page (e.g., 10).", { minimum: 1 }),
      },
      ["query"],
      "Input for Google Search.",
    ),
    outputSchema: s.looseObject(
      "The Autom response for Google Search.",
      {
        organic_results: s.array("Organic results.", automSearchResultSchema),
        knowledge_graph: automKnowledgeGraphSchema,
        search_information: s.looseObject(
          "Search information returned by Autom.",
          {
            total_results: s.nullableNumber("Estimated total number of results."),
          },
          { optional: ["total_results"] },
        ),
        pagination: s.looseObject(
          "Pagination returned by Autom.",
          {
            has_next_page: s.nullableBoolean("Whether another page of results exists."),
          },
          { optional: ["has_next_page"] },
        ),
      },
      { optional: ["organic_results", "knowledge_graph", "search_information", "pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "google_search_light",
    operationType: "read",
    description: "Search Google and get only the organic results, the fastest and cheapest Google search.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString('Search query (e.g., "best electric cars").'),
        country: s.nonEmptyString('Two-letter country code to search from (e.g., "us").'),
        language: s.nonEmptyString('Two-letter language code of the results (e.g., "en").'),
      },
      ["query"],
      "Input for Google Search (Organic Only).",
    ),
    outputSchema: s.looseObject(
      "The Autom response for Google Search (Organic Only).",
      {
        organic_results: s.array("Organic results.", automSearchResultSchema),
      },
      { optional: ["organic_results"] },
    ),
  }),
  defineProviderAction(service, {
    name: "google_news",
    operationType: "read",
    description: "Search Google News and get articles with title, source, date, link and snippet.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString('Search query (e.g., "best electric cars").'),
        country: s.nonEmptyString('Two-letter country code to search from (e.g., "us").'),
        language: s.nonEmptyString('Two-letter language code of the results (e.g., "en").'),
        page: s.integer("Page of results, starting at 1.", { minimum: 1 }),
        numResults: s.integer("Number of results per page (e.g., 10).", { minimum: 1 }),
      },
      ["query"],
      "Input for Google News.",
    ),
    outputSchema: s.looseObject(
      "The Autom response for Google News.",
      {
        organic_results: s.array("News articles.", automSearchResultSchema),
        pagination: s.looseObject(
          "Pagination returned by Autom.",
          {
            has_next_page: s.nullableBoolean("Whether another page of results exists."),
          },
          { optional: ["has_next_page"] },
        ),
      },
      { optional: ["organic_results", "pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "google_maps",
    operationType: "read",
    description: "Search Google Maps and get places with address, website, phone number and coordinates.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString('Search query (e.g., "best electric cars").'),
        country: s.nonEmptyString('Two-letter country code to search from (e.g., "us").'),
        language: s.nonEmptyString('Two-letter language code of the results (e.g., "en").'),
        page: s.integer("Page of results, starting at 1.", { minimum: 1 }),
      },
      ["query"],
      "Input for Google Maps.",
    ),
    outputSchema: s.actionOutput(
      { places: s.array("Places found on Google Maps", automPlaceSchema) },
      "Places found on Google Maps from Autom.",
    ),
  }),
  defineProviderAction(service, {
    name: "google_autocomplete",
    operationType: "read",
    description: "Get the Google Search autocomplete suggestions for a partial query.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString('Search query (e.g., "best electric cars").'),
        country: s.nonEmptyString('Two-letter country code to search from (e.g., "us").'),
        language: s.nonEmptyString('Two-letter language code of the results (e.g., "en").'),
      },
      ["query"],
      "Input for Google Autocomplete.",
    ),
    outputSchema: s.looseObject(
      "The Autom response for Google Autocomplete.",
      {
        suggestions: s.stringArray("Autocomplete suggestions."),
      },
      { optional: ["suggestions"] },
    ),
  }),
  defineProviderAction(service, {
    name: "bing_search",
    operationType: "read",
    description: "Search Bing and get organic results with their position, title, link and snippet.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString('Search query (e.g., "best electric cars").'),
        market: s.nonEmptyString('Bing market code (e.g., "en-US").'),
        page: s.integer("Page of results, starting at 1.", { minimum: 1 }),
        numResults: s.integer("Number of results per page (e.g., 10).", { minimum: 1 }),
      },
      ["query"],
      "Input for Bing Search.",
    ),
    outputSchema: s.looseObject(
      "The Autom response for Bing Search.",
      {
        organic_results: s.array("Organic results.", automSearchResultSchema),
        search_information: s.looseObject(
          "Search information returned by Autom.",
          {
            total_results: s.nullableNumber("Estimated total number of results."),
          },
          { optional: ["total_results"] },
        ),
        pagination: s.looseObject(
          "Pagination returned by Autom.",
          {
            has_next_page: s.nullableBoolean("Whether another page of results exists."),
          },
          { optional: ["has_next_page"] },
        ),
      },
      { optional: ["organic_results", "search_information", "pagination"] },
    ),
  }),
  defineProviderAction(service, {
    name: "duckduckgo_search",
    operationType: "read",
    description: "Search DuckDuckGo and get organic results with their position, title, link and snippet.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString('Search query (e.g., "best electric cars").'),
        country: s.nonEmptyString('Two-letter country code to search from (e.g., "us").'),
        language: s.nonEmptyString('Two-letter language code of the results (e.g., "en").'),
        page: s.integer("Page of results, starting at 1.", { minimum: 1 }),
      },
      ["query"],
      "Input for DuckDuckGo Search.",
    ),
    outputSchema: s.looseObject(
      "The Autom response for DuckDuckGo Search.",
      {
        organic_results: s.array("Organic results.", automSearchResultSchema),
      },
      { optional: ["organic_results"] },
    ),
  }),
  defineProviderAction(service, {
    name: "yahoo_search",
    operationType: "read",
    description: "Search Yahoo and get organic results with their position, title, link and snippet.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString('Search query (e.g., "best electric cars").'),
        country: s.nonEmptyString('Two-letter country code to search from (e.g., "us").'),
        language: s.nonEmptyString('Two-letter language code of the results (e.g., "en").'),
        page: s.integer("Page of results, starting at 1.", { minimum: 1 }),
      },
      ["query"],
      "Input for Yahoo Search.",
    ),
    outputSchema: s.looseObject(
      "The Autom response for Yahoo Search.",
      {
        organic_results: s.array("Organic results.", automSearchResultSchema),
      },
      { optional: ["organic_results"] },
    ),
  }),
  defineProviderAction(service, {
    name: "brave_search",
    operationType: "read",
    description: "Search Brave's web index and get organic results with their position, title, link and snippet.",
    inputSchema: s.actionInput(
      {
        query: s.nonEmptyString('Search query (e.g., "best electric cars").'),
        country: s.nonEmptyString('Two-letter country code to search from (e.g., "us").'),
        language: s.nonEmptyString('Two-letter language code of the results (e.g., "en").'),
        page: s.integer("Page of results, starting at 1.", { minimum: 1 }),
      },
      ["query"],
      "Input for Brave Search.",
    ),
    outputSchema: s.looseObject(
      "The Autom response for Brave Search.",
      {
        organic_results: s.array("Organic results.", automSearchResultSchema),
      },
      { optional: ["organic_results"] },
    ),
  }),
];
