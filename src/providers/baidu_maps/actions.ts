import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "baidu_maps";

const rawObject = s.unknownObject("A raw object returned by Baidu Maps.");

// Baidu POI records are passed through from the API unchanged, so every field
// is best-effort and may be absent depending on the endpoint (region vs.
// circular search, scope, etc.). `location` in particular is returned as a
// { lng, lat } object, not a string.
const poi = s.looseRequiredObject(
  "A Baidu Maps point of interest record. Fields are passed through from Baidu and vary by endpoint.",
  {
    uid: s.string("The Baidu Maps point of interest identifier."),
    name: s.string("The point of interest name."),
    address: s.string("The formatted address."),
    location: s.unknown("The coordinate; Baidu returns a { lng, lat } object for place search."),
    province: s.string("The province."),
    city: s.string("The city."),
    district: s.string("The district (Baidu field 'area')."),
    category: s.string("The point of interest category (when scope=2)."),
    detail: s.integer("The detail level flag returned by Baidu Maps."),
    distance: s.number("The distance from the search center in meters (circular search only)."),
  },
  {
    optional: ["uid", "name", "address", "location", "province", "city", "district", "category", "detail", "distance"],
  },
);

function action(
  name: string,
  description: string,
  inputSchema: ActionDefinition["inputSchema"],
  outputSchema: ActionDefinition["outputSchema"],
): ActionDefinition {
  return defineProviderAction(service, { name, description, inputSchema, outputSchema });
}

export const baiduMapsActions: ActionDefinition[] = [
  action(
    "geocode",
    "Geocode an address with Baidu Maps.",
    s.object(
      "Input parameters for geocoding an address.",
      {
        address: s.nonEmptyString("The address to geocode."),
        city: s.nonEmptyString("Restrict results to a city, for example '北京市'."),
      },
      { optional: ["city"] },
    ),
    s.requiredObject("The geocoding response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      location: s.string("The geocoded coordinate string formatted as latitude,longitude."),
      precise: s.integer("Whether the result is precise (1) or fuzzy (0)."),
      confidence: s.integer("The confidence score from 0 to 100."),
      comprehension: s.integer("Whether the address was understood as a comprehension query."),
      result: rawObject,
    }),
  ),
  action(
    "reverse_geocode",
    "Reverse geocode coordinates with Baidu Maps.",
    s.object(
      "Input parameters for reverse geocoding.",
      {
        location: s.nonEmptyString("The coordinate string formatted as latitude,longitude (bd09ll by default)."),
        coordtype: s.string("The coordinate system of the input location."),
        radius: s.nonNegativeInteger("The radius in meters to include nearby points of interest."),
        extensions_poi: s.integer("0 to only return the address (default), 1 to also return nearby POIs."),
        poi_types: s.string("Comma separated extensions_poi types filter (when extensions_poi=1)."),
        language: s.stringEnum("The language of the result.", [
          "en",
          "zh-CN",
          "zh-HK",
          "zh-TW",
          "ja",
          "ko",
          "fr",
          "th",
          "es",
          "pt",
          "ru",
          "de",
          "it",
          "vi",
          "ar",
          "hi",
        ]),
        latest_admin: s.integer(
          "Whether to return the latest administrative division (1) or the historical one (0, default).",
        ),
      },
      { optional: ["coordtype", "radius", "extensions_poi", "poi_types", "language", "latest_admin"] },
    ),
    s.requiredObject("The reverse geocoding response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      formatted_address: s.string("The formatted address."),
      addressComponent: s.requiredObject("The structured address component.", {
        country: s.string("The country."),
        country_code: s.integer("The numeric country code."),
        country_code_iso: s.string("The ISO country code."),
        province: s.string("The province."),
        city: s.string("The city."),
        city_level: s.integer("Whether the city field is filled (0/1)."),
        district: s.string("The district."),
        district_level: s.integer("Whether the district field is filled (0/1)."),
        town: s.string("The town."),
        town_level: s.integer("Whether the town field is filled (0/1)."),
        adcode: s.string("The administrative code."),
        street: s.string("The street."),
        street_number: s.string("The street number."),
        direction: s.string("The facing direction relative to the coordinate."),
        distance: s.string("The signed distance to the nearest road."),
      }),
      pois: s.array(poi),
      roads: s.unknown("The nearby roads as returned by Baidu Maps."),
      poiRegions: s.unknown("The POI region breakdown as returned by Baidu Maps."),
      sematic_description: s.string("A sematic description returned by Baidu Maps."),
      cityCode: s.integer("The numeric city code."),
    }),
  ),
  action(
    "search_places",
    "Search Baidu Maps places in a region or city.",
    s.object(
      "Input parameters for searching places.",
      {
        query: s.nonEmptyString("The keyword used to search places."),
        region: s.nonEmptyString("The region name to scope the search, for example '北京'."),
        city_limit: s.integer(
          "Whether to restrict results to the supplied region (1) or extend to nearby regions (0).",
        ),
        // Baidu's place-search `scope` parameter is documented as a numeric enum
        // (1 = basic, 2 = detail) but the upstream API also accepts the string
        // forms "1" / "2". Some SDKs and docs serialize it as a string, so we
        // accept both — but still constrain the integer form to {1, 2} so
        // out-of-range values get a clear validation error instead of being
        // silently forwarded and rejected by Baidu.
        scope: s.anyOf(
          [
            s.stringEnum(["1", "2"]),
            { type: "integer", enum: [1, 2], description: "The integer-form scope (1 or 2)." },
          ],
          { description: "The result scope. Baidu accepts either the string or the integer form." },
        ),
        filter: s.string("Pipe separated industry filtering tags."),
        coord_type: s.string("The coordinate system of returned locations."),
        ret_coordtype: s.string("Alias for coord_type used by some Baidu endpoints."),
        page_size: s.nonNegativeInteger("The page size, 0 to 20."),
        page_num: s.nonNegativeInteger("The zero-based page index."),
      },
      {
        optional: ["region", "city_limit", "scope", "filter", "coord_type", "ret_coordtype", "page_size", "page_num"],
      },
    ),
    s.requiredObject("The place search response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      total: s.integer("The total number of matching places."),
      results: s.array(poi),
    }),
  ),
  action(
    "search_places_around",
    "Search Baidu Maps places within a radius around a coordinate.",
    s.object(
      "Input parameters for circular place search.",
      {
        query: s.nonEmptyString("The keyword used to search places."),
        location: s.nonEmptyString("The search center formatted as latitude,longitude."),
        radius: s.nonNegativeInteger("The search radius in meters (default 1000, max 50000)."),
        radius_limit: s.integer("Whether to strictly observe the radius (1) or relax it (0)."),
        filter: s.string("Pipe separated industry filtering tags."),
        coord_type: s.string("The coordinate system of returned locations."),
        ret_coordtype: s.string("Alias for coord_type used by some Baidu endpoints."),
        page_size: s.nonNegativeInteger("The page size, 0 to 20."),
        page_num: s.nonNegativeInteger("The zero-based page index."),
      },
      {
        optional: ["radius", "radius_limit", "filter", "coord_type", "ret_coordtype", "page_size", "page_num"],
      },
    ),
    s.requiredObject("The circular place search response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      total: s.integer("The total number of matching places."),
      results: s.array(poi),
    }),
  ),
  action(
    "search_places_polygon",
    "Search Baidu Maps places inside a polygon (rectangle).",
    s.object(
      "Input parameters for rectangular place search.",
      {
        query: s.nonEmptyString("The keyword used to search places."),
        bounds: s.nonEmptyString(
          "Rectangle bounds 'bottomLeftLat,bottomLeftLng,topRightLat,topRightLng' — latitude first, all comma " +
            "separated (e.g. '39.915,116.404,39.975,116.414'). When supplied, region is ignored.",
        ),
        filter: s.string("Pipe separated industry filtering tags."),
        coord_type: s.string("The coordinate system of returned locations."),
        ret_coordtype: s.string("Alias for coord_type used by some Baidu endpoints."),
        page_size: s.nonNegativeInteger("The page size, 0 to 20."),
        page_num: s.nonNegativeInteger("The zero-based page index."),
      },
      {
        optional: ["filter", "coord_type", "ret_coordtype", "page_size", "page_num"],
      },
    ),
    s.requiredObject("The rectangular place search response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      total: s.integer("The total number of matching places."),
      results: s.array(poi),
    }),
  ),
  action(
    "get_place_detail",
    "Look up a Baidu Maps place by its uid.",
    s.object(
      "Input parameters for place detail lookup.",
      {
        uid: s.nonEmptyString("The Baidu Maps place identifier (uid)."),
        // Same string-or-integer contract as search_places.scope — Baidu's
        // place-detail endpoint accepts both, and SDKs differ on which they
        // emit. Integer is constrained to {1, 2} for the same reason.
        scope: s.anyOf(
          [
            s.stringEnum(["1", "2"]),
            { type: "integer", enum: [1, 2], description: "The integer-form scope (1 or 2)." },
          ],
          { description: "The detail scope. Baidu accepts either the string or the integer form." },
        ),
        coord_type: s.string("The coordinate system of returned locations."),
      },
      { optional: ["scope", "coord_type"] },
    ),
    s.requiredObject("The place detail response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      result: rawObject,
    }),
  ),
  action(
    "input_tips",
    "Fetch Baidu Maps input suggestions (keywordsuggestion).",
    s.object(
      "Input parameters for input suggestions.",
      {
        query: s.nonEmptyString("The keyword to suggest completions for."),
        region: s.nonEmptyString("Restrict suggestions to a region (e.g. '北京')."),
        city_limit: s.integer("Whether to restrict suggestions to the supplied region."),
        location: s.nonEmptyString("The center coordinate used for location bias."),
        coord_type: s.string("The coordinate system of the input location."),
      },
      { optional: ["region", "city_limit", "location", "coord_type"] },
    ),
    s.requiredObject("The input tips response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      result: s.array(s.unknownObject("One suggestion (name, location, uid, ...).")),
    }),
  ),
  action(
    "ip_locate",
    "Locate an IP address with Baidu Maps.",
    s.object(
      "Input parameters for IP geolocation.",
      {
        ip: s.string("The IP address to locate. Omit to locate the caller."),
        coor: s.string("The coordinate system of the returned location."),
      },
      { optional: ["ip", "coor"] },
    ),
    s.requiredObject("The IP location response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      address: s.string("The formatted address."),
      content: s.requiredObject("The structured IP location content.", {
        address: s.string("The formatted address."),
        point: s.requiredObject("The coordinate object.", {
          x: s.number("The longitude."),
          y: s.number("The latitude."),
        }),
        address_detail: s.requiredObject("The structured address detail.", {
          city: s.string("The city."),
          city_code: s.integer("The numeric city code."),
          province: s.string("The province."),
        }),
      }),
    }),
  ),
  action(
    "district_search",
    "Query the Baidu Maps administrative division API (api_region_search).",
    s.object(
      "Input parameters for the administrative district query.",
      {
        keyword: s.nonEmptyString("The district name or administrative code (adcode) to look up."),
        sub_admin: s.integer("Number of subordinate levels to return (0-3, default 0)."),
        extensions_code: s.integer("1 to also return standard administrative codes (default 0)."),
        boundary: s.integer("1 to return boundary coordinates (default 0)."),
      },
      { optional: ["sub_admin", "extensions_code", "boundary"] },
    ),
    s.requiredObject("The district query response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      result_size: s.integer("The number of matched administrative divisions."),
      districts: s.array(s.unknownObject("One administrative division (code, name, level, nested districts, ...).")),
    }),
  ),
  action(
    "weather",
    "Fetch weather observations and forecasts for a coordinate.",
    s.object(
      "Input parameters for the weather API.",
      {
        data_type: s.stringEnum("The data sections to include (default 'all').", [
          "now",
          "fc",
          "index",
          "alert",
          "fc_hour",
          "all",
        ]),
        coordtype: s.string("The coordinate system of the input location (weather uses 'coordtype', default wgs84)."),
        location: s.nonEmptyString(
          "The coordinate as longitude,latitude — NOTE weather is lng,lat (opposite of other endpoints). " +
            "Provide this or district_id.",
        ),
        district_id: s.string("The administrative division code (adcode). Provide this or location; takes priority."),
      },
      { optional: ["data_type", "coordtype", "location", "district_id"] },
    ),
    s.requiredObject("The weather response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      result: s.object(
        "The structured weather result.",
        {
          location: s.requiredObject("The resolved location.", {
            country: s.string("The country."),
            province: s.string("The province."),
            city: s.string("The city."),
            name: s.string("The region name."),
            id: s.string("The region code."),
          }),
          now: s.unknown("The current weather observation (data_type includes 'now' or 'all')."),
          forecasts: s.array(s.unknownObject("One day of the daily forecast (data_type includes 'fc' or 'all').")),
          forecast_hours: s.array(
            s.unknownObject("One hour of the hourly forecast (data_type includes 'fc_hour' or 'all')."),
          ),
          alerts: s.array(
            s.unknownObject(
              "One weather alert/warning (request data_type 'alert' or 'all'; response key is 'alerts').",
            ),
          ),
          indexes: s.array(s.unknownObject("One life index (data_type includes 'index' or 'all').")),
        },
        { optional: ["now", "forecasts", "forecast_hours", "alerts", "indexes"] },
      ),
    }),
  ),
  action(
    "route_driving",
    "Plan a Baidu Maps driving route.",
    s.object(
      "Input parameters for driving routing.",
      {
        origin: s.nonEmptyString("The origin coordinate formatted as latitude,longitude."),
        destination: s.nonEmptyString("The destination coordinate formatted as latitude,longitude."),
        origin_uid: s.string("Optional origin POI uid."),
        destination_uid: s.string("Optional destination POI uid."),
        waypoints: s.string("Comma separated intermediate waypoints."),
        tactics: s.integer(
          "The routing preference (0 default, 1 toll free, 2 distance first, 3 expressway first, 4 highway avoid, ...).",
        ),
        tactics_in_city: s.integer(
          "Urban routing preference (0 default, 1 main road first, 2 time first, 3 distance first, 4 avoid congestion).",
        ),
        alternatives: s.integer("0 to return only the best route; 3 to return up to 3 alternatives."),
        departure_time: s.string("Departure time in ISO 8601 (used only with future-traffic tactics)."),
        plate_number: s.string("License plate for restriction-aware routing."),
        traffic_policy: s.integer("Real-time traffic policy."),
        coord_type: s.string("The coordinate system of origin/destination."),
      },
      {
        optional: [
          "origin_uid",
          "destination_uid",
          "waypoints",
          "tactics",
          "tactics_in_city",
          "alternatives",
          "departure_time",
          "plate_number",
          "traffic_policy",
          "coord_type",
        ],
      },
    ),
    s.requiredObject("The driving route response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      result: s.requiredObject("The driving route result.", {
        origin: s.unknownObject("The origin as a { lng, lat } object."),
        destination: s.unknownObject("The destination as a { lng, lat } object."),
        routes: s.array(s.unknownObject("One driving route alternative.")),
      }),
    }),
  ),
  action(
    "route_walking",
    "Plan a Baidu Maps walking route.",
    s.object(
      "Input parameters for walking routing.",
      {
        origin: s.nonEmptyString("The origin coordinate formatted as latitude,longitude."),
        destination: s.nonEmptyString("The destination coordinate formatted as latitude,longitude."),
        coord_type: s.string("The coordinate system of origin/destination."),
      },
      { optional: ["coord_type"] },
    ),
    s.requiredObject("The walking route response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      result: s.requiredObject("The walking route result.", {
        origin: s.unknownObject("The origin as a { lng, lat } object."),
        destination: s.unknownObject("The destination as a { lng, lat } object."),
        routes: s.array(s.unknownObject("One walking route alternative.")),
      }),
    }),
  ),
  action(
    "route_bicycling",
    "Plan a Baidu Maps bicycling route.",
    s.object(
      "Input parameters for bicycling routing.",
      {
        origin: s.nonEmptyString("The origin coordinate formatted as latitude,longitude."),
        destination: s.nonEmptyString("The destination coordinate formatted as latitude,longitude."),
        coord_type: s.string("The coordinate system of origin/destination."),
      },
      { optional: ["coord_type"] },
    ),
    s.requiredObject("The bicycling route response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      result: s.requiredObject("The bicycling route result.", {
        origin: s.unknownObject("The origin as a { lng, lat } object."),
        destination: s.unknownObject("The destination as a { lng, lat } object."),
        routes: s.array(s.unknownObject("One bicycling route alternative.")),
      }),
    }),
  ),
  action(
    "route_transit",
    "Plan a Baidu Maps transit route.",
    s.object(
      "Input parameters for transit routing.",
      {
        origin: s.nonEmptyString("The origin coordinate formatted as latitude,longitude."),
        destination: s.nonEmptyString("The destination coordinate formatted as latitude,longitude."),
        departure_time: s.string("Optional ISO 8601 departure time, default now."),
        tactics_in_city: s.integer("Transit tactic when origin/destination are inside the same city."),
        tactics_inter_city: s.integer("Transit tactic when traveling between cities."),
        coord_type: s.string("The coordinate system of origin/destination."),
      },
      { optional: ["departure_time", "tactics_in_city", "tactics_inter_city", "coord_type"] },
    ),
    s.requiredObject("The transit route response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      result: s.requiredObject("The transit route result.", {
        origin: s.unknownObject("The origin as a { lng, lat } object."),
        destination: s.unknownObject("The destination as a { lng, lat } object."),
        routes: s.array(s.unknownObject("One transit route alternative.")),
      }),
    }),
  ),
];

export type BaiduMapsActionName =
  | "geocode"
  | "reverse_geocode"
  | "search_places"
  | "search_places_around"
  | "search_places_polygon"
  | "get_place_detail"
  | "input_tips"
  | "ip_locate"
  | "district_search"
  | "weather"
  | "route_driving"
  | "route_walking"
  | "route_bicycling"
  | "route_transit";
