import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "geoapify";

const locationTypeSchema = s.stringEnum("The Geoapify place type filter.", [
  "country",
  "state",
  "city",
  "postcode",
  "street",
  "amenity",
  "locality",
]);

const geocodingFormatSchema = s.stringEnum("The response format returned by Geoapify.", ["geojson", "json"]);

const commonGeocodingOutputSchema = s.looseObject("The Geoapify geocoding response.", {
  type: s.string("The top-level GeoJSON type returned by Geoapify."),
  features: s.array("The GeoJSON features returned by Geoapify.", s.looseObject("A Geoapify GeoJSON feature.")),
  results: s.array(
    "The geocoding results returned by Geoapify JSON format.",
    s.looseObject("A Geoapify geocoding result."),
  ),
  query: s.looseObject("The query metadata returned by Geoapify when available."),
});

const commonTextInputShape: Record<string, JsonSchema> = {
  text: s.nonEmptyString("The free-form text query sent to Geoapify."),
  lang: s.string({ description: "The result language code in ISO 639-1 format.", minLength: 2 }),
  limit: s.positiveInteger("The maximum number of results to return."),
  type: locationTypeSchema,
  filter: s.nonEmptyString("The Geoapify boundary or country filter expression."),
  bias: s.nonEmptyString("The Geoapify bias expression used to prioritize results."),
  format: geocodingFormatSchema,
};

const routeCoordinateSchema: JsonSchema = {
  type: "array",
  prefixItems: [
    s.number("The longitude value in decimal degrees.", { minimum: -180, maximum: 180 }),
    s.number("The latitude value in decimal degrees.", { minimum: -90, maximum: 90 }),
  ],
  items: false,
  minItems: 2,
  maxItems: 2,
  description: "A `[longitude, latitude]` coordinate pair.",
};

const routeResponseSchema = s.looseObject("The Geoapify routing response.", {
  type: s.string("The top-level GeoJSON type returned by Geoapify."),
  features: s.array("The route features returned by Geoapify.", s.looseObject("A Geoapify route feature.")),
  properties: s.looseObject("The top-level route metadata returned by Geoapify."),
});

const routeMatrixLocationSchema = s.requiredObject("One route matrix waypoint definition.", {
  location: routeCoordinateSchema,
});

const routeMatrixResponseSchema = s.looseObject("The Geoapify route matrix response.", {
  mode: s.string("The travel mode used for the route matrix."),
  type: s.string("The route preference used for the route matrix."),
  units: s.string("The unit system used for the route matrix."),
  sources: s.array("The normalized route matrix sources.", s.looseObject("One normalized source.")),
  targets: s.array("The normalized route matrix targets.", s.looseObject("One normalized target.")),
  sources_to_targets: s.array(
    "The source-to-target travel matrix returned by Geoapify.",
    s.array("One matrix row.", s.nullable(s.looseObject("One matrix cell entry."))),
  ),
});

export const geoapifyActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "forward_geocode",
    description: "Convert free-form text into geocoding results with Geoapify.",
    inputSchema: s.actionInput(commonTextInputShape, ["text"], "Input parameters for Geoapify forward geocoding."),
    outputSchema: commonGeocodingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "reverse_geocode",
    description: "Convert latitude and longitude into place results with Geoapify.",
    inputSchema: s.actionInput(
      {
        lat: s.number("The latitude of the location to reverse geocode.", { minimum: -90, maximum: 90 }),
        lon: s.number("The longitude of the location to reverse geocode.", { minimum: -180, maximum: 180 }),
        lang: s.string({ description: "The result language code in ISO 639-1 format.", minLength: 2 }),
        limit: s.positiveInteger("The maximum number of results to return."),
        type: locationTypeSchema,
        filter: s.nonEmptyString("The Geoapify boundary or country filter expression."),
        bias: s.nonEmptyString("The Geoapify bias expression used to prioritize results."),
        format: geocodingFormatSchema,
      },
      ["lat", "lon"],
      "Input parameters for Geoapify reverse geocoding.",
    ),
    outputSchema: commonGeocodingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "address_autocomplete",
    description: "Return address autocomplete suggestions from Geoapify.",
    inputSchema: s.actionInput(commonTextInputShape, ["text"], "Input parameters for Geoapify address autocomplete."),
    outputSchema: commonGeocodingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_route",
    description: "Calculate a route between waypoints with the Geoapify Routing API.",
    inputSchema: s.actionInput(
      {
        waypoints: s.array("The ordered route waypoints as `[longitude, latitude]` pairs.", routeCoordinateSchema, {
          minItems: 2,
        }),
        mode: s.nonEmptyString("The Geoapify routing mode."),
        type: s.nonEmptyString("The Geoapify route preference."),
        units: s.nonEmptyString("The distance unit system."),
        lang: s.string({ description: "The language for route instructions.", minLength: 2 }),
        details: s.nonEmptyString("The extra route details to include."),
        traffic: s.nonEmptyString("The traffic model used for the route."),
        max_speed: s.number("The maximum vehicle speed in kilometers per hour.", { minimum: 10, maximum: 252 }),
        avoid: s.nonEmptyString("The route avoid expression used by Geoapify."),
        format: geocodingFormatSchema,
      },
      ["waypoints"],
      "Input parameters for Geoapify route calculation.",
    ),
    outputSchema: routeResponseSchema,
  }),
  defineProviderAction(service, {
    name: "get_route_matrix",
    description: "Calculate a travel matrix between sources and targets with Geoapify.",
    inputSchema: s.actionInput(
      {
        sources: s.array("The source waypoints used for the route matrix.", routeMatrixLocationSchema, { minItems: 1 }),
        targets: s.array("The target waypoints used for the route matrix.", routeMatrixLocationSchema, { minItems: 1 }),
        mode: s.nonEmptyString("The Geoapify routing mode."),
        type: s.nonEmptyString("The Geoapify route preference."),
        units: s.nonEmptyString("The distance unit system."),
        traffic: s.nonEmptyString("The traffic model used for the route."),
        max_speed: s.number("The maximum vehicle speed in kilometers per hour.", { minimum: 10, maximum: 252 }),
        avoid: s.array(
          "The list of avoid rules applied to the route matrix.",
          s.object(
            "One avoid rule object.",
            {
              type: s.nonEmptyString("The avoided road or feature type."),
              importance: s.number("The importance of the avoid rule.", { minimum: 0, maximum: 1 }),
            },
            { required: ["type"] },
          ),
        ),
      },
      ["sources", "targets"],
      "Input parameters for Geoapify route matrix calculation.",
    ),
    outputSchema: routeMatrixResponseSchema,
  }),
];
