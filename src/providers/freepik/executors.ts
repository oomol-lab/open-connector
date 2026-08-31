import type { CredentialValidators, ProviderExecutors, ProviderProxyExecutor } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  defineApiKeyProviderExecutors,
  defineProviderProxy,
  isAbortLikeError,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

const service = "freepik";
const freepikApiBaseUrl = "https://api.magnific.com";
const freepikResourcesPath = "/v1/resources";

type FreepikPhase = "validate" | "execute";
type FreepikActionContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
type FreepikActionHandler = (input: Record<string, unknown>, context: FreepikActionContext) => Promise<unknown>;

export const freepikActionHandlers: ProviderActionHandlers<"freepik", FreepikActionHandler> = {
  async search_resources(input, context) {
    const payload = await requestFreepikJson({
      context,
      path: freepikResourcesPath,
      query: buildSearchResourcesQuery(input),
      acceptLanguage: optionalString(input.acceptLanguage),
      phase: "execute",
    });
    return normalizeSearchResourcesPayload(payload);
  },
  async get_resource(input, context) {
    const payload = await requestFreepikJson({
      context,
      path: `${freepikResourcesPath}/${encodePathSegment(input.resourceId, "resourceId")}`,
      acceptLanguage: optionalString(input.acceptLanguage),
      phase: "execute",
    });
    return normalizeGetResourcePayload(payload);
  },
  async download_resource(input, context) {
    if (input.format && input.imageSize) {
      throw new ProviderRequestError(400, "format and imageSize cannot be used together");
    }

    const payload = await requestFreepikJson({
      context,
      path: buildDownloadResourcePath(input),
      query: compactObject({
        image_size: optionalString(input.imageSize),
      }),
      acceptLanguage: optionalString(input.acceptLanguage),
      phase: "execute",
    });
    return normalizeDownloadResourcePayload(payload);
  },
};

export const executors: ProviderExecutors = defineApiKeyProviderExecutors(service, freepikActionHandlers);

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    await requestFreepikJson({
      context: {
        apiKey: input.apiKey,
        fetcher,
        signal,
      },
      path: freepikResourcesPath,
      query: { limit: "1" },
      phase: "validate",
    });

    return {
      profile: {
        accountId: "api_key",
        displayName: "Magnific API Key",
      },
      grantedScopes: [],
      metadata: {
        apiBaseUrl: freepikApiBaseUrl,
        validationEndpoint: freepikResourcesPath,
      },
    };
  },
};

function buildSearchResourcesQuery(input: Record<string, unknown>): Record<string, string> {
  const filters = optionalRecord(input.filters);
  if (filters?.ids !== undefined && Object.keys(filters).some((key) => key !== "ids")) {
    throw new ProviderRequestError(400, "ids cannot be combined with other filters");
  }

  const query: Record<string, string> = {};
  setOptionalQueryValue(query, "page", stringifyOptionalNumber(optionalInteger(input.page)));
  setOptionalQueryValue(query, "limit", stringifyOptionalNumber(optionalInteger(input.limit)));
  setOptionalQueryValue(query, "order", optionalString(input.order));
  setOptionalQueryValue(query, "term", optionalString(input.term));
  appendResourceFilters(query, filters);
  return query;
}

function appendResourceFilters(query: Record<string, string>, filters: Record<string, unknown> | undefined): void {
  if (!filters) {
    return;
  }

  appendNestedFilterValues(query, "content_type", optionalRecord(filters.contentType), ["photo", "psd", "vector"]);
  appendNestedFilterValues(query, "orientation", optionalRecord(filters.orientation), [
    "landscape",
    "portrait",
    "square",
    "panoramic",
  ]);
  appendNestedFilterValues(query, "license", optionalRecord(filters.license), ["freemium", "premium"]);
  appendNestedFilterValues(query, "people", optionalRecord(filters.people), [
    "include",
    "exclude",
    "number",
    "age",
    "gender",
    "ethnicity",
  ]);
  setOptionalQueryValue(query, "filters[period]", optionalString(filters.period));
  setOptionalQueryValue(query, "filters[color]", optionalString(filters.color));
  setOptionalQueryValue(query, "filters[author]", stringifyOptionalNumber(optionalNumber(filters.author)));
  appendNestedFilterValues(query, "ai-generated", optionalRecord(filters.aiGenerated), ["excluded", "only"]);
  appendNestedFilterValues(query, "vector", optionalRecord(filters.vector), ["type", "style"]);
  appendNestedFilterValues(query, "psd", optionalRecord(filters.psd), ["type"]);
  setOptionalQueryValue(query, "filters[ids]", optionalString(filters.ids));
}

function appendNestedFilterValues(
  query: Record<string, string>,
  upstreamName: string,
  values: Record<string, unknown> | undefined,
  keys: string[],
): void {
  if (!values) {
    return;
  }

  for (const key of keys) {
    const value = values[key];
    if (value !== undefined) {
      query[`filters[${upstreamName}][${key}]`] = String(value);
    }
  }
}

function buildDownloadResourcePath(input: Record<string, unknown>): string {
  const resourceId = encodePathSegment(input.resourceId, "resourceId");
  const format = optionalString(input.format);
  if (!format) {
    return `${freepikResourcesPath}/${resourceId}/download`;
  }
  return `${freepikResourcesPath}/${resourceId}/download/${encodePathSegment(format, "format")}`;
}

async function requestFreepikJson(input: {
  context: FreepikActionContext;
  path: string;
  query?: Record<string, string | undefined>;
  acceptLanguage?: string;
  phase: FreepikPhase;
}): Promise<Record<string, unknown>> {
  const url = new URL(input.path, freepikApiBaseUrl);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }

  const timeout = createProviderTimeout(input.context.signal);
  try {
    const response = await input.context.fetcher(url, {
      method: "GET",
      headers: freepikHeaders(input.context.apiKey, input.acceptLanguage),
      signal: timeout.signal,
    });
    const payload = await readFreepikPayload(response);
    if (!response.ok) {
      throw createFreepikError(response, payload, input.phase);
    }
    return readPayloadObject(payload, "Freepik returned a non-object response");
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Freepik request timed out", error);
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Freepik request failed: ${error.message}` : "Freepik request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

function freepikHeaders(apiKey: string, acceptLanguage: string | undefined): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-magnific-api-key": apiKey,
  };
  if (acceptLanguage) {
    headers["accept-language"] = acceptLanguage;
  }
  return headers;
}

async function readFreepikPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Freepik returned invalid JSON");
  }
}

function normalizeSearchResourcesPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    resources: readObjectArray(payload.data, "Freepik resources response is missing data"),
    meta: optionalRecord(payload.meta) ?? {},
    raw: payload,
  };
}

function normalizeGetResourcePayload(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    resource: readPayloadObject(payload.data, "Freepik resource response is missing data"),
    raw: payload,
  };
}

function normalizeDownloadResourcePayload(payload: Record<string, unknown>): Record<string, unknown> {
  const data = readPayloadObject(payload.data, "Freepik download response is missing data");
  return {
    filename: requirePayloadString(data.filename, "Freepik download response is missing filename"),
    url: requirePayloadString(data.url, "Freepik download response is missing url"),
    signedUrl: optionalString(data.signed_url) ?? null,
    prompt: optionalString(data.prompt) ?? null,
    raw: payload,
  };
}

function readPayloadObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, message, value);
  }
  return record;
}

function readObjectArray(value: unknown, message: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, message, value);
  }
  return value.map((item) => readPayloadObject(item, message));
}

function requirePayloadString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(502, message, value);
  }
  return value;
}

function createFreepikError(response: Response, payload: unknown, phase: FreepikPhase): ProviderRequestError {
  const message =
    (extractFreepikErrorMessage(payload) ?? response.statusText.trim()) ||
    `Freepik request failed with HTTP ${response.status}`;

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(phase === "validate" ? response.status : 401, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }
  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractFreepikErrorMessage(payload: unknown): string | undefined {
  const object = optionalRecord(payload);
  if (!object) {
    return undefined;
  }

  const problem = optionalRecord(object.problem);
  return (
    optionalString(object.message) ??
    optionalString(object.error) ??
    optionalString(object.detail) ??
    optionalString(problem?.message)
  );
}

function encodePathSegment(value: unknown, fieldName: string): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new ProviderRequestError(400, `${fieldName} is required.`);
  }
  return encodeURIComponent(String(value));
}

function stringifyOptionalNumber(value: number | undefined): string | undefined {
  return value === undefined ? undefined : String(value);
}

function setOptionalQueryValue(query: Record<string, string>, key: string, value: string | undefined): void {
  if (value !== undefined) {
    query[key] = value;
  }
}

export const proxy: ProviderProxyExecutor = defineProviderProxy({
  service,
  baseUrl: "https://api.magnific.com",
  auth: { type: "api_key_header", name: "x-magnific-api-key" },
});
