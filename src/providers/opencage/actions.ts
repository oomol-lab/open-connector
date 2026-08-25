import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "opencage";

const optionalBooleanFlag = (description: string): JsonSchema => s.boolean(description);
const optionalLimitSchema = s.integer("Maximum number of results to return, from 1 to 100.", {
  minimum: 1,
  maximum: 100,
});
const minConfidenceSchema = s.integer("Minimum confidence score allowed for returned results, from 1 to 10.", {
  minimum: 1,
  maximum: 10,
});

const commonForwardFiltersSchema = {
  q: s.nonEmptyString("Address or free-form query string to geocode."),
  limit: optionalLimitSchema,
  bounds: s.nonEmptyString("Bounding box bias formatted as west,south,east,north."),
  language: s.nonEmptyString("Preferred response language code."),
  proximity: s.nonEmptyString("Bias results near a latitude,longitude point."),
  countrycode: s.nonEmptyString("Comma-separated ISO 3166-1 alpha-2 country codes used to restrict results."),
  abbrv: optionalBooleanFlag("Whether to abbreviate road and route names."),
  add_request: optionalBooleanFlag("Whether to include the original request in the response."),
  no_annotations: optionalBooleanFlag("Whether to omit annotations such as timezone or currency details."),
  pretty: optionalBooleanFlag("Whether to pretty-print the JSON response."),
  min_confidence: minConfidenceSchema,
};

const commonForwardOptional = [
  "limit",
  "bounds",
  "language",
  "proximity",
  "countrycode",
  "abbrv",
  "add_request",
  "no_annotations",
  "pretty",
  "min_confidence",
];

const licenseSchema = s.object("A license entry describing result attribution requirements.", {
  name: s.nonEmptyString("License name for the returned data."),
  url: s.nonEmptyString("License URL for the returned data."),
});

const rateSchema = s.object("Rate limit information for the current API key.", {
  limit: s.integer("Maximum number of requests allowed in the current window."),
  remaining: s.integer("Remaining number of requests in the current window."),
  reset: s.integer("Unix timestamp when the rate window resets."),
});

const statusSchema = s.object("Status information returned by OpenCage.", {
  code: s.integer("OpenCage status code for the request."),
  message: s.nonEmptyString("Human-readable status message from OpenCage."),
});

const timestampSchema = s.object("Creation time metadata for the response.", {
  created_http: s.nonEmptyString("HTTP date when the response was generated."),
  created_unix: s.integer("Unix timestamp when the response was generated."),
});

const commonJsonResponseSchema = s.object("Standard JSON geocoding response returned by OpenCage.", {
  documentation: s.nonEmptyString("Documentation URL for the OpenCage API response."),
  licenses: s.array("License entries attached to the response.", licenseSchema),
  rate: rateSchema,
  results: s.array(
    "Geocoding results returned by OpenCage.",
    s.looseObject("A single OpenCage geocoding result.", {
      formatted: s.nonEmptyString("Formatted address string returned for the matched result."),
      confidence: s.integer("Confidence score assigned by OpenCage for this result."),
      geometry: s.object("Coordinates for the matched result.", {
        lat: s.number("Latitude in decimal degrees."),
        lng: s.number("Longitude in decimal degrees."),
      }),
      components: s.record(
        "Structured address components keyed by upstream field name.",
        s.unknown("Component value."),
      ),
      annotations: s.record("Additional annotations returned by OpenCage.", s.unknown("Annotation value.")),
      bounds: s.record("Bounding box metadata for the matched result.", s.unknown("Bounds value.")),
      distance_from_q: s.record(
        "Distance metadata between the query point and the matched result.",
        s.unknown("Distance value."),
      ),
    }),
  ),
  status: statusSchema,
  thanks: s.nonEmptyString("Attribution or thank-you message returned by OpenCage."),
  timestamp: timestampSchema,
  total_results: s.integer("Total number of matching results."),
});

const geojsonResponseSchema = s.object("GeoJSON geocoding response returned by OpenCage.", {
  type: s.literal("FeatureCollection", { description: "GeoJSON type returned by OpenCage." }),
  features: s.array(
    "GeoJSON features returned by OpenCage.",
    s.object("A single GeoJSON feature returned by OpenCage.", {
      type: s.literal("Feature", { description: "GeoJSON feature type." }),
      geometry: s.object("GeoJSON geometry payload.", {
        type: s.nonEmptyString("GeoJSON geometry type."),
        coordinates: s.array(
          "GeoJSON coordinates for the feature.",
          s.number("Coordinate number in the GeoJSON tuple."),
        ),
      }),
      properties: s.record("GeoJSON properties returned by OpenCage.", s.unknown("GeoJSON property value.")),
    }),
  ),
  licenses: s.array("License entries attached to the response.", licenseSchema),
  rate: rateSchema,
  status: statusSchema,
  timestamp: timestampSchema,
});

export const opencageActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "geocode_forward",
    description: "Convert an address or place name into OpenCage geocoding results.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for forward geocoding an address or place name.",
      commonForwardFiltersSchema,
      { optional: commonForwardOptional },
    ),
    outputSchema: commonJsonResponseSchema,
  }),
  defineProviderAction(service, {
    name: "geocode_reverse",
    description: "Convert a latitude and longitude pair into OpenCage reverse geocoding results.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for reverse geocoding a latitude,longitude pair.",
      {
        q: s.nonEmptyString("Latitude and longitude formatted as latitude,longitude."),
        language: s.nonEmptyString("Preferred response language code."),
        roadinfo: optionalBooleanFlag("Whether to include road information in the response."),
        abbrv: optionalBooleanFlag("Whether to abbreviate road and route names."),
        add_request: optionalBooleanFlag("Whether to include the original request in the response."),
        no_annotations: optionalBooleanFlag("Whether to omit annotations such as timezone or currency details."),
        pretty: optionalBooleanFlag("Whether to pretty-print the JSON response."),
        min_confidence: minConfidenceSchema,
        normalizecity: optionalBooleanFlag("Whether to normalize city names in the response."),
      },
      {
        optional: [
          "language",
          "roadinfo",
          "abbrv",
          "add_request",
          "no_annotations",
          "pretty",
          "min_confidence",
          "normalizecity",
        ],
      },
    ),
    outputSchema: commonJsonResponseSchema,
  }),
  defineProviderAction(service, {
    name: "geocode_geojson",
    description: "Return OpenCage geocoding results in GeoJSON FeatureCollection format.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for returning geocoding results in GeoJSON format.",
      {
        ...commonForwardFiltersSchema,
        roadinfo: optionalBooleanFlag("Whether to include road information in the response."),
      },
      { optional: [...commonForwardOptional, "roadinfo"] },
    ),
    outputSchema: geojsonResponseSchema,
  }),
];
