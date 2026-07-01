import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "amap";

const objectSchema = s.unknownObject("A JSON-like object with arbitrary string keys.");
const stringOrStringArraySchema = s.anyOf("A string or an array of strings.", [
  s.string("A single string value."),
  s.array("A list of string values.", s.string("A string value in the list.")),
]);
const geocodeInputSchema = s.object(
  "The input parameters for geocoding an address.",
  {
    address: s.string("The address to geocode."),
    city: s.string("The city used to narrow the geocode lookup."),
  },
  { optional: ["city"] },
);
const geocodeOutputSchema = s.object("The response payload returned by the geocode action.", {
  geocodes: s.array(
    "The list of geocoding results.",
    s.object(
      "A geocoding result entry.",
      {
        formattedAddress: s.string("The formatted address."),
        country: s.string("The country name."),
        province: s.string("The province or state name."),
        city: stringOrStringArraySchema,
        district: s.string("The district or county name."),
        adcode: s.string("The administrative code."),
        location: s.string("The coordinate string."),
      },
      { optional: ["formattedAddress", "country", "province", "city", "district", "adcode", "location"] },
    ),
  ),
});
const reverseGeocodeInputSchema = s.object(
  "The input parameters for reverse geocoding coordinates.",
  {
    location: s.string("The coordinates to reverse geocode."),
    radius: s.integer("The search radius in meters."),
    extensions: s.stringEnum("The requested response detail level.", ["base", "all"]),
    roadLevel: s.integer("The road level filter."),
  },
  { optional: ["radius", "extensions", "roadLevel"] },
);
const reverseGeocodeOutputSchema = s.object(
  "The response payload returned by the reverse geocode action.",
  {
    formattedAddress: s.string("The formatted address."),
    addressComponent: objectSchema,
    pois: s.array("The nearby points of interest.", objectSchema),
    roads: s.array("The nearby roads.", objectSchema),
    roadinters: s.array("The nearby road intersections.", objectSchema),
    aois: s.array("The nearby areas of interest.", objectSchema),
  },
  { optional: ["formattedAddress", "addressComponent"] },
);
const inputTipsInputSchema = s.object(
  "The input parameters for fetching input tips.",
  {
    keywords: s.string("The keywords used to search tips."),
    type: s.string("The optional category filter."),
    location: s.string("The optional location bias."),
    city: s.string("The optional city filter."),
    cityLimit: s.boolean("Whether to limit results to the specified city."),
    dataType: s.string("The optional data type filter."),
  },
  { optional: ["type", "location", "city", "cityLimit", "dataType"] },
);
const inputTipsOutputSchema = s.object("The response payload returned by the input tips action.", {
  tips: s.array("The returned tip records.", objectSchema),
});
const ipLocateInputSchema = s.object(
  "The input parameters for IP geolocation.",
  {
    ip: s.string("The IP address to locate."),
  },
  { optional: ["ip"] },
);
const ipLocateOutputSchema = s.object(
  "The response payload returned by the IP locate action.",
  {
    province: s.string("The province or state name."),
    city: s.string("The city name."),
    adcode: s.string("The administrative code."),
    rectangle: s.string("The bounding rectangle string."),
  },
  { optional: ["province", "city", "adcode", "rectangle"] },
);
const poiSchema = s.object(
  "A point of interest record.",
  {
    id: s.string("The point of interest identifier."),
    name: s.string("The point of interest name."),
    type: s.string("The point of interest type."),
    typecode: s.string("The type code."),
    address: s.string("The formatted address."),
    location: s.string("The coordinate string."),
    pname: s.string("The province name."),
    cityname: s.string("The city name."),
    adname: s.string("The district or area name."),
  },
  { optional: ["id", "name", "type", "typecode", "address", "location", "pname", "cityname", "adname"] },
);
const poiSearchOutputSchema = s.object(
  "The response payload returned by the place search actions.",
  {
    count: s.string("The total number of matching points of interest."),
    pois: s.array("The matching points of interest.", poiSchema),
  },
  { optional: ["count"] },
);
const searchPlacesInputSchema = s.object(
  "The input parameters for searching places by keyword.",
  {
    keywords: s.string("The keywords used to search places."),
    region: s.string("The optional region filter."),
    cityLimit: s.boolean("Whether to limit results to the region."),
    types: s.string("The optional place type filter."),
    pageNum: s.integer("The page number to fetch."),
    pageSize: s.integer("The page size to fetch."),
    showFields: s.string("The requested output fields."),
  },
  { optional: ["region", "cityLimit", "types", "pageNum", "pageSize", "showFields"] },
);
const searchPlacesAroundInputSchema = s.object(
  "The input parameters for searching places around a location.",
  {
    location: s.string("The center coordinate for the search."),
    radius: s.integer("The search radius in meters."),
    keywords: s.string("The optional keyword filter."),
    types: s.string("The optional place type filter."),
    sortRule: s.string("The optional sort rule."),
    pageNum: s.integer("The page number to fetch."),
    pageSize: s.integer("The page size to fetch."),
    showFields: s.string("The requested output fields."),
  },
  { optional: ["radius", "keywords", "types", "sortRule", "pageNum", "pageSize", "showFields"] },
);
const searchPlacesPolygonInputSchema = s.object(
  "The input parameters for searching places inside a polygon.",
  {
    polygon: s.string("The polygon used to bound the search."),
    keywords: s.string("The optional keyword filter."),
    types: s.string("The optional place type filter."),
    pageNum: s.integer("The page number to fetch."),
    pageSize: s.integer("The page size to fetch."),
    showFields: s.string("The requested output fields."),
  },
  { optional: ["keywords", "types", "pageNum", "pageSize", "showFields"] },
);
const placeDetailInputSchema = s.object(
  "The input parameters for fetching place details.",
  {
    id: s.string("The place identifier."),
    showFields: s.string("The requested output fields."),
  },
  { optional: ["showFields"] },
);
const placeDetailOutputSchema = s.object("The response payload returned by the place detail action.", {
  pois: s.array("The place detail records.", poiSchema),
});
const districtSearchInputSchema = s.object(
  "The input parameters for district search.",
  {
    keywords: s.string("The district search keywords."),
    subDistrict: s.integer("The subdistrict depth."),
    extensions: s.string("The requested response detail level."),
    page: s.integer("The page number to fetch."),
    offset: s.integer("The result offset."),
    filter: s.string("The optional filter expression."),
  },
  { optional: ["subDistrict", "extensions", "page", "offset", "filter"] },
);
const districtSearchOutputSchema = s.object(
  "The response payload returned by the district search action.",
  {
    count: s.string("The total number of matching districts."),
    districts: s.array("The matching districts.", objectSchema),
  },
  { optional: ["count"] },
);
const weatherInputSchema = s.object(
  "The input parameters for fetching weather information.",
  {
    city: s.string("The city to query."),
    extensions: s.stringEnum("The requested response detail level.", ["base", "all"]),
  },
  { optional: ["extensions"] },
);
const weatherOutputSchema = s.object(
  "The response payload returned by the weather action.",
  {
    lives: s.array("The current weather records.", objectSchema),
    forecasts: s.array("The forecast weather records.", objectSchema),
  },
  { optional: ["lives", "forecasts"] },
);
const simpleRoutePathSchema = s.object(
  "A single route path entry.",
  {
    distance: s.string("The route distance."),
    steps: s.array("The route steps.", objectSchema),
    cost: s.object(
      "The cost summary for the route path.",
      {
        duration: s.string("The estimated duration."),
      },
      { optional: ["duration"] },
    ),
  },
  { optional: ["distance", "cost"] },
);
const simpleRouteOutputSchema = s.object("The response payload returned by the simple route actions.", {
  route: s.object("The route summary returned by the API.", {
    origin: s.string("The route origin."),
    destination: s.string("The route destination."),
    paths: s.array("The available route paths.", simpleRoutePathSchema),
  }, { optional: ["origin", "destination"] }),
});
const routeWalkingInputSchema = s.object(
  "The input parameters for planning a walking route.",
  {
    origin: s.string("The route origin."),
    destination: s.string("The route destination."),
    showFields: s.string("The requested output fields."),
  },
  { optional: ["showFields"] },
);
const routeBicyclingInputSchema = s.object(
  "The input parameters for planning a bicycling route.",
  {
    origin: s.string("The route origin."),
    destination: s.string("The route destination."),
    alternativeRoute: s.string("The optional alternative route mode."),
    showFields: s.string("The requested output fields."),
  },
  { optional: ["alternativeRoute", "showFields"] },
);
const routeDrivingInputSchema = s.object(
  "The input parameters for planning a driving route.",
  {
    origin: s.string("The route origin."),
    destination: s.string("The route destination."),
    waypoints: s.string("The optional waypoint list."),
    strategy: s.string("The optional routing strategy."),
    plate: s.string("The optional license plate."),
    carType: s.string("The optional car type."),
    avoidPolygons: s.string("The optional avoid polygon list."),
    showFields: s.string("The requested output fields."),
  },
  { optional: ["waypoints", "strategy", "plate", "carType", "avoidPolygons", "showFields"] },
);
const routeDrivingOutputSchema = s.object("The response payload returned by the driving route action.", {
  route: s.object("The route summary returned by the driving route API.", {
    origin: s.string("The route origin."),
    destination: s.string("The route destination."),
    taxi_cost: s.string("The estimated taxi cost."),
    paths: s.array("The available driving paths.", objectSchema),
  }, { optional: ["origin", "destination", "taxi_cost"] }),
});
const routeTransitInputSchema = s.object(
  "The input parameters for planning a transit route.",
  {
    origin: s.string("The route origin."),
    destination: s.string("The route destination."),
    originCity: s.string("The origin city."),
    destinationCity: s.string("The destination city."),
    strategy: s.string("The optional routing strategy."),
    nightFlag: s.string("The optional night transit flag."),
    showFields: s.string("The requested output fields."),
  },
  { optional: ["strategy", "nightFlag", "showFields"] },
);
const routeTransitOutputSchema = s.object("The response payload returned by the transit route action.", {
  route: s.object("The route summary returned by the transit route API.", {
    origin: s.string("The route origin."),
    destination: s.string("The route destination."),
    cost: objectSchema,
    transits: s.array("The available transit options.", objectSchema),
  }, { optional: ["origin", "destination", "cost"] }),
});

export const amapActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "geocode",
    description: "Convert an address to coordinates.",
    inputSchema: geocodeInputSchema,
    outputSchema: geocodeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "reverse_geocode",
    description: "Convert coordinates to an address.",
    inputSchema: reverseGeocodeInputSchema,
    outputSchema: reverseGeocodeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_places",
    description: "Search places by keyword.",
    inputSchema: searchPlacesInputSchema,
    outputSchema: poiSearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_places_around",
    description: "Search places around a location.",
    inputSchema: searchPlacesAroundInputSchema,
    outputSchema: poiSearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_places_polygon",
    description: "Search places inside a polygon.",
    inputSchema: searchPlacesPolygonInputSchema,
    outputSchema: poiSearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_place_detail",
    description: "Get place details by id.",
    inputSchema: placeDetailInputSchema,
    outputSchema: placeDetailOutputSchema,
  }),
  defineProviderAction(service, {
    name: "input_tips",
    description: "Get input tips by keywords.",
    inputSchema: inputTipsInputSchema,
    outputSchema: inputTipsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "ip_locate",
    description: "Locate by IP address.",
    inputSchema: ipLocateInputSchema,
    outputSchema: ipLocateOutputSchema,
  }),
  defineProviderAction(service, {
    name: "district_search",
    description: "Search administrative districts.",
    inputSchema: districtSearchInputSchema,
    outputSchema: districtSearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "weather",
    description: "Get weather information.",
    inputSchema: weatherInputSchema,
    outputSchema: weatherOutputSchema,
  }),
  defineProviderAction(service, {
    name: "route_driving",
    description: "Plan a driving route.",
    inputSchema: routeDrivingInputSchema,
    outputSchema: routeDrivingOutputSchema,
  }),
  defineProviderAction(service, {
    name: "route_walking",
    description: "Plan a walking route.",
    inputSchema: routeWalkingInputSchema,
    outputSchema: simpleRouteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "route_bicycling",
    description: "Plan a bicycling route.",
    inputSchema: routeBicyclingInputSchema,
    outputSchema: simpleRouteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "route_electrobike",
    description: "Plan an electric bike route.",
    inputSchema: routeWalkingInputSchema,
    outputSchema: simpleRouteOutputSchema,
  }),
  defineProviderAction(service, {
    name: "route_transit",
    description: "Plan a transit route.",
    inputSchema: routeTransitInputSchema,
    outputSchema: routeTransitOutputSchema,
  }),
];
