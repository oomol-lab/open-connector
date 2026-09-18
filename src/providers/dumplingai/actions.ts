import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { jsonSchema as s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "dumplingai" as const;
const catalogTypeSchema = s.stringEnum("The catalog object type to search or inspect.", [
  "capability",
  "provider",
  "endpoint",
]);
const rawResponseSchema = s.looseObject("The JSON response returned by the DumplingAI API.");

export const dumplingaiActions: ProviderActionDefinition[] = [
  defineProviderAction(service, {
    name: "search_catalog",
    operationType: "read",
    description: "Search DumplingAI capabilities, providers, and managed provider endpoints.",
    requiredScopes: [],
    inputSchema: s.object(
      "A DumplingAI unified catalog search request.",
      {
        prompt: s.nonEmptyString("The natural-language catalog search prompt."),
        limit: s.positiveInteger("The maximum number of catalog matches to return."),
        type: catalogTypeSchema,
      },
      { optional: ["limit", "type"] },
    ),
    outputSchema: rawResponseSchema,
  }),
  defineProviderAction(service, {
    name: "get_catalog_details",
    operationType: "read",
    description: "Get the current contract and metadata for a DumplingAI catalog item.",
    requiredScopes: [],
    inputSchema: s.object(
      "A DumplingAI catalog details request.",
      {
        id: s.nonEmptyString("The capability, provider, or endpoint ID to inspect."),
        type: catalogTypeSchema,
        includeRelated: s.boolean("Whether to include related capabilities, providers, and endpoints."),
      },
      { optional: ["includeRelated"] },
    ),
    outputSchema: rawResponseSchema,
  }),
  defineProviderAction(service, {
    name: "run",
    operationType: "write",
    description: "Run a DumplingAI capability or managed provider endpoint with JSON input.",
    requiredScopes: [],
    inputSchema: s.object(
      "A canonical DumplingAI unified execution request.",
      {
        type: s.stringEnum("The kind of catalog object to run.", ["capability", "endpoint"]),
        id: s.nonEmptyString("The capability ID, such as search_news, or endpoint ID, such as firecrawl.scrape."),
        provider: s.nonEmptyString("An optional provider override supported by the selected capability."),
        input: s.looseObject("The JSON input defined by the selected catalog item."),
        options: s.object(
          "Optional execution response settings.",
          {
            include_native: s.boolean("Whether to include the managed provider's native response payload."),
          },
          { optional: ["include_native"] },
        ),
      },
      { optional: ["provider", "options"] },
    ),
    outputSchema: rawResponseSchema,
  }),
  defineProviderAction(service, {
    name: "get_balance",
    operationType: "read",
    description: "Get balance and budget information for the connected DumplingAI API key.",
    requiredScopes: [],
    inputSchema: s.object("No input is required to get the DumplingAI balance.", {}),
    outputSchema: rawResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_usage",
    operationType: "read",
    description: "List usage and request logs for the connected DumplingAI API key.",
    requiredScopes: [],
    inputSchema: s.object(
      "Filters and pagination for DumplingAI usage records.",
      {
        objectType: catalogTypeSchema,
        status: s.nonEmptyString("The request status to filter by."),
        provider: s.nonEmptyString("The managed provider ID to filter by."),
        objectId: s.nonEmptyString("The capability or endpoint ID to filter by."),
        page: s.positiveInteger("The page number to return."),
        limit: s.positiveInteger("The maximum number of usage records to return."),
      },
      { optional: ["objectType", "status", "provider", "objectId", "page", "limit"] },
    ),
    outputSchema: rawResponseSchema,
  }),
  defineProviderAction(service, {
    name: "list_transactions",
    operationType: "read",
    description: "List credit transactions for the connected DumplingAI API key.",
    requiredScopes: [],
    inputSchema: s.object(
      "Pagination for DumplingAI credit transactions.",
      {
        page: s.positiveInteger("The page number to return."),
        limit: s.positiveInteger("The maximum number of transactions to return."),
      },
      { optional: ["page", "limit"] },
    ),
    outputSchema: rawResponseSchema,
  }),
];

export type DumplingaiActionName = (typeof dumplingaiActions)[number]["name"];
