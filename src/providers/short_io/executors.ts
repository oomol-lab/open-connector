import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import {
  compactObject,
  optionalBoolean,
  optionalInteger,
  optionalRecord,
  optionalString,
  positiveInteger,
  requiredString,
} from "../../core/cast.ts";
import {
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "short_io";
const shortIoApiBaseUrl = "https://api.short.io";
const shortIoStatisticsBaseUrl = "https://statistics.short.io";
const shortIoValidationPath = "/api/domains";

type ShortIoMode = "validate" | "execute";
type ShortIoQueryValue = string | number | boolean | undefined;
type ShortIoActionHandler = (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>;
type JsonPayloadReadResult =
  | { kind: "empty" }
  | { kind: "json"; value: unknown }
  | { kind: "invalid_json"; raw: string };

interface ShortIoRequestOptions {
  apiKey: string;
  baseUrl?: string;
  path: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  mode: ShortIoMode;
  method?: string;
  query?: Record<string, ShortIoQueryValue>;
  body?: unknown;
  notFoundAsInvalidInput?: boolean;
}

export const shortIoActionHandlers: ProviderActionHandlers<"short_io", ShortIoActionHandler> = {
  list_domains(_input, context) {
    return listDomains(context);
  },
  get_domain(input, context) {
    return getDomain(input, context);
  },
  list_links(input, context) {
    return listLinks(input, context);
  },
  get_link(input, context) {
    return getLink(input, context);
  },
  create_link(input, context) {
    return createLink(input, context);
  },
  update_link(input, context) {
    return updateLink(input, context);
  },
  delete_link(input, context) {
    return deleteLink(input, context);
  },
  get_link_statistics(input, context) {
    return getLinkStatistics(input, context);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, shortIoActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestShortIoJson<unknown>({
      apiKey: input.apiKey,
      path: shortIoValidationPath,
      fetcher,
      signal,
      mode: "validate",
    });

    const domains = extractDomainList(payload);
    const firstDomain = domains[0] ? optionalRecord(domains[0]) : undefined;
    const defaultDomainId = optionalInteger(firstDomain?.id);
    const defaultDomainHostname = optionalString(firstDomain?.hostname);

    return {
      profile: {
        accountId: defaultDomainId === undefined ? "short-io-api-key" : String(defaultDomainId),
        displayName: defaultDomainHostname ?? "Short.io API Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: shortIoValidationPath,
        apiBaseUrl: shortIoApiBaseUrl,
        statisticsBaseUrl: shortIoStatisticsBaseUrl,
        domainCount: domains.length,
        defaultDomainId,
        defaultDomainHostname,
      }),
    };
  },
};

async function listDomains(context: ApiKeyProviderContext): Promise<Record<string, unknown>> {
  const payload = await requestShortIoJson<unknown>({
    apiKey: context.apiKey,
    path: shortIoValidationPath,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  return {
    domains: extractDomainList(payload),
  };
}

function getDomain(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const domainId = requirePositiveIntegerInput(input.domainId, "domainId");
  return requestShortIoJson({
    apiKey: context.apiKey,
    path: `/domains/${domainId}`,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });
}

function listLinks(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return requestShortIoJson({
    apiKey: context.apiKey,
    path: "/api/links",
    query: compactObject({
      domain_id: requirePositiveIntegerInput(input.domainId, "domainId"),
      limit: readOptionalPositiveInteger(input.limit, "limit"),
      pageToken: optionalString(input.pageToken),
      dateSortOrder: optionalString(input.dateSortOrder),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

function getLink(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const linkId = requireInputString(input.linkId, "linkId");
  return requestShortIoJson({
    apiKey: context.apiKey,
    path: `/links/${encodeURIComponent(linkId)}`,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });
}

function createLink(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  return requestShortIoJson({
    apiKey: context.apiKey,
    path: "/links",
    method: "POST",
    body: compactObject({
      domain: requireInputString(input.domain, "domain"),
      originalURL: requireInputString(input.originalURL, "originalURL"),
      path: optionalString(input.path),
      title: optionalString(input.title),
      allowDuplicates: optionalBoolean(input.allowDuplicates),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });
}

function updateLink(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const linkId = requireInputString(input.linkId, "linkId");
  const body = compactObject({
    originalURL: optionalString(input.originalURL),
    path: optionalString(input.path),
    title: optionalString(input.title),
    tags: readOptionalStringArray(input.tags, "tags"),
    archived: optionalBoolean(input.archived),
    cloaking: optionalBoolean(input.cloaking),
    expiresAt: readOptionalExpiresAt(input.expiresAt),
    redirectType: readOptionalRedirectType(input.redirectType),
  });
  if (Object.keys(body).length === 0) {
    throw new ProviderRequestError(
      400,
      "At least one of originalURL, path, title, tags, archived, cloaking, expiresAt, or redirectType is required",
    );
  }

  return requestShortIoJson({
    apiKey: context.apiKey,
    path: `/links/${encodeURIComponent(linkId)}`,
    method: "POST",
    body,
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });
}

async function deleteLink(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const linkId = requireInputString(input.linkId, "linkId");
  const response = await shortIoFetch({
    apiKey: context.apiKey,
    path: `/links/${encodeURIComponent(linkId)}`,
    method: "DELETE",
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
  });

  if (!response.ok) {
    throw await toShortIoError(response, "execute", true);
  }

  const payload = await readJsonPayload(response);
  if (payload.kind === "invalid_json") {
    throw new ProviderRequestError(502, "Short.io returned invalid JSON");
  }
  const deleteResult = payload.kind === "json" ? optionalRecord(payload.value) : undefined;
  if (!deleteResult) {
    throw new ProviderRequestError(502, "Short.io returned an invalid delete response");
  }
  return deleteResult;
}

function getLinkStatistics(input: Record<string, unknown>, context: ApiKeyProviderContext): Promise<unknown> {
  const linkId = requireInputString(input.linkId, "linkId");
  if (input.period === "custom" && (!optionalString(input.startDate) || !optionalString(input.endDate))) {
    throw new ProviderRequestError(400, "startDate and endDate are required when period is custom");
  }
  return requestShortIoJson({
    apiKey: context.apiKey,
    baseUrl: shortIoStatisticsBaseUrl,
    path: `/statistics/link/${encodeURIComponent(linkId)}`,
    query: compactObject({
      period: optionalString(input.period),
      tz: optionalString(input.tz),
      clicksChartInterval: optionalString(input.clicksChartInterval),
      skipTops: optionalBoolean(input.skipTops),
      startDate: optionalString(input.startDate),
      endDate: optionalString(input.endDate),
    }),
    fetcher: context.fetcher,
    signal: context.signal,
    mode: "execute",
    notFoundAsInvalidInput: true,
  });
}

async function requestShortIoJson<T>(input: ShortIoRequestOptions): Promise<T> {
  const response = await shortIoFetch(input);
  if (!response.ok) {
    throw await toShortIoError(response, input.mode, input.notFoundAsInvalidInput === true);
  }

  const payload = await readJsonPayload(response);
  if (payload.kind === "empty") {
    throw new ProviderRequestError(502, "Short.io returned an empty response body");
  }
  if (payload.kind === "invalid_json") {
    throw new ProviderRequestError(502, "Short.io returned invalid JSON");
  }
  return payload.value as T;
}

function shortIoFetch(input: ShortIoRequestOptions): Promise<Response> {
  const url = new URL(input.path, input.baseUrl ?? shortIoApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return input.fetcher(url, {
    method: input.method ?? "GET",
    headers: shortIoHeaders(input.apiKey, input.body !== undefined),
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    signal: input.signal,
  });
}

function shortIoHeaders(apiKey: string, hasBody: boolean): Record<string, string> {
  return {
    accept: "application/json",
    ...(hasBody ? { "content-type": "application/json" } : {}),
    authorization: apiKey,
    "user-agent": providerUserAgent,
  };
}

async function toShortIoError(
  response: Response,
  mode: ShortIoMode,
  notFoundAsInvalidInput: boolean,
): Promise<ProviderRequestError> {
  const payload = await readJsonPayload(response);
  const message = readErrorMessage(payload) ?? `Short.io request failed with status ${response.status}`;

  if (response.status === 401) {
    return new ProviderRequestError(mode === "validate" ? 401 : 403, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (notFoundAsInvalidInput && response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status >= 500 ? 502 : 500, message, payload);
}

async function readJsonPayload(response: Response): Promise<JsonPayloadReadResult> {
  const raw = await response.text().catch(() => "");
  if (!raw) {
    return { kind: "empty" };
  }
  try {
    return { kind: "json", value: JSON.parse(raw) as unknown };
  } catch {
    return { kind: "invalid_json", raw };
  }
}

function readErrorMessage(value: JsonPayloadReadResult): string | undefined {
  if (value.kind === "invalid_json" && value.raw) {
    return value.raw;
  }
  if (value.kind !== "json") {
    return undefined;
  }
  const objectValue = optionalRecord(value.value);
  if (!objectValue) {
    return undefined;
  }
  return (
    optionalString(objectValue.message) ??
    optionalString(objectValue.error) ??
    optionalString(objectValue.errorMessage) ??
    optionalString(objectValue.detail)
  );
}

function extractDomainList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload;
  }
  const objectPayload = optionalRecord(payload);
  if (Array.isArray(objectPayload?.domains)) {
    return objectPayload.domains;
  }
  throw new ProviderRequestError(502, "Short.io returned an invalid domains response", payload);
}

function requireInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function requirePositiveIntegerInput(value: unknown, fieldName: string): number {
  if (value === undefined || value === null || value === "") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return positiveInteger(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalPositiveInteger(value: unknown, fieldName: string): number | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  return positiveInteger(value, fieldName, (message) => new ProviderRequestError(400, message));
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map((item) => requireInputString(item, fieldName));
}

function readOptionalExpiresAt(value: unknown): string | undefined {
  const text = optionalString(value);
  if (!text) {
    return undefined;
  }
  if (/^\d+$/.test(text)) {
    const parsed = Number(text);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return text;
    }
  }
  if (!Number.isNaN(Date.parse(text))) {
    return text;
  }
  throw new ProviderRequestError(
    400,
    "expiresAt must be an ISO 8601 timestamp or positive millisecond timestamp string",
  );
}

function readOptionalRedirectType(value: unknown): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  const redirectType = Number(value);
  if (!Number.isInteger(redirectType) || ![301, 302, 307, 308].includes(redirectType)) {
    throw new ProviderRequestError(400, "redirectType must be one of 301, 302, 307, or 308");
  }
  return redirectType;
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.short.io",
  auth: { type: "api_key_authorization", prefix: "" },
});
