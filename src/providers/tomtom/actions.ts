import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tomtom";

const longitudeSchema = s.number("The longitude in decimal degrees.", { minimum: -180, maximum: 180 });
const latitudeSchema = s.number("The latitude in decimal degrees.", { minimum: -90, maximum: 90 });
const positiveLimitSchema = s.integer("The maximum number of results to return.", { minimum: 1, maximum: 100 });
const autocompleteLimitSchema = s.integer("The maximum number of autocomplete results to return.", {
  minimum: 1,
  maximum: 10,
});
const offsetSchema = s.nonNegativeInteger("The zero-based result offset used for pagination.");
const radiusSchema = s.number("The search radius in meters.", { exclusiveMinimum: 0 });

const countrySetSchema = s.array(
  "The country filters applied to the TomTom request.",
  s.string({
    minLength: 2,
    maxLength: 3,
    description: "One ISO 3166 country code used to filter results.",
  }),
  { minItems: 1 },
);
const categorySetSchema = s.array(
  "The POI category filters applied to the request.",
  s.positiveInteger("One TomTom POI category identifier."),
  { minItems: 1 },
);
const brandSetSchema = s.stringArray("The brand filters applied to the request.", {
  minItems: 1,
  itemDescription: "One brand name used to filter POI results.",
});
const entityTypeSetSchema = s.stringArray("The entity type filters applied to the request.", {
  minItems: 1,
  itemDescription: "One TomTom entity type value.",
});
const resultSetSchema = s.stringArray("The autocomplete segment types included in the response.", {
  minItems: 1,
  itemDescription: "One autocomplete segment type such as brand or category.",
});

const searchSummarySchema = s.looseObject("The summary metadata returned by TomTom search endpoints.", {
  query: s.string("The original query echoed by TomTom when available."),
  queryTime: s.number("The time spent processing the query in milliseconds."),
  numResults: s.integer("The number of results returned in this page."),
  offset: s.integer("The zero-based offset of the current page."),
  totalResults: s.integer("The total number of matching results."),
  fuzzyLevel: s.integer("The fuzzy matching level used by TomTom."),
});
const searchResultsSchema = s.array(
  "The TomTom search results returned by the endpoint.",
  s.looseObject("One TomTom result object."),
);
const fuzzySearchOutputSchema = s.looseObject("The TomTom fuzzy search response.", {
  summary: searchSummarySchema,
  results: searchResultsSchema,
});
const autocompleteOutputSchema = s.looseObject("The TomTom autocomplete response.", {
  context: s.looseObject("The autocomplete context metadata returned by TomTom.", {
    inputQuery: s.string("The original autocomplete query text."),
  }),
  results: searchResultsSchema,
});
const reverseGeocodeOutputSchema = s.looseObject("The TomTom reverse geocoding response.", {
  summary: searchSummarySchema,
  addresses: s.array(
    "The reverse geocoding address results returned by TomTom.",
    s.looseObject("One reverse geocoding address object."),
  ),
});

function optionalPositionInput(description: string, properties: Record<string, JsonSchema>): JsonSchema {
  return s.object(description, properties, { optional: Object.keys(properties).filter((key) => key !== "query") });
}

export const tomtomActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "fuzzy_search",
    operationType: "read",
    description: "Search addresses or places with the TomTom Search API fuzzy search endpoint.",
    inputSchema: optionalPositionInput("Input parameters for TomTom fuzzy search.", {
      query: s.nonEmptyString("The free-form text query sent to TomTom."),
      limit: positiveLimitSchema,
      offset: offsetSchema,
      countrySet: countrySetSchema,
      lat: latitudeSchema,
      lon: longitudeSchema,
      radius: radiusSchema,
      language: s.nonEmptyString("The IETF language tag for results."),
      categorySet: categorySetSchema,
      brandSet: brandSetSchema,
      entityTypeSet: entityTypeSetSchema,
      view: s.nonEmptyString("The geopolitical view applied to results."),
    }),
    outputSchema: fuzzySearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "autocomplete",
    operationType: "read",
    description: "Return autocomplete suggestions from the TomTom Search API.",
    inputSchema: s.object(
      "Input parameters for TomTom autocomplete.",
      {
        query: s.nonEmptyString("The partial text query used for autocomplete suggestions."),
        language: s.nonEmptyString("The IETF language tag for results."),
        limit: autocompleteLimitSchema,
        lat: latitudeSchema,
        lon: longitudeSchema,
        radius: radiusSchema,
        countrySet: countrySetSchema,
        resultSet: resultSetSchema,
      },
      { optional: ["limit", "lat", "lon", "radius", "countrySet", "resultSet"] },
    ),
    outputSchema: autocompleteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "nearby_search",
    operationType: "read",
    description: "Search for nearby places of interest around a coordinate with TomTom.",
    inputSchema: s.object(
      "Input parameters for TomTom nearby search.",
      {
        lat: latitudeSchema,
        lon: longitudeSchema,
        radius: radiusSchema,
        limit: positiveLimitSchema,
        offset: offsetSchema,
        countrySet: countrySetSchema,
        language: s.nonEmptyString("The IETF language tag for results."),
        categorySet: categorySetSchema,
        brandSet: brandSetSchema,
        view: s.nonEmptyString("The geopolitical view applied to results."),
      },
      { optional: ["radius", "limit", "offset", "countrySet", "language", "categorySet", "brandSet", "view"] },
    ),
    outputSchema: fuzzySearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "geocode",
    operationType: "read",
    description: "Convert an address into geographic search results with the TomTom Geocoding API.",
    inputSchema: optionalPositionInput("Input parameters for TomTom geocoding.", {
      query: s.nonEmptyString("The address or place query to geocode."),
      limit: positiveLimitSchema,
      offset: offsetSchema,
      lat: latitudeSchema,
      lon: longitudeSchema,
      radius: radiusSchema,
      countrySet: countrySetSchema,
      language: s.nonEmptyString("The IETF language tag for results."),
      view: s.nonEmptyString("The geopolitical view applied to results."),
      entityTypeSet: entityTypeSetSchema,
    }),
    outputSchema: fuzzySearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "reverse_geocode",
    operationType: "read",
    description: "Convert a coordinate into human-readable address candidates with the TomTom Reverse Geocoding API.",
    inputSchema: s.object(
      "Input parameters for TomTom reverse geocoding.",
      {
        lat: latitudeSchema,
        lon: longitudeSchema,
        radius: radiusSchema,
        entityType: s.nonEmptyString("The TomTom entity type used to shape reverse geocoding results."),
        language: s.nonEmptyString("The IETF language tag for results."),
        returnMatchType: s.boolean("Whether TomTom should include the match type metadata."),
        view: s.nonEmptyString("The geopolitical view applied to results."),
      },
      { optional: ["radius", "entityType", "language", "returnMatchType", "view"] },
    ),
    outputSchema: reverseGeocodeOutputSchema,
  }),
];
