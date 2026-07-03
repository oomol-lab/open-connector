import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";
import type { BeamerActionName } from "./actions.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const beamerApiBaseUrl = "https://api.getbeamer.com/v0";
const beamerTimeoutMs = 30_000;

type BeamerPhase = "validate" | "execute";
type BeamerActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;
type BeamerContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

export const beamerActionHandlers: Record<BeamerActionName, BeamerActionHandler> = {
  async get_feed_url(input, context) {
    const payload = await beamerGetJson(
      "/url",
      buildBeamerQuery({
        language: readOptionalLanguageCode(input.language),
        filterByUrl: readOptionalBoolean(input.filterByUrl),
        filter: optionalString(input.filter),
      }),
      context,
      "execute",
    );

    return {
      feedUrl: readRequiredStringFromPayload(payload, "url", "feed URL"),
    };
  },

  async count_unread_posts(input, context) {
    const filterByUserId = readOptionalBoolean(input.filterByUserId);
    const userId = optionalString(input.userId);
    if (filterByUserId && !userId) {
      throw new ProviderRequestError(400, "userId is required when filterByUserId is true");
    }

    const payload = await beamerGetJson(
      "/unread/count",
      buildBeamerQuery({
        filterByUserId,
        userId,
      }),
      context,
      "execute",
    );

    return {
      count: readRequiredIntegerFromPayload(payload, "count"),
    };
  },

  async list_posts(input, context) {
    const filterByUserId = readOptionalBoolean(input.filterByUserId);
    const userId = optionalString(input.userId);
    if (filterByUserId && !userId) {
      throw new ProviderRequestError(400, "userId is required when filterByUserId is true");
    }

    const payload = await beamerGetJson(
      "/posts",
      buildBeamerQuery({
        filter: optionalString(input.filter),
        forceFilter: optionalString(input.forceFilter),
        filterUrl: optionalString(input.filterUrl),
        dateFrom: optionalString(input.dateFrom),
        dateTo: optionalString(input.dateTo),
        language: readOptionalLanguageCode(input.language),
        category: optionalString(input.category),
        published: readOptionalBoolean(input.published),
        archived: readOptionalBoolean(input.archived),
        expired: readOptionalBoolean(input.expired),
        filterByUserId,
        userFirstName: optionalString(input.userFirstName),
        userLastName: optionalString(input.userLastName),
        userEmail: optionalString(input.userEmail),
        userId,
        traceableLinks: readOptionalBoolean(input.traceableLinks),
        ignoreRequestDetails: readOptionalBoolean(input.ignoreRequestDetails),
        saveViews: readOptionalBoolean(input.saveViews),
        maxResults: readOptionalPositiveInteger(input.maxResults, "maxResults"),
        page: readOptionalPositiveInteger(input.page, "page"),
        ignoreFilters: readOptionalBoolean(input.ignoreFilters),
      }),
      context,
      "execute",
    );

    if (!Array.isArray(payload)) {
      throw new ProviderRequestError(502, "Beamer returned an invalid posts payload");
    }

    return {
      posts: payload.map((item) => normalizePost(item)),
    };
  },

  async create_post(input, context) {
    const payload = await beamerPostJson(
      "/posts",
      compactObject({
        title: readRequiredStringArray(input.title, "title"),
        content: readRequiredStringArray(input.content, "content"),
        category: optionalString(input.category),
        publish: readOptionalBoolean(input.publish),
        archive: readOptionalBoolean(input.archive),
        pinned: readOptionalBoolean(input.pinned),
        showInWidget: readOptionalBoolean(input.showInWidget),
        showInStandalone: readOptionalBoolean(input.showInStandalone),
        boostedAnnouncement: optionalString(input.boostedAnnouncement),
        linkUrl: readOptionalStringArray(input.linkUrl),
        linkText: readOptionalStringArray(input.linkText),
        linksInNewWindow: readOptionalBoolean(input.linksInNewWindow),
        date: optionalString(input.date),
        dueDate: optionalString(input.dueDate),
        language: readOptionalLanguageArray(input.language),
        filter: optionalString(input.filter),
        filterUserId: optionalString(input.filterUserId),
        filterUrl: optionalString(input.filterUrl),
        enableFeedback: readOptionalBoolean(input.enableFeedback),
        enableReactions: readOptionalBoolean(input.enableReactions),
        enableSocialShare: readOptionalBoolean(input.enableSocialShare),
        autoOpen: readOptionalBoolean(input.autoOpen),
        sendPushNotification: readOptionalBoolean(input.sendPushNotification),
        userEmail: optionalString(input.userEmail),
        fixedBoostedAnnouncement: readOptionalBoolean(input.fixedBoostedAnnouncement),
      }),
      context,
      "execute",
    );

    return {
      post: normalizePost(payload),
    };
  },
};

export async function validateBeamerCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const payload = await beamerPostJson("/ping", {}, { apiKey, fetcher, signal }, "validate");
  const productName =
    readOptionalStringFromPayload(payload, "name") ??
    readOptionalStringFromPayload(payload, "product") ??
    "Beamer API Key";

  return {
    profile: {
      displayName: productName,
    },
    grantedScopes: [],
    metadata: compactObject({
      apiBaseUrl: beamerApiBaseUrl,
      validationEndpoint: "/ping",
      productName,
    }),
  };
}

async function beamerGetJson(
  path: string,
  query: URLSearchParams,
  context: BeamerContext,
  phase: BeamerPhase,
): Promise<unknown> {
  const url = beamerUrl(path);
  query.forEach((value, key) => {
    url.searchParams.set(key, value);
  });

  return requestBeamerJson(
    url,
    {
      method: "GET",
      headers: beamerHeaders(context.apiKey),
    },
    context,
    phase,
  );
}

async function beamerPostJson(
  path: string,
  body: Record<string, unknown>,
  context: BeamerContext,
  phase: BeamerPhase,
): Promise<unknown> {
  return requestBeamerJson(
    beamerUrl(path),
    {
      method: "POST",
      headers: {
        ...beamerHeaders(context.apiKey),
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    },
    context,
    phase,
  );
}

async function requestBeamerJson(
  url: URL,
  init: RequestInit,
  context: BeamerContext,
  phase: BeamerPhase,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, beamerTimeoutMs);

  try {
    const response = await context.fetcher(url, {
      ...init,
      signal: timeout.signal,
    });
    const payload = await readBeamerPayload(response);

    if (!response.ok) {
      throw createBeamerError(response.status, payload, phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Beamer request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Beamer request failed: ${error.message}` : "Beamer request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

function beamerUrl(path: string): URL {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  return new URL(normalizedPath, `${beamerApiBaseUrl}/`);
}

function beamerHeaders(apiKey: string): Record<string, string> {
  return {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "Beamer-Api-Key": apiKey,
  };
}

async function readBeamerPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createBeamerError(status: number, payload: unknown, phase: BeamerPhase): ProviderRequestError {
  const message = extractBeamerMessage(payload) ?? `Beamer request failed with status ${status}`;

  if (status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (phase === "execute" && status >= 400 && status < 500) {
    return new ProviderRequestError(status, message, payload);
  }

  return new ProviderRequestError(status || 500, message, payload);
}

function extractBeamerMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return optionalString(payload);
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.errorMessage);
}

function buildBeamerQuery(values: Record<string, string | boolean | number | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined) {
      params.set(key, String(value));
    }
  }
  return params;
}

function normalizePost(value: unknown): Record<string, unknown> {
  const record = requireRecord(value, "post");
  return compactObject({
    id: readOptionalStringLike(record.id),
    date: readOptionalStringLike(record.date),
    dueDate: readOptionalStringLike(record.dueDate),
    published: readOptionalBooleanLike(record.published),
    pinned: readOptionalBooleanLike(record.pinned),
    showInWidget: readOptionalBooleanLike(record.showInWidget),
    showInStandalone: readOptionalBooleanLike(record.showInStandalone),
    category: readOptionalStringLike(record.category),
    boostedAnnouncement: readOptionalStringLike(record.boostedAnnouncement),
    translations: readTranslationArray(record.translations),
    filter: readOptionalStringLike(record.filter),
    filterUrl: readOptionalStringLike(record.filterUrl),
    autoOpen: readOptionalBooleanLike(record.autoOpen),
    editionDate: readOptionalStringLike(record.editionDate),
    feedbackEnabled: readOptionalBooleanLike(record.feedbackEnabled),
    reactionsEnabled: readOptionalBooleanLike(record.reactionsEnabled),
    views: readOptionalIntegerLike(record.views),
    uniqueViews: readOptionalIntegerLike(record.uniqueViews),
    clicks: readOptionalIntegerLike(record.clicks),
    feedbacks: readOptionalIntegerLike(record.feedbacks),
    positiveReactions: readOptionalIntegerLike(record.positiveReactions),
    neutralReactions: readOptionalIntegerLike(record.neutralReactions),
    negativeReactions: readOptionalIntegerLike(record.negativeReactions),
  });
}

function readTranslationArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => {
    const record = requireRecord(item, "translation");
    return compactObject({
      title: readOptionalStringLike(record.title),
      content: readOptionalStringLike(record.content),
      contentHtml: readOptionalStringLike(record.contentHtml),
      language: readOptionalStringLike(record.language),
      category: readOptionalStringLike(record.category),
      linkUrl: readOptionalStringLike(record.linkUrl),
      linkText: readOptionalStringLike(record.linkText),
      images: readStringArray(record.images),
    });
  });
}

function readRequiredStringArray(value: unknown, fieldName: string): string[] {
  const result = readStringArray(value);
  if (result.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return result;
}

function readOptionalStringArray(value: unknown): string[] | undefined {
  const result = readStringArray(value);
  return result.length > 0 ? result : undefined;
}

function readOptionalLanguageArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const result = value
    .map((item) => readOptionalLanguageCode(item))
    .filter((item): item is string => item !== undefined);
  return result.length > 0 ? result : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => optionalString(item)).filter((item): item is string => item !== undefined);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `Beamer returned an invalid ${label} payload`);
  }
  return record;
}

function readRequiredStringFromPayload(payload: unknown, key: string, label: string): string {
  const value = readOptionalStringFromPayload(payload, key);
  if (!value) {
    throw new ProviderRequestError(502, `Beamer response is missing ${label}`);
  }
  return value;
}

function readOptionalStringFromPayload(payload: unknown, key: string): string | undefined {
  const record = optionalRecord(payload);
  return record ? readOptionalStringLike(record[key]) : undefined;
}

function readRequiredIntegerFromPayload(payload: unknown, key: string): number {
  const record = optionalRecord(payload);
  const value = record ? readOptionalIntegerLike(record[key]) : undefined;
  if (value === undefined) {
    throw new ProviderRequestError(502, `Beamer response is missing ${key}`);
  }
  return value;
}

function readOptionalStringLike(value: unknown): string | undefined {
  if (typeof value === "string") {
    return optionalString(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

function readOptionalLanguageCode(value: unknown): string | undefined {
  const parsed = readOptionalStringLike(value);
  return parsed ? parsed.toUpperCase() : undefined;
}

function readOptionalBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readOptionalBooleanLike(value: unknown): boolean | undefined {
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

function readOptionalIntegerLike(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isInteger(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = optionalNumber(value);
  if (!Number.isInteger(parsed) || parsed == null || parsed <= 0) {
    throw new ProviderRequestError(400, `${fieldName} must be a positive integer`);
  }
  return parsed;
}
