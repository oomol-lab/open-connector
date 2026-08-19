import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "accuweather";

const languageSchema = s.string({
  minLength: 2,
  description: "The AccuWeather language code used to localize results.",
});
const detailsSchema = s.boolean("Whether AccuWeather should include optional extended details in the response.");
const metricSchema = s.boolean("Whether forecast values should be returned in metric units.");
const locationKeySchema = s.nonEmptyString("The AccuWeather location key returned by a location search endpoint.");
const rawPayloadSchema = s.unknown("The raw AccuWeather response payload.");
const looseRecordSchema = s.looseObject("The raw nested object returned by AccuWeather.");

const locationSchema = s.looseRequiredObject("A normalized AccuWeather location result.", {
  key: s.string("The AccuWeather location key."),
  localizedName: s.string("The localized location name returned by AccuWeather."),
  englishName: s.string("The English location name returned by AccuWeather."),
  type: s.string("The AccuWeather location type, such as City."),
  rank: s.integer("The AccuWeather ranking value for this location."),
  country: looseRecordSchema,
  administrativeArea: looseRecordSchema,
  raw: rawPayloadSchema,
});

const conditionSchema = s.looseRequiredObject("A normalized current condition record.", {
  localObservationDateTime: s.string("The local observation timestamp returned by AccuWeather."),
  weatherText: s.string("The current weather description."),
  weatherIcon: s.integer("The AccuWeather weather icon code."),
  hasPrecipitation: s.boolean("Whether precipitation is currently present."),
  precipitationType: s.nullable(s.string("The precipitation type, when AccuWeather returns one.")),
  isDayTime: s.boolean("Whether the observation is during local daytime."),
  temperature: looseRecordSchema,
  mobileLink: s.string("The AccuWeather mobile URL for this condition."),
  link: s.string("The AccuWeather web URL for this condition."),
  raw: rawPayloadSchema,
});

const searchLocationsInputSchema = s.object(
  "The input payload for searching AccuWeather locations by text.",
  {
    query: s.nonEmptyString("The city, postal code, or place text to search for."),
    language: languageSchema,
    details: detailsSchema,
    offset: s.nonNegativeInteger("The result offset requested from AccuWeather."),
    alias: s.integer({
      minimum: 0,
      maximum: 2,
      description: "The AccuWeather alias mode: 0 for always, 1 for never, or 2 only when no official match exists.",
    }),
  },
  { required: ["query"], optional: ["language", "details", "offset", "alias"] },
);

const geopositionInputSchema = s.object(
  "The input payload for resolving an AccuWeather location by coordinates.",
  {
    latitude: s.number({ minimum: -90, maximum: 90, description: "The latitude in decimal degrees." }),
    longitude: s.number({ minimum: -180, maximum: 180, description: "The longitude in decimal degrees." }),
    language: languageSchema,
    details: detailsSchema,
    topLevel: s.boolean("Whether AccuWeather should return only top-level administrative data."),
  },
  { required: ["latitude", "longitude"], optional: ["language", "details", "topLevel"] },
);

const locationKeyInputSchema = s.object(
  "The input payload for an AccuWeather location-key request.",
  {
    locationKey: locationKeySchema,
    language: languageSchema,
    details: detailsSchema,
  },
  { required: ["locationKey"], optional: ["language", "details"] },
);

const dailyForecastInputSchema = s.object(
  "The input payload for an AccuWeather daily forecast request.",
  {
    locationKey: locationKeySchema,
    duration: s.stringEnum("The AccuWeather daily forecast duration endpoint to call.", [
      "1day",
      "5day",
      "7day",
      "10day",
      "15day",
    ]),
    language: languageSchema,
    details: detailsSchema,
    metric: metricSchema,
  },
  { required: ["locationKey", "duration"], optional: ["language", "details", "metric"] },
);

const hourlyForecastInputSchema = s.object(
  "The input payload for an AccuWeather hourly forecast request.",
  {
    locationKey: locationKeySchema,
    duration: s.stringEnum("The AccuWeather hourly forecast duration endpoint to call.", [
      "1hour",
      "12hour",
      "24hour",
      "72hour",
      "120hour",
    ]),
    language: languageSchema,
    details: detailsSchema,
    metric: metricSchema,
  },
  { required: ["locationKey", "duration"], optional: ["language", "details", "metric"] },
);

const locationSearchOutputSchema = s.requiredObject("The AccuWeather location search response.", {
  locations: s.array("The ordered AccuWeather location results.", locationSchema),
  raw: rawPayloadSchema,
});

const geopositionOutputSchema = s.requiredObject("The AccuWeather geoposition lookup response.", {
  location: locationSchema,
  raw: rawPayloadSchema,
});

const currentConditionsOutputSchema = s.requiredObject("The AccuWeather current conditions response.", {
  conditions: s.array("The current condition records returned by AccuWeather.", conditionSchema),
  raw: rawPayloadSchema,
});

const dailyForecastOutputSchema = s.requiredObject("The AccuWeather daily forecast response.", {
  headline: looseRecordSchema,
  dailyForecasts: s.array("The daily forecast records returned by AccuWeather.", looseRecordSchema),
  raw: rawPayloadSchema,
});

const hourlyForecastOutputSchema = s.requiredObject("The AccuWeather hourly forecast response.", {
  forecasts: s.array("The hourly forecast records returned by AccuWeather.", looseRecordSchema),
  raw: rawPayloadSchema,
});

export const accuweatherActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_locations",
    description: "Search AccuWeather locations by text and return normalized location keys for weather requests.",
    inputSchema: searchLocationsInputSchema,
    outputSchema: locationSearchOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_location_by_geoposition",
    description: "Resolve latitude and longitude coordinates to a single AccuWeather location key.",
    inputSchema: geopositionInputSchema,
    outputSchema: geopositionOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_current_conditions",
    description: "Retrieve current weather conditions for an AccuWeather location key.",
    inputSchema: locationKeyInputSchema,
    outputSchema: currentConditionsOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_daily_forecast",
    description: "Retrieve a daily forecast for an AccuWeather location key using an official duration endpoint.",
    inputSchema: dailyForecastInputSchema,
    outputSchema: dailyForecastOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_hourly_forecast",
    description: "Retrieve an hourly forecast for an AccuWeather location key using an official duration endpoint.",
    inputSchema: hourlyForecastInputSchema,
    outputSchema: hourlyForecastOutputSchema,
  }),
];
