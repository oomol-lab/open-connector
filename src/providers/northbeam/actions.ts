import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "northbeam";

const nonEmptyStringSchema = (description: string): JsonSchema =>
  s.string(description, { minLength: 1, pattern: "\\S" });

const metricSchema = s.object(
  "A Northbeam export metric.",
  {
    id: nonEmptyStringSchema("The Northbeam metric identifier."),
    label: s.nullableString("The human-readable metric label."),
  },
  { optional: ["label"] },
);
const attributionModelSchema = s.object(
  "A Northbeam attribution model.",
  {
    id: nonEmptyStringSchema("The Northbeam attribution model identifier."),
    name: s.nullableString("The human-readable attribution model name."),
  },
  { optional: ["name"] },
);
const breakdownSchema = s.object("A Northbeam breakdown definition.", {
  key: nonEmptyStringSchema("The Northbeam breakdown key."),
  values: s.array("The values available for the breakdown key.", s.string("A breakdown value.")),
});
const spendRecordSchema = s.looseObject("A Northbeam spend record.");
const spendListOutputSchema = s.object("A paginated Northbeam spend response.", {
  records: s.array("The spend records returned by Northbeam.", spendRecordSchema),
  page: s.integer("The current result page."),
  page_size: s.integer("The number of results requested per page."),
  total_pages: s.integer("The total number of pages available."),
  total_count: s.integer("The total number of spend records matching the filters."),
});
const spendFilterProperties = {
  platform_account_id: nonEmptyStringSchema("The ad platform account ID to filter spend by."),
  campaign_id: nonEmptyStringSchema("The ad platform campaign ID to filter spend by."),
  adset_id: nonEmptyStringSchema("The ad platform ad set ID to filter spend by."),
  ad_id: nonEmptyStringSchema("The ad platform ad ID to filter spend by."),
  page: s.positiveInteger("The result page to fetch."),
  page_size: s.integer("The number of results per page. Northbeam documents a maximum of 1000.", {
    minimum: 1,
    maximum: 1000,
  }),
};
const listSpendInputSchema: JsonSchema = s.object(
  "The query filters for listing Northbeam daily spend records.",
  {
    date: s.date("The single spend date to fetch. Use this instead of date_start/date_end."),
    date_start: s.date("The start date for a spend date range."),
    date_end: s.date("The end date for a spend date range."),
    ...spendFilterProperties,
  },
  {
    optional: [
      "date",
      "date_start",
      "date_end",
      "platform_account_id",
      "campaign_id",
      "adset_id",
      "ad_id",
      "page",
      "page_size",
    ],
  },
);
listSpendInputSchema.not = {
  anyOf: [{ required: ["date", "date_start"] }, { required: ["date", "date_end"] }],
};
listSpendInputSchema.dependentRequired = {
  date_start: ["date_end"],
  date_end: ["date_start"],
};

const listHourlySpendInputSchema: JsonSchema = s.object(
  "The query filters for listing Northbeam hourly spend records.",
  {
    hour_start_iso_begin: s.dateTime("The start date-time for the hourly spend range."),
    hour_start_iso_end: s.dateTime("The end date-time for the hourly spend range."),
    ...spendFilterProperties,
  },
  {
    optional: [
      "hour_start_iso_begin",
      "hour_start_iso_end",
      "platform_account_id",
      "campaign_id",
      "adset_id",
      "ad_id",
      "page",
      "page_size",
    ],
  },
);
listHourlySpendInputSchema.dependentRequired = {
  hour_start_iso_begin: ["hour_start_iso_end"],
  hour_start_iso_end: ["hour_start_iso_begin"],
};

export const northbeamActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_metrics",
    description: "List the metrics available for Northbeam data exports.",
    inputSchema: s.object("The input payload for listing Northbeam metrics.", {}),
    outputSchema: s.object("The Northbeam metrics response.", {
      metrics: s.array("The metrics returned by Northbeam.", metricSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_attribution_models",
    description: "List the attribution models available for Northbeam data exports.",
    inputSchema: s.object("The input payload for listing Northbeam attribution models.", {}),
    outputSchema: s.object("The Northbeam attribution models response.", {
      attribution_models: s.array("The attribution models returned by Northbeam.", attributionModelSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_breakdowns",
    description: "List the breakdown keys and values available for Northbeam data exports.",
    inputSchema: s.object("The input payload for listing Northbeam breakdowns.", {}),
    outputSchema: s.object("The Northbeam breakdowns response.", {
      breakdowns: s.array("The breakdowns returned by Northbeam.", breakdownSchema),
    }),
  }),
  defineProviderAction(service, {
    name: "list_spend",
    description: "List paginated Northbeam daily spend records.",
    inputSchema: listSpendInputSchema,
    outputSchema: spendListOutputSchema,
  }),
  defineProviderAction(service, {
    name: "list_hourly_spend",
    description: "List paginated Northbeam hourly spend records.",
    inputSchema: listHourlySpendInputSchema,
    outputSchema: spendListOutputSchema,
  }),
];
