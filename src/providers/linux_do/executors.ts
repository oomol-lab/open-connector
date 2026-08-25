import type { ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { optionalInteger, optionalString, requiredString } from "../../core/cast.ts";
import { defineProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";
import { parseBadgeFeed, parsePostFeed, parseTopicFeed } from "./rss.ts";

const service = "linux_do";
const linuxDoForumBaseUrl = "https://linux.do";

interface LinuxDoActionContext {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type LinuxDoActionHandler = (input: Record<string, unknown>, context: LinuxDoActionContext) => Promise<unknown>;

export const linuxDoActionHandlers: ProviderActionHandlers<"linux_do", LinuxDoActionHandler> = {
  list_latest_topics(input, context) {
    return topicFeed("/latest.rss", {}, input, context);
  },
  list_top_topics(input, context) {
    return topicFeed("/top.rss", { period: optionalString(input.period) }, input, context);
  },
  list_hot_topics(input, context) {
    return topicFeed("/hot.rss", {}, input, context);
  },
  list_category_topics(input, context) {
    const slug = requiredString(input.slug, "slug", invalidInputError);
    const id = requiredNumber(input.id, "id");
    return topicFeed(`/c/${segment(slug)}/${id}.rss`, {}, input, context);
  },
  list_tag_topics(input, context) {
    const tag = requiredString(input.tag, "tag", invalidInputError);
    return topicFeed(`/tag/${segment(tag)}.rss`, {}, input, context);
  },
  list_user_topics(input, context) {
    const username = requiredString(input.username, "username", invalidInputError);
    return topicFeed(`/u/${segment(username)}/activity/topics.rss`, {}, input, context);
  },
  list_category_tag_topics(input, context) {
    const categorySlug = requiredString(input.categorySlug, "categorySlug", invalidInputError);
    const categoryId = requiredNumber(input.categoryId, "categoryId");
    const tag = requiredString(input.tag, "tag", invalidInputError);
    return topicFeed(`/tags/c/${segment(categorySlug)}/${categoryId}/${segment(tag)}.rss`, {}, input, context);
  },
  list_latest_posts(input, context) {
    return postFeed("/posts.rss", input, context);
  },
  list_topic_posts(input, context) {
    const topicId = requiredNumber(input.topicId, "topicId");
    const slug = optionalString(input.slug) ?? "topic";
    return postFeed(`/t/${segment(slug)}/${topicId}.rss`, input, context);
  },
  list_user_posts(input, context) {
    const username = requiredString(input.username, "username", invalidInputError);
    return postFeed(`/u/${segment(username)}/activity.rss`, input, context);
  },
  list_group_posts(input, context) {
    const name = requiredString(input.name, "name", invalidInputError);
    return postFeed(`/g/${segment(name)}/posts.rss`, input, context);
  },
  list_group_mentions(input, context) {
    const name = requiredString(input.name, "name", invalidInputError);
    return postFeed(`/g/${segment(name)}/mentions.rss`, input, context);
  },
  list_badge_grants(input, context) {
    const id = requiredNumber(input.id, "id");
    return badgeFeed(`/badges/${id}.rss`, input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<LinuxDoActionContext>({
  service,
  handlers: linuxDoActionHandlers,
  createContext(context: ExecutionContext, fetcher: typeof fetch): LinuxDoActionContext {
    return {
      fetcher,
      signal: context.signal,
    };
  },
  fallbackMessage: "linux_do request failed",
});

async function topicFeed(
  path: string,
  query: Record<string, string | undefined>,
  input: Record<string, unknown>,
  context: LinuxDoActionContext,
): Promise<unknown> {
  const xml = await requestLinuxDoRss(path, query, context);
  return await parseFeedSafely(xml, (text) => parseTopicFeed(text, optionalLimit(input)));
}

async function postFeed(path: string, input: Record<string, unknown>, context: LinuxDoActionContext): Promise<unknown> {
  const xml = await requestLinuxDoRss(path, {}, context);
  return await parseFeedSafely(xml, (text) => parsePostFeed(text, optionalLimit(input)));
}

async function badgeFeed(
  path: string,
  input: Record<string, unknown>,
  context: LinuxDoActionContext,
): Promise<unknown> {
  const xml = await requestLinuxDoRss(path, {}, context);
  return await parseFeedSafely(xml, (text) => parseBadgeFeed(text, optionalLimit(input)));
}

async function requestLinuxDoRss(
  path: string,
  query: Record<string, string | undefined>,
  context: LinuxDoActionContext,
): Promise<string> {
  const url = new URL(path, linuxDoForumBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  let response: Response;
  let body: string;
  try {
    response = await context.fetcher(url, {
      headers: {
        accept: "application/rss+xml, application/xml;q=0.9",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    body = await response.text();
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `linux_do RSS request failed: ${error.message}` : "linux_do RSS request failed",
    );
  }

  if (isCloudflareChallenge(response, body)) {
    throw challengeError(response, body);
  }
  if (!response.ok) {
    throw httpError(response, body);
  }
  if (!looksLikeRss(body, response)) {
    throw notRssError(response, body);
  }
  return body;
}

async function parseFeedSafely<T>(xml: string, parse: (xml: string) => Promise<T>): Promise<T> {
  try {
    return await parse(xml);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(502, `linux_do RSS parse failed (body=${snippet(xml)})`);
  }
}

function httpError(response: Response, body: string): ProviderRequestError {
  const contentType = response.headers.get("content-type") ?? "unknown";
  if (response.status === 404) {
    return new ProviderRequestError(
      404,
      "linux_do RSS endpoint returned 404 - the category, tag, topic, user, or group may be " +
        "private or not accessible anonymously, which does not necessarily mean it does not " +
        `exist (content-type=${contentType})`,
    );
  }
  return new ProviderRequestError(
    response.status,
    `linux_do RSS request failed with ${response.status} (content-type=${contentType}; body=${snippet(body)})`,
  );
}

function isCloudflareChallenge(response: Response, body: string): boolean {
  return response.headers.get("cf-mitigated") !== null || /just a moment/i.test(body);
}

function challengeError(response: Response, body: string): ProviderRequestError {
  const contentType = response.headers.get("content-type") ?? "unknown";
  return new ProviderRequestError(
    response.status >= 400 ? response.status : 502,
    "linux_do RSS request was blocked by a Cloudflare anti-bot challenge " +
      `(status=${response.status}; content-type=${contentType}; body=${snippet(body)})`,
  );
}

function notRssError(response: Response, body: string): ProviderRequestError {
  const contentType = response.headers.get("content-type") ?? "unknown";
  return new ProviderRequestError(
    502,
    `linux_do RSS endpoint returned a non-RSS response (status=${response.status}; content-type=${contentType}; body=${snippet(body)})`,
  );
}

function looksLikeRss(body: string, response: Response): boolean {
  const contentType = response.headers.get("content-type") ?? "";
  if (/xml|rss/i.test(contentType)) {
    return true;
  }
  const head = body.trimStart().slice(0, 200).toLowerCase();
  return head.startsWith("<?xml") || head.includes("<rss");
}

function snippet(body: string): string {
  return body.replaceAll(/\s+/g, " ").trim().slice(0, 200);
}

function optionalLimit(input: Record<string, unknown>): number | undefined {
  return optionalInteger(input.limit);
}

function segment(value: string): string {
  return encodeURIComponent(value);
}

function requiredNumber(value: unknown, field: string): number {
  const number = optionalInteger(value);
  if (number !== undefined) {
    return number;
  }
  throw new ProviderRequestError(400, `linux_do ${field} is required`);
}

function invalidInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, `linux_do ${message}`);
}
