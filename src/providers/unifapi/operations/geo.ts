import type { JsonSchema } from "../../../core/types.ts";
import type { UnifapiOperationDefinition } from "../operations.ts";

import { createDataForSeoFilterSchema, dataForSeoFilterDefinitions } from "./dataforseo-filter.ts";

const geoTargetSchema: JsonSchema = {
  type: "array",
  items: {
    type: "object",
    properties: {
      domain: {
        type: "string",
        minLength: 1,
        maxLength: 63,
        description: "Target domain (no protocol/www). Provide domain or keyword.",
      },
      keyword: {
        type: "string",
        minLength: 1,
        maxLength: 2000,
        description: "Target keyword. Provide domain or keyword.",
      },
      filter: {
        type: "string",
        enum: ["include", "exclude"],
        description: "Whether to include or exclude matches for this entity. Defaults to include.",
      },
      scope: {
        type: "array",
        items: {
          type: "string",
          description: "One item in the array.",
        },
        description:
          "Where to look. Domain scopes: any, sources, search_results. Keyword scopes: any, question, answer, brand_entities, fan_out_queries.",
      },
      match: {
        type: "string",
        enum: ["word", "partial"],
        description: "Keyword match type. word = full-term match; partial = substring. Defaults to word.",
      },
      include_subdomains: {
        type: "boolean",
        description: "Include subdomains of the target domain. Defaults to false.",
      },
    },
    description: "One item in the array.",
  },
  minItems: 1,
  maxItems: 10,
  description: "Up to 10 target entities, each a domain or a keyword.",
};

const geoMentionFiltersSchema = createDataForSeoFilterSchema(
  'Filter the raw mentions dataset before it is aggregated. Provide a single condition {"field","op","value"} or an {"and":[...]} / {"or":[...]} group of conditions (nest groups for mixed logic), up to 8 conditions. Operators: =, <>, <, <=, >, >=, in, not_in, like, not_like, ilike, not_ilike, match, not_match (use an array value with in / not_in). Filterable fields: ai_search_volume (monthly AI search volume); mentions (number of mentions); platform (LLM engine, e.g. chat_gpt, google); location (location name); language (language name); sources_domain (cited source domain); search_results_domain (domain in the engine\'s search results); brand_entities_title (brand entity title); brand_entities_category (brand entity category). Example: {"field":"ai_search_volume","op":">","value":1000}',
);

const geoMatchedMentionFiltersSchema = createDataForSeoFilterSchema(
  'Filter the matched mentions. Provide a single condition {"field","op","value"} or an {"and":[...]} / {"or":[...]} group of conditions (nest groups for mixed logic), up to 8 conditions. Operators: =, <>, <, <=, >, >=, in, not_in, like, not_like, ilike, not_ilike, match, not_match (use an array value with in / not_in). Filterable fields: ai_search_volume (monthly AI search volume); platform (LLM engine, e.g. chat_gpt, google, perplexity); model (model name that produced the answer). Example: {"and":[{"field":"ai_search_volume","op":">","value":1000},{"field":"platform","op":"=","value":"chat_gpt"}]}',
);

export const geoOperations: readonly UnifapiOperationDefinition[] = [
  {
    name: "get_geo_keyword_search_volume",
    operationId: "postGeoKeywordsSearchVolume",
    description: "Get AI search volume for keywords.",
    method: "POST",
    path: "/geo/keywords/search-volume",
    pathFields: [],
    queryFields: [],
    bodyFields: ["keywords", "location", "language"],
    inputSchema: {
      type: "object",
      properties: {
        keywords: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 250,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 1000,
          description: "Keywords to look up AI search volume for. Up to 1000 keywords, 250 chars each.",
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
      },
      additionalProperties: false,
      description: "The input payload for Get AI search volume for keywords.",
      required: ["keywords"],
    },
    paginated: false,
  },
  {
    name: "aggregate_geo_mentions",
    operationId: "postGeoMentionsAggregatedMetrics",
    description: "Aggregate LLM mention metrics by dimension.",
    method: "POST",
    path: "/geo/mentions/aggregated-metrics",
    pathFields: [],
    queryFields: [],
    bodyFields: ["target", "engine", "location", "language", "filters", "internal_list_limit"],
    inputSchema: {
      type: "object",
      properties: {
        target: geoTargetSchema,
        engine: {
          allOf: [
            {
              type: "string",
              enum: ["chatgpt", "google"],
              description: "The engine value.",
            },
            {
              description:
                "AI platform to query. `google` covers Google AI Overviews; `chatgpt` covers ChatGPT (United States + English only). Defaults to google.",
            },
          ],
          description: "The engine value.",
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
        filters: geoMentionFiltersSchema,
        internal_list_limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          description: "Max elements per internal grouped array (source/search-result domains). Default 10.",
        },
      },
      $defs: dataForSeoFilterDefinitions,
      additionalProperties: false,
      description: "The input payload for Aggregate LLM mention metrics by dimension.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "compare_geo_mention_groups",
    operationId: "postGeoMentionsCrossAggregatedMetrics",
    description: "Compare LLM mentions across labeled groups.",
    method: "POST",
    path: "/geo/mentions/cross-aggregated-metrics",
    pathFields: [],
    queryFields: [],
    bodyFields: ["groups", "engine", "location", "language", "filters", "internal_list_limit"],
    inputSchema: {
      type: "object",
      properties: {
        groups: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: {
                type: "string",
                minLength: 1,
                maxLength: 250,
                description: "Aggregation label that groups and identifies this target set in the response.",
              },
              target: geoTargetSchema,
            },
            required: ["label", "target"],
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 10,
          description: "Labeled target groups to compare against each other.",
        },
        engine: {
          allOf: [
            {
              type: "string",
              enum: ["chatgpt", "google"],
              description: "The engine value.",
            },
            {
              description:
                "AI platform to query. `google` covers Google AI Overviews; `chatgpt` covers ChatGPT (United States + English only). Defaults to google.",
            },
          ],
          description: "The engine value.",
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
        filters: geoMentionFiltersSchema,
        internal_list_limit: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          description: "Max elements per internal grouped array. Default 5.",
        },
      },
      $defs: dataForSeoFilterDefinitions,
      additionalProperties: false,
      description: "The input payload for Compare LLM mentions across labeled groups.",
      required: ["groups"],
    },
    paginated: false,
  },
  {
    name: "search_geo_mentions",
    operationId: "postGeoMentionsSearch",
    description: "Search LLM mentions of a domain or keyword.",
    method: "POST",
    path: "/geo/mentions/search",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "target",
      "engine",
      "location",
      "language",
      "filters",
      "order_by",
      "limit",
      "offset",
      "cursor",
      "view",
    ],
    inputSchema: {
      type: "object",
      properties: {
        target: geoTargetSchema,
        engine: {
          allOf: [
            {
              type: "string",
              enum: ["chatgpt", "google"],
              description: "The engine value.",
            },
            {
              description:
                "AI platform to query. `google` covers Google AI Overviews; `chatgpt` covers ChatGPT (United States + English only). Defaults to google.",
            },
          ],
          description: "The engine value.",
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
        filters: geoMatchedMentionFiltersSchema,
        order_by: {
          type: "array",
          items: {
            type: "object",
            properties: {
              field: {
                type: "string",
                minLength: 1,
                description: "Field to sort by. See the endpoint's list of sortable fields.",
              },
              dir: {
                type: "string",
                enum: ["asc", "desc"],
                default: "desc",
                description: "Sort direction: asc or desc. Defaults to desc.",
              },
            },
            required: ["field"],
            additionalProperties: false,
            description: "One item in the array.",
          },
          minItems: 1,
          maxItems: 3,
          description:
            'Sort the matched mentions. Each rule is {"field","dir"} with dir asc or desc; up to 3 rules, applied in order. Sortable fields: ai_search_volume, platform, model.',
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 1000,
          description: "Max mentions to return. Default 100.",
        },
        offset: {
          type: "integer",
          minimum: 0,
          maximum: 9000,
          description: "Mentions to skip. Use cursor beyond 9000.",
        },
        cursor: {
          type: "string",
          description: "search_after_token from a previous response, for deep pagination.",
        },
        view: {
          type: "string",
          enum: ["summary", "standard", "full"],
          description:
            "Response size. full keeps answers, sources, and raw search results; standard drops raw search results; summary keeps only the question, volume, and cited sources. Defaults to standard.",
        },
      },
      $defs: dataForSeoFilterDefinitions,
      additionalProperties: false,
      description: "The input payload for Search LLM mentions of a domain or keyword.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "list_geo_top_mentioned_domains",
    operationId: "postGeoMentionsTopDomains",
    description: "List domains most cited in LLM answers.",
    method: "POST",
    path: "/geo/mentions/top-domains",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "target",
      "engine",
      "location",
      "language",
      "links_scope",
      "filters",
      "items_list_limit",
      "internal_list_limit",
    ],
    inputSchema: {
      type: "object",
      properties: {
        target: geoTargetSchema,
        engine: {
          allOf: [
            {
              type: "string",
              enum: ["chatgpt", "google"],
              description: "The engine value.",
            },
            {
              description:
                "AI platform to query. `google` covers Google AI Overviews; `chatgpt` covers ChatGPT (United States + English only). Defaults to google.",
            },
          ],
          description: "The engine value.",
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
        links_scope: {
          type: "string",
          enum: ["sources", "search_results"],
          description: "Which links to extract domains from. Defaults to sources.",
        },
        filters: geoMentionFiltersSchema,
        items_list_limit: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          description: "Max number of top domains to return. Default 5.",
        },
        internal_list_limit: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          description: "Max elements per internal grouped array. Default 5.",
        },
      },
      $defs: dataForSeoFilterDefinitions,
      additionalProperties: false,
      description: "The input payload for List domains most cited in LLM answers.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "list_geo_top_mentioned_pages",
    operationId: "postGeoMentionsTopPages",
    description: "List pages most cited in LLM answers.",
    method: "POST",
    path: "/geo/mentions/top-pages",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "target",
      "engine",
      "location",
      "language",
      "links_scope",
      "filters",
      "items_list_limit",
      "internal_list_limit",
    ],
    inputSchema: {
      type: "object",
      properties: {
        target: geoTargetSchema,
        engine: {
          allOf: [
            {
              type: "string",
              enum: ["chatgpt", "google"],
              description: "The engine value.",
            },
            {
              description:
                "AI platform to query. `google` covers Google AI Overviews; `chatgpt` covers ChatGPT (United States + English only). Defaults to google.",
            },
          ],
          description: "The engine value.",
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
        links_scope: {
          type: "string",
          enum: ["sources", "search_results"],
          description: "Which links to extract pages from. Defaults to sources.",
        },
        filters: geoMentionFiltersSchema,
        items_list_limit: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          description: "Max number of top pages to return. Default 5.",
        },
        internal_list_limit: {
          type: "integer",
          minimum: 1,
          maximum: 10,
          description: "Max elements per internal grouped array. Default 5.",
        },
      },
      $defs: dataForSeoFilterDefinitions,
      additionalProperties: false,
      description: "The input payload for List pages most cited in LLM answers.",
      required: ["target"],
    },
    paginated: false,
  },
  {
    name: "search_geo_ai_mode",
    operationId: "postGeoSerp",
    description: "Search AI Mode generative results.",
    method: "POST",
    path: "/geo/serp",
    pathFields: [],
    queryFields: [],
    bodyFields: ["query", "target", "location", "language", "device", "include_pixel_rankings", "view"],
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          maxLength: 700,
          description: "Search query to inspect in AI Mode.",
        },
        target: {
          type: "string",
          minLength: 1,
          description: "Optional domain or URL to mark when it appears in AI Mode answers, links, or cited references.",
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
        device: {
          type: "string",
          enum: ["desktop", "mobile"],
          description: "AI SERP device type. Defaults to desktop.",
        },
        include_pixel_rankings: {
          type: "boolean",
          description: "When true, request pixel rectangle data for visual AI SERP analysis.",
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
                "Controls response size. Defaults to full, which keeps every answer section, cited reference, link, and image because AI Mode evidence is not billed per record. standard drops raw extras and nested items; summary keeps only the core answer plus citation domains.",
            },
          ],
          description: "The view value.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Search AI Mode generative results.",
      required: ["query"],
    },
    paginated: false,
  },
];
