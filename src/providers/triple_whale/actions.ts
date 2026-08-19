import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "triple_whale";

const shopDomainSchema = s.nonEmptyString(
  "The Shopify shop domain for the Triple Whale store, for example example.myshopify.com.",
);

const summaryPeriodSchema = s.object("The Summary Page date range to request.", {
  start: s.nonEmptyString("The ISO 8601 start date or timestamp for the Summary Page period."),
  end: s.nonEmptyString("The ISO 8601 end date or timestamp for the Summary Page period."),
});

const queryPeriodSchema = s.object("The Custom SQL query date range.", {
  startDate: s.date("The start date for the SQL query period."),
  endDate: s.date("The end date for the SQL query period."),
});

const looseRecordSchema = s.looseObject("A Triple Whale response object.");

const metricsSchema = s.array(
  "Summary Page metrics returned by Triple Whale.",
  s.looseObject("One Summary Page metric object.", {
    metricName: s.string("The metric name returned by Triple Whale."),
    value: s.number("The metric value returned by Triple Whale."),
  }),
);

const todayHourSchema = s.nullable(
  s.integer(
    "The base-1 current-day hour requested by Triple Whale. Pass null or omit it when the requested period has no current-day hour.",
    {
      minimum: 1,
      maximum: 25,
    },
  ),
);

export const tripleWhaleActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "validate_api_key",
    description: "Validate the connected Triple Whale API key and return its metadata when present.",
    inputSchema: s.actionInput({}),
    outputSchema: s.actionOutput({
      valid: s.boolean("Whether Triple Whale accepted the connected API key."),
      apiKey: looseRecordSchema,
    }),
  }),
  defineProviderAction(service, {
    name: "get_summary_page_data",
    description: "Retrieve Triple Whale Summary Page metrics for a store and date period.",
    providerPermissions: ["Summary Page: Read"],
    inputSchema: s.actionInput(
      {
        shopDomain: shopDomainSchema,
        period: summaryPeriodSchema,
        todayHour: todayHourSchema,
      },
      ["shopDomain", "period"],
      "Input payload for retrieving Triple Whale Summary Page data.",
    ),
    outputSchema: s.actionOutput(
      {
        metrics: metricsSchema,
        raw: looseRecordSchema,
      },
      "Summary Page data returned by Triple Whale.",
    ),
  }),
  defineProviderAction(service, {
    name: "execute_custom_sql_query",
    description: "Execute a Triple Whale Data-Out custom SQL query for a store and date period.",
    inputSchema: s.actionInput(
      {
        shopId: shopDomainSchema,
        query: s.nonEmptyString("The SQL query to execute with @startDate and @endDate parameters."),
        period: queryPeriodSchema,
        currency: s.string({
          description: "The currency code for data aggregation, such as USD or EUR.",
          minLength: 3,
          maxLength: 3,
        }),
      },
      ["shopId", "query", "period"],
      "Input payload for executing a Triple Whale custom SQL query.",
    ),
    outputSchema: s.actionOutput(
      {
        success: s.nullableBoolean("Whether Triple Whale reported the query as successful."),
        message: s.nullableString("The message returned by Triple Whale."),
        data: s.array("Rows returned by the custom SQL query.", looseRecordSchema),
        raw: looseRecordSchema,
      },
      "Custom SQL query result returned by Triple Whale.",
    ),
  }),
  defineProviderAction(service, {
    name: "get_customer_journey_attribution_data",
    description: "Export Triple Whale customer journey attribution data for orders in a date period.",
    providerPermissions: ["Pixel Attribution: Read"],
    inputSchema: s.actionInput(
      {
        shop: shopDomainSchema,
        startDate: s.nonEmptyString("The start timestamp for the requested attribution period."),
        endDate: s.nonEmptyString("The end timestamp for the requested attribution period."),
        page: s.integer("The page number of results to return, starting from 1.", {
          minimum: 1,
          maximum: 10000,
        }),
        pageSize: s.integer("The number of results per page.", {
          minimum: 1,
          maximum: 100,
        }),
        excludeJourneyData: s.boolean("Whether to exclude detailed journey events from each order result."),
      },
      ["shop", "startDate", "endDate"],
      "Input payload for retrieving Triple Whale customer journey attribution data.",
    ),
    outputSchema: s.actionOutput(
      {
        totalForRange: s.nullableNumber("The total number of orders in the requested date range."),
        count: s.nullableNumber("The number of orders returned in this response."),
        startDate: s.nullableString("The start timestamp returned by Triple Whale."),
        endDate: s.nullableString("The end timestamp returned by Triple Whale."),
        page: s.nullableNumber("The current result page returned by Triple Whale."),
        earliestDate: s.nullableString("The earliest available attribution date returned by Triple Whale."),
        ordersWithJourneys: s.array("Orders with attribution and customer journey details.", looseRecordSchema),
        raw: looseRecordSchema,
      },
      "Customer journey attribution data returned by Triple Whale.",
    ),
  }),
];
