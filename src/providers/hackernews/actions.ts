import type { ActionDefinition, JsonSchema } from "../../core/types.ts";

import { s } from "../../core/json-schema.ts";
import { defineProviderAction } from "../../core/provider-definition.ts";

const service = "hackernews";
const firebaseItemTypes = ["job", "story", "comment", "poll", "pollopt"];
const safeInteger = s.integer({
  minimum: -Number.MAX_SAFE_INTEGER,
  maximum: Number.MAX_SAFE_INTEGER,
});
const positiveId = s.integer({
  exclusiveMinimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
});
const prettyInput = s.object(
  {
    print: s.literal("pretty", {
      description: "The pretty-print flag for Firebase responses.",
    }),
  },
  { description: "Optional Firebase request options." },
);
const storyIdsOutput = s.object(
  {
    story_ids: s.array(safeInteger, { description: "Hacker News item IDs." }),
  },
  {
    required: ["story_ids"],
    description: "Story ID list returned by the Hacker News Firebase API.",
  },
);
const countedStoryIdsOutput = s.object(
  {
    story_ids: s.array(safeInteger, { description: "Hacker News item IDs." }),
    count: safeInteger,
  },
  {
    required: ["story_ids", "count"],
    description: "Story ID list with the number of returned IDs.",
  },
);
const itemSchema = s.object(
  {
    by: s.string({ description: "The username of the item author." }),
    descendants: safeInteger,
    id: safeInteger,
    kids: s.array(safeInteger),
    parent: safeInteger,
    parts: s.array(safeInteger),
    poll: safeInteger,
    score: safeInteger,
    text: s.string(),
    time: safeInteger,
    title: s.string(),
    type: s.stringEnum(firebaseItemTypes),
    url: s.string(),
    dead: s.boolean(),
    deleted: s.boolean(),
  },
  {
    required: ["id", "type"],
    additionalProperties: true,
    description: "A Hacker News item from the Firebase API.",
  },
);
const treeItemSchema = s.object(
  {
    id: safeInteger,
    url: s.string(),
    text: s.string(),
    type: s.stringEnum(firebaseItemTypes),
    title: s.string(),
    author: s.string(),
    points: safeInteger,
    options: s.array(safeInteger),
    children: s.array(s.ref("#/$defs/treeItem")),
    story_id: safeInteger,
    parent_id: safeInteger,
    created_at: s.string(),
    created_at_i: safeInteger,
    children_shown: safeInteger,
    max_depth_reached: s.boolean(),
    children_truncated: s.boolean(),
    total_children_count: safeInteger,
  },
  {
    required: ["id", "type"],
    additionalProperties: true,
    description: "A Hacker News item with bounded nested children.",
  },
);
const searchHitSchema = s.object(
  {
    url: s.string(),
    title: s.string(),
    author: s.string(),
    points: safeInteger,
    objectID: s.string(),
    story_id: safeInteger,
    created_at: s.string(),
    story_text: s.string(),
    story_title: s.string(),
    story_url: s.string(),
    comment_text: s.string(),
    created_at_i: safeInteger,
    num_comments: safeInteger,
    _tags: s.array(s.string()),
  },
  {
    additionalProperties: true,
    description: "A Hacker News search hit from the Algolia API.",
  },
);
const searchOutputBase = {
  hits: s.array(searchHitSchema),
  nbHits: safeInteger,
  page: safeInteger,
  nbPages: safeInteger,
  hitsPerPage: safeInteger,
};

export const hackernewsActions: ActionDefinition[] = [
  storyListAction("get_ask_stories", "Get the latest Ask HN story IDs from Hacker News.", false),
  storyListAction("get_best_stories", "Get the best story IDs from Hacker News ranked by score.", true),
  defineProviderAction(service, {
    name: "get_item",
    description: "Get a Hacker News item by its numeric ID.",
    inputSchema: s.object(
      {
        id: positiveId,
        print: s.literal("pretty"),
      },
      {
        required: ["id"],
        description: "Item lookup input.",
      },
    ),
    outputSchema: s.nullable(itemSchema),
  }),
  defineProviderAction(service, {
    name: "get_item_with_id",
    description: "Get a Hacker News item with a bounded nested comment tree.",
    inputSchema: s.object(
      {
        item_id: s.union([positiveId, s.stringPattern("^\\d+$", { description: "A numeric item ID as a string." })]),
        max_depth: s.integer({
          minimum: 0,
          maximum: 10,
          default: 2,
          description: "The maximum depth of the nested comment tree.",
        }),
        max_children: s.integer({
          minimum: 0,
          maximum: 100,
          default: 10,
          description: "The maximum number of children per node.",
        }),
        truncate_text: s.boolean({
          default: true,
          description: "Whether to truncate long text content.",
        }),
      },
      {
        required: ["item_id", "max_depth", "max_children", "truncate_text"],
        description: "Nested item lookup input.",
      },
    ),
    outputSchema: s.object(
      {
        found: s.boolean(),
        item: s.ref("#/$defs/treeItem"),
        error_message: s.string(),
      },
      {
        required: ["found"],
        defs: { treeItem: treeItemSchema },
        description: "Nested item lookup result.",
      },
    ),
  }),
  storyListAction("get_job_stories", "Get the latest job story IDs from Hacker News.", false),
  defineProviderAction(service, {
    name: "get_latest_posts",
    description: "Get the latest Hacker News posts via Algolia search_by_date.",
    inputSchema: searchInput(false),
    outputSchema: searchOutput("The latest post hits."),
  }),
  defineProviderAction(service, {
    name: "get_max_item_id",
    description: "Get the current largest Hacker News item ID.",
    inputSchema: prettyInput,
    outputSchema: s.object(
      { max_item_id: safeInteger },
      {
        required: ["max_item_id"],
        description: "Current largest Hacker News item ID.",
      },
    ),
  }),
  storyListAction("get_new_stories", "Get the newest story IDs from Hacker News.", true),
  storyListAction("get_show_stories", "Get the latest Show HN story IDs from Hacker News.", false),
  storyListAction("get_top_stories", "Get the top story IDs from Hacker News sorted by front page position.", true),
  defineProviderAction(service, {
    name: "get_updates",
    description: "Get recently changed items and user profiles from Hacker News.",
    inputSchema: prettyInput,
    outputSchema: s.object(
      {
        items: s.array(safeInteger),
        profiles: s.array(s.string()),
      },
      {
        required: ["items", "profiles"],
        description: "Recently changed Hacker News items and profiles.",
      },
    ),
  }),
  defineProviderAction(service, {
    name: "get_user",
    description: "Get a Hacker News user's public profile summary by username.",
    inputSchema: usernameInput(),
    outputSchema: s.nullable(
      s.object(
        {
          username: s.string(),
          karma: safeInteger,
          about: s.string(),
        },
        {
          required: ["username", "karma"],
          description: "A Hacker News user profile summary.",
        },
      ),
    ),
  }),
  defineProviderAction(service, {
    name: "get_user_by_username",
    description: "Get a Hacker News user's detailed public profile by username.",
    inputSchema: usernameInput(),
    outputSchema: s.nullable(
      s.object(
        {
          id: s.string(),
          about: s.string(),
          karma: safeInteger,
          created: safeInteger,
          submitted: s.array(safeInteger),
        },
        {
          required: ["id", "karma", "created"],
          description: "A Hacker News user profile from the Firebase API.",
        },
      ),
    ),
  }),
  defineProviderAction(service, {
    name: "search_posts",
    description: "Search Hacker News posts using Algolia full-text search.",
    inputSchema: searchInput(true),
    outputSchema: searchOutput("The search result hits.", { query: s.string() }),
  }),
];

function storyListAction(name: string, description: string, includeCount: boolean): ActionDefinition {
  return defineProviderAction(service, {
    name,
    description,
    inputSchema: prettyInput,
    outputSchema: includeCount ? countedStoryIdsOutput : storyIdsOutput,
  });
}

function searchInput(requireQuery: boolean): JsonSchema {
  const properties: Record<string, JsonSchema> = {
    page: s.integer({
      minimum: 0,
      maximum: Number.MAX_SAFE_INTEGER,
      default: 0,
      description: "The page number to fetch.",
    }),
    size: s.integer({
      minimum: 0,
      maximum: 20,
      default: 5,
      description: "The number of results per page.",
    }),
    tags: s.array(s.string(), { description: "Algolia filter tags." }),
  };
  if (requireQuery) {
    properties.query = s.string({ description: "The search query text." });
  }

  return s.object(properties, {
    required: requireQuery ? ["query", "page", "size"] : ["page", "size"],
    description: "Algolia search input.",
  });
}

function searchOutput(description: string, extra: Record<string, JsonSchema> = {}): JsonSchema {
  return s.object(
    {
      ...searchOutputBase,
      ...extra,
    },
    {
      required: ["hits", "nbHits", "page", "nbPages", "hitsPerPage"],
      description,
    },
  );
}

function usernameInput(): JsonSchema {
  return s.object(
    {
      username: s.string({ description: "The username to look up." }),
      print: s.literal("pretty"),
    },
    {
      required: ["username"],
      description: "Hacker News user lookup input.",
    },
  );
}
