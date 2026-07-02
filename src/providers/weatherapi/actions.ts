import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "weatherapi";

const queryFieldSchema = s.nonEmptyString(
  "Location query accepted by WeatherAPI, such as a city name, coordinates, or location id.",
);
const languageFieldSchema = s.nonEmptyString("Optional language code used by WeatherAPI to localize text fields.");
const dateFieldSchema = s.nonEmptyString("Date string in YYYY-MM-DD format used by WeatherAPI date-aware endpoints.");
const locationSchema = s.looseObject("WeatherAPI location payload.");
const currentSchema = s.looseObject("WeatherAPI current weather payload.");
const forecastDaySchema = s.looseObject("Single WeatherAPI forecast day payload.");

export const weatherapiActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_locations",
    description: "Search locations supported by WeatherAPI.",
    inputSchema: s.actionInput(
      {
        query: queryFieldSchema,
      },
      ["query"],
      "Input parameters for searching WeatherAPI-supported locations.",
    ),
    outputSchema: s.actionOutput(
      {
        results: s.array(
          "Matched WeatherAPI location results.",
          s.looseObject("Single WeatherAPI location search result."),
        ),
      },
      "Location search results returned by WeatherAPI.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_current_weather",
    description: "Get current weather conditions for a WeatherAPI location query.",
    inputSchema: s.actionInput(
      {
        query: queryFieldSchema,
        language: languageFieldSchema,
      },
      ["query"],
      "Input parameters for reading current weather from WeatherAPI.",
    ),
    outputSchema: s.actionOutput(
      {
        location: locationSchema,
        current: currentSchema,
      },
      "Current weather payload returned by WeatherAPI.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_forecast",
    description: "Get weather forecast data for a WeatherAPI location query.",
    inputSchema: s.actionInput(
      {
        query: queryFieldSchema,
        days: s.integer("Number of forecast days to request, between 1 and 14.", { minimum: 1, maximum: 14 }),
        date: dateFieldSchema,
        language: languageFieldSchema,
      },
      ["query", "days"],
      "Input parameters for reading forecast data from WeatherAPI.",
    ),
    outputSchema: s.actionOutput(
      {
        location: locationSchema,
        current: currentSchema,
        forecastDays: s.array("Forecast day payloads returned by WeatherAPI.", forecastDaySchema),
      },
      "Forecast payload returned by WeatherAPI.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_astronomy",
    description: "Get astronomy information for a WeatherAPI location query and date.",
    inputSchema: s.actionInput(
      {
        query: queryFieldSchema,
        date: s.nonEmptyString("Date string in YYYY-MM-DD format for astronomy lookup."),
      },
      ["query", "date"],
      "Input parameters for reading astronomy data from WeatherAPI.",
    ),
    outputSchema: s.actionOutput(
      {
        location: locationSchema,
        astronomy: s.looseObject("WeatherAPI astronomy payload."),
      },
      "Astronomy payload returned by WeatherAPI.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_timezone",
    description: "Get timezone information for a WeatherAPI location query.",
    inputSchema: s.actionInput(
      {
        query: queryFieldSchema,
      },
      ["query"],
      "Input parameters for reading timezone data from WeatherAPI.",
    ),
    outputSchema: s.actionOutput(
      {
        location: locationSchema,
        timezone: s.looseObject("WeatherAPI timezone payload."),
      },
      "Timezone payload returned by WeatherAPI.",
    ),
  }),
];

export type WeatherapiActionName = (typeof weatherapiActions)[number]["name"];
