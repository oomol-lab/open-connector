import type { CredentialValidationResult, CredentialValidators, ProviderExecutors } from "../../core/types.ts";
import type { OAuthProviderContext, ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  defineOAuthProviderExecutors,
  ProviderRequestError,
  providerUserAgent,
  readProviderJsonBody,
} from "../provider-runtime.ts";

const service = "reddit";
const redditApiBaseUrl = "https://oauth.reddit.com";

type RedditActionHandler = (input: Record<string, unknown>, context: OAuthProviderContext) => Promise<unknown>;

interface RedditRequestOptions {
  path: string;
  method?: "GET" | "POST";
  query?: Record<string, string | number | undefined>;
  form?: Record<string, string | number | boolean | undefined>;
}

export const redditActionHandlers: ProviderActionHandlers<"reddit", RedditActionHandler> = {
  async get_me(_input, context) {
    return { account: requireRedditObject(await redditRequest(context, { path: "/api/v1/me" }), "account") };
  },
  async list_posts(input, context) {
    const subreddit = encodeURIComponent(requireInputString(input.subreddit, "subreddit"));
    const sort = optionalString(input.sort) ?? "hot";
    return normalizeListing(
      await redditRequest(context, {
        path: `/r/${subreddit}/${sort}`,
        query: buildListingQuery(input),
      }),
    );
  },
  async search_posts(input, context) {
    const subreddit = optionalString(input.subreddit);
    return normalizeListing(
      await redditRequest(context, {
        path: subreddit ? `/r/${encodeURIComponent(subreddit)}/search` : "/search",
        query: {
          ...buildListingQuery(input),
          q: requireInputString(input.query, "query"),
          restrict_sr: subreddit ? "true" : undefined,
          sort: optionalString(input.sort) ?? "relevance",
          t: optionalString(input.time) ?? "all",
        },
      }),
    );
  },
  async get_post_comments(input, context) {
    const postId = encodeURIComponent(requireInputString(input.postId, "postId"));
    const subreddit = optionalString(input.subreddit);
    const payload = await redditRequest(context, {
      path: subreddit ? `/r/${encodeURIComponent(subreddit)}/comments/${postId}` : `/comments/${postId}`,
      query: {
        raw_json: 1,
        sort: optionalString(input.sort),
        limit: optionalInteger(input.limit),
        depth: optionalInteger(input.depth),
      },
    });
    if (!Array.isArray(payload) || payload.length < 2) {
      throw new ProviderRequestError(502, "Reddit returned an invalid comment tree");
    }
    return {
      post: listingChildren(payload[0])[0] ?? {},
      comments: listingChildren(payload[1]),
    };
  },
  async create_post(input, context) {
    const kind = requireInputString(input.kind, "kind");
    if (kind == "self" && input.url != null) {
      throw new ProviderRequestError(400, "url is only valid for a link post");
    }
    if (kind == "link" && !optionalString(input.url)) {
      throw new ProviderRequestError(400, "url is required for a link post");
    }
    const data = requireRedditApiData(
      await redditRequest(context, {
        path: "/api/submit",
        method: "POST",
        form: {
          api_type: "json",
          sr: requireInputString(input.subreddit, "subreddit"),
          title: requireInputString(input.title, "title"),
          kind,
          text: optionalString(input.text),
          url: optionalString(input.url),
          flair_id: optionalString(input.flairId),
          flair_text: optionalString(input.flairText),
          sendreplies: optionalBoolean(input.sendReplies),
          nsfw: optionalBoolean(input.nsfw),
          spoiler: optionalBoolean(input.spoiler),
          resubmit: true,
        },
      }),
      "create post",
    );
    return {
      post: firstRedditThing(data) ?? data,
      url: optionalString(data.url) ?? null,
    };
  },
  async create_comment(input, context) {
    const data = requireRedditApiData(
      await redditRequest(context, {
        path: "/api/comment",
        method: "POST",
        form: {
          api_type: "json",
          thing_id: requireContentFullname(input.parentFullname, "parentFullname"),
          text: requireInputString(input.text, "text"),
        },
      }),
      "create comment",
    );
    return { comment: firstRedditThing(data) ?? data };
  },
  async edit_content(input, context) {
    const data = requireRedditApiData(
      await redditRequest(context, {
        path: "/api/editusertext",
        method: "POST",
        form: {
          api_type: "json",
          thing_id: requireContentFullname(input.fullname, "fullname"),
          text: requireInputString(input.text, "text"),
        },
      }),
      "edit content",
    );
    return { content: firstRedditThing(data) ?? data };
  },
  async delete_content(input, context) {
    const fullname = requireContentFullname(input.fullname, "fullname");
    await redditRequest(context, {
      path: "/api/del",
      method: "POST",
      form: { id: fullname },
    });
    return { accepted: true, fullname };
  },
};

export const executors: ProviderExecutors = defineOAuthProviderExecutors(service, redditActionHandlers, {
  skipDnsValidation: true,
});

export const credentialValidators: CredentialValidators = {
  async oauth2(input, { fetcher, signal }): Promise<CredentialValidationResult> {
    const account = requireRedditObject(
      await redditRequest({ accessToken: input.accessToken, fetcher, signal }, { path: "/api/v1/me" }),
      "account",
    );
    const id = optionalString(account.id);
    const name = optionalString(account.name);
    if (!id || !name) {
      throw new ProviderRequestError(502, "Reddit account response is missing an id or name");
    }
    return {
      profile: {
        accountId: id,
        displayName: `u/${name}`,
      },
      metadata: {
        isModerator: optionalBoolean(account.is_mod) ?? false,
      },
    };
  },
};

async function redditRequest(context: OAuthProviderContext, options: RedditRequestOptions): Promise<unknown> {
  const url = new URL(options.path, redditApiBaseUrl);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value != null) url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = {
    accept: "application/json",
    authorization: `Bearer ${context.accessToken}`,
    "user-agent": providerUserAgent,
  };
  let body: URLSearchParams | undefined;
  if (options.form) {
    body = new URLSearchParams();
    for (const [key, value] of Object.entries(options.form)) {
      if (value != null) body.set(key, String(value));
    }
    headers["content-type"] = "application/x-www-form-urlencoded";
  }

  const response = await context.fetcher(url, {
    method: options.method ?? "GET",
    headers,
    body,
    signal: context.signal,
  });
  const payload = await readProviderJsonBody(response, {
    emptyBody: {},
    invalidJsonMessage: "Reddit returned invalid JSON",
  });
  if (!response.ok) {
    const object = optionalRecord(payload);
    const message = optionalString(object?.message) ?? optionalString(object?.error) ?? "Reddit request failed";
    throw new ProviderRequestError(response.status, message, payload);
  }
  return payload;
}

function normalizeListing(payload: unknown): Record<string, unknown> {
  const listing = requireRedditObject(payload, "listing");
  const data = requireRedditObject(listing.data, "listing data");
  return {
    posts: listingChildren(listing),
    after: optionalString(data.after) ?? null,
    before: optionalString(data.before) ?? null,
  };
}

function listingChildren(payload: unknown): Record<string, unknown>[] {
  const listing = optionalRecord(payload);
  const data = optionalRecord(listing?.data);
  if (!Array.isArray(data?.children)) return [];
  return data.children.flatMap((child) => {
    const object = optionalRecord(child);
    const childData = optionalRecord(object?.data);
    return childData ? [childData] : [];
  });
}

function buildListingQuery(input: Record<string, unknown>): Record<string, string | number | undefined> {
  return {
    raw_json: 1,
    limit: optionalInteger(input.limit) ?? 25,
    after: optionalString(input.after),
    before: optionalString(input.before),
    t: optionalString(input.time),
  };
}

function requireRedditApiData(payload: unknown, operation: string): Record<string, unknown> {
  const root = requireRedditObject(payload, `${operation} response`);
  const json = requireRedditObject(root.json, `${operation} JSON response`);
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    const first = json.errors[0];
    const message = Array.isArray(first) ? first.map(String).join(": ") : String(first);
    const code = Array.isArray(first) ? optionalString(first[0]) : undefined;
    throw new ProviderRequestError(code == "RATELIMIT" ? 429 : 400, `Reddit ${operation} failed: ${message}`);
  }
  return requireRedditObject(json.data, `${operation} response data`);
}

function firstRedditThing(data: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!Array.isArray(data.things)) return undefined;
  const first = optionalRecord(data.things[0]);
  return optionalRecord(first?.data) ?? first;
}

function requireRedditObject(value: unknown, label: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) throw new ProviderRequestError(502, `Reddit ${label} is missing`);
  return object;
}

function requireInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requireContentFullname(value: unknown, fieldName: string): string {
  const fullname = requireInputString(value, fieldName);
  if (!fullname.startsWith("t1_") && !fullname.startsWith("t3_")) {
    throw new ProviderRequestError(400, `${fieldName} must be a Reddit post or comment fullname`);
  }
  return fullname;
}
