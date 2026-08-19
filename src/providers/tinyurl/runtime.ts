import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
} from "../../core/cast.ts";
import { jsonObject } from "../../core/request.ts";
import { providerUserAgent, ProviderRequestError } from "../provider-runtime.ts";

const tinyurlApiBaseUrl = "https://api.tinyurl.com";
const tinyurlValidationPath = "/urls/available?page=1&limit=1";

type TinyurlRequestPhase = "validate" | "execute";

export const tinyurlActionHandlers: ProviderActionHandlers<"tinyurl", ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  create_short_url(input, context) {
    return createShortUrl(input, context);
  },
  list_urls(input, context) {
    return listUrls(input, context);
  },
};

export async function validateTinyurlCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  await requestTinyurl(new URL(tinyurlValidationPath, tinyurlApiBaseUrl), {
    method: "GET",
    apiKey,
    fetcher,
    signal,
    phase: "validate",
  });

  return {
    profile: {
      accountId: "tinyurl:api_token",
      displayName: "TinyURL API Token",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: tinyurlApiBaseUrl,
      validationEndpoint: tinyurlValidationPath,
      validationMode: "list_permission_probe",
    },
  };
}

async function createShortUrl(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = await requestTinyurl(new URL("/create", tinyurlApiBaseUrl), {
    method: "POST",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
    body: jsonObject({
      url: optionalString(input.url),
      alias: optionalString(input.alias),
      domain: optionalString(input.domain),
      tags: Array.isArray(input.tags)
        ? input.tags.filter((item): item is string => typeof item === "string")
        : undefined,
      expires_at: optionalString(input.expires_at),
    }),
  });
  const record = requireTinyurlObject(payload, "create response");
  const data = optionalRecord(record.data) ?? record;
  return compactObject({
    tiny_url: requiredString(data.tiny_url, "tinyurl create response tiny_url", providerError),
    alias: requiredString(data.alias, "tinyurl create response alias", providerError),
    domain: optionalString(data.domain),
    url: optionalString(data.url),
    tags: Array.isArray(data.tags) ? data.tags.filter((item): item is string => typeof item === "string") : undefined,
    expires_at: optionalString(data.expires_at),
    created_at: optionalString(data.created_at),
  });
}

async function listUrls(
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const type = requiredString(input.type, "type", invalidInput);
  const url = new URL(`/urls/${type}`, tinyurlApiBaseUrl);
  const page = optionalInteger(input.page);
  const limit = optionalInteger(input.limit);
  if (page !== undefined) url.searchParams.set("page", String(page));
  if (limit !== undefined) url.searchParams.set("limit", String(limit));

  const payload = await requestTinyurl(url, {
    method: "GET",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    phase: "execute",
  });
  const record = requireTinyurlObject(payload, "list response");
  const data = optionalRecord(record.data);
  const listEnvelope = data && Array.isArray(data.data) ? data : record;
  const items = listEnvelope.data;
  if (!Array.isArray(items)) {
    throw new ProviderRequestError(502, "tinyurl list response is missing data");
  }

  return compactObject({
    code: optionalInteger(listEnvelope.code),
    data: items.map((item, index) => parseTinyurlListItem(item, index)),
    page: optionalInteger(listEnvelope.page),
    limit: optionalInteger(listEnvelope.limit),
    total: optionalInteger(listEnvelope.total),
  });
}

async function requestTinyurl(
  url: URL,
  input: {
    method: "GET" | "POST";
    apiKey: string;
    fetcher: typeof fetch;
    phase: TinyurlRequestPhase;
    signal?: AbortSignal;
    body?: Record<string, unknown>;
  },
): Promise<unknown> {
  let response: Response;
  try {
    response = await input.fetcher(url, {
      method: input.method,
      headers: {
        authorization: `Bearer ${input.apiKey}`,
        accept: "application/json",
        "user-agent": providerUserAgent,
        ...(input.body ? { "content-type": "application/json" } : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `tinyurl request failed: ${error.message}` : "tinyurl request failed",
    );
  }

  const payload = await readPayload(response);
  if (!response.ok) {
    throw createTinyurlError(response, payload, input.phase);
  }
  return payload;
}

async function readPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createTinyurlError(response: Response, payload: unknown, phase: TinyurlRequestPhase): ProviderRequestError {
  const message = extractTinyurlMessage(payload, `tinyurl request failed with status ${response.status}`);
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if ([400, 401, 403, 404, 409, 422].includes(response.status)) {
    return new ProviderRequestError(response.status, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : response.status, message, payload);
}

function extractTinyurlMessage(payload: unknown, fallback: string): string {
  if (typeof payload === "string" && payload.trim()) return payload;
  const record = optionalRecord(payload);
  if (!record) return fallback;
  const direct = optionalString(record.error) ?? optionalString(record.message);
  if (direct) return direct;
  if (Array.isArray(record.errors)) {
    for (const item of record.errors) {
      if (typeof item === "string" && item.trim()) return item;
      const message = optionalString(optionalRecord(item)?.message);
      if (message) return message;
    }
  }
  return fallback;
}

function parseTinyurlListItem(value: unknown, index: number): Record<string, unknown> {
  const record = requireTinyurlObject(value, `list item ${index + 1}`);
  return compactObject({
    tiny_url: requiredString(record.tiny_url, `tinyurl list item ${index + 1} tiny_url`, providerError),
    alias: requiredString(record.alias, `tinyurl list item ${index + 1} alias`, providerError),
    domain: requiredString(record.domain, `tinyurl list item ${index + 1} domain`, providerError),
    url: optionalString(record.url),
    archived: optionalBoolean(record.archived) ?? false,
    created_at: requiredString(record.created_at, `tinyurl list item ${index + 1} created_at`, providerError),
  });
}

function requireTinyurlObject(value: unknown, label: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `tinyurl ${label} is invalid`);
  }
  return record;
}

function invalidInput(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function providerError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}
