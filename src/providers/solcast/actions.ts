import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "solcast";

const nonEmptyString = (description: string) => s.nonEmptyString(description);
const latitudeField = s.number("Latitude in decimal degrees using EPSG:4326.", { minimum: -90, maximum: 90 });
const longitudeField = s.number("Longitude in decimal degrees using EPSG:4326.", { minimum: -180, maximum: 180 });
const periodSchema = s.stringEnum("Length of the averaging period in ISO 8601 duration format.", [
  "PT5M",
  "PT10M",
  "PT15M",
  "PT20M",
  "PT30M",
  "PT60M",
]);
const timeZoneSchema = s.anyOf(
  "Timezone used for returned timestamps. Use utc, longitudinal, or a UTC offset from -13 to 13 in 0.25 hour increments.",
  [
    s.literal("utc", { description: "Use UTC timestamps." }),
    s.literal("longitudinal", { description: "Use Solcast longitudinal timestamps." }),
    s.number("UTC offset from -13 to 13.", { minimum: -13, maximum: 13 }),
  ],
);

const timeseriesRecordSchema = s.looseObject(
  {
    period_end: nonEmptyString("The inclusive end timestamp for the returned averaging period."),
    period: nonEmptyString("The ISO 8601 averaging duration for this record."),
  },
  { description: "One Solcast time-series record keyed by the requested output parameters." },
);

const timeseriesOutputSchema = s.object(
  {
    records: s.array("Ordered Solcast time-series records.", timeseriesRecordSchema),
    message: nonEmptyString("Solcast response message returned when the request succeeds without record data."),
  },
  { required: ["records"], optional: ["message"], description: "Normalized Solcast time-series response." },
);

function forecastLikeInput(maxHours: number, description: string): JsonSchema {
  return s.object(
    {
      latitude: latitudeField,
      longitude: longitudeField,
      hours: s.integer({
        description: `Time window of the response in hours from 1 to ${maxHours}.`,
        minimum: 1,
        maximum: maxHours,
      }),
      period: periodSchema,
      output_parameters: nonEmptyString("Comma-separated Solcast output parameter names to include in each record."),
    },
    { optional: ["hours", "period", "output_parameters"], description },
  );
}

export const solcastActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_radiation_and_weather_forecast",
    description: "Get Solcast irradiance and weather forecasts for a latitude and longitude up to 14 days ahead.",
    inputSchema: forecastLikeInput(336, "Input parameters for Solcast irradiance and weather forecasts."),
    outputSchema: timeseriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_radiation_and_weather_live_estimated_actuals",
    description:
      "Get Solcast irradiance and weather live estimated actuals for a latitude and longitude over the past 7 days.",
    inputSchema: forecastLikeInput(168, "Input parameters for Solcast irradiance and weather live estimated actuals."),
    outputSchema: timeseriesOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_radiation_and_weather_historic",
    description:
      "Get Solcast irradiance and weather historical estimated actuals for a latitude and longitude from 2007 through 7 days ago.",
    inputSchema: s.object(
      {
        latitude: latitudeField,
        longitude: longitudeField,
        start: nonEmptyString(
          "ISO 8601 start timestamp for the historical request. If the value omits a timezone, Solcast infers it from time_zone or assumes UTC.",
        ),
        end: nonEmptyString("ISO 8601 end timestamp for the historical request. Provide either end or duration."),
        duration: nonEmptyString("ISO 8601 duration for the historical request. Provide either duration or end."),
        period: periodSchema,
        output_parameters: nonEmptyString(
          "Comma-separated Solcast output parameter names to include in each historical record.",
        ),
        time_zone: timeZoneSchema,
      },
      {
        required: ["latitude", "longitude", "start"],
        optional: ["end", "duration", "period", "output_parameters", "time_zone"],
        description: "Input parameters for Solcast irradiance and weather historical estimated actuals.",
      },
    ),
    outputSchema: timeseriesOutputSchema,
  }),
];
