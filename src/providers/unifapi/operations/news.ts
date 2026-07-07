import type { UnifapiOperationDefinition } from "../operations.ts";

export const newsOperations: readonly UnifapiOperationDefinition[] = [
  {
    name: "search_news",
    operationId: "postNewsSearch",
    description: "Search News.",
    method: "POST",
    path: "/news/search",
    pathFields: [],
    queryFields: [],
    bodyFields: ["query", "location", "language", "limit", "view", "os"],
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
          allOf: [
            {
              type: "string",
              enum: ["summary", "standard", "full"],
              description: "The view value.",
            },
            {
              description:
                "Controls response size. summary keeps lean rank evidence, standard adds descriptive fields, full includes raw extras and nested items. Defaults to standard.",
            },
          ],
          description: "The view value.",
        },
        os: {
          type: "string",
          enum: ["windows", "macos", "android", "ios"],
          description: "Optional device operating system.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Search News.",
      required: ["query"],
    },
    paginated: false,
  },
];
