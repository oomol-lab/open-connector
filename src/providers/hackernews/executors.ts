import type { ProviderExecutors } from "../../core/types.ts";

import {
  optionalBoolean,
  optionalInteger,
  positiveInteger,
  requiredString,
} from "../../core/cast.ts";
import { defineProviderExecutors, readProviderJson, setSearchParams } from "../provider-runtime.ts";

const firebaseBaseUrl = "https://hacker-news.firebaseio.com/v0";
const algoliaBaseUrl = "https://hn.algolia.com/api/v1";
const maxTruncatedTextLength = 500;

type FirebaseItemType = "job" | "story" | "comment" | "poll" | "pollopt";

type FirebaseItem = {
  by?: string;
  descendants?: number;
  id: number;
  kids?: number[];
  parent?: number;
  parts?: number[];
  poll?: number;
  score?: number;
  text?: string;
  time?: number;
  title?: string;
  type: FirebaseItemType;
  url?: string;
};

type User = {
  about?: string;
  created: number;
  id: string;
  karma: number;
  submitted?: number[];
};

type TreeItem = {
  author?: string;
  children?: TreeItem[];
  children_shown?: number;
  children_truncated?: boolean;
  created_at?: string;
  created_at_i?: number;
  id: number;
  max_depth_reached?: boolean;
  options?: number[];
  parent_id?: number;
  points?: number;
  story_id?: number;
  text?: string;
  title?: string;
  total_children_count?: number;
  type: FirebaseItemType;
  url?: string;
};

type HackerNewsActionContext = {
  fetcher: typeof fetch;
};

/**
 * Action names implemented by the Hacker News provider.
 */
export type HackernewsActionName =
  | "get_ask_stories"
  | "get_best_stories"
  | "get_item"
  | "get_item_with_id"
  | "get_job_stories"
  | "get_latest_posts"
  | "get_max_item_id"
  | "get_new_stories"
  | "get_show_stories"
  | "get_top_stories"
  | "get_updates"
  | "get_user"
  | "get_user_by_username"
  | "search_posts";

/**
 * Hacker News action handlers backed by public Firebase and Algolia endpoints.
 */
export const hackernewsActionHandlers: Record<
  HackernewsActionName,
  (input: Record<string, unknown>, context: HackerNewsActionContext) => Promise<unknown>
> = {
  get_ask_stories(input, context): Promise<unknown> {
    return getStoryIdList("askstories", input, context.fetcher, false);
  },
  get_best_stories(input, context): Promise<unknown> {
    return getStoryIdList("beststories", input, context.fetcher, true);
  },
  get_item(input, context): Promise<unknown> {
    return getItem(input, context.fetcher);
  },
  get_item_with_id(input, context): Promise<unknown> {
    return getItemWithId(input, context.fetcher);
  },
  get_job_stories(input, context): Promise<unknown> {
    return getStoryIdList("jobstories", input, context.fetcher, false);
  },
  get_latest_posts(input, context): Promise<unknown> {
    return getLatestPosts(input, context.fetcher);
  },
  get_max_item_id(input, context): Promise<unknown> {
    return getMaxItemId(input, context.fetcher);
  },
  get_new_stories(input, context): Promise<unknown> {
    return getStoryIdList("newstories", input, context.fetcher, true);
  },
  get_show_stories(input, context): Promise<unknown> {
    return getStoryIdList("showstories", input, context.fetcher, false);
  },
  get_top_stories(input, context): Promise<unknown> {
    return getStoryIdList("topstories", input, context.fetcher, true);
  },
  get_updates(input, context): Promise<unknown> {
    return getUpdates(input, context.fetcher);
  },
  get_user(input, context): Promise<unknown> {
    return getUser(input, context.fetcher);
  },
  get_user_by_username(input, context): Promise<unknown> {
    return getUserByUsername(input, context.fetcher);
  },
  search_posts(input, context): Promise<unknown> {
    return searchPosts(input, context.fetcher);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<HackerNewsActionContext>({
  service: "hackernews",
  handlers: hackernewsActionHandlers,
  createContext(_context, fetcher): HackerNewsActionContext {
    return { fetcher };
  },
});

async function getStoryIdList(
  feed: "askstories" | "beststories" | "jobstories" | "newstories" | "showstories" | "topstories",
  input: Record<string, unknown>,
  fetcher: typeof fetch,
  includeCount: boolean,
): Promise<unknown> {
  const storyIds = await requestFirebase<number[]>(`${feed}.json`, fetcher, readPrettyQuery(input));
  return includeCount ? { story_ids: storyIds, count: storyIds.length } : { story_ids: storyIds };
}

async function getItem(input: Record<string, unknown>, fetcher: typeof fetch): Promise<unknown> {
  return requestFirebase<FirebaseItem | null>(
    `item/${positiveInteger(input.id, "id")}.json`,
    fetcher,
    readPrettyQuery(input),
  );
}

async function getItemWithId(
  input: Record<string, unknown>,
  fetcher: typeof fetch,
): Promise<unknown> {
  const itemId = positiveInteger(input.item_id, "item_id");
  const rootItem = await fetchFirebaseItem(itemId, fetcher);

  if (!rootItem) {
    return {
      found: false,
      error_message: `item not found: ${itemId}`,
    };
  }

  return {
    found: true,
    item: await buildTreeItem(
      rootItem,
      {
        storyId: await resolveStoryId(rootItem, fetcher),
        maxDepth: optionalInteger(input.max_depth) ?? 2,
        maxChildren: optionalInteger(input.max_children) ?? 10,
        truncateText: optionalBoolean(input.truncate_text) ?? true,
      },
      fetcher,
    ),
  };
}

async function getLatestPosts(
  input: Record<string, unknown>,
  fetcher: typeof fetch,
): Promise<unknown> {
  return requestAlgolia("search_by_date", fetcher, {
    page: String(optionalInteger(input.page) ?? 0),
    tags: readOptionalTags(input.tags),
    hitsPerPage: String(toHitsPerPage(optionalInteger(input.size), 5)),
  });
}

async function getMaxItemId(
  input: Record<string, unknown>,
  fetcher: typeof fetch,
): Promise<unknown> {
  return {
    max_item_id: await requestFirebase<number>("maxitem.json", fetcher, readPrettyQuery(input)),
  };
}

async function getUpdates(input: Record<string, unknown>, fetcher: typeof fetch): Promise<unknown> {
  return requestFirebase<{ items: number[]; profiles: string[] }>(
    "updates.json",
    fetcher,
    readPrettyQuery(input),
  );
}

async function getUser(input: Record<string, unknown>, fetcher: typeof fetch): Promise<unknown> {
  const user = await requestFirebase<User | null>(
    `user/${encodeURIComponent(requiredString(input.username, "username"))}.json`,
    fetcher,
    readPrettyQuery(input),
  );
  if (!user) {
    return null;
  }

  return {
    username: user.id,
    karma: user.karma,
    about: user.about,
  };
}

async function getUserByUsername(
  input: Record<string, unknown>,
  fetcher: typeof fetch,
): Promise<unknown> {
  return requestFirebase<User | null>(
    `user/${encodeURIComponent(requiredString(input.username, "username"))}.json`,
    fetcher,
    readPrettyQuery(input),
  );
}

async function searchPosts(
  input: Record<string, unknown>,
  fetcher: typeof fetch,
): Promise<unknown> {
  return requestAlgolia("search", fetcher, {
    query: requiredString(input.query, "query"),
    page: String(optionalInteger(input.page) ?? 0),
    tags: readOptionalTags(input.tags),
    hitsPerPage: String(toHitsPerPage(optionalInteger(input.size), 5)),
  });
}

async function buildTreeItem(
  item: FirebaseItem,
  options: {
    storyId: number | undefined;
    maxDepth: number;
    maxChildren: number;
    truncateText: boolean;
  },
  fetcher: typeof fetch,
): Promise<TreeItem> {
  const childIds = Array.isArray(item.kids) ? item.kids.filter((id) => Number.isInteger(id)) : [];
  const storyId =
    options.storyId ?? (item.type === "story" || item.type === "poll" ? item.id : undefined);
  const baseItem: TreeItem = {
    id: item.id,
    type: item.type,
    url: item.url,
    text: item.text ? maybeTruncateText(item.text, options.truncateText) : undefined,
    title: item.title,
    author: item.by,
    points: item.score,
    options: item.parts,
    story_id: storyId,
    parent_id: item.parent,
    created_at:
      typeof item.time === "number" ? new Date(item.time * 1000).toISOString() : undefined,
    created_at_i: item.time,
  };

  if (childIds.length === 0) {
    return baseItem;
  }
  if (options.maxDepth <= 0) {
    return {
      ...baseItem,
      children: [],
      children_shown: 0,
      max_depth_reached: true,
      children_truncated: false,
      total_children_count: childIds.length,
    };
  }

  const limitedChildIds = childIds.slice(0, options.maxChildren);
  const childItems = (
    await Promise.all(
      limitedChildIds.map(async (childId) => {
        const child = await fetchFirebaseItem(childId, fetcher);
        return child
          ? buildTreeItem(
              child,
              {
                storyId,
                maxDepth: options.maxDepth - 1,
                maxChildren: options.maxChildren,
                truncateText: options.truncateText,
              },
              fetcher,
            )
          : null;
      }),
    )
  ).filter((child): child is TreeItem => child != null);

  return {
    ...baseItem,
    children: childItems,
    children_shown: childItems.length,
    max_depth_reached: false,
    children_truncated: childIds.length > limitedChildIds.length,
    total_children_count: childIds.length,
  };
}

async function resolveStoryId(
  item: FirebaseItem,
  fetcher: typeof fetch,
): Promise<number | undefined> {
  if (item.type === "story" || item.type === "poll") {
    return item.id;
  }
  if (item.type !== "comment" || typeof item.parent !== "number") {
    return undefined;
  }

  let currentParentId = item.parent;
  for (let depth = 0; depth < 32; depth += 1) {
    const parent = await fetchFirebaseItem(currentParentId, fetcher);
    if (!parent) return undefined;
    if (parent.type === "story" || parent.type === "poll") return parent.id;
    if (parent.type !== "comment" || typeof parent.parent !== "number") return undefined;
    currentParentId = parent.parent;
  }

  return undefined;
}

async function fetchFirebaseItem(id: number, fetcher: typeof fetch): Promise<FirebaseItem | null> {
  return requestFirebase<FirebaseItem | null>(`item/${id}.json`, fetcher);
}

async function requestFirebase<T>(
  path: string,
  fetcher: typeof fetch,
  query?: Record<string, string | undefined>,
): Promise<T> {
  const url = new URL(`${firebaseBaseUrl}/${path}`);
  setSearchParams(url, query ?? {});
  return readProviderJson<T>(await fetcher(url), "hackernews firebase");
}

async function requestAlgolia(
  path: string,
  fetcher: typeof fetch,
  query: Record<string, string | undefined>,
): Promise<unknown> {
  const url = new URL(`${algoliaBaseUrl}/${path}`);
  setSearchParams(url, query);
  return readProviderJson<unknown>(await fetcher(url), "hackernews algolia");
}

function readPrettyQuery(input: Record<string, unknown>): Record<string, string> | undefined {
  return input.print === "pretty" ? { print: "pretty" } : undefined;
}

function readOptionalTags(value: unknown): string | undefined {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  const tags = value.filter((tag): tag is string => typeof tag === "string" && tag.length > 0);
  return tags.length > 0 ? tags.join(",") : undefined;
}

function toHitsPerPage(value: number | undefined, fallback: number): number {
  if (value == null) return fallback;
  if (value <= 0) return 20;
  return value;
}

function maybeTruncateText(value: string, truncate: boolean): string {
  if (!truncate || value.length <= maxTruncatedTextLength) {
    return value;
  }

  return value.slice(0, maxTruncatedTextLength);
}
