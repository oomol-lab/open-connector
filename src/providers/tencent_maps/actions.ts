import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "tencent_maps";

const rawObject = s.looseObject({}, { description: "A raw object returned by Tencent Maps." });
const poi = s.looseObject(
  {
    id: s.string("The point of interest identifier."),
    name: s.string("The point of interest name."),
    address: s.string("The formatted address."),
    category: s.string("The point of interest category."),
    location: s.string("The coordinate string formatted as latitude,longitude."),
  },
  { description: "A normalized point of interest record." },
);

function action(
  name: string,
  description: string,
  inputSchema: ActionDefinition["inputSchema"],
  outputSchema: ActionDefinition["outputSchema"],
): ActionDefinition {
  return defineProviderAction(service, { name, description, inputSchema, outputSchema });
}

export const tencentMapsActions: ActionDefinition[] = [
  action(
    "geocode",
    "Geocode an address with Tencent Maps.",
    s.object(
      "Input parameters for geocoding an address.",
      {
        address: s.nonEmptyString("The address to geocode."),
        policy: s.integer("The Tencent Maps geocoding policy.", { minimum: 0, maximum: 1 }),
      },
      { optional: ["policy"] },
    ),
    s.object("The geocoding response.", { geocodes: s.array(poi) }),
  ),
  action(
    "reverse_geocode",
    "Reverse geocode coordinates with Tencent Maps.",
    s.object(
      "Input parameters for reverse geocoding.",
      {
        location: s.nonEmptyString("The coordinate string formatted as latitude,longitude."),
        radius: s.integer("The administrative boundary absorb radius in meters."),
        getPoi: s.boolean("Whether to return nearby points of interest."),
        poiOptions: s.string("The Tencent Maps poi_options value."),
      },
      { optional: ["radius", "getPoi", "poiOptions"] },
    ),
    s.object(
      "The reverse geocode response.",
      {
        formattedAddress: s.string("The formatted address."),
        formattedAddresses: rawObject,
        addressComponent: rawObject,
        adInfo: rawObject,
        pois: s.array(poi),
      },
      { optional: ["formattedAddress", "formattedAddresses", "addressComponent", "adInfo"] },
    ),
  ),
  action(
    "search_places",
    "Search Tencent Maps places in a region.",
    s.looseObject(
      {
        keywords: s.nonEmptyString("The keyword used to search places."),
        region: s.nonEmptyString("The region name or adcode used for region search."),
      },
      { description: "Input parameters for searching places in a region." },
    ),
    s.object(
      "The normalized place search response.",
      {
        count: s.integer("The total number of matching places."),
        pois: s.array(poi),
        clusters: s.array(rawObject),
      },
      { optional: ["count", "clusters"] },
    ),
  ),
  action(
    "search_places_around",
    "Search Tencent Maps places around a coordinate.",
    s.looseObject(
      {
        location: s.nonEmptyString("The search center formatted as latitude,longitude."),
        keywords: s.nonEmptyString("The keyword used to search places."),
      },
      { description: "Input parameters for searching places around a location." },
    ),
    s.object(
      "The normalized nearby place search response.",
      {
        count: s.integer("The total number of matching places."),
        pois: s.array(poi),
        clusters: s.array(rawObject),
      },
      { optional: ["count", "clusters"] },
    ),
  ),
  action(
    "search_places_polygon",
    "Search Tencent Maps places inside a polygon.",
    s.looseObject(
      {
        polygon: s.nonEmptyString("The polygon boundary string."),
        keywords: s.nonEmptyString("The keyword used to search places."),
      },
      { description: "Input parameters for searching places inside a polygon." },
    ),
    s.object(
      "The normalized polygon place search response.",
      {
        count: s.integer("The total number of matching places."),
        pois: s.array(poi),
        clusters: s.array(rawObject),
      },
      { optional: ["count", "clusters"] },
    ),
  ),
  action(
    "get_place_detail",
    "Get details for one Tencent Maps place identifier.",
    s.looseObject(
      { id: s.nonEmptyString("The Tencent Maps place identifier.") },
      { description: "Input parameters for place detail." },
    ),
    s.object("The place detail response.", { pois: s.array(poi) }),
  ),
  action(
    "input_tips",
    "Fetch Tencent Maps input suggestions.",
    s.looseObject(
      { keywords: s.nonEmptyString("The keyword used to fetch input tips.") },
      { description: "Input parameters for fetching input tips." },
    ),
    s.object(
      "The input tips response.",
      {
        count: s.integer("The total number of tips returned."),
        tips: s.array(poi),
      },
      { optional: ["count"] },
    ),
  ),
  action(
    "ip_locate",
    "Locate an IP address with Tencent Maps.",
    s.object(
      "Input parameters for IP geolocation.",
      { ip: s.string("The IP address to locate.") },
      { optional: ["ip"] },
    ),
    s.object(
      "The IP location response.",
      {
        ip: s.string("The IP address used by Tencent Maps."),
        location: s.string("The coordinate string formatted as latitude,longitude."),
        adInfo: rawObject,
      },
      { optional: ["ip", "location", "adInfo"] },
    ),
  ),
  action(
    "district_search",
    "Search Tencent Maps administrative districts.",
    s.looseObject(
      { mode: s.stringEnum("The Tencent Maps district endpoint variant.", ["list", "children", "search"]) },
      { description: "Input parameters for district search." },
    ),
    s.object(
      "The district search response.",
      {
        dataVersion: s.integer("The Tencent Maps district data version."),
        result: s.array(s.unknown("One district result item.")),
      },
      { optional: ["dataVersion"] },
    ),
  ),
  action(
    "weather",
    "Fetch Tencent Maps weather by adcode or coordinate.",
    s.looseObject({}, { description: "Input parameters for weather lookup." }),
    s.object(
      "The weather response.",
      {
        realtime: s.array(rawObject),
        forecast: s.array(rawObject),
        forecastHours: s.array(rawObject),
      },
      { optional: ["realtime", "forecast", "forecastHours"] },
    ),
  ),
  action(
    "route_driving",
    "Plan a Tencent Maps driving route.",
    s.looseObject({}, { description: "Input parameters for driving routing." }),
    s.looseObject({}, { description: "The route response." }),
  ),
  action(
    "route_walking",
    "Plan a Tencent Maps walking route.",
    s.looseObject({}, { description: "Input parameters for walking routing." }),
    s.looseObject({}, { description: "The route response." }),
  ),
  action(
    "route_bicycling",
    "Plan a Tencent Maps bicycling route.",
    s.looseObject({}, { description: "Input parameters for bicycling routing." }),
    s.looseObject({}, { description: "The route response." }),
  ),
  action(
    "route_transit",
    "Plan a Tencent Maps transit route.",
    s.looseObject({}, { description: "Input parameters for transit routing." }),
    s.looseObject({}, { description: "The route response." }),
  ),
  action(
    "distance_matrix",
    "Calculate a Tencent Maps distance matrix.",
    s.looseObject({}, { description: "Input parameters for distance matrix lookup." }),
    s.looseObject({}, { description: "The distance matrix response." }),
  ),
];
