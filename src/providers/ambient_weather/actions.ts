import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "ambient_weather";

const macAddressFieldSchema = s.string("The Ambient Weather device MAC address.", {
  minLength: 1,
});
const limitFieldSchema = s.integer("The maximum number of historical records to return.", {
  minimum: 1,
  maximum: 288,
});
const endDateFieldSchema = s.anyOf(
  "The history end cursor as an ISO 8601 timestamp or Unix millisecond timestamp.",
  [
    s.dateTime("An ISO 8601 timestamp used as the history end cursor."),
    s.integer("A Unix millisecond timestamp used as the history end cursor."),
  ],
);

const emptyInputSchema = s.object("This action does not require any input.", {});
const latestDeviceInputSchema = s.object(
  "The input payload for reading the latest Ambient Weather device data.",
  {
    macAddress: macAddressFieldSchema,
  },
  { optional: ["macAddress"] },
);
const deviceHistoryInputSchema = s.object(
  "The input payload for reading Ambient Weather device history.",
  {
    macAddress: macAddressFieldSchema,
    limit: limitFieldSchema,
    endDate: endDateFieldSchema,
  },
  { optional: ["macAddress", "limit", "endDate"] },
);

const deviceInfoSchema = s.looseRequiredObject("Ambient Weather device metadata.", {
  name: s.string("The Ambient Weather device name."),
});
const observationRecordSchema = s.looseRequiredObject(
  "Ambient Weather observation fields returned by the upstream API.",
  {
    dateutc: s.integer("The observation timestamp in Unix milliseconds."),
    date: s.string("The observation local date string."),
  },
);
const deviceSummarySchema = s.object("An Ambient Weather device summary with its latest observation.", {
  macAddress: s.string("The Ambient Weather device MAC address."),
  info: { ...deviceInfoSchema, description: "Ambient Weather device information." },
  lastData: {
    ...observationRecordSchema,
    description: "The latest Ambient Weather observation record.",
  },
});

export const ambientWeatherActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_devices",
    description: "List Ambient Weather devices linked to the connected account.",
    requiredScopes: [],
    inputSchema: emptyInputSchema,
    outputSchema: s.object("Ambient Weather devices returned by the list endpoint.", {
      devices: s.array("Ambient Weather devices linked to the connected account.", deviceSummarySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "get_latest_device_data",
    description: "Get the latest observation record for an Ambient Weather device.",
    requiredScopes: [],
    inputSchema: latestDeviceInputSchema,
    outputSchema: s.object("The latest Ambient Weather observation result.", {
      device: { ...deviceSummarySchema, description: "The Ambient Weather device that was resolved." },
      record: {
        ...observationRecordSchema,
        description: "The latest Ambient Weather observation record.",
      },
    }),
  }),
  defineProviderAction(service, {
    name: "get_device_history",
    description: "Get recent historical observation records for an Ambient Weather device.",
    requiredScopes: [],
    inputSchema: deviceHistoryInputSchema,
    outputSchema: s.object("Ambient Weather historical observation records.", {
      device: { ...deviceSummarySchema, description: "The Ambient Weather device that was resolved." },
      records: s.array("Ambient Weather historical observation records.", observationRecordSchema),
    }),
  }),
];
