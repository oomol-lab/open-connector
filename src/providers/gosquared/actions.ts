import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "gosquared";

const siteTokenSchema = s.nonEmptyString(
  "GoSquared site_token for the project to query. Omit this to use the siteToken saved on the connection.",
);
const fromSchema = s.nonEmptyString("The start date-time for the GoSquared query.");
const toSchema = s.nonEmptyString("The end date-time for the GoSquared query.");
const dateFormatSchema = s.nonEmptyString(
  "Moment.js date format that GoSquared should use for returned date parameters.",
);
const timeSeriesIntervalSchema = s.nonEmptyString(
  "Discrete time interval between Now Time Series points, such as 5min.",
);
const trendsLimitSchema = s.nonEmptyString(
  "Maximum number of results to return, either as a count such as 10 or offset,count such as 5,10.",
);
const trendsIntervalSchema = s.stringEnum("Interval used to split GoSquared Trends Aggregate datapoints.", [
  "hour",
  "day",
  "month",
]);
const rawObjectSchema = s.looseObject("The raw JSON object returned by GoSquared.");
const rawOutputSchema = s.actionOutput(
  {
    raw: rawObjectSchema,
  },
  "The GoSquared API response.",
);

export const gosquaredActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "get_token_info",
    description: "Fetch scope and authorization information for the connected GoSquared API key.",
    inputSchema: s.actionInput({}, [], "This action does not require input fields."),
    outputSchema: s.actionOutput(
      {
        scopes: s.array("Scopes returned by GoSquared for the API key.", s.string("One GoSquared API key scope.")),
        raw: rawObjectSchema,
      },
      "The GoSquared tokeninfo response.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_now_overview",
    description: "Retrieve a realtime GoSquared Now overview for the configured project.",
    inputSchema: s.actionInput(
      {
        siteToken: siteTokenSchema,
        from: fromSchema,
        to: toSchema,
        dateFormat: dateFormatSchema,
      },
      [],
      "Input parameters for retrieving a GoSquared Now overview.",
    ),
    outputSchema: rawOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_now_time_series",
    description: "Retrieve GoSquared Now visitor counts over time for the configured project.",
    inputSchema: s.actionInput(
      {
        siteToken: siteTokenSchema,
        from: fromSchema,
        to: toSchema,
        interval: timeSeriesIntervalSchema,
        dateFormat: dateFormatSchema,
      },
      [],
      "Input parameters for retrieving a GoSquared Now time series.",
    ),
    outputSchema: rawOutputSchema,
  }),
  defineProviderAction(service, {
    name: "get_trends_aggregate",
    description: "Retrieve GoSquared Trends aggregate metrics for a project over a time period.",
    inputSchema: s.actionInput(
      {
        siteToken: siteTokenSchema,
        from: fromSchema,
        to: toSchema,
        dateFormat: dateFormatSchema,
        limit: trendsLimitSchema,
        interval: trendsIntervalSchema,
      },
      [],
      "Input parameters for retrieving GoSquared Trends aggregate data.",
    ),
    outputSchema: rawOutputSchema,
  }),
];
