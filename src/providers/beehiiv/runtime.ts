import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BeehiivActionName } from "./actions.ts";

import { compactObject, optionalRecord, optionalString } from "../../core/cast.ts";
import { encodePathSegment } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const beehiivApiOrigin = "https://api.beehiiv.com";
const beehiivApiBaseUrl = `${beehiivApiOrigin}/v2`;

type BeehiivPhase = "validate" | "execute";
type BeehiivContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type BeehiivActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const beehiivActionHandlers: Record<BeehiivActionName, BeehiivActionHandler> = {
  list_publications(input, context) {
    return requestBeehiiv(buildListPublicationsUrl(input), context, "execute");
  },
  get_publication(input, context) {
    return requestBeehiiv(buildGetPublicationUrl(input), context, "execute");
  },
  list_posts(input, context) {
    return requestBeehiiv(buildListPostsUrl(input), context, "execute");
  },
  get_post(input, context) {
    return requestBeehiiv(buildGetPostUrl(input), context, "execute");
  },
  list_subscriptions(input, context) {
    return requestBeehiiv(buildListSubscriptionsUrl(input), context, "execute");
  },
  get_subscription(input, context) {
    return requestBeehiiv(buildGetSubscriptionUrl(input), context, "execute");
  },
};

export async function validateBeehiivCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await requestBeehiiv("/publications?limit=1", { apiKey, fetcher, signal }, "validate");
  const firstPublication = Array.isArray(payload.data) ? optionalRecord(payload.data[0]) : undefined;
  const publicationName = optionalString(firstPublication?.name);
  const publicationId = optionalString(firstPublication?.id);

  return {
    profile: {
      accountId: publicationId ?? "beehiiv-api-key",
      displayName: publicationName ?? publicationId ?? "Beehiiv API Key",
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: beehiivApiBaseUrl,
      validationEndpoint: "/publications",
      firstPublicationId: publicationId,
      firstPublicationName: publicationName,
    }),
  };
}

function buildListPublicationsUrl(input: Record<string, unknown>): URL {
  const url = beehiivUrl("/publications");
  appendCommonQuery(url, input);
  appendArrayQuery(url, "expand", input.expand);
  appendMappedStringQuery(url, input, {
    orderBy: "order_by",
  });
  return url;
}

function buildGetPublicationUrl(input: Record<string, unknown>): URL {
  const url = beehiivUrl(`/publications/${encodePathSegment(input.publicationId)}`);
  appendArrayQuery(url, "expand", input.expand);
  return url;
}

function buildListPostsUrl(input: Record<string, unknown>): URL {
  const url = beehiivUrl(`/publications/${encodePathSegment(input.publicationId)}/posts`);
  appendCommonQuery(url, input);
  appendArrayQuery(url, "expand", input.expand);
  appendArrayQuery(url, "content_tags[]", input.contentTags);
  appendArrayQuery(url, "slugs[]", input.slugs);
  appendArrayQuery(url, "authors[]", input.authors);
  appendArrayQuery(url, "premium_tiers", input.premiumTiers);
  appendMappedStringQuery(url, input, {
    audience: "audience",
    platform: "platform",
    status: "status",
    orderBy: "order_by",
    hiddenFromFeed: "hidden_from_feed",
  });
  return url;
}

function buildGetPostUrl(input: Record<string, unknown>): URL {
  const url = beehiivUrl(
    `/publications/${encodePathSegment(input.publicationId)}/posts/${encodePathSegment(input.postId)}`,
  );
  appendArrayQuery(url, "expand", input.expand);
  appendArrayQuery(url, "premium_tiers", input.premiumTiers);
  return url;
}

function buildListSubscriptionsUrl(input: Record<string, unknown>): URL {
  const url = beehiivUrl(`/publications/${encodePathSegment(input.publicationId)}/subscriptions`);
  appendCommonQuery(url, input);
  appendArrayQuery(url, "expand[]", input.expand);
  appendArrayQuery(url, "premium_tiers[]", input.premiumTiers);
  appendArrayQuery(url, "premium_tier_ids[]", input.premiumTierIds);
  appendMappedStringQuery(url, input, {
    status: "status",
    tier: "tier",
    cursor: "cursor",
    email: "email",
    orderBy: "order_by",
    creationDate: "creation_date",
  });
  return url;
}

function buildGetSubscriptionUrl(input: Record<string, unknown>): URL {
  const url = beehiivUrl(
    `/publications/${encodePathSegment(input.publicationId)}/subscriptions/${encodePathSegment(input.subscriptionId)}`,
  );
  appendArrayQuery(url, "expand[]", input.expand);
  return url;
}

function beehiivUrl(path: string): URL {
  return new URL(`/v2${path}`, beehiivApiOrigin);
}

function appendCommonQuery(url: URL, input: Record<string, unknown>): void {
  for (const key of ["limit", "page"]) {
    const value = input[key];
    if (typeof value === "number") {
      url.searchParams.set(key, String(value));
    }
  }
  if (typeof input.direction === "string") {
    url.searchParams.set("direction", input.direction);
  }
}

function appendMappedStringQuery(url: URL, input: Record<string, unknown>, mapping: Record<string, string>): void {
  for (const [inputKey, queryKey] of Object.entries(mapping)) {
    const value = optionalString(input[inputKey]);
    if (value) {
      url.searchParams.set(queryKey, value);
    }
  }
}

function appendArrayQuery(url: URL, queryKey: string, value: unknown): void {
  if (!Array.isArray(value)) {
    return;
  }

  for (const item of value) {
    url.searchParams.append(queryKey, String(item));
  }
}

async function requestBeehiiv(
  pathOrUrl: string | URL,
  context: BeehiivContext,
  phase: BeehiivPhase,
): Promise<Record<string, unknown>> {
  const url =
    pathOrUrl instanceof URL ? pathOrUrl : beehiivUrl(pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`);
  const response = await context.fetcher(url.toString(), {
    method: "GET",
    headers: beehiivHeaders(context.apiKey),
    signal: context.signal,
  });
  const payload = await readBeehiivJson(response);

  if (!response.ok) {
    throw createBeehiivError(response, payload, phase);
  }

  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "invalid Beehiiv response");
  }

  return record;
}

function beehiivHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    authorization: `Bearer ${apiKey}`,
    "user-agent": providerUserAgent,
  };
}

async function readBeehiivJson(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createBeehiivError(response: Response, payload: unknown, phase: BeehiivPhase): ProviderRequestError {
  const message = extractBeehiivErrorMessage(payload) ?? `Beehiiv request failed with status ${response.status}`;

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 400 || response.status === 404 || response.status === 422) {
    return new ProviderRequestError(response.status, message, payload);
  }

  return new ProviderRequestError(response.status, message, payload);
}

function extractBeehiivErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  const direct = optionalString(record.message) ?? optionalString(record.error);
  if (direct) {
    return direct;
  }

  const errors = record.errors ?? record.detail;
  if (!Array.isArray(errors)) {
    return undefined;
  }

  const messages = errors
    .map((item) => (typeof item === "string" ? item : optionalString(optionalRecord(item)?.message)))
    .filter((item): item is string => Boolean(item));
  return messages.length > 0 ? messages.join("; ") : undefined;
}
