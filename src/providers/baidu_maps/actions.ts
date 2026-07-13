import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "baidu_maps";

const rawObject = s.unknownObject("A raw object returned by Baidu Maps.");

const poi = s.looseRequiredObject("A normalized point of interest record.", {
  uid: s.string("The Baidu Maps point of interest identifier."),
  name: s.string("The point of interest name."),
  address: s.string("The formatted address."),
  location: s.string("The coordinate string formatted as latitude,longitude."),
  province: s.string("The province."),
  city: s.string("The city."),
  district: s.string("The district."),
  category: s.string("The point of interest category."),
  detail: s.integer("The detail level flag returned by Baidu Maps."),
  distance: s.number("The distance from the search center in meters."),
});

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
      result: s.requiredObject("The structured geocoding result.", {
        level: s.string("The match level (e.g. '道路')."),
        precise: s.integer("Whether the result is precise (1) or fuzzy (0)."),
        confidence: s.integer("The confidence score from 0 to 100."),
        location: s.string("The coordinate string formatted as latitude,longitude."),
        formatted_address: s.string("The formatted address."),
        business: s.string("A landmark near the coordinate."),
      }),
    }),
  ),
  action(
    "reverse_geocode",
    "Reverse geocode coordinates with Baidu Maps.",
    s.object(
      "Input parameters for reverse geocoding.",
      {
        location: s.nonEmptyString("The coordinate string formatted as latitude,longitude (bd09ll by default)."),
        coordtype: s.stringEnum("The coordinate system of the input location.", ["bd09ll", "bd09mc", "gcj02", "wgs84"]),
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
        region: s.nonEmptyString("The region name, for example '北京'. Required when tag is not used."),
        city_limit: s.integer(
          "Whether to restrict results to the supplied region (1) or extend to nearby regions (0).",
        ),
        output: s.stringEnum("The output format.", ["json", "xml"]),
        scope: s.stringEnum("The result scope.", ["1", "2"]),
        filter: s.string("Pipe separated industry filtering tags."),
        coord_type: s.stringEnum("The coordinate system of returned locations.", [
          "bd09ll",
          "bd09mc",
          "gcj02",
          "wgs84",
        ]),
        ret_coordtype: s.stringEnum("Alias for coord_type used by some Baidu endpoints.", [
          "bd09ll",
          "bd09mc",
          "gcj02",
          "wgs84",
        ]),
        page_size: s.nonNegativeInteger("The page size, 0 to 20."),
        page_num: s.nonNegativeInteger("The zero-based page index."),
        ak: s.string("The Baidu Maps AK; provided automatically from the credential."),
      },
      {
        optional: [
          "region",
          "city_limit",
          "output",
          "scope",
          "filter",
          "coord_type",
          "ret_coordtype",
          "page_size",
          "page_num",
          "ak",
        ],
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
        output: s.stringEnum("The output format.", ["json", "xml"]),
        filter: s.string("Pipe separated industry filtering tags."),
        coord_type: s.stringEnum("The coordinate system of returned locations.", [
          "bd09ll",
          "bd09mc",
          "gcj02",
          "wgs84",
        ]),
        ret_coordtype: s.stringEnum("Alias for coord_type used by some Baidu endpoints.", [
          "bd09ll",
          "bd09mc",
          "gcj02",
          "wgs84",
        ]),
        page_size: s.nonNegativeInteger("The page size, 0 to 20."),
        page_num: s.nonNegativeInteger("The zero-based page index."),
        ak: s.string("The Baidu Maps AK; provided automatically from the credential."),
      },
      {
        optional: [
          "location",
          "radius",
          "radius_limit",
          "output",
          "filter",
          "coord_type",
          "ret_coordtype",
          "page_size",
          "page_num",
          "ak",
        ],
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
          "Comma delimited bounds string 'minLng,minLat;maxLng,maxLat'. When supplied, region is ignored.",
        ),
        output: s.stringEnum("The output format.", ["json", "xml"]),
        filter: s.string("Pipe separated industry filtering tags."),
        coord_type: s.stringEnum("The coordinate system of returned locations.", [
          "bd09ll",
          "bd09mc",
          "gcj02",
          "wgs84",
        ]),
        ret_coordtype: s.stringEnum("Alias for coord_type used by some Baidu endpoints.", [
          "bd09ll",
          "bd09mc",
          "gcj02",
          "wgs84",
        ]),
        page_size: s.nonNegativeInteger("The page size, 0 to 20."),
        page_num: s.nonNegativeInteger("The zero-based page index."),
        ak: s.string("The Baidu Maps AK; provided automatically from the credential."),
      },
      {
        optional: ["bounds", "output", "filter", "coord_type", "ret_coordtype", "page_size", "page_num", "ak"],
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
    s.requiredObject("Input parameters for place detail lookup.", {
      uid: s.nonEmptyString("The Baidu Maps place identifier (uid)."),
      scope: s.stringEnum("The detail scope.", ["1", "2"]),
      output: s.stringEnum("The output format.", ["json", "xml"]),
      coord_type: s.stringEnum("The coordinate system of returned locations.", ["bd09ll", "bd09mc", "gcj02", "wgs84"]),
      ak: s.string("The Baidu Maps AK; provided automatically from the credential."),
    }),
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
        coord_type: s.stringEnum("The coordinate system of the input location.", [
          "bd09ll",
          "bd09mc",
          "gcj02",
          "wgs84",
        ]),
        ak: s.string("The Baidu Maps AK; provided automatically from the credential."),
      },
      { optional: ["region", "city_limit", "location", "coord_type", "ak"] },
    ),
    s.requiredObject("The input tips response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      result: rawObject,
    }),
  ),
  action(
    "ip_locate",
    "Locate an IP address with Baidu Maps.",
    s.requiredObject("Input parameters for IP geolocation.", {
      ip: s.string("The IP address to locate. Omit to locate the caller."),
      coor: s.stringEnum("The coordinate system of the returned location.", ["bd09ll", "bd09mc", "gcj02", "wgs84"]),
      ak: s.string("The Baidu Maps AK; provided automatically from the credential."),
    }),
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
    "Query the Baidu Maps administrative district API.",
    s.requiredObject("Input parameters for the district query.", {
      mode: s.stringEnum("The district endpoint variant.", ["list", "children", "search"]),
      keyword: s.string("The keyword used by 'search' mode (adcode or name fragment)."),
      id: s.string("The adcode used by 'children' mode."),
      struct_type: s.integer("The structure type: 0 default, 1 with polygon."),
      get_polygon: s.integer("1 to include polygons (requires service claim)."),
      max_offset: s.integer("Maximum number of polygons to return per district."),
      output: s.stringEnum("The output format.", ["json", "xml"]),
      ak: s.string("The Baidu Maps AK; provided automatically from the credential."),
    }),
    s.requiredObject("The district query response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      data_version: s.string("The district data version string."),
      result: s.unknown("The district payload returned by Baidu Maps."),
    }),
  ),
  action(
    "weather",
    "Fetch weather observations and forecasts for a coordinate.",
    s.requiredObject("Input parameters for the weather API.", {
      data_type: s.stringEnum("The data sections to include.", ["all", "fc", "index", "alerts", "nearest"]),
      coord_type: s.stringEnum("The coordinate system of the input location.", ["bd09ll", "bd09mc", "gcj02", "wgs84"]),
      location: s.nonEmptyString("The coordinate string formatted as latitude,longitude."),
      output: s.stringEnum("The output format.", ["json", "xml"]),
      ak: s.string("The Baidu Maps AK; provided automatically from the credential."),
    }),
    s.requiredObject("The weather response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      result: s.requiredObject("The structured weather result.", {
        location: s.requiredObject("The resolved location.", {
          country: s.string("The country."),
          province: s.string("The province."),
          city: s.string("The city."),
          name: s.string("The region name."),
          id: s.string("The region code."),
        }),
        now: s.unknown("The current weather observation (when data_type includes 'now')."),
        forecast: s.unknown("The forecast data (when data_type includes 'fc')."),
        forecast_hours: s.unknown("The hourly forecast (when data_type includes 'hour')."),
        alerts: s.unknown("The weather alerts (when data_type includes 'alerts')."),
        indices: s.unknown("The lifestyle indices (when data_type includes 'index')."),
      }),
    }),
  ),
  action(
    "route_driving",
    "Plan a Baidu Maps driving route.",
    s.requiredObject("Input parameters for driving routing.", {
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
      coord_type: s.stringEnum("The coordinate system of origin/destination.", ["bd09ll", "bd09mc", "gcj02", "wgs84"]),
      output: s.stringEnum("The output format.", ["json", "xml"]),
      ak: s.string("The Baidu Maps AK; provided automatically from the credential."),
    }),
    s.requiredObject("The driving route response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      result: s.requiredObject("The driving route result.", {
        origin: s.requiredObject("The origin summary.", {
          location: s.string("The origin coordinate."),
          uid: s.string("The origin POI uid when supplied."),
        }),
        destination: s.requiredObject("The destination summary.", {
          location: s.string("The destination coordinate."),
          uid: s.string("The destination POI uid when supplied."),
        }),
        routes: s.array(s.unknownObject("One driving route alternative.")),
        origin_poi: s.unknown("The detailed origin POI."),
        destination_poi: s.unknown("The detailed destination POI."),
      }),
    }),
  ),
  action(
    "route_walking",
    "Plan a Baidu Maps walking route.",
    s.requiredObject("Input parameters for walking routing.", {
      origin: s.nonEmptyString("The origin coordinate formatted as latitude,longitude."),
      destination: s.nonEmptyString("The destination coordinate formatted as latitude,longitude."),
      coord_type: s.stringEnum("The coordinate system of origin/destination.", ["bd09ll", "bd09mc", "gcj02", "wgs84"]),
      output: s.stringEnum("The output format.", ["json", "xml"]),
      ak: s.string("The Baidu Maps AK; provided automatically from the credential."),
    }),
    s.requiredObject("The walking route response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      result: s.requiredObject("The walking route result.", {
        origin: s.requiredObject("The origin summary.", { location: s.string("The origin coordinate.") }),
        destination: s.requiredObject("The destination summary.", {
          location: s.string("The destination coordinate."),
        }),
        routes: s.array(s.unknownObject("One walking route alternative.")),
      }),
    }),
  ),
  action(
    "route_bicycling",
    "Plan a Baidu Maps bicycling route.",
    s.requiredObject("Input parameters for bicycling routing.", {
      origin: s.nonEmptyString("The origin coordinate formatted as latitude,longitude."),
      destination: s.nonEmptyString("The destination coordinate formatted as latitude,longitude."),
      coord_type: s.stringEnum("The coordinate system of origin/destination.", ["bd09ll", "bd09mc", "gcj02", "wgs84"]),
      output: s.stringEnum("The output format.", ["json", "xml"]),
      ak: s.string("The Baidu Maps AK; provided automatically from the credential."),
    }),
    s.requiredObject("The bicycling route response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      result: s.requiredObject("The bicycling route result.", {
        origin: s.requiredObject("The origin summary.", { location: s.string("The origin coordinate.") }),
        destination: s.requiredObject("The destination summary.", {
          location: s.string("The destination coordinate."),
        }),
        routes: s.array(s.unknownObject("One bicycling route alternative.")),
      }),
    }),
  ),
  action(
    "route_transit",
    "Plan a Baidu Maps transit route.",
    s.requiredObject("Input parameters for transit routing.", {
      origin: s.nonEmptyString("The origin coordinate formatted as latitude,longitude."),
      destination: s.nonEmptyString("The destination coordinate formatted as latitude,longitude."),
      departure_time: s.string("Optional ISO 8601 departure time, default now."),
      tactics_in_city: s.integer("Transit tactic when origin/destination are inside the same city."),
      tactics_inter_city: s.integer("Transit tactic when traveling between cities."),
      coord_type: s.stringEnum("The coordinate system of origin/destination.", ["bd09ll", "bd09mc", "gcj02", "wgs84"]),
      output: s.stringEnum("The output format.", ["json", "xml"]),
      ak: s.string("The Baidu Maps AK; provided automatically from the credential."),
    }),
    s.requiredObject("The transit route response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      result: s.requiredObject("The transit route result.", {
        origin: s.requiredObject("The origin summary.", { location: s.string("The origin coordinate.") }),
        destination: s.requiredObject("The destination summary.", {
          location: s.string("The destination coordinate."),
        }),
        routes: s.array(s.unknownObject("One transit route alternative.")),
      }),
    }),
  ),
  action(
    "distance_matrix",
    "Calculate a Baidu Maps distance matrix.",
    s.requiredObject("Input parameters for the distance matrix API.", {
      origins: s.nonEmptyString("Semicolon separated origin coordinates."),
      destinations: s.nonEmptyString("Semicolon separated destination coordinates."),
      tactics: s.integer("0 distance, 1 duration, 3 duration with traffic."),
      coord_type: s.stringEnum("The coordinate system of origins/destinations.", [
        "bd09ll",
        "bd09mc",
        "gcj02",
        "wgs84",
      ]),
      output: s.stringEnum("The output format.", ["json", "xml"]),
      ak: s.string("The Baidu Maps AK; provided automatically from the credential."),
    }),
    s.requiredObject("The distance matrix response.", {
      status: s.integer("The Baidu Maps status code (0 means success)."),
      message: s.string("The status message."),
      result: s.requiredObject("The distance matrix result.", {
        elements: s.array(s.unknownObject("One distance matrix cell.")),
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
  | "route_transit"
  | "distance_matrix";
