import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "aerisweather";

const locationSchema = s.nonEmptyString(
  "The Xweather location identifier, such as a city name, postal code, station ID, or latitude and longitude pair.",
);
const fieldsSchema = s.stringArray("The Xweather dot-notation fields to include in the response.", {
  itemDescription: "One Xweather field path such as place.name or ob.tempC.",
  minItems: 1,
});
const rawPayloadSchema = s.unknown("The raw Xweather response payload.");
const looseRecordSchema = s.unknownObject("A raw nested object returned by Xweather.");

const placeResultSchema = s.looseRequiredObject("A normalized Xweather place result.", {
  loc: looseRecordSchema,
  place: looseRecordSchema,
  profile: looseRecordSchema,
  raw: rawPayloadSchema,
});

const observationResultSchema = s.looseRequiredObject("A normalized Xweather observation result.", {
  id: s.nullableString("The reporting station ID returned by Xweather."),
  dataSource: s.nullableString("The observation data source returned by Xweather."),
  loc: looseRecordSchema,
  place: looseRecordSchema,
  profile: looseRecordSchema,
  observation: looseRecordSchema,
  raw: rawPayloadSchema,
});

const forecastResultSchema = s.looseRequiredObject("A normalized Xweather forecast result.", {
  loc: looseRecordSchema,
  interval: s.nullableString("The forecast interval returned by Xweather."),
  place: looseRecordSchema,
  periods: s.array("The forecast periods returned by Xweather.", looseRecordSchema),
  raw: rawPayloadSchema,
});

export const aerisweatherActions: readonly ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_place",
    operationType: "read",
    description: "Resolve an Xweather place by location identifier.",
    inputSchema: s.actionInput(
      {
        location: locationSchema,
        fields: fieldsSchema,
      },
      ["location"],
      "The input payload for resolving an Xweather place.",
    ),
    outputSchema: s.actionOutput(
      {
        place: placeResultSchema,
        raw: rawPayloadSchema,
      },
      "The response returned when resolving an Xweather place.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_observation",
    operationType: "read",
    description: "Retrieve the latest Xweather observation for a location.",
    inputSchema: s.actionInput(
      {
        location: locationSchema,
        fields: fieldsSchema,
      },
      ["location"],
      "The input payload for retrieving an Xweather observation.",
    ),
    outputSchema: s.actionOutput(
      {
        observation: observationResultSchema,
        raw: rawPayloadSchema,
      },
      "The response returned when retrieving an Xweather observation.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_forecast",
    operationType: "read",
    description: "Retrieve Xweather forecast periods for a location.",
    inputSchema: s.actionInput(
      {
        location: locationSchema,
        filter: s.nonEmptyString("The Xweather forecast filter, such as day, daynight, 1hr, or 3hr."),
        limit: s.positiveInteger("The maximum number of records to return."),
        periodLimit: s.positiveInteger("The maximum number of forecast periods to return."),
        fields: fieldsSchema,
      },
      ["location"],
      "The input payload for retrieving an Xweather forecast.",
    ),
    outputSchema: s.actionOutput(
      {
        forecasts: s.array("The forecast records returned by Xweather.", forecastResultSchema),
        raw: rawPayloadSchema,
      },
      "The response returned when retrieving an Xweather forecast.",
    ),
  }),
];
