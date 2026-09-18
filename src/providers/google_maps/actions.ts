import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "google_maps";

function upstreamObject(description: string): JsonSchema {
  return s.record(description, s.unknown("An upstream Google Maps API JSON property value."));
}

const localeFields = {
  languageCode: s.nonEmptyString("The BCP 47 language code for localized results."),
  regionCode: s.nonEmptyString("The two-character CLDR region code used to format results."),
};
const fieldMask = s.nonEmptyString("The comma-separated response field mask; requested fields affect Google billing.");
const placesOutput = s.looseObject(
  {
    places: s.array("The places returned by Google.", upstreamObject("A Google Places place resource.")),
    nextPageToken: s.string("The token for retrieving the next page."),
    searchUri: s.string("The Google Maps URL for the search."),
  },
  { description: "A Google Places search response." },
);
const nearbyPlacesOutput = s.looseObject(
  {
    places: s.array("The places returned by Google.", upstreamObject("A Google Places place resource.")),
    routingSummaries: s.array(
      "Routing summaries returned when routing parameters are requested.",
      upstreamObject("One routing summary."),
    ),
  },
  { description: "A Google Places nearby search response." },
);

export const googleMapsActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_places",
    operationType: "read",
    description: "Search Google Places using a text query.",
    inputSchema: s.looseRequiredObject(
      "Input for a Google Places text search.",
      {
        textQuery: s.nonEmptyString("The text query describing a place or category to find."),
        fieldMask,
        pageSize: s.integer("The number of results to return, from 1 through 20.", { minimum: 1, maximum: 20 }),
        pageToken: s.nonEmptyString("The token returned by a previous text search."),
        ...localeFields,
      },
      { optional: ["fieldMask", "pageSize", "pageToken", "languageCode", "regionCode"] },
    ),
    outputSchema: placesOutput,
  }),
  defineProviderAction(service, {
    name: "search_nearby_places",
    operationType: "read",
    description: "Search Google Places near a geographic point.",
    inputSchema: s.looseRequiredObject(
      "Input for a Google Places nearby search.",
      {
        latitude: s.number("The center latitude in decimal degrees.", { minimum: -90, maximum: 90 }),
        longitude: s.number("The center longitude in decimal degrees.", { minimum: -180, maximum: 180 }),
        radiusMeters: s.number("The search radius in meters, greater than 0 and at most 50000.", {
          exclusiveMinimum: 0,
          maximum: 50000,
        }),
        fieldMask,
        includedTypes: s.array("The place types to include.", s.nonEmptyString("One supported place type."), {
          maxItems: 50,
        }),
        excludedTypes: s.array("The place types to exclude.", s.nonEmptyString("One supported place type."), {
          maxItems: 50,
        }),
        ...localeFields,
      },
      { optional: ["fieldMask", "includedTypes", "excludedTypes", "languageCode", "regionCode"] },
    ),
    outputSchema: nearbyPlacesOutput,
  }),
  defineProviderAction(service, {
    name: "get_place",
    operationType: "read",
    description: "Get details for a Google Place by place ID.",
    inputSchema: s.looseRequiredObject(
      "Input for retrieving Google Place details.",
      { placeId: s.nonEmptyString("The Google Place ID to retrieve."), fieldMask, ...localeFields },
      { optional: ["fieldMask", "languageCode", "regionCode"] },
    ),
    outputSchema: upstreamObject("A Google Places place resource."),
  }),
  defineProviderAction(service, {
    name: "autocomplete_places",
    operationType: "read",
    description: "Return Google Places autocomplete predictions for text input.",
    inputSchema: s.looseRequiredObject(
      "Input for Google Places autocomplete.",
      {
        input: s.nonEmptyString("The text for which to return place or query predictions."),
        sessionToken: s.nonEmptyString("A URL-safe token that groups one autocomplete session."),
        ...localeFields,
      },
      { optional: ["sessionToken", "languageCode", "regionCode"] },
    ),
    outputSchema: s.looseObject(
      { suggestions: s.array("The autocomplete suggestions.", upstreamObject("One place or query suggestion.")) },
      { description: "A Google Places autocomplete response." },
    ),
  }),
  defineProviderAction(service, {
    name: "geocode_address",
    operationType: "read",
    description: "Convert an address into geographic coordinates with Google Geocoding.",
    inputSchema: s.object(
      {
        address: s.nonEmptyString("The human-readable street address to geocode."),
        bounds: s.nonEmptyString("The viewport bounds used to bias results."),
        components: s.nonEmptyString("The pipe-separated component filters."),
        language: s.nonEmptyString("The language code for results."),
        region: s.nonEmptyString("The two-character region code used to bias results."),
      },
      { description: "Input for geocoding an address.", optional: ["bounds", "components", "language", "region"] },
    ),
    outputSchema: upstreamObject("A Google Geocoding response."),
  }),
  defineProviderAction(service, {
    name: "reverse_geocode",
    operationType: "read",
    description: "Convert geographic coordinates into addresses with Google Geocoding.",
    inputSchema: s.object(
      {
        latitude: s.number("The latitude in decimal degrees.", { minimum: -90, maximum: 90 }),
        longitude: s.number("The longitude in decimal degrees.", { minimum: -180, maximum: 180 }),
        resultTypes: s.array("The address result types to include.", s.nonEmptyString("One result type.")),
        locationTypes: s.array("The location precision types to include.", s.nonEmptyString("One location type.")),
        language: s.nonEmptyString("The language code for results."),
        region: s.nonEmptyString("The two-character region code used to bias results."),
      },
      {
        description: "Input for reverse geocoding coordinates.",
        optional: ["resultTypes", "locationTypes", "language", "region"],
      },
    ),
    outputSchema: upstreamObject("A Google reverse geocoding response."),
  }),
  defineProviderAction(service, {
    name: "compute_routes",
    operationType: "read",
    description: "Compute one or more routes between an origin and destination with Google Routes.",
    inputSchema: s.looseRequiredObject("Input for Google Routes computeRoutes.", {
      fieldMask,
      origin: upstreamObject("The route origin waypoint."),
      destination: upstreamObject("The route destination waypoint."),
    }),
    outputSchema: upstreamObject("A Google Routes computeRoutes response."),
  }),
  defineProviderAction(service, {
    name: "compute_route_matrix",
    operationType: "read",
    description: "Compute routes for every origin and destination combination with Google Routes.",
    inputSchema: s.looseRequiredObject("Input for Google Routes computeRouteMatrix.", {
      fieldMask,
      origins: s.array("The route matrix origins.", upstreamObject("One route matrix origin."), { minItems: 1 }),
      destinations: s.array("The route matrix destinations.", upstreamObject("One route matrix destination."), {
        minItems: 1,
      }),
    }),
    outputSchema: s.array("The Google Routes route matrix elements.", upstreamObject("One route matrix element.")),
  }),
];
