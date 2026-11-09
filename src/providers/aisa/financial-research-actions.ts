import type { ActionDefinition } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";
export const financialResearchActions: ActionDefinition[] = [
  defineProviderAction("aisa", {
    name: "screen_stocks",
    operationType: "read",
    description: "Screen stocks by financial metrics and company identifiers.",
    requiredScopes: [],
    inputSchema: {
      properties: {
        filters: {
          description: "An array of filter objects to apply to the search.",
          items: {
            properties: {
              field: {
                description:
                  "The criteria to filter on.  For financial metric fields, use 'gt', 'lt', 'gte', 'lte', 'eq' operators.  For 'ticker' and 'cik' fields, use the 'in' operator to filter against multiple values.",
                type: "string",
              },
              operator: {
                description:
                  "The comparison operator. The 'in' operator can only be used with a field value of 'ticker' or 'cik' and lets you filter against multiple values.",
                enum: ["gt", "lt", "gte", "lte", "eq", "in"],
                type: "string",
              },
              value: {
                oneOf: [
                  {
                    description: "The value to compare against for single-value operators (gt, lt, gte, lte, eq)",
                    type: "number",
                  },
                  {
                    description: "Array of ticker or cik values to compare against when using the 'in' operator",
                    items: {
                      type: "string",
                      description: "The value item value.",
                    },
                    type: "array",
                  },
                ],
                description: "The value value.",
              },
            },
            required: ["field", "operator", "value"],
            type: "object",
            description: "The filters item value.",
            additionalProperties: false,
            allOf: [
              {
                if: {
                  properties: {
                    operator: {
                      const: "in",
                    },
                  },
                  required: ["operator"],
                },
                then: {
                  properties: {
                    field: {
                      enum: ["ticker", "cik"],
                    },
                    value: {
                      type: "array",
                      minItems: 1,
                    },
                  },
                },
                else: {
                  properties: {
                    field: {
                      not: {
                        enum: ["ticker", "cik"],
                      },
                    },
                    value: {
                      type: "number",
                    },
                  },
                },
              },
            ],
          },
          minItems: 1,
          type: "array",
        },
        limit: {
          description: "The maximum number of results to return.",
          minimum: 1,
          type: "integer",
        },
      },
      required: ["filters"],
      type: "object",
      description: "Screen stocks by financial metrics and company identifiers.",
      additionalProperties: false,
    },
    outputSchema: s.looseObject("The upstream research response, including additional fields and pagination metadata."),
  }),
  defineProviderAction("aisa", {
    name: "search_financial_line_items",
    operationType: "read",
    description: "Compare selected financial line items across companies.",
    requiredScopes: [],
    inputSchema: {
      properties: {
        limit: {
          description: "The maximum number of results to return.",
          minimum: 1,
          type: "integer",
        },
        lineItems: {
          description: "An array of line items to apply to the search.",
          items: {
            description: "The financial metric to search for.",
            type: "string",
          },
          minItems: 1,
          type: "array",
        },
        period: {
          description: "The time period for the financial data.",
          enum: ["annual", "quarterly", "ttm"],
          type: "string",
        },
        tickers: {
          description: "An array of tickers to apply to the search.",
          items: {
            description: "The tickers to search for.",
            type: "string",
          },
          minItems: 1,
          type: "array",
        },
      },
      required: ["lineItems", "tickers"],
      type: "object",
      description: "Compare selected financial line items across companies.",
      additionalProperties: false,
    },
    outputSchema: s.looseObject("The upstream research response, including additional fields and pagination metadata."),
  }),
  defineProviderAction("aisa", {
    name: "get_company_guidance",
    operationType: "read",
    description: "Get reported company guidance with metric and period filters.",
    requiredScopes: [],
    inputSchema: {
      type: "object",
      description: "Get reported company guidance with metric and period filters.",
      properties: {
        cursor: {
          type: "string",
          description:
            "Opaque pagination cursor from a previous response's next_page_url. When provided, all other query parameters are ignored: the cursor carries the original request's filters. Treat it as opaque; do not construct or modify it.",
        },
        limit: {
          maximum: 50,
          type: "integer",
          description:
            "Number of periods to return. This is the total across all pages, not a page size: each page holds up to 10 records, linked by `next_page_url`.",
        },
        metricName: {
          type: "string",
          description: "Filter to a specific metric.",
        },
        period: {
          enum: ["quarterly", "annual"],
          type: "string",
          description: "Filter by period type: quarterly or annual.",
        },
        reportPeriodGte: {
          format: "date",
          type: "string",
          description: "Only return guidance on or after this date (YYYY-MM-DD).",
        },
        reportPeriodLte: {
          format: "date",
          type: "string",
          description: "Only return guidance on or before this date (YYYY-MM-DD).",
        },
        ticker: {
          type: "string",
          description: "The ticker symbol.",
        },
      },
      required: ["ticker"],
      additionalProperties: false,
    },
    outputSchema: s.looseObject("The upstream research response, including additional fields and pagination metadata."),
  }),
  defineProviderAction("aisa", {
    name: "get_company_kpis",
    operationType: "read",
    description: "Get company-specific operating performance indicators.",
    requiredScopes: [],
    inputSchema: {
      type: "object",
      description: "Get company-specific operating performance indicators.",
      properties: {
        cursor: {
          type: "string",
          description:
            "Opaque pagination cursor from a previous response's next_page_url. When provided, all other query parameters are ignored: the cursor carries the original request's filters. Treat it as opaque; do not construct or modify it.",
        },
        limit: {
          maximum: 50,
          type: "integer",
          description:
            "Number of periods to return. Returns all metrics for the N most recent periods. This is the total across all pages, not a page size: each page holds up to 10 records, linked by `next_page_url`.",
        },
        metricName: {
          type: "string",
          description: "Filter to a specific metric (e.g., load_factor, cet1_ratio).",
        },
        period: {
          enum: ["quarterly", "annual"],
          type: "string",
          description: "Filter by period type: quarterly or annual.",
        },
        reportPeriodGte: {
          format: "date",
          type: "string",
          description: "Only return metrics on or after this date (YYYY-MM-DD).",
        },
        reportPeriodLte: {
          format: "date",
          type: "string",
          description: "Only return metrics on or before this date (YYYY-MM-DD).",
        },
        ticker: {
          type: "string",
          description: "The ticker symbol.",
        },
      },
      required: ["ticker"],
      additionalProperties: false,
    },
    outputSchema: s.looseObject("The upstream research response, including additional fields and pagination metadata."),
  }),
  defineProviderAction("aisa", {
    name: "get_company_non_gaap_metrics",
    operationType: "read",
    description: "Get reported non-GAAP financial metrics.",
    requiredScopes: [],
    inputSchema: {
      type: "object",
      description: "Get reported non-GAAP financial metrics.",
      properties: {
        cursor: {
          type: "string",
          description:
            "Opaque pagination cursor from a previous response's next_page_url. When provided, all other query parameters are ignored: the cursor carries the original request's filters. Treat it as opaque; do not construct or modify it.",
        },
        limit: {
          maximum: 50,
          type: "integer",
          description:
            "Number of periods to return. This is the total across all pages, not a page size: each page holds up to 10 records, linked by `next_page_url`.",
        },
        metricName: {
          type: "string",
          description: "Filter to a specific metric.",
        },
        period: {
          enum: ["quarterly", "annual"],
          type: "string",
          description: "Filter by period type: quarterly or annual.",
        },
        reportPeriodGte: {
          format: "date",
          type: "string",
          description: "Only return metrics on or after this date (YYYY-MM-DD).",
        },
        reportPeriodLte: {
          format: "date",
          type: "string",
          description: "Only return metrics on or before this date (YYYY-MM-DD).",
        },
        ticker: {
          type: "string",
          description: "The ticker symbol.",
        },
      },
      required: ["ticker"],
      additionalProperties: false,
    },
    outputSchema: s.looseObject("The upstream research response, including additional fields and pagination metadata."),
  }),
];
