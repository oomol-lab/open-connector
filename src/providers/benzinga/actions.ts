import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "benzinga";

const symbolSchema = s.string("The stock ticker symbol to query.", {
  minLength: 1,
  pattern: "\\S",
});
const optionalSymbolSchema = s.string("The stock ticker symbol used to filter results.", {
  minLength: 1,
  pattern: "\\S",
});
const dateSchema = s.stringPattern("^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$", {
  description: "The date in YYYY-MM-DD format.",
});
const limitSchema = s.integer("The maximum number of records to request.", {
  minimum: 1,
  maximum: 1000,
});
const pageSchema = s.integer("The 0-based page number to request.", {
  minimum: 0,
});
const rawItemSchema = s.looseObject("One raw item returned by Benzinga.");

const calendarInputSchema = s.object(
  "The input payload for listing Benzinga calendar events.",
  {
    symbol: optionalSymbolSchema,
    dateFrom: dateSchema,
    dateTo: dateSchema,
    page: pageSchema,
    limit: limitSchema,
  },
  { optional: ["symbol", "dateFrom", "dateTo", "page", "limit"] },
);

export const benzingaActions: ActionDefinition[] = [
  defineProviderAction(service, {
    name: "list_news_channels",
    description: "List Benzinga news channels that can be used to filter news feeds.",
    inputSchema: s.object({}, { description: "The input payload for listing Benzinga news channels." }),
    outputSchema: s.object(
      "The response returned when listing Benzinga news channels.",
      {
        channels: s.array("The news channels returned by Benzinga.", rawItemSchema),
      },
      { required: ["channels"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_earnings",
    description: "List Benzinga earnings calendar events with optional date and symbol filters.",
    inputSchema: {
      ...calendarInputSchema,
      description: "The input payload for listing Benzinga earnings calendar events.",
    },
    outputSchema: s.object(
      "The response returned when listing Benzinga earnings events.",
      {
        earnings: s.array("The earnings calendar records returned by Benzinga.", rawItemSchema),
      },
      { required: ["earnings"] },
    ),
  }),
  defineProviderAction(service, {
    name: "list_analyst_ratings",
    description: "List Benzinga analyst rating calendar events with optional date and symbol filters.",
    inputSchema: {
      ...calendarInputSchema,
      description: "The input payload for listing Benzinga analyst rating events.",
    },
    outputSchema: s.object(
      "The response returned when listing Benzinga analyst ratings.",
      {
        ratings: s.array("The analyst rating records returned by Benzinga.", rawItemSchema),
      },
      { required: ["ratings"] },
    ),
  }),
  defineProviderAction(service, {
    name: "get_consensus_ratings",
    description: "Get Benzinga consensus analyst ratings and price target data for a ticker.",
    inputSchema: s.object(
      "The input payload for getting Benzinga consensus ratings.",
      {
        symbol: symbolSchema,
      },
      { required: ["symbol"] },
    ),
    outputSchema: s.object(
      "The response returned when getting Benzinga consensus ratings.",
      {
        consensusRatings: s.array("The consensus rating records returned by Benzinga.", rawItemSchema),
      },
      { required: ["consensusRatings"] },
    ),
  }),
];

export type BenzingaActionName = (typeof benzingaActions)[number]["name"];
