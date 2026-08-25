import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "graphhopper";

const coordinateStringSchema = s.string("A coordinate string in `latitude,longitude` format.", {
  minLength: 3,
});
const optionalStringSchema = (description: string) => s.nonEmptyString(description);
const routingProfileSchema = s.nonEmptyString(
  "The GraphHopper routing profile, such as `car`, `bike`, `foot`, or a custom profile id.",
);
const looseObjectSchema = s.looseObject("An upstream GraphHopper object returned as-is.");
const responseInfoSchema = s.looseObject("Additional GraphHopper response metadata.", {
  copyrights: s.array("The copyright notices returned by GraphHopper.", s.string("One notice.")),
  took: s.number("The time GraphHopper spent processing the request."),
});
const routePathSchema = s.looseObject("One route path returned by GraphHopper.", {
  distance: s.number("The total route distance in meters."),
  time: s.integer("The total route travel time in milliseconds."),
  ascend: s.number("The total ascent in meters."),
  descend: s.number("The total descent in meters."),
  points: s.unknown("The route geometry, either encoded or a coordinate object."),
  snapped_waypoints: s.unknown("The snapped input waypoints, either encoded or a coordinate object."),
  points_encoded: s.boolean("Whether route geometry fields use encoded polyline strings."),
  bbox: s.array(
    "The route bounding box as `[minLon, minLat, maxLon, maxLat]`.",
    s.number("One bounding box coordinate."),
  ),
  instructions: s.array("The turn-by-turn route instructions returned by GraphHopper.", looseObjectSchema),
  details: s.looseObject("Path details keyed by requested detail type."),
  points_order: s.array(
    "The optimized visit order when route optimization was requested.",
    s.integer("One zero-based input point index."),
  ),
});
const routeOutputSchema = s.looseObject("The route response returned by GraphHopper.", {
  paths: s.array("The calculated route paths.", routePathSchema),
  info: responseInfoSchema,
});
const geocodingPointSchema = s.object("A latitude and longitude point returned by GraphHopper.", {
  lat: s.number("The latitude coordinate."),
  lng: s.number("The longitude coordinate."),
});
const geocodingLocationSchema = s.looseObject("One geocoding hit returned by GraphHopper.", {
  point: geocodingPointSchema,
  osm_id: s.integer("The OpenStreetMap entity id."),
  osm_type: s.string("The OpenStreetMap entity type."),
  osm_key: s.string("The OpenStreetMap key."),
  osm_value: s.string("The OpenStreetMap value."),
  name: s.string("The matched place, address, or entity name."),
  country: s.string("The country of the result."),
  city: s.string("The city of the result."),
  state: s.string("The state or region of the result."),
  street: s.string("The street of the result."),
  housenumber: s.string("The house number of the result."),
  postcode: s.string("The postal code of the result."),
});
const geocodeOutputSchema = s.looseObject("The geocoding response returned by GraphHopper.", {
  hits: s.array("The geocoding candidates returned by GraphHopper.", geocodingLocationSchema),
  took: s.number("The time GraphHopper spent processing the geocoding request in milliseconds."),
});
const nullableNumberMatrixSchema = s.array(
  "A GraphHopper matrix of numeric values or null entries.",
  s.array("One matrix row.", s.nullable(s.number("One matrix value, or null when the route could not be calculated."))),
);
const matrixOutputSchema = s.looseObject("The matrix response returned by GraphHopper.", {
  distances: nullableNumberMatrixSchema,
  times: nullableNumberMatrixSchema,
  weights: nullableNumberMatrixSchema,
  info: responseInfoSchema,
  hints: s.array("Additional GraphHopper matrix hints.", looseObjectSchema),
});
const isochroneOutputSchema = s.looseObject("The isochrone response returned by GraphHopper.", {
  polygons: s.array("The GeoJSON isochrone polygons returned by GraphHopper.", looseObjectSchema),
});
const profileSchema = s.looseObject("One custom GraphHopper routing profile.", {
  id: s.string("The custom profile id."),
  profile: s.string("The built-in routing profile this custom profile is based on."),
  bounds: s.looseObject("The geographic bounds where this custom profile can be used."),
  custom_model: s.looseObject("The custom model definition for this profile."),
});
const profilesOutputSchema = s.object("The custom routing profiles returned by GraphHopper.", {
  profiles: s.array("The available custom routing profiles.", profileSchema),
});
const stringArraySchema = (description: string, itemDescription: string, minItems = 1) =>
  s.array(description, s.nonEmptyString(itemDescription), { minItems });
const routeInputSchema = s.object(
  "Input parameters for calculating a GraphHopper route.",
  {
    point: s.array("Route waypoints in `latitude,longitude` format.", coordinateStringSchema, { minItems: 2 }),
    profile: routingProfileSchema,
    locale: optionalStringSchema("The locale for turn instructions, such as `en`, `de`, or `fr`."),
    pointHint: stringArraySchema("Optional road name hints for snapping each route waypoint.", "One road name hint."),
    snapPrevention: stringArraySchema(
      "Road types that should be avoided while snapping input points.",
      "One snap prevention value such as `motorway`, `trunk`, `ferry`, `tunnel`, `bridge`, or `ford`.",
    ),
    curbside: s.array(
      "Curbside preferences for each route waypoint.",
      s.stringEnum("One curbside preference.", ["any", "right", "left"]),
    ),
    details: stringArraySchema(
      "Path detail types to include in the route response.",
      "One GraphHopper path detail type.",
    ),
    optimize: s.boolean("Whether GraphHopper should reorder more than two points to reduce travel time."),
    instructions: s.boolean("Whether GraphHopper should return turn-by-turn instructions."),
    calcPoints: s.boolean("Whether GraphHopper should calculate route geometry points."),
    pointsEncoded: s.boolean("Whether GraphHopper should return encoded polyline geometry."),
    elevation: s.boolean("Whether GraphHopper should include altitude as a third coordinate."),
    debug: s.boolean("Whether GraphHopper should format debug output."),
    chDisable: s.boolean("Whether to enable flexible mode for advanced routing options."),
    heading: s.array(
      "Preferred heading directions in degrees, north-based clockwise.",
      s.integer("One heading direction in degrees.", { minimum: 0, maximum: 360 }),
    ),
    headingPenalty: s.nonNegativeInteger("The time penalty in seconds for not obeying heading."),
    passThrough: s.boolean("Whether GraphHopper should avoid u-turns at via-points."),
    algorithm: s.stringEnum("The special route algorithm to use.", ["round_trip", "alternative_route"]),
    roundTripDistance: s.nonNegativeInteger("The approximate round-trip length in meters."),
    roundTripSeed: s.integer("The random seed used for deterministic round-trip results."),
    alternativeRouteMaxPaths: s.positiveInteger("The maximum number of alternative routes."),
    alternativeRouteMaxWeightFactor: s.number(
      "The maximum factor by which alternative routes may be longer than the optimal route.",
      { minimum: 0 },
    ),
    alternativeRouteMaxShareFactor: s.number(
      "The maximum similarity factor between an alternative route and the optimal route.",
      { minimum: 0, maximum: 1 },
    ),
  },
  {
    optional: [
      "profile",
      "locale",
      "pointHint",
      "snapPrevention",
      "curbside",
      "details",
      "optimize",
      "instructions",
      "calcPoints",
      "pointsEncoded",
      "elevation",
      "debug",
      "chDisable",
      "heading",
      "headingPenalty",
      "passThrough",
      "algorithm",
      "roundTripDistance",
      "roundTripSeed",
      "alternativeRouteMaxPaths",
      "alternativeRouteMaxWeightFactor",
      "alternativeRouteMaxShareFactor",
    ],
  },
);
const geocodeInputSchema = s.object(
  "Input parameters for forward or reverse geocoding with GraphHopper.",
  {
    q: optionalStringSchema("The textual address or place query for forward geocoding."),
    point: optionalStringSchema(
      "The `latitude,longitude` location bias for forward geocoding or target coordinate for reverse geocoding.",
    ),
    reverse: s.boolean("Whether to perform reverse geocoding. When true, point is required and q must be omitted."),
    locale: optionalStringSchema("The locale used for localized geocoding results."),
    limit: s.positiveInteger("The maximum number of geocoding results to return."),
    provider: optionalStringSchema(
      "The GraphHopper geocoding provider, such as `default`, `nominatim`, `gisgraphy`, or `opencagedata`.",
    ),
    debug: s.boolean("Whether GraphHopper should format debug output."),
  },
  { optional: ["q", "point", "reverse", "locale", "limit", "provider", "debug"] },
);
const matrixInputSchema = s.object(
  "Input parameters for computing a synchronous GraphHopper matrix.",
  {
    point: s.array(
      "Points in `latitude,longitude` format used as both origins and destinations.",
      coordinateStringSchema,
      { minItems: 3 },
    ),
    fromPoint: s.array("Origin points in `latitude,longitude` format.", coordinateStringSchema, { minItems: 1 }),
    toPoint: s.array("Destination points in `latitude,longitude` format.", coordinateStringSchema, { minItems: 1 }),
    profile: routingProfileSchema,
    pointHint: stringArraySchema("Hints for point entries.", "One point hint."),
    fromPointHint: stringArraySchema("Hints for origin points.", "One origin point hint."),
    toPointHint: stringArraySchema("Hints for destination points.", "One destination point hint."),
    snapPrevention: stringArraySchema(
      "Road types that should be avoided while snapping matrix points.",
      "One snap prevention value.",
    ),
    curbside: s.array(
      "Curbside preferences for point entries.",
      s.stringEnum("One curbside preference.", ["any", "right", "left"]),
    ),
    fromCurbside: s.array(
      "Curbside preferences for origin points.",
      s.stringEnum("One curbside preference.", ["any", "right", "left"]),
    ),
    toCurbside: s.array(
      "Curbside preferences for destination points.",
      s.stringEnum("One curbside preference.", ["any", "right", "left"]),
    ),
    outArray: s.array(
      "Matrix arrays to include in the response.",
      s.stringEnum("One matrix output array name.", ["weights", "times", "distances"]),
      { minItems: 1 },
    ),
    failFast: s.boolean("Whether GraphHopper should fail immediately when points cannot be resolved."),
  },
  {
    optional: [
      "point",
      "fromPoint",
      "toPoint",
      "profile",
      "pointHint",
      "fromPointHint",
      "toPointHint",
      "snapPrevention",
      "curbside",
      "fromCurbside",
      "toCurbside",
      "outArray",
      "failFast",
    ],
  },
);
const isochroneInputSchema = s.object(
  "Input parameters for computing GraphHopper isochrone polygons.",
  {
    point: coordinateStringSchema,
    profile: routingProfileSchema,
    timeLimit: s.positiveInteger("The travel time limit in seconds."),
    distanceLimit: s.positiveInteger("The travel distance limit in meters."),
    buckets: s.positiveInteger("The number of nested isochrone buckets to return."),
    reverseFlow: s.boolean("Whether the flow should go from polygons toward the point."),
  },
  { optional: ["profile", "timeLimit", "distanceLimit", "buckets", "reverseFlow"] },
);

export const graphhopperActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "calculate_route",
    description: "Calculate the best route connecting two or more coordinates with the GraphHopper Routing API.",
    inputSchema: routeInputSchema,
    outputSchema: routeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "geocode",
    description: "Convert text to coordinates or coordinates to place candidates with the GraphHopper Geocoding API.",
    inputSchema: geocodeInputSchema,
    outputSchema: geocodeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "compute_matrix",
    description: "Compute a synchronous travel time, distance, or weight matrix with the GraphHopper Matrix API.",
    inputSchema: matrixInputSchema,
    outputSchema: matrixOutputSchema,
  }),
  defineProviderAction(service, {
    name: "compute_isochrone",
    description: "Compute GeoJSON isochrone polygons around a coordinate with the GraphHopper Isochrone API.",
    inputSchema: isochroneInputSchema,
    outputSchema: isochroneOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_profiles",
    description: "List custom routing profiles available to the GraphHopper API key.",
    inputSchema: s.object("Input parameters for listing GraphHopper custom profiles.", {}),
    outputSchema: profilesOutputSchema,
  }),
];
