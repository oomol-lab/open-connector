import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ambee";

const latitudeField = s.number("The latitude of the target location.", {
  minimum: -90,
  maximum: 90,
});
const longitudeField = s.number("The longitude of the target location.", {
  minimum: -180,
  maximum: 180,
});
const placeField = s.nonEmptyString("The place name or address to geocode.");
const historyTimestampField = s.string({
  description: "The timestamp in `YYYY-MM-DD hh:mm:ss` format required by the Ambee history endpoint.",
  minLength: 1,
  pattern: "^\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}$",
});

const addressSchema = s.looseObject(
  {
    label: s.string("The full formatted address label."),
    countryCode: s.string("The ISO country code."),
    countryName: s.string("The full country name."),
    city: s.string("The city name."),
    state: s.string("The state or province name."),
    stateCode: s.string("The state or province code."),
    district: s.string("The district or neighbourhood name."),
    street: s.string("The street name."),
    houseNumber: s.string("The house or building number."),
    postalCode: s.string("The postal or ZIP code."),
  },
  { description: "The address details returned by Ambee." },
);

const locationSchema = s.looseObject(
  {
    lat: s.number("The latitude of the matched location."),
    lng: s.number("The longitude of the matched location."),
    address: addressSchema,
  },
  { description: "One geocoding result returned by Ambee." },
);

const aqiInfoSchema = s.looseObject(
  {
    pollutant: s.string("The dominant pollutant for this AQI reading."),
    concentration: s.number("The concentration of the dominant pollutant."),
    category: s.string("The AQI category such as Good or Moderate."),
  },
  { description: "The dominant pollutant details for one AQI reading." },
);

const airQualityStationSchema = s.looseObject(
  {
    lat: s.number("The latitude of the reading."),
    lng: s.number("The longitude of the reading."),
    AQI: s.integer("The US EPA Air Quality Index value."),
    CO: s.number("The carbon monoxide concentration."),
    NO2: s.number("The nitrogen dioxide concentration."),
    OZONE: s.number("The ozone concentration."),
    PM10: s.number("The PM10 concentration."),
    PM25: s.number("The PM2.5 concentration."),
    SO2: s.number("The sulphur dioxide concentration."),
    updatedAt: s.string("The timestamp when the reading was updated."),
    aqiInfo: aqiInfoSchema,
    city: s.string("The city name."),
    state: s.string("The state or province name."),
    division: s.string("The administrative division or district name."),
    postalCode: s.string("The postal or ZIP code."),
    countryCode: s.string("The ISO country code."),
    placeName: s.string("The specific place name when available."),
  },
  { description: "One air quality station reading returned by Ambee." },
);

const airQualityHistoryEntrySchema = s.looseObject(
  {
    lat: s.number("The latitude of the reading."),
    lng: s.number("The longitude of the reading."),
    AQI: s.integer("The US EPA Air Quality Index value."),
    CO: s.number("The carbon monoxide concentration."),
    NO2: s.number("The nitrogen dioxide concentration."),
    OZONE: s.number("The ozone concentration."),
    PM10: s.number("The PM10 concentration."),
    PM25: s.number("The PM2.5 concentration."),
    SO2: s.number("The sulphur dioxide concentration."),
    createdAt: s.string("The timestamp when the historical reading was recorded."),
    majorPollutant: s.string("The dominant pollutant for the historical reading."),
    postalCode: s.string("The postal or ZIP code."),
  },
  { description: "One historical air quality reading returned by Ambee." },
);

const coordinateInputSchema = s.object("The coordinate input payload used by Ambee location endpoints.", {
  lat: latitudeField,
  lng: longitudeField,
});

const geocodeOutputSchema = s.object("The geocoding results returned by Ambee.", {
  locations: s.array("The geocoded locations returned by Ambee.", locationSchema),
});

const reverseGeocodeOutputSchema = s.object(
  "The reverse geocoding results returned by Ambee.",
  {
    message: s.string("The optional Ambee status message."),
    locations: s.array("The reverse geocoded locations returned by Ambee.", locationSchema),
  },
  { optional: ["message"] },
);

const airQualityCurrentOutputSchema = s.object(
  "The current air quality station readings returned by Ambee.",
  {
    message: s.string("The Ambee status message for the current reading."),
    stations: s.array("The air quality station readings returned by Ambee.", airQualityStationSchema),
  },
  { optional: ["message"] },
);

const airQualityForecastOutputSchema = s.object(
  "The air quality forecast returned by Ambee.",
  {
    message: s.string("The Ambee status message for the forecast request."),
    forecast: s.array("The forecast air quality readings returned by Ambee.", airQualityStationSchema),
  },
  { optional: ["message"] },
);

const airQualityHistoryOutputSchema = s.object(
  "The historical air quality readings returned by Ambee.",
  {
    message: s.string("The Ambee status message for the history request."),
    history: s.array("The historical air quality readings returned by Ambee.", airQualityHistoryEntrySchema),
  },
  { optional: ["message"] },
);

export const ambeeActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "geocode_by_place",
    description: "Convert a place name or address into latitude and longitude with Ambee.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for geocoding a place with Ambee.", {
      place: placeField,
    }),
    outputSchema: geocodeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "reverse_geocode_by_lat_lng",
    description: "Convert latitude and longitude into location details with Ambee.",
    requiredScopes: [],
    inputSchema: coordinateInputSchema,
    outputSchema: reverseGeocodeOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_air_quality_by_lat_lng",
    description: "Get the latest air quality station readings for one coordinate from Ambee.",
    requiredScopes: [],
    inputSchema: coordinateInputSchema,
    outputSchema: airQualityCurrentOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_air_quality_forecast_by_lat_lng",
    description: "Get the air quality forecast for one coordinate from Ambee.",
    requiredScopes: [],
    inputSchema: coordinateInputSchema,
    outputSchema: airQualityForecastOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_air_quality_history_by_lat_lng",
    description: "Get historical air quality readings for one coordinate from Ambee.",
    requiredScopes: [],
    inputSchema: s.object("The input payload for reading historical air quality from Ambee.", {
      lat: latitudeField,
      lng: longitudeField,
      from: historyTimestampField,
      to: historyTimestampField,
    }),
    outputSchema: airQualityHistoryOutputSchema,
  }),
];
