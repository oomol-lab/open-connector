import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { DiffbotActionName } from "./actions.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const service = "diffbot";
const diffbotApiOrigin = "https://api.diffbot.com";
const diffbotArticleRequestPath = "/v3/article";
const validationProbeUrl = "https://www.example.com/";

interface DiffbotContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type DiffbotActionHandler = (input: Record<string, unknown>, context: DiffbotContext) => Promise<unknown>;

export const diffbotActionHandlers: Record<DiffbotActionName, DiffbotActionHandler> = {
  extract_article(input, context) {
    return requestDiffbotArticle(input, context, "execute");
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, diffbotActionHandlers);

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: diffbotApiOrigin,
  auth: { type: "api_key_query", name: "token" },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const output = await requestDiffbotArticle(
      { url: validationProbeUrl },
      { apiKey: input.apiKey, fetcher, signal },
      "validate",
    );
    const request = optionalRecord((output as Record<string, unknown>).request);
    const article = optionalRecord((output as Record<string, unknown>).article);

    return {
      profile: {
        accountId: "diffbot:api_token",
        displayName: "Diffbot API Token",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: diffbotArticleRequestPath,
        validationProbeUrl,
        api: optionalString(request?.api),
        pageUrl: optionalString(request?.pageUrl),
        articleType: optionalString(article?.type),
        articleTitle: optionalString(article?.title),
      }),
    };
  },
};

async function requestDiffbotArticle(
  input: Record<string, unknown>,
  context: DiffbotContext,
  phase: "validate" | "execute",
): Promise<unknown> {
  const response = await context.fetcher(buildDiffbotArticleUrl(input, context.apiKey), {
    method: "GET",
    headers: {
      accept: "application/json",
      "user-agent": providerUserAgent,
    },
    signal: context.signal,
  });
  const raw = await response.text();
  const json = parseJson(raw);
  if (!response.ok) {
    throw createDiffbotHttpError(response.status, raw, json, phase);
  }
  const payload = optionalRecord(json);
  if (!payload) {
    throw new ProviderRequestError(502, "Diffbot response is not a JSON object");
  }
  return normalizeDiffbotArticleResponse(payload);
}

function buildDiffbotArticleUrl(input: Record<string, unknown>, apiKey: string): string {
  const target = optionalString(input.url);
  if (!target) {
    throw new ProviderRequestError(400, "url is required");
  }
  const publicUrl = assertPublicHttpUrl(target, {
    fieldName: "url",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (publicUrl.protocol !== "https:" || publicUrl.username || publicUrl.password) {
    throw new ProviderRequestError(400, "url must use https and must not include credentials");
  }

  const url = new URL(diffbotArticleRequestPath, diffbotApiOrigin);
  url.searchParams.set("token", apiKey);
  url.searchParams.set("url", publicUrl.toString());
  setArrayQueryParameter(url, "fields", input.fields);
  setArrayQueryParameter(url, "naturalLanguage", input.naturalLanguage);
  setStringQueryParameter(url, "proxy", optionalString(input.proxy));
  setStringQueryParameter(url, "proxyAuth", optionalString(input.proxyAuth));
  setStringQueryParameter(url, "scroll", optionalString(input.scroll));
  setStringQueryParameter(url, "useProxy", optionalString(input.useProxy));
  setNumberQueryParameter(url, "timeout", input.timeout);
  setNumberQueryParameter(url, "renderDelay", input.renderDelay);
  setNumberQueryParameter(url, "maxTags", input.maxTags);
  setNumberQueryParameter(url, "tagConfidence", input.tagConfidence);
  setNumberQueryParameter(url, "categoryConfidence", input.categoryConfidence);
  setNumberQueryParameter(url, "summaryNumSentences", input.summaryNumSentences);
  setBooleanQueryParameter(url, "paging", input.paging);
  setBooleanQueryParameter(url, "discussion", input.discussion);
  return url.toString();
}

function setArrayQueryParameter(url: URL, key: string, value: unknown): void {
  if (Array.isArray(value)) {
    url.searchParams.set(key, value.map(String).join(","));
  }
}

function setStringQueryParameter(url: URL, key: string, value: string | undefined): void {
  if (value !== undefined) {
    url.searchParams.set(key, value);
  }
}

function setNumberQueryParameter(url: URL, key: string, value: unknown): void {
  const parsed = optionalNumber(value);
  if (parsed !== undefined) {
    url.searchParams.set(key, String(parsed));
  }
}

function setBooleanQueryParameter(url: URL, key: string, value: unknown): void {
  if (typeof value === "boolean") {
    url.searchParams.set(key, String(value));
  }
}

function parseJson(raw: string): unknown {
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function createDiffbotHttpError(status: number, raw: string, json: unknown, phase: "validate" | "execute"): Error {
  const payload = optionalRecord(json);
  const message =
    (optionalString(payload?.error) ?? optionalString(payload?.message) ?? raw) ||
    `Diffbot request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if ((status === 401 || status === 403) && phase === "validate") {
    return new ProviderRequestError(400, message);
  }
  if (status === 400) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status, message);
}

function normalizeDiffbotArticleResponse(payload: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    request: normalizeDiffbotRequest(payload.request) ?? null,
    article: normalizeDiffbotArticle(Array.isArray(payload.objects) ? payload.objects[0] : undefined) ?? null,
    humanLanguage: optionalString(payload.humanLanguage),
    type: optionalString(payload.type),
    title: optionalString(payload.title),
  });
}

function normalizeDiffbotRequest(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  const request = compactObject({
    ...record,
    pageUrl: optionalString(record.pageUrl),
    api: optionalString(record.api),
    version: typeof record.version === "number" ? record.version : undefined,
  });
  return Object.keys(request).length > 0 ? request : undefined;
}

function normalizeDiffbotArticle(value: unknown): Record<string, unknown> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  const article = compactObject({
    ...record,
    type: optionalString(record.type),
    title: optionalString(record.title),
    pageUrl: optionalString(record.pageUrl),
    text: optionalString(record.text),
    html: optionalString(record.html),
    date: optionalString(record.date),
    estimatedDate: optionalString(record.estimatedDate),
    sentiment: optionalNumber(record.sentiment),
    author: optionalString(record.author),
    authorUrl: optionalString(record.authorUrl),
    siteName: optionalString(record.siteName),
    publisherCountry: optionalString(record.publisherCountry),
    publisherRegion: optionalString(record.publisherRegion),
    humanLanguage: optionalString(record.humanLanguage),
    icon: optionalString(record.icon),
    diffbotUri: optionalString(record.diffbotUri),
    authors: normalizeObjectArray(record.authors),
    images: normalizeObjectArray(record.images),
    tags: normalizeObjectArray(record.tags),
    categories: normalizeObjectArray(record.categories),
    meta: optionalRecord(record.meta),
    querystring: optionalRecord(record.querystring),
    naturalLanguage: optionalRecord(record.naturalLanguage),
    discussion: optionalRecord(record.discussion),
    breadcrumb: Array.isArray(record.breadcrumb) ? record.breadcrumb : undefined,
    links: Array.isArray(record.links) ? record.links : undefined,
    extlinks: Array.isArray(record.extlinks) ? record.extlinks : undefined,
    quotes: Array.isArray(record.quotes) ? record.quotes : undefined,
  });
  return Object.keys(article).length > 0 ? article : undefined;
}

function normalizeObjectArray(value: unknown): Array<Record<string, unknown>> | undefined {
  return Array.isArray(value)
    ? value.map((item) => optionalRecord(item)).filter((item): item is Record<string, unknown> => item !== undefined)
    : undefined;
}
