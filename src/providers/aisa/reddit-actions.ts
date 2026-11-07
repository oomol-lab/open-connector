import type { ProviderActionDefinition } from "../../core/provider-definition.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const redditActions: ProviderActionDefinition[] = [
  defineProviderAction("aisa", {
    name: "search_reddit_posts",
    operationType: "read",
    description: "Search public Reddit posts or comments with pagination.",
    requiredScopes: [],
    inputSchema: {
      type: "object",
      description: "Search public Reddit posts or comments with pagination.",
      properties: {
        after: {
          type: "string",
          description: "Used to paginate to next page",
        },
        count: {
          type: "string",
          description: "The count value.",
        },
        filter: {
          enum: ["comments", "posts"],
          type: "string",
          description: "Search posts or comments",
        },
        limit: {
          type: "string",
          description: "The limit value.",
        },
        query: {
          type: "string",
          description: "Search query",
          minLength: 1,
        },
        sort: {
          type: "string",
          description:
            'Sort by\n\nProvider reference (supplier schema): `{"enum":["relevance","new","top","comment_count"],"type":"string"}`.',
        },
        time: {
          type: "string",
          description: "The time value.",
        },
        timeframe: {
          type: "string",
          description:
            'Timeframe\n\nProvider reference (supplier schema): `{"enum":["all","day","week","month","year"],"type":"string"}`.',
        },
        trim: {
          type: "string",
          description: "Set to true for a trimmed down version of the response",
        },
        trimmed: {
          type: "string",
          description: "The trimmed value.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    outputSchema: s.looseObject("The upstream research response, including additional fields and pagination metadata."),
  }),
  defineProviderAction("aisa", {
    name: "get_reddit_post_comments",
    operationType: "read",
    description: "Read public Reddit comments for a post URL.",
    requiredScopes: [],
    inputSchema: {
      type: "object",
      description: "Read public Reddit comments for a post URL.",
      properties: {
        cursor: {
          type: "string",
          description: "Cursor to get more comments, or replies.",
        },
        trim: {
          type: "boolean",
          description: "Set to true for a trimmed down version of the response",
        },
        trimmed: {
          type: "string",
          description: "The trimmed value.",
        },
        url: {
          type: "string",
          description: "Reddit post URL",
          minLength: 1,
        },
      },
      required: ["url"],
      additionalProperties: false,
    },
    outputSchema: s.looseObject("The upstream research response, including additional fields and pagination metadata."),
  }),
  defineProviderAction("aisa", {
    name: "search_reddit_subreddit",
    operationType: "read",
    description: "Search public Reddit discussions within one subreddit.",
    requiredScopes: [],
    inputSchema: {
      type: "object",
      description: "Search public Reddit discussions within one subreddit.",
      properties: {
        cursor: {
          type: "string",
          description: "Cursor to get more results. Get 'cursor' from previous response.",
        },
        query: {
          type: "string",
          description: "Search query to find matching content",
          minLength: 1,
        },
        sort: {
          type: "string",
          description:
            'Sort order. For posts/media: relevance, hot, top, new, comments. For comments: relevance, top, new\n\nProvider reference (supplier schema): `{"enum":["relevance","hot","top","new","comments"],"type":"string"}`.',
        },
        subreddit: {
          type: "string",
          description: "Subreddit name (e.g. 'Fitness', not 'r/Fitness' or a full URL)",
          minLength: 1,
        },
        timeframe: {
          type: "string",
          description:
            'Timeframe to filter results\n\nProvider reference (supplier schema): `{"enum":["all","year","month","week","day","hour"],"type":"string"}`.',
        },
      },
      required: ["query", "subreddit"],
      additionalProperties: false,
    },
    outputSchema: s.looseObject("The upstream research response, including additional fields and pagination metadata."),
  }),
];
