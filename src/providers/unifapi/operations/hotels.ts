import type { UnifapiOperationDefinition } from "../operations.ts";

export const hotelsOperations: readonly UnifapiOperationDefinition[] = [
  {
    name: "get_hotel_info",
    operationId: "postHotelsInfo",
    description: "Get Hotels detail.",
    method: "POST",
    path: "/hotels/info",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "hotel_identifier",
      "location",
      "language",
      "check_in",
      "check_out",
      "currency",
      "adults",
      "children",
      "load_prices_by_dates",
      "prices_start_date",
      "prices_end_date",
      "prices_date_range",
    ],
    inputSchema: {
      type: "object",
      properties: {
        hotel_identifier: {
          type: "string",
          minLength: 1,
          maxLength: 400,
          description: "Unique hotel id returned by /hotels/search.",
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
        check_in: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Check-in date. Date in YYYY-MM-DD format.",
        },
        check_out: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Check-out date. Date in YYYY-MM-DD format.",
        },
        currency: {
          type: "string",
          minLength: 3,
          maxLength: 3,
          description: "ISO 4217 currency code for prices, such as USD.",
        },
        adults: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          description: "Number of adult guests.",
        },
        children: {
          type: "array",
          items: {
            type: "integer",
            minimum: 0,
            maximum: 17,
            description: "One item in the array.",
          },
          maxItems: 10,
          description: "Ages of children staying, used to refine availability and pricing.",
        },
        load_prices_by_dates: {
          type: "boolean",
          description:
            "When true, return a daily price calendar across the requested date range instead of a single stay price.",
        },
        prices_start_date: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Start date for the daily price calendar. Date in YYYY-MM-DD format.",
        },
        prices_end_date: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "End date for the daily price calendar. Date in YYYY-MM-DD format.",
        },
        prices_date_range: {
          type: "string",
          minLength: 1,
          maxLength: 40,
          description: "Predefined period for the daily price calendar, such as next_30_days.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Get Hotels detail.",
      required: ["hotel_identifier"],
    },
    paginated: false,
  },
  {
    name: "search_hotels",
    operationId: "postHotelsSearch",
    description: "Search Hotels.",
    method: "POST",
    path: "/hotels/search",
    pathFields: [],
    queryFields: [],
    bodyFields: [
      "query",
      "location",
      "language",
      "limit",
      "check_in",
      "check_out",
      "currency",
      "adults",
      "children",
      "stars",
      "min_rating",
      "sort_by",
      "min_price",
      "max_price",
      "free_cancellation",
      "is_vacation_rentals",
      "amenities",
    ],
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          minLength: 1,
          maxLength: 700,
          description: "Optional hotel name or search query. Combine with location to scope the search.",
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
          maximum: 100,
          description: "Number of hotels to return. Defaults to 10.",
        },
        check_in: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Check-in date. Date in YYYY-MM-DD format.",
        },
        check_out: {
          type: "string",
          pattern: "^\\d{4}-\\d{2}-\\d{2}$",
          description: "Check-out date. Date in YYYY-MM-DD format.",
        },
        currency: {
          type: "string",
          minLength: 3,
          maxLength: 3,
          description: "ISO 4217 currency code for prices, such as USD.",
        },
        adults: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          description: "Number of adult guests.",
        },
        children: {
          type: "array",
          items: {
            type: "integer",
            minimum: 0,
            maximum: 17,
            description: "One item in the array.",
          },
          maxItems: 10,
          description: "Ages of children staying, used to refine availability and pricing.",
        },
        stars: {
          type: "array",
          items: {
            type: "integer",
            minimum: 1,
            maximum: 5,
            description: "One item in the array.",
          },
          maxItems: 5,
          description: "Filter to hotels with these class ratings, such as [4, 5].",
        },
        min_rating: {
          type: "number",
          minimum: 0,
          maximum: 5,
          description: "Filter to hotels with at least this guest rating.",
        },
        sort_by: {
          type: "string",
          enum: ["relevance", "lowest_price", "highest_rating", "most_reviewed"],
          description: "Sort order for results. Defaults to relevance.",
        },
        min_price: {
          type: "integer",
          minimum: 0,
          description: "Minimum price per night.",
        },
        max_price: {
          type: "integer",
          minimum: 0,
          description: "Maximum price per night.",
        },
        free_cancellation: {
          type: "boolean",
          description: "When true, only return hotels offering free cancellation.",
        },
        is_vacation_rentals: {
          type: "boolean",
          description: "When true, search vacation rentals instead of hotels.",
        },
        amenities: {
          type: "array",
          items: {
            type: "string",
            minLength: 1,
            maxLength: 60,
            description: "One item in the array.",
          },
          maxItems: 30,
          description: "Filter to hotels offering these amenities, such as pool or free_wifi.",
        },
      },
      additionalProperties: false,
      description: "The input payload for Search Hotels.",
    },
    paginated: false,
  },
];
