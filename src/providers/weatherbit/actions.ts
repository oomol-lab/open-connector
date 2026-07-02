import type { ProviderActionDefinition } from "../../core/provider-definition.ts";
import type { JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "weatherbit";

const latitudeSchema = s.number("Latitude in decimal degrees.", { minimum: -90, maximum: 90 });
const longitudeSchema = s.number("Longitude in decimal degrees.", { minimum: -180, maximum: 180 });
const citySchema = s.nonEmptyString("City name accepted by Weatherbit.");
const stateSchema = s.nonEmptyString("State or province name used with a city query.");
const countrySchema = s.nonEmptyString("Country code used with a city or postal code query, such as US.");
const postalCodeSchema = s.nonEmptyString("Postal or ZIP code accepted by Weatherbit.");
const cityIdSchema = s.integer("Weatherbit city identifier.", { minimum: 1 });
const languageSchema = s.nonEmptyString("Language code used by Weatherbit to localize text fields.");
const unitsSchema = s.stringEnum("Units system for Weatherbit measurements.", ["M", "S", "I"]);

const baseWeatherInputFields = {
  latitude: latitudeSchema,
  longitude: longitudeSchema,
  city: citySchema,
  state: stateSchema,
  country: countrySchema,
  postal_code: postalCodeSchema,
  city_id: cityIdSchema,
  language: languageSchema,
  units: unitsSchema,
};

const weatherRecordSchema = s.looseRequiredObject("One Weatherbit weather record.", {
  datetime: s.string("Weatherbit date or timestamp for the record."),
});
const forecastOutputSchema = s.actionOutput(
  {
    city_name: s.string("Nearest city name returned by Weatherbit."),
    country_code: s.string("Country code returned by Weatherbit."),
    latitude: s.number("Latitude returned by Weatherbit."),
    longitude: s.number("Longitude returned by Weatherbit."),
    timezone: s.string("Timezone returned by Weatherbit."),
    forecast: s.array("Forecast records returned by Weatherbit.", weatherRecordSchema),
  },
  "Forecast response returned by Weatherbit.",
);

export const weatherbitActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_current_weather",
    description: "Get current weather observations from Weatherbit for a location.",
    inputSchema: locationRequired(
      s.actionInput(
        {
          ...baseWeatherInputFields,
          include: s.array(
            "Additional current weather response sections to include.",
            s.stringEnum("One additional Weatherbit current weather section.", ["minutely", "alerts", "lightning"]),
            { minItems: 1, maxItems: 3 },
          ),
        },
        [],
        "Input parameters for reading current weather from Weatherbit.",
      ),
    ),
    outputSchema: s.actionOutput(
      {
        observations: s.array("Current weather observations returned by Weatherbit.", weatherRecordSchema),
        count: s.integer("Number of current weather observations in the response."),
      },
      "Current weather response returned by Weatherbit.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_daily_forecast",
    description: "Get daily weather forecasts from Weatherbit for a location.",
    inputSchema: locationRequired(
      s.actionInput(
        {
          ...baseWeatherInputFields,
          days: s.integer("Number of forecast days to return, from 1 to 16.", { minimum: 1, maximum: 16 }),
        },
        [],
        "Input parameters for reading daily forecasts from Weatherbit.",
      ),
    ),
    outputSchema: forecastOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_hourly_forecast",
    description: "Get hourly weather forecasts from Weatherbit for a location.",
    inputSchema: locationRequired(
      s.actionInput(
        {
          ...baseWeatherInputFields,
          hours: s.integer("Number of forecast hours to return, from 1 to 240.", { minimum: 1, maximum: 240 }),
        },
        [],
        "Input parameters for reading hourly forecasts from Weatherbit.",
      ),
    ),
    outputSchema: forecastOutputSchema,
  }),
];

export type WeatherbitActionName = (typeof weatherbitActions)[number]["name"];

function locationRequired(schema: JsonSchema): JsonSchema {
  return {
    ...schema,
    anyOf: [
      {
        type: "object",
        required: ["latitude", "longitude"],
        additionalProperties: true,
        description: "Provide latitude and longitude.",
      },
      {
        type: "object",
        required: ["city"],
        additionalProperties: true,
        description: "Provide a city.",
      },
      {
        type: "object",
        required: ["postal_code"],
        additionalProperties: true,
        description: "Provide a postal code.",
      },
      {
        type: "object",
        required: ["city_id"],
        additionalProperties: true,
        description: "Provide a Weatherbit city ID.",
      },
    ],
  };
}
