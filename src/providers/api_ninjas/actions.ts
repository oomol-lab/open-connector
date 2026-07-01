import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "api_ninjas";

const latitudeSchema = s.number({
  minimum: -90,
  maximum: 90,
  description: "Latitude coordinate in decimal degrees between -90 and 90.",
});

const longitudeSchema = s.number({
  minimum: -180,
  maximum: 180,
  description: "Longitude coordinate in decimal degrees between -180 and 180.",
});

const cityField = s.nonEmptyString("City name used to look up the requested location.");
const stateField = s.nonEmptyString("State or province used to narrow the city-based lookup.");
const countryField = s.nonEmptyString("Country name or ISO country code used to narrow the city-based lookup.");

const geocodeResultSchema = s.object("A single geocoding result.", {
  name: s.string("Resolved location name returned by the geocoding lookup."),
  latitude: s.number("Latitude of the resolved location in decimal degrees."),
  longitude: s.number("Longitude of the resolved location in decimal degrees."),
  country: s.string("Country code of the resolved location."),
});

const reverseGeocodeResultSchema = s.object(
  "A single reverse geocoding result.",
  {
    name: s.string("Resolved place name for the provided coordinates."),
    country: s.string("Country code of the resolved place."),
    state: s.string("State or administrative region of the resolved place."),
  },
  { optional: ["state"] },
);

const weatherMetricsSchema = s.object("Normalized weather metrics for a single reading.", {
  temp: s.number("Temperature in Celsius."),
  feelsLike: s.number("Perceived temperature in Celsius."),
  minTemp: s.number("Lowest temperature in Celsius."),
  maxTemp: s.number("Highest temperature in Celsius."),
  humidity: s.number("Humidity percentage."),
  windSpeed: s.number("Wind speed in meters per second."),
  windDegrees: s.number("Wind direction in degrees."),
  sunrise: s.number("Sunrise time as a Unix timestamp in seconds."),
  sunset: s.number("Sunset time as a Unix timestamp in seconds."),
});

const weatherCoordinateInputSchema = s.object(
  "Coordinate input accepted by weather endpoints.",
  {
    lat: latitudeSchema,
    lon: longitudeSchema,
  },
  { required: ["lat", "lon"] },
);

const pollutantSchema = s.object("Normalized pollutant measurement.", {
  aqi: s.number("Air quality index for the pollutant."),
  concentration: s.number("Pollutant concentration in micrograms per cubic meter."),
});

const airQualityInputSchema = s.object(
  "Input parameters for looking up air quality by coordinates or city.",
  {
    lat: latitudeSchema,
    lon: longitudeSchema,
    city: cityField,
    state: stateField,
    country: countryField,
  },
  {
    optional: ["lat", "lon", "city", "state", "country"],
  },
);
airQualityInputSchema.anyOf = [{ required: ["lat", "lon"] }, { required: ["city"] }];

const timezoneInputSchema = s.object(
  "Input parameters for looking up timezone details.",
  {
    timezone: s.nonEmptyString("IANA timezone identifier used by the free-tier lookup path."),
    lat: latitudeSchema,
    lon: longitudeSchema,
    city: cityField,
    state: stateField,
    country: countryField,
  },
  {
    optional: ["timezone", "lat", "lon", "city", "state", "country"],
  },
);
timezoneInputSchema.anyOf = [{ required: ["timezone"] }, { required: ["lat", "lon"] }, { required: ["city"] }];

export const apiNinjasActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "geocode",
    description: "Convert a city name into geographic coordinates and country information.",
    inputSchema: s.object(
      "Input parameters for converting a named location into coordinates.",
      {
        city: s.nonEmptyString("City name to convert into geographic coordinates."),
        state: stateField,
        country: countryField,
        zipcode: s.nonEmptyString("ZIP or postal code used to narrow the geocoding lookup."),
      },
      { required: ["city"] },
    ),
    outputSchema: s.object("Resolved coordinates returned by the geocode action.", {
      results: s.array("Resolved geocoding matches for the input.", geocodeResultSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "reverse_geocode",
    description: "Resolve latitude and longitude coordinates into place metadata.",
    inputSchema: s.object(
      "Input parameters for resolving coordinates into location metadata.",
      {
        lat: latitudeSchema,
        lon: longitudeSchema,
      },
      { required: ["lat", "lon"] },
    ),
    outputSchema: s.object("Resolved location metadata returned by the reverse geocode action.", {
      results: s.array("Resolved places matching the provided coordinates.", reverseGeocodeResultSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "weather",
    description: "Fetch the current weather conditions for a set of coordinates.",
    inputSchema: weatherCoordinateInputSchema,
    outputSchema: weatherMetricsSchema,
  }),
  defineProviderAction(service, {
    name: "weather_forecast",
    description: "Fetch forecast weather readings for a set of coordinates.",
    inputSchema: weatherCoordinateInputSchema,
    outputSchema: s.object("Forecast weather data returned by the weather_forecast action.", {
      forecast: s.array("Forecast readings returned in chronological order.", weatherMetricsSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "air_quality",
    description: "Fetch current air quality metrics for coordinates or a city-based lookup.",
    inputSchema: airQualityInputSchema,
    outputSchema: s.object("Normalized air quality metrics returned by the air_quality action.", {
      overallAqi: s.number("Overall air quality index for the location."),
      co: pollutantSchema,
      no2: pollutantSchema,
      o3: pollutantSchema,
      so2: pollutantSchema,
      pm25: pollutantSchema,
      pm10: pollutantSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "timezone",
    description: "Fetch timezone metadata by timezone name or premium location lookup fields.",
    inputSchema: timezoneInputSchema,
    outputSchema: s.object(
      "Normalized timezone data returned by the timezone action.",
      {
        timezone: s.string("Resolved IANA timezone identifier."),
        utcOffset: s.number("UTC offset in seconds for the resolved timezone."),
        localTime: s.string("Current local time in ISO 8601 format."),
        city: s.string("Resolved city name when available."),
      },
      { optional: ["city"] },
    ),
  }),
];

export type ApiNinjasActionName = (typeof apiNinjasActions)[number]["name"];
