import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "iqair_airvisual";

const countrySchema = s.nonEmptyString("The supported country English name used by IQAir AirVisual.");
const stateSchema = s.nonEmptyString("The supported state English name used by IQAir AirVisual.");
const citySchema = s.nonEmptyString("The supported city English name used by IQAir AirVisual.");
const latitudeSchema = s.number("Latitude in decimal degrees.", {
  minimum: -90,
  maximum: 90,
});
const longitudeSchema = s.number("Longitude in decimal degrees.", {
  minimum: -180,
  maximum: 180,
});

const emptyInputSchema = s.object("No input fields are required.", {});

const statesInputSchema = s.object("Input for listing supported states in one country.", {
  country: countrySchema,
});

const citiesInputSchema = s.object("Input for listing supported cities in one state.", {
  country: countrySchema,
  state: stateSchema,
});

const nearestCityInputSchema = s.oneOf(
  [
    emptyInputSchema,
    s.object("Coordinate lookup input for the nearest supported IQAir AirVisual city.", {
      latitude: latitudeSchema,
      longitude: longitudeSchema,
    }),
  ],
  {
    description:
      "Input for reading the nearest supported city. Omit both coordinates to use IP geolocation, or provide both latitude and longitude.",
  },
);

const cityDataInputSchema = s.object("Input for reading current data for one supported city.", {
  country: countrySchema,
  state: stateSchema,
  city: citySchema,
});

const countryOutputSchema = s.object("One country returned by IQAir AirVisual.", {
  country: countrySchema,
});

const stateOutputSchema = s.object("One state returned by IQAir AirVisual.", {
  state: stateSchema,
});

const cityOutputSchema = s.object("One city returned by IQAir AirVisual.", {
  city: citySchema,
});

const coordinatesSchema = s.array(
  "Longitude and latitude coordinates returned by IQAir AirVisual.",
  s.number("One coordinate value returned by IQAir AirVisual."),
  { minItems: 2, maxItems: 2 },
);

const locationSchema = s.looseRequiredObject("The GeoJSON point returned by IQAir AirVisual.", {
  type: s.nonEmptyString("The GeoJSON location type returned by IQAir AirVisual."),
  coordinates: coordinatesSchema,
});

const looseRecordSchema = s.looseObject("A plan-dependent object returned by IQAir AirVisual.");

const cityDataSchema = s.looseRequiredObject(
  "Current air quality and weather data for one city returned by IQAir AirVisual.",
  {
    city: citySchema,
    state: stateSchema,
    country: countrySchema,
    name: s.nonEmptyString("The station name returned by IQAir AirVisual when available."),
    location: locationSchema,
    current: s.looseObject("Current weather and pollution readings returned by IQAir AirVisual.", {
      weather: looseRecordSchema,
      pollution: looseRecordSchema,
    }),
    units: s.record(
      "Measurement units keyed by pollutant or weather field returned by IQAir AirVisual.",
      s.nonEmptyString("One IQAir AirVisual unit value."),
    ),
    forecasts: s.array("Hourly forecast records returned by IQAir AirVisual.", looseRecordSchema),
    forecasts_daily: s.array("Daily forecast records returned by IQAir AirVisual.", looseRecordSchema),
    history: s.looseObject("Historical weather and pollution records returned by IQAir AirVisual."),
  },
  { optional: ["name", "location", "current", "units", "forecasts", "forecasts_daily", "history"] },
);

const countriesOutputSchema = s.object("Supported countries returned by IQAir AirVisual.", {
  countries: s.array("Supported country objects returned by IQAir AirVisual.", countryOutputSchema),
  count: s.nonNegativeInteger("Number of countries returned by IQAir AirVisual."),
});

const statesOutputSchema = s.object("Supported states returned by IQAir AirVisual.", {
  states: s.array("Supported state objects returned by IQAir AirVisual.", stateOutputSchema),
  count: s.nonNegativeInteger("Number of states returned by IQAir AirVisual."),
});

const citiesOutputSchema = s.object("Supported cities returned by IQAir AirVisual.", {
  cities: s.array("Supported city objects returned by IQAir AirVisual.", cityOutputSchema),
  count: s.nonNegativeInteger("Number of cities returned by IQAir AirVisual."),
});

const cityDataOutputSchema = s.object("City data returned by IQAir AirVisual.", {
  data: cityDataSchema,
});

export const iqairAirvisualActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_supported_countries",
    description: "List countries that currently have active IQAir AirVisual stations.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: countriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_supported_states",
    description: "List supported states for a country that has active IQAir AirVisual stations.",
    requiredScopes: [],
    inputSchema: statesInputSchema,
    outputSchema: statesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_supported_cities",
    description: "List supported cities for a country and state with active IQAir AirVisual stations.",
    requiredScopes: [],
    inputSchema: citiesInputSchema,
    outputSchema: citiesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_nearest_city",
    description: "Get current air quality and weather data for the nearest supported city by IP or coordinates.",
    requiredScopes: [],
    inputSchema: nearestCityInputSchema,
    outputSchema: cityDataOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_city_data",
    description: "Get current air quality and weather data for a specified supported city.",
    requiredScopes: [],
    inputSchema: cityDataInputSchema,
    outputSchema: cityDataOutputSchema,
  }),
];
