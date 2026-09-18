import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "mezmo";

const usageEntrySchema = s.looseObject("One usage entry returned by Mezmo.");
const timeRangeInputSchema = s.requiredObject("Time range used for Mezmo usage queries.", {
  from: s.dateTime("Start timestamp for the usage window."),
  to: s.dateTime("End timestamp for the usage window."),
});
const timeRangeWithLimitInputSchema = s.object(
  "Time range and optional limit used for Mezmo dimension usage queries.",
  {
    from: s.dateTime("Start timestamp for the usage window."),
    to: s.dateTime("End timestamp for the usage window."),
    limit: s.integer("Maximum number of usage entries to return.", { minimum: 1 }),
  },
  {
    required: ["from", "to"],
    optional: ["limit"],
  },
);

export const mezmoActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_ingestion_status",
    operationType: "read",
    description: "Get whether the Mezmo ingestion service is currently ingesting data for the authenticated account.",
    requiredScopes: [],
    inputSchema: s.object({}, { description: "This action does not require any input parameters." }),
    outputSchema: s.requiredObject("Current Mezmo ingestion service status.", {
      isIngesting: s.boolean("Whether the Mezmo ingestion service is currently ingesting data."),
    }),
  }),
  defineProviderAction(service, {
    name: "get_usage_summary",
    operationType: "read",
    description:
      "Get the Mezmo usage summary for a required time window without flattening the upstream usage payload.",
    requiredScopes: [],
    inputSchema: timeRangeInputSchema,
    outputSchema: s.requiredObject("Usage summary returned by Mezmo for the requested time range.", {
      usage: s.looseObject("Raw Mezmo usage summary payload after minimal normalization."),
    }),
  }),
  defineProviderAction(service, {
    name: "list_app_usages",
    operationType: "read",
    description: "List Mezmo usage entries grouped by app for a required time window and optional result limit.",
    requiredScopes: [],
    inputSchema: timeRangeWithLimitInputSchema,
    outputSchema: s.requiredObject("App usage entries returned by Mezmo.", {
      usages: s.array("Usage entries grouped by app.", usageEntrySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_host_usages",
    operationType: "read",
    description: "List Mezmo usage entries grouped by host for a required time window and optional result limit.",
    requiredScopes: [],
    inputSchema: timeRangeWithLimitInputSchema,
    outputSchema: s.requiredObject("Host usage entries returned by Mezmo.", {
      usages: s.array("Usage entries grouped by host.", usageEntrySchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_tag_usages",
    operationType: "read",
    description: "List Mezmo usage entries grouped by tag for a required time window and optional result limit.",
    requiredScopes: [],
    inputSchema: timeRangeWithLimitInputSchema,
    outputSchema: s.requiredObject("Tag usage entries returned by Mezmo.", {
      usages: s.array("Usage entries grouped by tag.", usageEntrySchema),
    }),
  }),
];
