import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mapbox";

const longitudeSchema = (description: string): JsonSchema => s.number(description, { minimum: -180, maximum: 180 });
const latitudeSchema = (description: string): JsonSchema => s.number(description, { minimum: -90, maximum: 90 });

const coordinateSchema: JsonSchema = {
  type: "array",
  prefixItems: [
    longitudeSchema("The longitude value in decimal degrees."),
    latitudeSchema("The latitude value in decimal degrees."),
  ],
  items: false,
  minItems: 2,
  maxItems: 2,
  description: "A `[longitude, latitude]` coordinate pair.",
};

const boundingBoxSchema: JsonSchema = {
  type: "array",
  prefixItems: [
    longitudeSchema("The minimum longitude of the bounding box."),
    latitudeSchema("The minimum latitude of the bounding box."),
    longitudeSchema("The maximum longitude of the bounding box."),
    latitudeSchema("The maximum latitude of the bounding box."),
  ],
  items: false,
  minItems: 4,
  maxItems: 4,
  description: "The `[minLon, minLat, maxLon, maxLat]` bounding box.",
};

const geocodingResponseSchema = s.looseObject(
  {
    type: s.string("The top-level GeoJSON type returned by Mapbox."),
    features: s.array("The geocoding features returned by Mapbox.", s.unknownObject("One Mapbox geocoding feature.")),
    attribution: s.string("The Mapbox attribution string for the response."),
  },
  { description: "Mapbox geocoding response." },
);

const directionsResponseSchema = s.looseObject(
  {
    routes: s.array("Directions routes returned by Mapbox.", s.unknownObject("One Mapbox route.")),
    waypoints: s.array("Waypoint metadata returned by Mapbox.", s.unknownObject("One Mapbox waypoint.")),
    code: s.string("The response code returned by Mapbox."),
    uuid: s.string("The response UUID returned by Mapbox."),
  },
  { description: "Mapbox directions response." },
);

const matrixResponseSchema = s.looseObject(
  {
    code: s.string("The response code returned by Mapbox."),
    durations: s.array(
      "Travel duration matrix in seconds.",
      s.array("One matrix duration row.", s.nullableNumber("One matrix duration value in seconds.")),
    ),
    distances: s.array(
      "Travel distance matrix in meters.",
      s.array("One matrix distance row.", s.nullableNumber("One matrix distance value in meters.")),
    ),
    sources: s.array("Source waypoint metadata.", s.unknownObject("One source waypoint.")),
    destinations: s.array("Destination waypoint metadata.", s.unknownObject("One destination waypoint.")),
  },
  { description: "Mapbox matrix response." },
);

const routeProfileSchema = s.stringEnum("Routing profile used by the request.", [
  "mapbox/driving",
  "mapbox/driving-traffic",
  "mapbox/walking",
  "mapbox/cycling",
]);

const featureTypeArraySchema = s.array(
  "Feature types to include in the response.",
  s.string("One Mapbox feature type filter value.", { minLength: 1 }),
  { minItems: 1 },
);

const stringArray = (description: string): JsonSchema =>
  s.array(description, s.string("One non-empty string value.", { minLength: 1 }), { minItems: 1 });
const indexArray = (description: string): JsonSchema =>
  s.array(description, s.nonNegativeInteger("One zero-based coordinate index."), { minItems: 1 });

export const mapboxActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "forward_geocode",
    description: "Convert free-form text into geographic features with Mapbox Geocoding v6.",
    inputSchema: s.object(
      "Input payload for Mapbox forward geocoding.",
      {
        q: s.string("The free-form text query to geocode.", { minLength: 1 }),
        autocomplete: s.boolean("Whether Mapbox should return autocomplete-style results."),
        limit: s.integer("The maximum number of features to return.", { minimum: 1, maximum: 10 }),
        language: s.string("The IETF language tag used for localized feature names.", { minLength: 1 }),
        country: s.array(
          "Country filters applied to the geocoding request.",
          s.string("ISO 3166-1 alpha-2 country code.", { minLength: 2, maxLength: 2 }),
          { minItems: 1 },
        ),
        types: featureTypeArraySchema,
        bbox: boundingBoxSchema,
        proximity: coordinateSchema,
      },
      { optional: ["autocomplete", "limit", "language", "country", "types", "bbox", "proximity"] },
    ),
    outputSchema: geocodingResponseSchema,
  }),
  defineProviderAction(service, {
    name: "reverse_geocode",
    description: "Convert a coordinate pair into place features with Mapbox Geocoding v6.",
    inputSchema: s.object(
      "Input payload for Mapbox reverse geocoding.",
      {
        longitude: longitudeSchema("The longitude of the coordinate to reverse geocode."),
        latitude: latitudeSchema("The latitude of the coordinate to reverse geocode."),
        limit: s.integer("The maximum number of features to return.", { minimum: 1, maximum: 10 }),
        language: s.string("The IETF language tag used for localized feature names.", { minLength: 1 }),
        types: featureTypeArraySchema,
        worldview: s.string("The worldview applied to the response.", { minLength: 1 }),
      },
      { optional: ["limit", "language", "types", "worldview"] },
    ),
    outputSchema: geocodingResponseSchema,
  }),
  defineProviderAction(service, {
    name: "batch_geocode",
    description: "Submit multiple forward or reverse geocoding queries in one Mapbox batch request.",
    inputSchema: s.object("Input payload for Mapbox batch geocoding.", {
      queries: s.array(
        "Batch geocoding queries submitted to Mapbox.",
        s.oneOf(
          [
            s.object(
              "One forward geocoding batch query.",
              {
                mode: s.literal("forward", { description: "Use forward geocoding for this query." }),
                q: s.string("The free-form text query to geocode.", { minLength: 1 }),
                limit: s.integer("The maximum number of features to return for this query.", {
                  minimum: 1,
                  maximum: 10,
                }),
              },
              { optional: ["limit"] },
            ),
            s.object(
              "One reverse geocoding batch query.",
              {
                mode: s.literal("reverse", { description: "Use reverse geocoding for this query." }),
                longitude: longitudeSchema("The longitude of the coordinate to reverse geocode."),
                latitude: latitudeSchema("The latitude of the coordinate to reverse geocode."),
                limit: s.integer("The maximum number of features to return for this query.", {
                  minimum: 1,
                  maximum: 10,
                }),
              },
              { optional: ["limit"] },
            ),
          ],
          { description: "One batch geocoding query entry." },
        ),
        { minItems: 1 },
      ),
    }),
    outputSchema: s.looseObject(
      {
        batch: s.array("Per-query geocoding results returned by Mapbox.", geocodingResponseSchema),
      },
      { description: "Mapbox batch geocoding response." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_directions",
    description: "Compute a route between multiple coordinates with the Mapbox Directions API.",
    inputSchema: s.object(
      "Input payload for the Mapbox Directions API.",
      {
        profile: routeProfileSchema,
        coordinates: s.array("Route coordinates in travel order.", coordinateSchema, { minItems: 2 }),
        alternatives: s.boolean("Whether to request alternative routes."),
        annotations: stringArray("Route annotations to include in the response."),
        continue_straight: s.boolean("Whether the router should prefer continuing straight at waypoints."),
        exclude: stringArray("Route features to exclude."),
        geometries: s.string("Geometry encoding used in the route response.", { minLength: 1 }),
        language: s.string("Language used for route instructions.", { minLength: 1 }),
        overview: s.string("Route overview geometry detail level.", { minLength: 1 }),
        roundabout_exits: s.boolean("Whether roundabout maneuver exits should be included."),
        steps: s.boolean("Whether step-by-step route instructions should be included."),
        voice_instructions: s.boolean("Whether voice instructions should be included."),
        banner_instructions: s.boolean("Whether banner instructions should be included."),
        avoid_maneuver_radius: s.number("Radius in meters used to avoid immediate maneuvers.", {
          exclusiveMinimum: 0,
        }),
        depart_at: s.string("Departure time used for time-aware routing.", { minLength: 1 }),
        arrive_by: s.string("Arrival time used for time-aware routing.", { minLength: 1 }),
        waypoints: indexArray("Coordinate indexes that should be treated as waypoints."),
      },
      {
        optional: [
          "alternatives",
          "annotations",
          "continue_straight",
          "exclude",
          "geometries",
          "language",
          "overview",
          "roundabout_exits",
          "steps",
          "voice_instructions",
          "banner_instructions",
          "avoid_maneuver_radius",
          "depart_at",
          "arrive_by",
          "waypoints",
        ],
      },
    ),
    outputSchema: directionsResponseSchema,
  }),
  defineProviderAction(service, {
    name: "get_matrix",
    description: "Compute a travel time or distance matrix with the Mapbox Matrix API.",
    inputSchema: s.object(
      "Input payload for the Mapbox Matrix API.",
      {
        profile: routeProfileSchema,
        coordinates: s.array("Coordinates included in the matrix calculation.", coordinateSchema, { minItems: 2 }),
        annotations: s.array(
          "Matrix annotations to include in the response.",
          s.stringEnum("One matrix annotation value.", ["duration", "distance"]),
          { minItems: 1 },
        ),
        approaches: stringArray("Curb approach constraints for the coordinates."),
        bearings: stringArray("Bearing filters applied to the coordinates."),
        fallback_speed: s.number("Fallback speed in meters per second.", { exclusiveMinimum: 0 }),
        sources: indexArray("Coordinates used as matrix sources."),
        destinations: indexArray("Coordinates used as matrix destinations."),
      },
      { optional: ["annotations", "approaches", "bearings", "fallback_speed", "sources", "destinations"] },
    ),
    outputSchema: matrixResponseSchema,
  }),
];
