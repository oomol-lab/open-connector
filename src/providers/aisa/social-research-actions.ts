import type { ActionDefinition } from "../../core/types.ts";
import type { AisaActionRoute } from "./routes.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

export const nativeSocialActions: ActionDefinition[] = [
  defineProviderAction("aisa", {
    name: "get_bilibili_hot_search",
    operationType: "read",
    description:
      "Get public Bilibili hot-search terms through AIsa's TikHub source. Defaults to 10 results and supports up to 50.",
    requiredScopes: [],
    inputSchema: s.object(
      "The number of Bilibili hot-search terms to request.",
      {
        limit: s.integer(
          "Number of hot-search items to return, at most 50. Defaults to 10 and is always sent to the upstream API.",
          { maximum: 50, default: 10 },
        ),
      },
      { optional: ["limit"] },
    ),
    outputSchema: s.object(
      "The TikHub hot-search response, preserving additional upstream fields.",
      {
        code: s.integer("The upstream response status code."),
        data: s.unknown("The endpoint-specific hot-search payload returned by TikHub."),
        message: s.string("The upstream response message."),
        request_id: s.nullableString("The upstream request identifier, when available."),
      },
      { optional: ["code", "data", "message", "request_id"], additionalProperties: true },
    ),
  }),
  defineProviderAction("aisa", {
    name: "get_instagram_basic_profile",
    operationType: "read",
    description:
      "Read a public Instagram profile by numeric user ID. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "Read a public Instagram profile by numeric user ID. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        cacheMaxAge: {
          enum: ["14d", "1d", "30d", "3d", "7d"],
          type: "string",
          description:
            "Maximum acceptable age of a cached result. Omit to request a live result. Upstream cache metadata is returned when available.",
        },
        userId: {
          type: "string",
          minLength: 1,
          description: "Instagram user id",
        },
      },
      { optional: ["cacheMaxAge"] },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        biography: {
          description: "The biography returned by the native ScrapeCreators source.",
          type: "string",
        },
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        follower_count: {
          description: "The follower_count returned by the native ScrapeCreators source.",
          type: "integer",
        },
        following_count: {
          description: "The following_count returned by the native ScrapeCreators source.",
          type: "integer",
        },
        full_name: {
          description: "The full_name returned by the native ScrapeCreators source.",
          type: "string",
        },
        id: {
          description: "The id returned by the native ScrapeCreators source.",
          type: "string",
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
        username: {
          description: "The username returned by the native ScrapeCreators source.",
          type: "string",
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "get_instagram_transcript",
    operationType: "read",
    description:
      "Get available transcripts for a public Instagram post or reel. AI transcription above 120 seconds requires explicit paid opt-in. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "Get available transcripts for a public Instagram post or reel. AI transcription above 120 seconds requires explicit paid opt-in. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        allowLongTranscription: {
          type: "boolean",
          description:
            "Explicit opt-in for AI transcription without a fixed duration cap. When omitted or false, successful AI transcription up to 120 seconds costs 1 supplier credit; longer AI transcription is unavailable. When true, all successful AI transcription costs 10 supplier credits per started minute, including short videos. Empty AI results and errors cost 0 supplier credits. This does not force AI transcription; native captions still cost 1 supplier credit even for long videos. The request is synchronous with a 180-second connector transport budget; long-video success is not guaranteed.",
        },
        cacheMaxAge: {
          enum: ["14d", "1d", "30d", "3d", "7d"],
          type: "string",
          description:
            "Maximum acceptable age of a cached result. Omit to request a live result. Upstream cache metadata is returned when available.",
        },
        url: {
          type: "string",
          minLength: 1,
          format: "uri",
          description: "Instagram post or reel URL",
        },
      },
      { optional: ["allowLongTranscription", "cacheMaxAge"] },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
        transcripts: {
          description: "The transcripts returned by the native ScrapeCreators source.",
          type: "array",
          items: {
            description: "One returned record.",
          },
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "get_instagram_post",
    operationType: "read",
    description:
      "Get a public Instagram post or reel with optional play counts and permanent media downloads. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "Get a public Instagram post or reel with optional play counts and permanent media downloads. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        cacheMaxAge: {
          enum: ["14d", "1d", "30d", "3d", "7d"],
          type: "string",
          description:
            "Maximum acceptable age of a cached result. Omit to request a live result. Upstream cache metadata is returned when available.",
        },
        downloadMedia: {
          type: "boolean",
          description:
            "Set to true to download the video/images and get back permanent Supabase URLs. Costs 10 supplier credits if media is found, 1 supplier credit otherwise.",
        },
        includePlayCount: {
          type: "boolean",
          description:
            "Set to false to omit `video_play_count` and skip its additional fetch for a faster response. Defaults to true.",
        },
        region: {
          type: "string",
          minLength: 2,
          maxLength: 2,
          description: "2 letter country code to set the proxy in",
        },
        trim: {
          type: "boolean",
          description: "Set to true to get a trimmed response",
        },
        url: {
          type: "string",
          minLength: 1,
          format: "uri",
          description: "Instagram post or reel URL",
        },
      },
      { optional: ["cacheMaxAge", "downloadMedia", "includePlayCount", "region", "trim"] },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "get_instagram_post_comments",
    operationType: "read",
    description:
      "Read public Instagram post comments with cursor pagination and optional reply expansion. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "Read public Instagram post comments with cursor pagination and optional reply expansion. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        cursor: {
          type: "string",
          description: "The cursor to get more comments. Get 'cursor' from previous response.",
        },
        includeReplies: {
          type: "boolean",
          description:
            "Set to true to include replies for every returned comment. This always costs 15 supplier credits because each comment requires a separate Instagram replies request. You will still be charged 15 supplier credits if no replies are returned. This is much slower and may time out at 29 seconds.",
        },
        url: {
          type: "string",
          minLength: 1,
          format: "uri",
          description: "The URL of the post or reel to get comments from",
        },
      },
      { optional: ["cursor", "includeReplies"] },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        comments: {
          description: "The comments returned by the native ScrapeCreators source.",
          type: "array",
          items: {
            description: "One returned record.",
          },
        },
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        cursor: {
          description: "The cursor returned by the native ScrapeCreators source.",
          type: ["string", "null"],
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "get_instagram_profile",
    operationType: "read",
    description:
      "Read a public Instagram profile by handle. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "Read a public Instagram profile by handle. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        cacheMaxAge: {
          enum: ["14d", "1d", "30d", "3d", "7d"],
          type: "string",
          description:
            "Maximum acceptable age of a cached result. Omit to request a live result. Upstream cache metadata is returned when available.",
        },
        handle: {
          type: "string",
          minLength: 1,
          description: "Instagram handle",
        },
        trim: {
          type: "boolean",
          description: "Set to true to get a trimmed response",
        },
      },
      { optional: ["cacheMaxAge", "trim"] },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        data: {
          description: "The data returned by the native ScrapeCreators source.",
          type: "object",
          additionalProperties: true,
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "search_instagram_reels",
    operationType: "read",
    description:
      "Search public Instagram reels by keyword, relative publication window, and page. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "Search public Instagram reels by keyword, relative publication window, and page. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        datePosted: {
          type: "string",
          description:
            "Optional Google-search date filter. Runtime confirmed with `last-hour`; omit this parameter if a provider search window is unavailable.",
        },
        limit: {
          type: "integer",
          minimum: 1,
          description: "The maximum number of results to request.",
        },
        page: {
          type: "integer",
          minimum: 1,
          description: "The page number to return.",
        },
        query: {
          type: "string",
          minLength: 1,
          description: "The keyword to search for",
        },
      },
      { optional: ["datePosted", "limit", "page"] },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        cursor: {
          description: "The cursor returned by the native ScrapeCreators source.",
          type: ["string", "null"],
        },
        reels: {
          description: "The reels returned by the native ScrapeCreators source.",
          type: "array",
          items: {
            description: "One returned record.",
          },
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "get_instagram_trending_reels",
    operationType: "read",
    description:
      "Get currently trending public Instagram reels. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "Get currently trending public Instagram reels. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {},
      { optional: [] },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        cursor: {
          description: "The cursor returned by the native ScrapeCreators source.",
          type: ["string", "null"],
        },
        reels: {
          description: "The reels returned by the native ScrapeCreators source.",
          type: "array",
          items: {
            description: "One returned record.",
          },
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "search_instagram_hashtag",
    operationType: "read",
    description:
      "Find Google-indexed public Instagram posts and reels for a hashtag. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "Find Google-indexed public Instagram posts and reels for a hashtag. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        cursor: {
          type: "string",
          description:
            "The cursor returned by the previous response. In this version, it is the next Google results page number.",
        },
        datePosted: {
          enum: ["last-day", "last-hour", "last-month", "last-week", "last-year"],
          type: "string",
          description: "Only return Google-indexed posts found in this relative window.",
        },
        hashtag: {
          type: "string",
          minLength: 1,
          description: "The hashtag to search for. Include or omit the #.",
        },
        mediaType: {
          enum: ["all", "reels"],
          type: "string",
          description: "Use all to search public posts and reels, or reels to only return reels. Defaults to all.",
        },
      },
      { optional: ["cursor", "datePosted", "mediaType"] },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        cursor: {
          description: "The cursor returned by the native ScrapeCreators source.",
          type: ["string", "null"],
        },
        posts: {
          description: "The posts returned by the native ScrapeCreators source.",
          type: "array",
          items: {
            description: "One returned record.",
          },
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "search_instagram_profiles",
    operationType: "read",
    description:
      "Find public Instagram profiles by biography or caption keywords. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "Find public Instagram profiles by biography or caption keywords. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        cursor: {
          type: "string",
          description:
            "The cursor returned by the previous response. In this version, it is the next Google results page number.",
        },
        query: {
          type: "string",
          minLength: 1,
          description: "Bio or caption keyword/phrase to search for.",
        },
      },
      { optional: ["cursor"] },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        cursor: {
          description: "The cursor returned by the native ScrapeCreators source.",
          type: ["string", "null"],
        },
        profiles: {
          description: "The profiles returned by the native ScrapeCreators source.",
          type: "array",
          items: {
            description: "One returned record.",
          },
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "get_instagram_song_reels",
    operationType: "read",
    description:
      "Find public Instagram reels using an audio ID with cursor pagination. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "Find public Instagram reels using an audio ID with cursor pagination. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        audioId: {
          type: "string",
          minLength: 1,
          description: "The audio id from the Instagram audio page URL.",
        },
        cursor: {
          type: "string",
          description: "Pagination cursor returned by Instagram from the previous response.",
        },
      },
      { optional: ["cursor"] },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        cursor: {
          description: "The cursor returned by the native ScrapeCreators source.",
          type: ["string", "null"],
        },
        reels: {
          description: "The reels returned by the native ScrapeCreators source.",
          type: "array",
          items: {
            description: "One returned record.",
          },
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "get_instagram_profile_embed",
    operationType: "read",
    description:
      "Get the HTML embed for a public Instagram profile. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "Get the HTML embed for a public Instagram profile. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        handle: {
          type: "string",
          minLength: 1,
          description: "Instagram handle",
        },
      },
      { optional: [] },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        html: {
          description: "The html returned by the native ScrapeCreators source.",
          type: "string",
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "get_instagram_highlight",
    operationType: "read",
    description:
      "Read a public Instagram highlight using an ID returned by get_instagram_highlights. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "Read a public Instagram highlight using an ID returned by get_instagram_highlights. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        highlightId: {
          type: "string",
          minLength: 1,
          description:
            "Highlight ID. Use `/instagram/user/highlights` to discover current highlight IDs for a public account.",
        },
      },
      { optional: [] },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        id: {
          description: "The id returned by the native ScrapeCreators source.",
          type: "string",
        },
        items: {
          description: "The items returned by the native ScrapeCreators source.",
          type: "array",
          items: {
            description: "One returned record.",
          },
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "get_instagram_highlights",
    operationType: "read",
    description:
      "List public Instagram highlights by handle or user ID; a user ID avoids the handle lookup. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "List public Instagram highlights by handle or user ID; a user ID avoids the handle lookup. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        handle: {
          type: "string",
          minLength: 1,
          description: "Instagram handle. Use user_id for faster response times.",
        },
        userId: {
          type: "string",
          minLength: 1,
          description: "Instagram user id. Use for faster response times.",
        },
      },
      {
        optional: ["handle", "userId"],
        anyOf: [{ required: ["handle"] }, { required: ["userId"] }],
      },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        highlights: {
          description: "The highlights returned by the native ScrapeCreators source.",
          type: "array",
          items: {
            description: "One returned record.",
          },
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "get_instagram_user_posts",
    operationType: "read",
    description:
      "Read posts from a public Instagram account with cursor pagination. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "Read posts from a public Instagram account with cursor pagination. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        handle: {
          type: "string",
          minLength: 1,
          description: "Instagram handle",
        },
        nextMaxId: {
          type: "string",
          description: "Cursor to get next page of results.",
        },
        trim: {
          type: "boolean",
          description: "Set to true to get a trimmed response",
        },
      },
      { optional: ["nextMaxId", "trim"] },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        items: {
          description: "The items returned by the native ScrapeCreators source.",
          type: "array",
          items: {
            description: "One returned record.",
          },
        },
        max_id: {
          description: "The max_id returned by the native ScrapeCreators source.",
          type: ["string", "null"],
        },
        next_max_id: {
          description: "The next_max_id returned by the native ScrapeCreators source.",
          type: ["string", "null"],
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "get_instagram_user_reels",
    operationType: "read",
    description:
      "Read reels from a public Instagram account by handle or user ID with cursor pagination. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "Read reels from a public Instagram account by handle or user ID with cursor pagination. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        handle: {
          type: "string",
          minLength: 1,
          description: "Instagram handle. Use user_id for faster response times.",
        },
        maxId: {
          type: "string",
          description: "Max id to get more reels. Get 'max_id' from previous response.",
        },
        trim: {
          type: "boolean",
          description: "Set to true for a trimmed down version of the response",
        },
        userId: {
          type: "string",
          minLength: 1,
          description: "Instagram user id. Use this for faster response times.",
        },
      },
      {
        optional: ["handle", "maxId", "trim", "userId"],
        anyOf: [{ required: ["handle"] }, { required: ["userId"] }],
      },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        items: {
          description: "The items returned by the native ScrapeCreators source.",
          type: "array",
          items: {
            description: "One returned record.",
          },
        },
        max_id: {
          description: "The max_id returned by the native ScrapeCreators source.",
          type: ["string", "null"],
        },
        next_max_id: {
          description: "The next_max_id returned by the native ScrapeCreators source.",
          type: ["string", "null"],
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "get_pinterest_board",
    operationType: "read",
    description:
      "Read pins from a public Pinterest board with cursor pagination. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "Read pins from a public Pinterest board with cursor pagination. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        cursor: {
          type: "string",
          description: "The cursor to get the next page of results",
        },
        trim: {
          type: "boolean",
          description: "Set to true for a trimmed down version of the response",
        },
        url: {
          type: "string",
          minLength: 1,
          format: "uri",
          description: "The URL of the board to get",
        },
      },
      { optional: ["cursor", "trim"] },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        cursor: {
          description: "The cursor returned by the native ScrapeCreators source.",
          type: ["string", "null"],
        },
        pins: {
          description: "The pins returned by the native ScrapeCreators source.",
          type: "array",
          items: {
            description: "One returned record.",
          },
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "get_pinterest_pin",
    operationType: "read",
    description:
      "Read a public Pinterest pin by URL. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "Read a public Pinterest pin by URL. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        cacheMaxAge: {
          enum: ["14d", "1d", "30d", "3d", "7d"],
          type: "string",
          description:
            "Maximum acceptable age of a cached result. Omit to request a live result. Upstream cache metadata is returned when available.",
        },
        trim: {
          type: "boolean",
          description: "Set to true for a trimmed down version of the response",
        },
        url: {
          type: "string",
          minLength: 1,
          format: "uri",
          description: "Pinterest pin URL",
        },
      },
      { optional: ["cacheMaxAge", "trim"] },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        description: {
          description: "The description returned by the native ScrapeCreators source.",
          type: "string",
        },
        entityId: {
          description: "The entityId returned by the native ScrapeCreators source.",
          type: "string",
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "search_pinterest",
    operationType: "read",
    description:
      "Search public Pinterest pins by keyword with cursor pagination. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "Search public Pinterest pins by keyword with cursor pagination. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        cursor: {
          type: "string",
          description: "Cursor",
        },
        limit: {
          type: "integer",
          minimum: 1,
          description: "The maximum number of results to request.",
        },
        query: {
          type: "string",
          minLength: 1,
          description: "Search query",
        },
        trim: {
          type: "boolean",
          description: "Set to true for a trimmed down version of the response",
        },
      },
      { optional: ["cursor", "limit", "trim"] },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        cursor: {
          description: "The cursor returned by the native ScrapeCreators source.",
          type: ["string", "null"],
        },
        pins: {
          description: "The pins returned by the native ScrapeCreators source.",
          type: "array",
          items: {
            description: "One returned record.",
          },
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
      },
      additionalProperties: true,
    },
  }),
  defineProviderAction("aisa", {
    name: "get_pinterest_user_boards",
    operationType: "read",
    description:
      "List public Pinterest boards for a username. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
    requiredScopes: [],
    inputSchema: s.object(
      "List public Pinterest boards for a username. Uses AIsa's native ScrapeCreators source, independently of TikHub.",
      {
        handle: {
          type: "string",
          minLength: 1,
          description:
            "The username of the user to get boards for. (e.g. broadstbullycom from https://www.pinterest.com/broadstbullycom/)",
        },
        trim: {
          type: "boolean",
          description: "Set to true for a trimmed down version of the response",
        },
      },
      { optional: ["trim"] },
    ),
    outputSchema: {
      type: "object",
      description: "The native ScrapeCreators response, preserving additional source fields.",
      properties: {
        boards: {
          description: "The boards returned by the native ScrapeCreators source.",
          type: "array",
          items: {
            description: "One returned record.",
          },
        },
        credits_remaining: {
          description: "The credits_remaining returned by the native ScrapeCreators source.",
          type: "integer",
        },
        cursor: {
          description: "The cursor returned by the native ScrapeCreators source.",
          type: ["string", "null"],
        },
        success: {
          description: "The success returned by the native ScrapeCreators source.",
          type: "boolean",
        },
      },
      additionalProperties: true,
    },
  }),
];

export const nativeSocialRoutes: Record<string, AisaActionRoute> = {
  get_bilibili_hot_search: {
    path: "/apis/v1/tikhub/bilibili/web/fetch_hot_search",
    query: { limit: "limit" },
  },
  get_instagram_basic_profile: {
    path: "/apis/v1/instagram/basic-profile",
    query: {
      cacheMaxAge: "cache_max_age",
      userId: "userId",
    },
  },
  get_instagram_transcript: {
    path: "/apis/v1/instagram/media/transcript",
    timeoutMs: 180000,
    query: {
      allowLongTranscription: "allow_long_transcription",
      cacheMaxAge: "cache_max_age",
      url: "url",
    },
  },
  get_instagram_post: {
    path: "/apis/v1/instagram/post",
    query: {
      cacheMaxAge: "cache_max_age",
      downloadMedia: "download_media",
      includePlayCount: "include_play_count",
      region: "region",
      trim: "trim",
      url: "url",
    },
  },
  get_instagram_post_comments: {
    path: "/apis/v1/instagram/post/comments",
    query: {
      cursor: "cursor",
      includeReplies: "include_replies",
      url: "url",
    },
  },
  get_instagram_profile: {
    path: "/apis/v1/instagram/profile",
    query: {
      cacheMaxAge: "cache_max_age",
      handle: "handle",
      trim: "trim",
    },
  },
  search_instagram_reels: {
    path: "/apis/v1/instagram/reels/search",
    query: {
      datePosted: "date_posted",
      limit: "limit",
      page: "page",
      query: "query",
    },
  },
  get_instagram_trending_reels: {
    path: "/apis/v1/instagram/reels/trending",
    query: {},
  },
  search_instagram_hashtag: {
    path: "/apis/v1/instagram/search/hashtag",
    query: {
      cursor: "cursor",
      datePosted: "date_posted",
      hashtag: "hashtag",
      mediaType: "media_type",
    },
  },
  search_instagram_profiles: {
    path: "/apis/v1/instagram/search/profiles",
    query: {
      cursor: "cursor",
      query: "query",
    },
  },
  get_instagram_song_reels: {
    path: "/apis/v1/instagram/song/reels",
    query: {
      audioId: "audio_id",
      cursor: "cursor",
    },
  },
  get_instagram_profile_embed: {
    path: "/apis/v1/instagram/user/embed",
    query: {
      handle: "handle",
    },
  },
  get_instagram_highlight: {
    path: "/apis/v1/instagram/user/highlight/detail",
    query: {
      highlightId: "id",
    },
  },
  get_instagram_highlights: {
    path: "/apis/v1/instagram/user/highlights",
    query: {
      handle: "handle",
      userId: "user_id",
    },
  },
  get_instagram_user_posts: {
    path: "/apis/v1/instagram/user/posts",
    query: {
      handle: "handle",
      nextMaxId: "next_max_id",
      trim: "trim",
    },
  },
  get_instagram_user_reels: {
    path: "/apis/v1/instagram/user/reels",
    query: {
      handle: "handle",
      maxId: "max_id",
      trim: "trim",
      userId: "user_id",
    },
  },
  get_pinterest_board: {
    path: "/apis/v1/pinterest/board",
    query: {
      cursor: "cursor",
      trim: "trim",
      url: "url",
    },
  },
  get_pinterest_pin: {
    path: "/apis/v1/pinterest/pin",
    query: {
      cacheMaxAge: "cache_max_age",
      trim: "trim",
      url: "url",
    },
  },
  search_pinterest: {
    path: "/apis/v1/pinterest/search",
    query: {
      cursor: "cursor",
      limit: "limit",
      query: "query",
      trim: "trim",
    },
  },
  get_pinterest_user_boards: {
    path: "/apis/v1/pinterest/user/boards",
    query: {
      handle: "handle",
      trim: "trim",
    },
  },
};
