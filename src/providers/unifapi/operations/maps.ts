import type { UnifapiOperationDefinition } from "../operations.ts";

export const mapsOperations: readonly UnifapiOperationDefinition[] = [
  {
    name: "search_maps",
    operationId: "postMapsSearch",
    description: "Search Maps.",
    method: "POST",
    path: "/maps/search",
    pathFields: [],
    queryFields: [],
    bodyFields: ["query", "location", "language", "limit", "view", "device", "os", "search_this_area", "search_places"],
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
        search_this_area: {
          type: "boolean",
          description: "When true, return results from the displayed map area rather than the broader location.",
        },
        search_places: {
          type: "boolean",
          description: "When true, use search-places mode to return listings the way the mobile app surfaces them.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Search Maps.",
      required: ["query"],
    },
    paginated: false,
  },
];
