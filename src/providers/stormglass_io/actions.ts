import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "stormglass_io";

const coordinateFields = {
  lat: s.number("Latitude of the requested coordinate in decimal degrees.", { minimum: -90, maximum: 90 }),
  lng: s.number("Longitude of the requested coordinate in decimal degrees.", { minimum: -180, maximum: 180 }),
};
const timeValueSchema = s.anyOf("A Stormglass time value in ISO 8601 or UNIX timestamp format.", [
  s.nonEmptyString("An ISO 8601 timestamp or date string accepted by Stormglass."),
  s.integer("A UNIX timestamp accepted by Stormglass."),
]);
const weatherParameterSchema = s.stringEnum("One Stormglass weather parameter to request.", [
  "airTemperature",
  "airTemperature80m",
  "airTemperature100m",
  "airTemperature1000hpa",
  "airTemperature800hpa",
  "airTemperature500hpa",
  "airTemperature200hpa",
  "pressure",
  "cloudCover",
  "currentDirection",
  "currentSpeed",
  "dewPointTemperature",
  "gust",
  "humidity",
  "iceCover",
  "precipitation",
  "rain",
  "snow",
  "graupel",
  "snowAlbedo",
  "snowDepth",
  "seaIceThickness",
  "seaLevel",
  "swellDirection",
  "swellHeight",
  "swellPeriod",
  "secondarySwellPeriod",
  "secondarySwellDirection",
  "secondarySwellHeight",
  "visibility",
  "waterTemperature",
  "surfaceTemperature",
  "waveDirection",
  "waveHeight",
  "wavePeriod",
  "windWaveDirection",
  "windWaveHeight",
  "windWavePeriod",
  "windDirection",
  "windDirection20m",
  "windDirection30m",
  "windDirection40m",
  "windDirection50m",
  "windDirection80m",
  "windDirection100m",
  "windDirection1000hpa",
  "windDirection800hpa",
  "windDirection500hpa",
  "windDirection200hpa",
  "windSpeed",
  "windSpeed20m",
  "windSpeed30m",
  "windSpeed40m",
  "windSpeed50m",
  "windSpeed80m",
  "windSpeed100m",
  "windSpeed1000hpa",
  "windSpeed800hpa",
  "windSpeed500hpa",
  "windSpeed200hpa",
]);
const weatherSourceSchema = s.stringEnum("One Stormglass weather source identifier.", [
  "sg",
  "noaa",
  "dwd",
  "icon",
  "meteo",
  "smhi",
]);
const datumSchema = s.stringEnum("The tide datum used for relative sea-level values.", ["MLLW", "MSL"]);
const weatherHourSchema = s.looseRequiredObject("One Stormglass weather hour entry.", {
  time: s.string("The UTC timestamp for this weather hour."),
});
const stationSchema = s.looseObject("The tide station metadata returned by Stormglass.", {
  distance: s.number("The distance from the requested coordinate in kilometers."),
  lat: s.number("The latitude of the selected tide station."),
  lng: s.number("The longitude of the selected tide station."),
  name: s.string("The tide station name."),
  source: s.string("The tide station owner or data source."),
});
const weatherMetaSchema = s.looseRequiredObject("Metadata returned by a Stormglass weather request.", {
  dailyQuota: s.integer("The daily request quota assigned to the API key."),
  requestCount: s.integer("The number of requests used so far today."),
  lat: s.number("The latitude resolved by Stormglass."),
  lng: s.number("The longitude resolved by Stormglass."),
});
const tideMetaSchema = s.looseObject("Metadata returned by a Stormglass tide request.", {
  station: stationSchema,
  datum: datumSchema,
});
const tidePointInputSchema = s.object(
  {
    ...coordinateFields,
    start: timeValueSchema,
    end: timeValueSchema,
    datum: datumSchema,
  },
  { required: ["lat", "lng"], description: "Input parameters for querying a Stormglass tide point." },
);

export const stormglassIoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_weather_point",
    operationType: "read",
    description: "Get Stormglass forecast weather data for one coordinate.",
    inputSchema: s.object(
      {
        ...coordinateFields,
        params: s.array(weatherParameterSchema, {
          description: "Weather parameters to request from Stormglass.",
          minItems: 1,
        }),
        start: timeValueSchema,
        end: timeValueSchema,
        source: s.array(weatherSourceSchema, {
          description: "Weather sources to request from Stormglass.",
          minItems: 1,
        }),
      },
      { required: ["lat", "lng", "params"], description: "Input parameters for querying a Stormglass weather point." },
    ),
    outputSchema: s.object(
      {
        hours: s.array(weatherHourSchema, { description: "Hourly weather entries returned by Stormglass." }),
        meta: weatherMetaSchema,
      },
      { required: ["hours", "meta"], description: "Stormglass weather point response." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_tide_extremes",
    operationType: "read",
    description: "Get Stormglass high and low tide extremes for one coordinate.",
    inputSchema: tidePointInputSchema,
    outputSchema: s.object(
      {
        extremes: s.array(
          s.object(
            {
              height: s.number("The relative tide height in meters."),
              time: s.string("The UTC timestamp of the tide extreme."),
              type: s.stringEnum("The tide extreme type returned by Stormglass.", ["high", "low"]),
            },
            { required: ["height", "time", "type"], description: "One Stormglass tide extreme record." },
          ),
          { description: "Tide extreme records returned by Stormglass." },
        ),
        meta: tideMetaSchema,
      },
      { required: ["extremes", "meta"], description: "Stormglass tide extremes response." },
    ),
  }),
  defineProviderAction(service, {
    name: "get_tide_sea_level",
    operationType: "read",
    description: "Get Stormglass hourly tide sea-level data for one coordinate.",
    inputSchema: tidePointInputSchema,
    outputSchema: s.object(
      {
        seaLevels: s.array(
          s.looseRequiredObject("One Stormglass tide sea-level record.", {
            time: s.string("The UTC timestamp of the sea-level reading."),
          }),
          { description: "Hourly sea-level entries returned by Stormglass." },
        ),
        meta: tideMetaSchema,
      },
      { required: ["seaLevels", "meta"], description: "Stormglass tide sea-level response." },
    ),
  }),
];
