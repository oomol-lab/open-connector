import type { CredentialValidationResult, ProviderExecutors } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalNumber, optionalRecord, optionalString, requiredRecord } from "../../core/cast.ts";
import { defineApiKeyProviderExecutors, providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const service = "serpdog";
const serpdogBaseUrl = "https://api.serpdog.io";

type SerpdogPhase = "validate" | "execute";
type SerpdogQueryValue = string | number | boolean | undefined;
type SerpdogActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

interface SerpdogAccountInfo {
  user_name: string;
  api_key: string;
  email: string;
  plan: string;
  quota: number;
  requests: number;
  requests_left: number;
  billing_history?: Array<Record<string, unknown>>;
}

export const serpdogActionHandlers: ProviderActionHandlers<"serpdog", SerpdogActionHandler> = {
  async get_account_info(_input, context) {
    return requestSerpdogAccountInfo(context, "execute");
  },
  async google_search(input, context) {
    const endpoint = optionalString(input.mode) === "lite" ? "lite_search" : "search";
    const payload = requirePayloadRecord(
      await requestSerpdogJson(
        endpoint,
        compactObject({
          q: readInputString(input.q, "q"),
          num: optionalNumber(input.num),
          gl: optionalString(input.gl),
          hl: optionalString(input.hl),
          page: optionalNumber(input.page),
          lr: optionalString(input.lr),
          uule: optionalString(input.uule),
          duration: optionalString(input.duration),
          nfpr: readOptionalBooleanAsInteger(input.nfpr),
          tbs: optionalString(input.tbs),
          safe: optionalString(input.safe),
          domain: optionalString(input.domain),
        }),
        context,
        "execute",
      ),
    );

    return compactObject({
      meta: requirePayloadRecord(payload.meta ?? {}),
      organic_results: asArrayOfObjects(payload.organic_results),
      knowledge_graph: optionalRecord(payload.knowledge_graph),
      inline_videos: asOptionalArrayOfObjects(payload.inline_videos),
      local_results: asOptionalArrayOfObjects(payload.local_results),
      recipes_results: asOptionalArrayOfObjects(payload.recipes_results),
      peopleAlsoAskedFor: asOptionalArrayOfObjects(payload.peopleAlsoAskedFor),
      relatedSearches: asOptionalArrayOfObjects(payload.relatedSearches),
      pagination: optionalRecord(payload.pagination),
      serpdog_pagination: optionalRecord(payload.serpdog_pagination),
    });
  },
  async google_news_search(input, context) {
    const payload = requirePayloadRecord(
      await requestSerpdogJson(
        "news",
        compactObject({
          q: readInputString(input.q, "q"),
          num: optionalNumber(input.num),
          gl: optionalString(input.gl),
          hl: optionalString(input.hl),
          page: optionalNumber(input.page),
          lr: optionalString(input.lr),
          uule: optionalString(input.uule),
          duration: optionalString(input.duration),
          nfpr: readOptionalBooleanAsInteger(input.nfpr),
          tbs: optionalString(input.tbs),
          safe: optionalString(input.safe),
        }),
        context,
        "execute",
      ),
    );

    return compactObject({
      meta: requirePayloadRecord(payload.meta ?? {}),
      news_results: asArrayOfObjects(payload.news_results),
      subArticles: asOptionalArrayOfObjects(payload.subArticles),
      pagination: optionalRecord(payload.pagination),
      serpdog_pagination: optionalRecord(payload.serpdog_pagination),
    });
  },
  async google_videos_search(input, context) {
    const payload = requirePayloadRecord(
      await requestSerpdogJson(
        "videos",
        compactObject({
          q: readInputString(input.q, "q"),
          num: optionalNumber(input.num),
          gl: optionalString(input.gl),
          hl: optionalString(input.hl),
          page: optionalNumber(input.page),
          lr: optionalString(input.lr),
          uule: optionalString(input.uule),
          duration: optionalString(input.duration),
          nfpr: readOptionalBooleanAsInteger(input.nfpr),
          tbs: optionalString(input.tbs),
          safe: optionalString(input.safe),
        }),
        context,
        "execute",
      ),
    );

    return compactObject({
      meta: requirePayloadRecord(payload.meta ?? {}),
      video_results: asArrayOfObjects(payload.video_results),
      pagination: optionalRecord(payload.pagination),
      serpdog_pagination: optionalRecord(payload.serpdog_pagination),
    });
  },
  async google_autocomplete(input, context) {
    const payload = requirePayloadRecord(
      await requestSerpdogJson(
        "autocomplete",
        compactObject({
          q: readInputString(input.q, "q"),
          gl: optionalString(input.gl),
          hl: optionalString(input.hl),
        }),
        context,
        "execute",
      ),
    );

    return {
      meta: requirePayloadRecord(payload.meta ?? {}),
      suggestions: asArrayOfObjects(payload.suggestions),
      verbatim_relevance: readRequiredInteger(payload.verbatim_relevance, "verbatim_relevance"),
    };
  },
};

export async function validateSerpdogCredential(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const accountInfo = await requestSerpdogAccountInfo({ apiKey, fetcher, signal }, "validate");

  return {
    profile: {
      accountId: accountInfo.email,
      displayName: accountInfo.email,
    },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/account_info",
      apiBaseUrl: serpdogBaseUrl,
      userName: accountInfo.user_name,
      plan: accountInfo.plan,
      quota: accountInfo.quota,
      requests: accountInfo.requests,
      requestsLeft: accountInfo.requests_left,
    },
  };
}

async function requestSerpdogAccountInfo(
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: SerpdogPhase,
): Promise<SerpdogAccountInfo> {
  const payload = await requestSerpdogJson("account_info", {}, context, phase);
  return parseSerpdogAccountInfo(payload);
}

async function requestSerpdogJson(
  path: string,
  query: Record<string, SerpdogQueryValue>,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: SerpdogPhase,
): Promise<unknown> {
  let response: Response;
  let payload: unknown;

  try {
    response = await context.fetcher(buildSerpdogUrl(path, query, context.apiKey), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: context.signal,
    });
    payload = await readJsonPayload(response);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Serpdog request failed: ${error.message}` : "Serpdog request failed",
    );
  }

  if (!response.ok) {
    throw createSerpdogError(response.status, payload, phase);
  }

  return payload;
}

function buildSerpdogUrl(path: string, query: Record<string, SerpdogQueryValue>, apiKey: string): string {
  const url = new URL(path, ensureTrailingSlash(serpdogBaseUrl));
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  url.searchParams.set("api_key", apiKey);
  return url.toString();
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

function parseSerpdogAccountInfo(payload: unknown): SerpdogAccountInfo {
  const record = requirePayloadRecord(payload);

  return {
    user_name: readRequiredString(record.user_name, "user_name"),
    api_key: readRequiredString(record.api_key, "api_key"),
    email: readRequiredString(record.email, "email"),
    plan: readRequiredString(record.plan, "plan"),
    quota: readRequiredInteger(record.quota, "quota"),
    requests: readRequiredInteger(record.requests, "requests"),
    requests_left: readRequiredInteger(record.requests_left, "requests_left"),
    billing_history: asOptionalArrayOfObjects(record.billing_history),
  };
}

async function readJsonPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Serpdog returned invalid JSON");
  }
}

function createSerpdogError(status: number, payload: unknown, phase: SerpdogPhase): ProviderRequestError {
  const message = extractSerpdogMessage(payload) ?? `Serpdog request failed with ${status || 500}`;
  if (status === 400 || status === 404 || ((status === 401 || status === 403) && phase === "validate")) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function extractSerpdogMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }

  const record = optionalRecord(payload);
  return optionalString(record?.error) ?? optionalString(record?.message) ?? optionalString(record?.detail);
}

function readInputString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return text;
}

function readRequiredString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (!text) {
    throw new ProviderRequestError(502, `Serpdog response missing ${fieldName}`);
  }
  return text;
}

function readRequiredInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `Serpdog response missing ${fieldName}`);
  }
  return value;
}

function readOptionalBooleanAsInteger(value: unknown): number | undefined {
  return typeof value === "boolean" ? (value ? 1 : 0) : undefined;
}

function requirePayloadRecord(value: unknown): Record<string, unknown> {
  return requiredRecord(value, "Serpdog response", (message) => new ProviderRequestError(502, message));
}

function asArrayOfObjects(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.map((item) => requirePayloadRecord(item)) : [];
}

function asOptionalArrayOfObjects(value: unknown): Array<Record<string, unknown>> | undefined {
  return Array.isArray(value) ? value.map((item) => requirePayloadRecord(item)) : undefined;
}

export const serpdogExecutors: ProviderExecutors = defineApiKeyProviderExecutors(service, serpdogActionHandlers);
