import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "wttr_in" as const;

const numericWeatherFieldSchema = s.nullable(
  s.number("The numeric weather value after parsing the wttr.in string field."),
);

const currentWeatherSchema = s.object("A normalized wttr.in current weather summary.", {
  observationTime: s.nullable(s.string("The observation time returned by wttr.in.")),
  description: s.nullable(s.string("The current weather description.")),
  weatherCode: s.nullable(s.string("The wttr.in weather condition code.")),
  temperatureC: numericWeatherFieldSchema,
  temperatureF: numericWeatherFieldSchema,
  feelsLikeC: numericWeatherFieldSchema,
  feelsLikeF: numericWeatherFieldSchema,
  humidity: numericWeatherFieldSchema,
  cloudCover: numericWeatherFieldSchema,
  pressureMb: numericWeatherFieldSchema,
  precipitationMm: numericWeatherFieldSchema,
  windSpeedKmph: numericWeatherFieldSchema,
  windSpeedMiles: numericWeatherFieldSchema,
  windDirectionDegree: numericWeatherFieldSchema,
  windDirection16Point: s.nullable(s.string("The 16-point wind direction label.")),
  uvIndex: numericWeatherFieldSchema,
  visibilityKm: numericWeatherFieldSchema,
  iconUrl: s.nullable(s.url("The wttr.in weather icon URL when present.")),
});

const locationSchema = s.object("The normalized wttr.in location metadata.", {
  name: s.nullable(s.string("The nearest area name returned by wttr.in.")),
  region: s.nullable(s.string("The region returned by wttr.in.")),
  country: s.nullable(s.string("The country returned by wttr.in.")),
  latitude: numericWeatherFieldSchema,
  longitude: numericWeatherFieldSchema,
  query: s.nullable(s.string("The request query reported by wttr.in.")),
  type: s.nullable(s.string("The request type reported by wttr.in.")),
});

const astronomySchema = s.object("The normalized wttr.in astronomy data for one forecast day.", {
  sunrise: s.nullable(s.string("The sunrise time returned by wttr.in.")),
  sunset: s.nullable(s.string("The sunset time returned by wttr.in.")),
  moonrise: s.nullable(s.string("The moonrise time returned by wttr.in.")),
  moonset: s.nullable(s.string("The moonset time returned by wttr.in.")),
  moonPhase: s.nullable(s.string("The moon phase name returned by wttr.in.")),
  moonIllumination: numericWeatherFieldSchema,
});

const forecastDaySchema = s.object("A normalized wttr.in daily forecast summary.", {
  date: s.nullable(s.date("The forecast date.")),
  minTempC: numericWeatherFieldSchema,
  maxTempC: numericWeatherFieldSchema,
  avgTempC: numericWeatherFieldSchema,
  minTempF: numericWeatherFieldSchema,
  maxTempF: numericWeatherFieldSchema,
  avgTempF: numericWeatherFieldSchema,
  uvIndex: numericWeatherFieldSchema,
  sunHours: numericWeatherFieldSchema,
  astronomy: astronomySchema,
});

export const wttrInActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_weather",
    description: "Get current weather and forecast from wttr.in as JSON.",
    requiredScopes: [],
    inputSchema: s.object(
      "Input parameters for fetching wttr.in weather JSON.",
      {
        location: s.string(
          "Optional wttr.in location such as London, muc, @example.com, 94107, or 30.25,120.21. If omitted, wttr.in infers the location from the connector or proxy IP rather than the end user.",
          { minLength: 1 },
        ),
        format: s.stringEnum("The wttr.in JSON format variant.", ["j1", "j2"]),
        lang: s.string("Optional wttr.in localization language code such as en, fr, or zh.", { minLength: 1 }),
        units: s.stringEnum("Optional wttr.in unit mode.", ["metric", "us"]),
      },
      { optional: ["location", "format", "lang", "units"] },
    ),
    outputSchema: s.object("The response returned by wttr.in weather JSON.", {
      location: locationSchema,
      current: currentWeatherSchema,
      forecast: s.array("Normalized daily forecast summaries.", forecastDaySchema),
      raw: s.looseObject("The raw wttr.in JSON response payload."),
    }),
  }),
];
