import type { UnifapiOperationDefinition } from "../operations.ts";

export const eventsOperations: readonly UnifapiOperationDefinition[] = [
  {
    name: "search_events",
    operationId: "postEventsSearch",
    description: "Search Events.",
    method: "POST",
    path: "/events/search",
    pathFields: [],
    queryFields: [],
    bodyFields: ["query", "location", "language", "limit", "view", "os", "date_range"],
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          maxLength: 700,
          description: "Search query to inspect.",
        },
        location: {
          anyOf: [
            {
              type: "string",
              minLength: 2,
              maxLength: 120,
              description: "The location value.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "The location value.",
            },
          ],
          description:
            "Search location as a country code/name, DataForSEO location code, full location name, or latitude,longitude,radius coordinate string. Defaults to us.",
        },
        language: {
          type: "string",
          minLength: 2,
          maxLength: 80,
          description: "Search language as an ISO code or full language name. Defaults to en.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 700,
          description:
            "Number of results to return, matching the limit parameter used across other UnifAPI endpoints. Maps to result depth.",
        },
        view: {
          type: "string",
          enum: ["summary", "standard", "full"],
          description:
            "Controls response size. summary keeps lean rank evidence, standard adds descriptive fields, full includes raw extras and nested items. Defaults to standard.",
        },
        os: {
          type: "string",
          enum: ["windows", "macos", "android", "ios"],
          description: "Optional device operating system.",
        },
        date_range: {
          type: "string",
          enum: ["today", "tomorrow", "this_week", "this_weekend", "next_week", "this_month", "next_month"],
          description: "Restrict events to a relative date range. Defaults to all upcoming events.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Search Events.",
      required: ["query"],
    },
    paginated: false,
  },
];
