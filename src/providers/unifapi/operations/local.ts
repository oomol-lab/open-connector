import type { UnifapiOperationDefinition } from "../operations.ts";

export const localOperations: readonly UnifapiOperationDefinition[] = [
  {
    name: "search_local",
    operationId: "postLocalSearch",
    description: "Search Local Finder.",
    method: "POST",
    path: "/local/search",
    pathFields: [],
    queryFields: [],
    bodyFields: ["query", "location", "language", "limit", "view", "device", "os", "min_rating", "time_filter"],
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
              description: "Search location as a country code/name, full location name, or coordinate string.",
            },
            {
              type: "integer",
              exclusiveMinimum: 0,
              description: "DataForSEO location code.",
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
        device: {
          type: "string",
          enum: ["desktop", "mobile"],
          description: "SERP device type. Defaults to desktop.",
        },
        os: {
          type: "string",
          enum: ["windows", "macos", "android", "ios"],
          description: "Optional device operating system.",
        },
        min_rating: {
          type: "number",
          minimum: 0,
          maximum: 5,
          description: "Filter results to places with at least this average rating.",
        },
        time_filter: {
          type: "string",
          enum: ["any", "open_now"],
          description: "Filter results by open hours. open_now keeps only places open at request time.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Search Local Finder.",
      required: ["query"],
    },
    paginated: false,
  },
];
