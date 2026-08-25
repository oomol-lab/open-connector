import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "chengxin" as const;

const queryString = (description: string) =>
  s.nonWhitespaceString(description, {
    maxLength: 500,
  });

const extraSchema = s.nonWhitespaceString(
  "Additional travel requirements such as dates, time preferences, budget, service class, or traveler needs.",
  {
    maxLength: 1000,
  },
);

const nullableString = (description: string) => s.nullable(s.string(description));

const ticketSchema = s.object("One ticket option returned by Tongcheng Chengxin.", {
  type: nullableString("The seat, cabin, or ticket type."),
  price: nullableString("The ticket price as reported by Tongcheng Chengxin."),
  remaining: nullableString("The remaining ticket availability when reported."),
});

const transferSegmentSchema = s.object("One segment in a Tongcheng Chengxin transfer itinerary.", {
  type: nullableString("The segment transport type, such as TRAIN, FLIGHT, AIR, or BUS."),
  number: nullableString("The train, flight, or bus service number."),
  departureStation: nullableString("The departure station or airport name."),
  departureTerminal: nullableString("The departure airport terminal when applicable."),
  arrivalStation: nullableString("The arrival station or airport name."),
  arrivalTerminal: nullableString("The arrival airport terminal when applicable."),
  departureDate: nullableString("The segment departure date."),
  departureTime: nullableString("The segment departure time."),
  arrivalDate: nullableString("The segment arrival date."),
  arrivalTime: nullableString("The segment arrival time."),
  durationMinutes: s.nullable(s.integer("The segment duration in minutes when reported.")),
  seat: nullableString("The seat or cabin name."),
  price: nullableString("The segment price."),
});

const transferInfoSchema = s.object("One transfer between segments in a Tongcheng Chengxin itinerary.", {
  city: nullableString("The transfer city."),
  waitDuration: nullableString("The human-readable transfer wait duration."),
});

const supplementalTransportSchema = s.object(
  "One supplemental ground transport segment returned with a Tongcheng Chengxin flight search.",
  {
    groupIndex: s.integer("The zero-based flight result group index.", { minimum: 0 }),
    groupDescription: nullableString("The provider description for the owning flight group."),
    direction: s.nullable(
      s.stringEnum("How the supplemental segment connects with the flight.", [
        "to_departure_airport",
        "from_arrival_airport",
      ]),
    ),
    type: nullableString("The supplemental transport type, such as TRAIN or BUS."),
    number: nullableString("The train or bus service number."),
    departureStation: nullableString("The departure station name."),
    arrivalStation: nullableString("The arrival station name."),
    departureDate: nullableString("The departure date."),
    departureTime: nullableString("The departure time."),
    arrivalDate: nullableString("The arrival date."),
    arrivalTime: nullableString("The arrival time."),
    duration: nullableString("The supplemental journey duration."),
    price: nullableString("The lowest reported supplemental transport price."),
    tickets: s.array("The available supplemental transport ticket options.", ticketSchema),
    bookingUrl: nullableString("The Tongcheng URL for viewing or booking the supplemental transport segment."),
  },
);

const flightSchema = s.object("One normalized flight returned by Tongcheng Chengxin.", {
  groupIndex: s.integer("The zero-based flight result group index.", { minimum: 0 }),
  groupDescription: nullableString(
    "The provider description for the result group, such as cheapest, fastest, or recommended.",
  ),
  flightNumber: nullableString("The flight number."),
  departureName: nullableString(
    "The departure city or location, especially for low-price destination recommendations.",
  ),
  arrivalName: nullableString("The arrival city or location, especially for low-price destination recommendations."),
  week: nullableString("The weekday description returned for low-price recommendations."),
  airline: nullableString("The airline name."),
  departureAirport: nullableString("The departure airport name."),
  departureTerminal: nullableString("The departure terminal."),
  arrivalAirport: nullableString("The arrival airport name."),
  arrivalTerminal: nullableString("The arrival terminal."),
  departureDate: nullableString("The departure date."),
  departureTime: nullableString("The departure time."),
  arrivalDate: nullableString("The arrival date."),
  arrivalTime: nullableString("The arrival time."),
  duration: nullableString("The flight duration."),
  price: nullableString("The current flight price."),
  discount: nullableString("The current discount when reported."),
  originalPrice: nullableString("The original flight price when reported."),
  tripType: nullableString("Whether the itinerary is direct or a transfer itinerary."),
  segments: s.array("The segments in a transfer itinerary.", transferSegmentSchema),
  transfers: s.array("The waits between transfer itinerary segments.", transferInfoSchema),
  bookingUrl: nullableString("The Tongcheng URL for viewing or booking the flight."),
});

const trainSchema = s.object("One normalized train returned by Tongcheng Chengxin.", {
  groupDescription: nullableString("The provider description for the result group."),
  trainNumber: nullableString("The train number."),
  trainType: nullableString("The train type."),
  departureStation: nullableString("The departure station name."),
  arrivalStation: nullableString("The arrival station name."),
  departureDate: nullableString("The departure date."),
  departureTime: nullableString("The departure time."),
  arrivalDate: nullableString("The arrival date."),
  arrivalTime: nullableString("The arrival time."),
  duration: nullableString("The train journey duration."),
  price: nullableString("The lowest reported train ticket price."),
  tickets: s.array("The available train ticket options.", ticketSchema),
  tripType: nullableString("Whether the itinerary is direct or a transfer itinerary."),
  segments: s.array("The segments in a transfer itinerary.", transferSegmentSchema),
  transfers: s.array("The waits between transfer itinerary segments.", transferInfoSchema),
  bookingUrl: nullableString("The Tongcheng URL for viewing or booking the train."),
});

const busSchema = s.object("One normalized bus service returned by Tongcheng Chengxin.", {
  groupDescription: nullableString("The provider description for the result group."),
  coachNumber: nullableString("The coach or bus service number."),
  coachType: nullableString("The coach or bus type."),
  departureCity: nullableString("The departure city."),
  arrivalCity: nullableString("The arrival city."),
  departureStation: nullableString("The departure bus station."),
  arrivalStation: nullableString("The arrival bus station."),
  departureDate: nullableString("The departure date."),
  departureTime: nullableString("The departure time."),
  arrivalDate: nullableString("The arrival date."),
  arrivalTime: nullableString("The arrival time."),
  durationMinutes: s.nullable(s.integer("The journey duration in minutes when reported.")),
  duration: nullableString("The human-readable journey duration."),
  price: nullableString("The bus ticket price."),
  remainingTickets: nullableString("The remaining bus ticket availability when reported."),
  tripType: nullableString("Whether the itinerary is direct or a transfer itinerary."),
  segments: s.array("The segments in a transfer itinerary.", transferSegmentSchema),
  transfers: s.array("The waits between transfer itinerary segments.", transferInfoSchema),
  bookingUrl: nullableString("The Tongcheng URL for viewing or booking the bus service."),
});

const transitStepSchema = s.object("One step in a Tongcheng Chengxin public transit route.", {
  type: nullableString("The step type, such as bus, subway, train, or walk."),
  instructions: nullableString("The human-readable instructions for the step."),
  distanceMeters: s.nullable(s.number("The step distance in meters.")),
  durationSeconds: s.nullable(s.number("The step duration in seconds.")),
  vehicleType: s.nullable(s.integer("The Tongcheng vehicle type code.")),
  lineName: nullableString("The public transit line name."),
  direction: nullableString("The service direction text."),
  departureStation: nullableString("The boarding station."),
  arrivalStation: nullableString("The alighting station."),
  stopCount: s.nullable(s.integer("The number of stops.")),
  firstDepartureTime: nullableString("The first service time when reported."),
  lastDepartureTime: nullableString("The last service time when reported."),
});

const transitRouteSchema = s.object("One public transit route returned by Tongcheng Chengxin.", {
  departure: nullableString("The route departure name."),
  destination: nullableString("The route destination name."),
  arrivalTime: nullableString("The estimated arrival time when reported."),
  durationSeconds: s.nullable(s.number("The total route duration in seconds.")),
  distanceMeters: s.nullable(s.number("The total route distance in meters.")),
  price: s.nullable(s.number("The total public transit price, with negative values omitted.")),
  steps: s.array("The ordered public transit steps.", transitStepSchema),
});

const hotelSchema = s.object("One normalized hotel returned by Tongcheng Chengxin.", {
  groupDescription: nullableString("The provider description for the result group."),
  id: nullableString("The Tongcheng hotel resource ID."),
  name: nullableString("The hotel name."),
  price: nullableString("The current hotel price."),
  star: nullableString("The hotel category or star description."),
  starLevel: nullableString("The numeric hotel star level when reported."),
  score: nullableString("The hotel review score."),
  reviewCount: nullableString("The number of hotel reviews."),
  description: nullableString("A short hotel description."),
  address: nullableString("The hotel address."),
  city: nullableString("The hotel city."),
  district: nullableString("The hotel district or county."),
  businessDistrict: nullableString("The hotel business district."),
  imageUrl: nullableString("The hotel image URL."),
  bookingUrl: nullableString("The Tongcheng URL for viewing or booking the hotel."),
});

const scenerySchema = s.object("One normalized attraction or scenic area returned by Tongcheng Chengxin.", {
  groupDescription: nullableString("The provider description for the result group."),
  id: nullableString("The Tongcheng attraction resource ID."),
  name: nullableString("The attraction or scenic area name."),
  city: nullableString("The destination city."),
  star: nullableString("The attraction rating or grade."),
  score: nullableString("The attraction review score."),
  reviewCount: nullableString("The number of attraction reviews."),
  price: nullableString("The current admission price."),
  description: nullableString("A short attraction description."),
  address: nullableString("The attraction address."),
  theme: nullableString("The attraction theme or category."),
  openTime: nullableString("The attraction opening hours."),
  bestPlayTime: nullableString("The recommended visit duration."),
  rankTitle: nullableString("The provider ranking title when reported."),
  facilities: s.array(
    "The attraction facilities reported by Tongcheng Chengxin.",
    s.string("One attraction facility."),
  ),
  imageUrl: nullableString("The attraction image URL."),
  bookingUrl: nullableString("The Tongcheng URL for viewing or booking the attraction."),
});

const travelProductSchema = s.object("One normalized vacation or travel product returned by Tongcheng Chengxin.", {
  groupDescription: nullableString("The provider description for the result group."),
  id: nullableString("The Tongcheng travel product resource ID."),
  name: nullableString("The travel product name."),
  price: nullableString("The current travel product price."),
  score: nullableString("The travel product review score."),
  reviewCount: nullableString("The number of travel product reviews."),
  labels: s.array("The labels attached to the travel product.", s.string("One travel product label.")),
  destinations: s.array("The destinations covered by the travel product.", s.string("One covered destination.")),
  imageUrl: nullableString("The travel product image URL."),
  bookingUrl: nullableString("The Tongcheng URL for viewing or booking the travel product."),
});

const articleSchema = s.object("One normalized travel guide article returned by Tongcheng Chengxin.", {
  name: nullableString("The guide article title."),
  author: nullableString("The guide article author or nickname."),
  url: nullableString("The Tongcheng URL for opening the guide article."),
});

const searchFlightsInputSchema = {
  ...s.object(
    "The input payload for searching Tongcheng Chengxin flights.",
    {
      departure: queryString("The departure city."),
      destination: queryString("The destination city."),
      flightNumber: queryString("The exact flight number, such as CA1234."),
      lowPrice: s.boolean(
        "Whether to search low-price flights; a destination may be omitted for destination recommendations.",
      ),
      extra: extraSchema,
    },
    { optional: ["departure", "destination", "flightNumber", "lowPrice", "extra"] },
  ),
  anyOf: [
    { required: ["flightNumber"] },
    { required: ["departure", "destination"] },
    { required: ["departure", "lowPrice"] },
  ],
};

const searchTrainsInputSchema = {
  ...s.object(
    "The input payload for searching Tongcheng Chengxin trains.",
    {
      departure: queryString("The departure city."),
      destination: queryString("The destination city."),
      departureStation: queryString("The exact departure station."),
      arrivalStation: queryString("The exact arrival station."),
      trainNumber: queryString("The exact train number, such as G1234."),
      extra: extraSchema,
    },
    {
      optional: ["departure", "destination", "departureStation", "arrivalStation", "trainNumber", "extra"],
    },
  ),
  anyOf: [
    { required: ["departure", "destination"] },
    { required: ["departureStation", "arrivalStation"] },
    { required: ["trainNumber"] },
  ],
};

const searchBusesInputSchema = {
  ...s.object(
    "The input payload for searching Tongcheng Chengxin long-distance buses.",
    {
      departure: queryString("The departure city."),
      destination: queryString("The destination city."),
      departureStation: queryString("The exact departure bus station."),
      arrivalStation: queryString("The exact arrival bus station."),
      extra: extraSchema,
    },
    {
      optional: ["departure", "destination", "departureStation", "arrivalStation", "extra"],
    },
  ),
  anyOf: [{ required: ["departure", "destination"] }, { required: ["departureStation", "arrivalStation"] }],
};

const flightOutputSchema = s.object("The normalized Tongcheng Chengxin flight search response.", {
  answer: nullableString("The natural-language answer returned by Tongcheng Chengxin."),
  flights: s.array("The flights returned by Tongcheng Chengxin.", flightSchema),
  supplementalTransport: s.array(
    "The ground transport segments suggested for air-rail or air-bus connections.",
    supplementalTransportSchema,
  ),
});

const trainOutputSchema = s.object("The normalized Tongcheng Chengxin train search response.", {
  answer: nullableString("The natural-language answer returned by Tongcheng Chengxin."),
  trains: s.array("The trains returned by Tongcheng Chengxin.", trainSchema),
});

const hotelOutputSchema = s.object("The normalized Tongcheng Chengxin hotel search response.", {
  answer: nullableString("The natural-language answer returned by Tongcheng Chengxin."),
  hotels: s.array("The hotels returned by Tongcheng Chengxin.", hotelSchema),
});

const sceneryOutputSchema = s.object("The normalized Tongcheng Chengxin attraction search response.", {
  answer: nullableString("The natural-language answer returned by Tongcheng Chengxin."),
  attractions: s.array("The attractions and scenic areas returned by Tongcheng Chengxin.", scenerySchema),
});

const busOutputSchema = s.object("The normalized Tongcheng Chengxin bus search response.", {
  answer: nullableString("The natural-language answer returned by Tongcheng Chengxin."),
  buses: s.array("The bus services returned by Tongcheng Chengxin.", busSchema),
});

const transportOutputSchema = s.object("The normalized multimodal transport response returned by Tongcheng Chengxin.", {
  answer: nullableString("The natural-language answer returned by Tongcheng Chengxin."),
  flights: s.array("The recommended flights.", flightSchema),
  trains: s.array("The recommended trains.", trainSchema),
  buses: s.array("The recommended bus services.", busSchema),
  supplementalTransport: s.array(
    "The ground transport segments suggested for air-rail or air-bus connections.",
    supplementalTransportSchema,
  ),
  transitRoutes: s.array("The public transit routes returned for local ground transportation.", transitRouteSchema),
});

const travelOutputSchema = s.object(
  "The normalized travel planning and vacation product response returned by Tongcheng Chengxin.",
  {
    answer: nullableString("The natural-language answer returned by Tongcheng Chengxin."),
    flights: s.array("The recommended flights.", flightSchema),
    trains: s.array("The recommended trains.", trainSchema),
    buses: s.array("The recommended bus services.", busSchema),
    supplementalTransport: s.array(
      "The ground transport segments suggested for air-rail or air-bus connections.",
      supplementalTransportSchema,
    ),
    hotels: s.array("The recommended hotels.", hotelSchema),
    attractions: s.array("The recommended attractions and scenic areas.", scenerySchema),
    products: s.array("The recommended vacation and travel products.", travelProductSchema),
    plans: s.array(
      "The provider-defined itinerary plans returned by Tongcheng Chengxin.",
      s.looseObject("One provider-defined itinerary plan."),
    ),
    articles: s.array("The travel guide articles returned by Tongcheng Chengxin.", articleSchema),
  },
);

export const chengxinActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_flights",
    description: "Search Tongcheng Chengxin for flights by route, flight number, or low-price preference.",
    requiredScopes: [],
    inputSchema: searchFlightsInputSchema,
    outputSchema: flightOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_trains",
    description: "Search Tongcheng Chengxin for train services by cities, stations, or train number.",
    requiredScopes: [],
    inputSchema: searchTrainsInputSchema,
    outputSchema: trainOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_hotels",
    description: "Search Tongcheng Chengxin for hotels using a destination and optional natural-language preferences.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for searching Tongcheng Chengxin hotels.", {
      destination: queryString("The destination city."),
      extra: s.optional(extraSchema),
    }),
    outputSchema: hotelOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_attractions",
    description: "Search Tongcheng Chengxin for attractions, scenic areas, and admission products.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for searching Tongcheng Chengxin attractions.", {
      destination: queryString("The destination city."),
      extra: s.optional(extraSchema),
    }),
    outputSchema: sceneryOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_travel",
    description:
      "Search Tongcheng Chengxin for vacation products, travel plans, hotels, attractions, and transport recommendations.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for searching Tongcheng Chengxin travel products and plans.",
      {
        departure: queryString("The optional departure city."),
        destination: queryString("The destination city or region."),
        extra: extraSchema,
      },
      { optional: ["departure", "extra"] },
    ),
    outputSchema: travelOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_transport",
    description:
      "Search Tongcheng Chengxin for multimodal transport when the traveler has not selected a transport type.",
    requiredScopes: [],
    inputSchema: s.object(
      "The input payload for searching Tongcheng Chengxin multimodal transport.",
      {
        departure: queryString("The departure city."),
        destination: queryString("The destination city."),
        extra: extraSchema,
      },
      { optional: ["extra"] },
    ),
    outputSchema: transportOutputSchema,
  }),
  defineProviderAction(service, {
    name: "search_buses",
    description: "Search Tongcheng Chengxin for long-distance bus services by cities or stations.",
    requiredScopes: [],
    inputSchema: searchBusesInputSchema,
    outputSchema: busOutputSchema,
  }),
] as const satisfies ActionDefinition[];

export type ChengxinActionName =
  | "search_flights"
  | "search_trains"
  | "search_hotels"
  | "search_attractions"
  | "search_travel"
  | "search_transport"
  | "search_buses";

export const chengxinActionByName: Map<string, ActionDefinition> = new Map(
  chengxinActions.map((action) => [action.name, action]),
);
