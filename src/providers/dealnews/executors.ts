import type { ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { XMLParser } from "fast-xml-parser";
import { positiveInteger } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineProviderExecutors,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "dealnews";
const dealNewsBaseUrl = "https://www.dealnews.com";
const dealNewsRequestTimeoutMs = 30_000;
const rssParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "value",
  parseTagValue: false,
});

interface DealNewsContext {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type DealNewsActionHandler = (input: Record<string, unknown>, context: DealNewsContext) => Promise<unknown>;

export const dealNewsActionHandlers: ProviderActionHandlers<"dealnews", DealNewsActionHandler> = {
  list_latest_deals(_input, context) {
    return requestFeed(new URL("/?rss=1&sort=time", dealNewsBaseUrl), context);
  },
  list_popular_deals(_input, context) {
    return requestFeed(new URL("/?rss=1&sort=hotness", dealNewsBaseUrl), context);
  },
  list_editors_choice_deals(_input, context) {
    return requestFeed(new URL("/f1682/Staff-Pick/?rss=1", dealNewsBaseUrl), context);
  },
  list_blog_posts(_input, context) {
    return requestFeed(new URL("/rss/features/", dealNewsBaseUrl), context);
  },
  list_category_deals(input, context) {
    const categoryId = positiveInteger(input.categoryId, "categoryId", providerInputError);
    return requestFeed(new URL(`/rss/c${categoryId}/`, dealNewsBaseUrl), context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<DealNewsContext>({
  service,
  handlers: dealNewsActionHandlers,
  createContext(context: ExecutionContext, fetcher: typeof fetch): DealNewsContext {
    return { fetcher, signal: context.signal };
  },
});

async function requestFeed(url: URL, context: DealNewsContext): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, dealNewsRequestTimeoutMs);
  try {
    const response = await context.fetcher(url, {
      headers: {
        accept: "application/rss+xml, application/xml;q=0.9, text/xml;q=0.8",
        "user-agent": providerUserAgent,
      },
      signal: timeout.signal,
    });
    if (response.status === 429) {
      throw new ProviderRequestError(429, "DealNews RSS rate limit exceeded");
    }
    if (!response.ok) {
      throw new ProviderRequestError(
        response.status >= 500 ? response.status : 502,
        `DealNews RSS request failed with status ${response.status}`,
      );
    }
    return parseFeed(await response.text(), url.toString());
  } catch (error) {
    if (error instanceof ProviderRequestError) throw error;
    if (timeout.didTimeout()) throw new ProviderRequestError(504, "DealNews RSS request timed out");
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `DealNews RSS request failed: ${error.message}` : "DealNews RSS request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function parseFeed(xml: string, feedUrl: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = rssParser.parse(xml) as unknown;
  } catch {
    throw malformedFeedError();
  }
  const root = asRecord(parsed);
  const rss = asRecord(root?.rss);
  const channel = asRecord(rss?.channel);
  if (!channel) throw malformedFeedError();

  const { item, ...feed } = channel;
  const items = item === undefined ? [] : Array.isArray(item) ? item : [item];
  if (items.some((entry) => !asRecord(entry))) throw malformedFeedError();
  return {
    attribution: "DealNews",
    feedUrl,
    feed,
    items,
    count: items.length,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function malformedFeedError(): ProviderRequestError {
  return new ProviderRequestError(502, "DealNews returned malformed RSS");
}
