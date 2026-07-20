import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderFetch, ProviderRuntimeHandler } from "../provider-runtime.ts";

import {
  compactObject,
  objectArray,
  optionalInteger,
  optionalRecord,
  optionalString,
  requiredString,
  requiredStringArray,
} from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

type AnySearchRequestPhase = "validate" | "execute";
type AnySearchMcpToolName = "get_sub_domains" | "batch_search" | "extract";
type AnySearchContext = Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;

export const anySearchApiBaseUrl = "https://api.anysearch.com";
const anySearchMcpEndpoint = anySearchApiBaseUrl + "/mcp";
const anySearchRequestTimeoutMs = 30_000;
const anySearchClientHeader = "connector/1.0.0";
const authenticatedQuotaResponse = Symbol("authenticatedQuotaResponse");
const credentialErrorSymbols = new Set([
  "account_disabled",
  "expired_api_key",
  "invalid_api_key",
  "invalid_auth_header",
]);
const rateLimitedErrorSymbols = new Set([
  "daily_free_quota_exhausted",
  "quota_exhausted",
  "rate_limit_exceeded",
  "rate_limit_exceeded_user",
  "user_daily_quota_exhausted",
]);
const invalidInputErrorSymbols = new Set([
  "extract_unsupported_content",
  "invalid_extract_url",
  "invalid_request",
  "private_capability_not_enabled",
]);
const inputError = (message: string): ProviderRequestError => new ProviderRequestError(400, message);

export const anySearchActionHandlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  search(input, context) {
    return requestAnySearchRest(buildSearchInput(input), context, "execute");
  },
  get_sub_domains(input, context) {
    return requestAnySearchMcpTool("get_sub_domains", buildGetSubDomainsInput(input), context);
  },
  batch_search(input, context) {
    return requestAnySearchMcpTool("batch_search", buildBatchSearchInput(input), context);
  },
  extract(input, context) {
    return requestAnySearchMcpTool("extract", { url: readExtractUrl(input.url) }, context);
  },
};

export async function validateAnySearchApiKey(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  await requestAnySearchRest(
    {
      query: "AnySearch credential validation",
      max_results: 1,
    },
    { apiKey, fetcher, signal },
    "validate",
  );

  return {
    profile: {
      accountId: "anysearch",
      displayName: "AnySearch API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: anySearchApiBaseUrl,
      validationEndpoint: "/v1/search",
    },
  };
}

function buildSearchInput(input: Record<string, unknown>): Record<string, unknown> {
  return compactObject({
    query: requiredString(input.query, "query", inputError),
    max_results: optionalInteger(input.max_results),
    domain: optionalString(input.domain),
    tag: optionalString(input.tag),
    content_types: readOptionalStringArray(input.content_types, "content_types"),
    zone: optionalString(input.zone),
    language: optionalString(input.language),
    params: optionalRecord(input.params),
  });
}

function buildGetSubDomainsInput(input: Record<string, unknown>): Record<string, unknown> {
  if (input.domains !== undefined) {
    return {
      domains: requiredStringArray(input.domains, "domains", inputError),
    };
  }
  return {
    domain: requiredString(input.domain, "domain", inputError),
  };
}

function buildBatchSearchInput(input: Record<string, unknown>): Record<string, unknown> {
  const queries = objectArray(input.queries, "queries", inputError).map((query, index) =>
    compactObject({
      query: requiredString(query.query, "queries[" + index + "].query", inputError),
      domain: optionalString(query.domain),
      sub_domain: optionalString(query.sub_domain),
      sub_domain_params: optionalRecord(query.sub_domain_params),
      max_results: optionalInteger(query.max_results),
    }),
  );
  return { queries };
}

function readExtractUrl(value: unknown): string {
  const url = requiredString(value, "url", inputError);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new ProviderRequestError(400, "url must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new ProviderRequestError(400, "url must use http or https");
  }
  return url;
}

function readOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredStringArray(value, fieldName, inputError).map((item, index) =>
    requiredString(item, fieldName + "[" + index + "]", inputError),
  );
}

async function requestAnySearchRest(
  body: Record<string, unknown>,
  context: AnySearchContext,
  phase: AnySearchRequestPhase,
): Promise<unknown> {
  const payload = await requestAnySearchJson(new URL("/v1/search", anySearchApiBaseUrl), body, context, phase);
  if (payload === authenticatedQuotaResponse) {
    return {};
  }
  return unwrapAnySearchRestPayload(payload);
}

async function requestAnySearchMcpTool(
  toolName: AnySearchMcpToolName,
  argumentsValue: Record<string, unknown>,
  context: AnySearchContext,
): Promise<unknown> {
  const payload = await requestAnySearchJson(
    anySearchMcpEndpoint,
    {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: toolName,
        arguments: argumentsValue,
      },
    },
    context,
    "execute",
    { "x-anysearch-client": anySearchClientHeader },
  );
  return unwrapAnySearchMcpPayload(payload, toolName);
}

async function requestAnySearchJson(
  url: string | URL,
  body: Record<string, unknown>,
  context: AnySearchContext,
  phase: AnySearchRequestPhase,
  extraHeaders: Record<string, string> = {},
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, anySearchRequestTimeoutMs);

  try {
    const response = await context.fetcher(url, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: "Bearer " + context.apiKey,
        "content-type": "application/json",
        "user-agent": providerUserAgent,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
      signal: timeout.signal,
    });
    const payload = await readAnySearchPayload(response);

    if (!response.ok) {
      if (phase === "validate" && response.status === 402) {
        return authenticatedQuotaResponse;
      }
      throw createAnySearchHttpError(response, payload, phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "AnySearch request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? "AnySearch request failed: " + error.message : "AnySearch request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }
}

async function readAnySearchPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "AnySearch returned invalid JSON");
  }
}

function unwrapAnySearchRestPayload(payload: unknown): Record<string, unknown> {
  const envelope = optionalRecord(payload);
  const data = optionalRecord(envelope?.data);
  const metadata = optionalRecord(data?.metadata);
  const requestId = readNonEmptyString(envelope?.request_id) ?? readNonEmptyString(metadata?.request_id);

  if (envelope?.code !== 0 || !data || !metadata || !requestId) {
    throw new ProviderRequestError(
      502,
      readAnySearchErrorMessage(payload) ?? "AnySearch returned an invalid response",
      payload,
    );
  }

  const results = readSearchResults(data.results);
  const totalResults = readNonNegativeInteger(metadata.total_results, "metadata.total_results");
  const searchTimeMs = readNonNegativeInteger(metadata.search_time_ms, "metadata.search_time_ms");
  const { request_id: _requestId, ...restMetadata } = metadata;

  return {
    ...data,
    results,
    metadata: {
      ...restMetadata,
      total_results: totalResults,
      search_time_ms: searchTimeMs,
    },
    request_id: requestId,
  };
}

function readSearchResults(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "AnySearch response results must be an array", value);
  }
  return value.map((item, index) => {
    const result = optionalRecord(item);
    if (!result) {
      throw new ProviderRequestError(502, "AnySearch result " + index + " must be an object", item);
    }
    readOutputString(result.title, "results[" + index + "].title");
    readOutputString(result.url, "results[" + index + "].url");
    readOutputString(result.snippet, "results[" + index + "].snippet");
    readOutputString(result.content, "results[" + index + "].content");
    return result;
  });
}

function unwrapAnySearchMcpPayload(payload: unknown, toolName: AnySearchMcpToolName): Record<string, unknown> {
  const envelope = optionalRecord(payload);
  if (envelope?.jsonrpc !== "2.0") {
    throw new ProviderRequestError(502, "AnySearch returned an invalid MCP response", payload);
  }

  const rpcError = optionalRecord(envelope.error);
  if (rpcError) {
    const message = readNonEmptyString(rpcError.message) ?? "AnySearch MCP request failed";
    const code = typeof rpcError.code === "number" ? rpcError.code : undefined;
    throw new ProviderRequestError(code === -32602 ? 400 : 502, message, rpcError);
  }

  const result = optionalRecord(envelope.result);
  if (!result) {
    throw new ProviderRequestError(502, "AnySearch returned an invalid MCP result", payload);
  }

  const content = readMcpTextContent(result.content);
  if (result.isError === true) {
    throw createAnySearchMcpToolError(toolName, content);
  }
  if (!content) {
    throw new ProviderRequestError(502, "AnySearch MCP result has no text content", result);
  }

  const metadata = optionalRecord(result._meta);
  if (toolName === "batch_search") {
    const requestIds = readNonEmptyStringArray(metadata?.request_ids);
    if (!requestIds || requestIds.length > 5) {
      throw new ProviderRequestError(502, "AnySearch batch search result has invalid request identifiers", result);
    }
    return { content, request_ids: requestIds };
  }

  const requestId = readNonEmptyString(metadata?.request_id);
  if (!requestId) {
    throw new ProviderRequestError(502, "AnySearch " + toolName + " result has no request identifier", result);
  }
  return { content, request_id: requestId };
}

function createAnySearchHttpError(
  response: Response,
  payload: unknown,
  phase: AnySearchRequestPhase,
): ProviderRequestError {
  const message = readAnySearchErrorMessage(payload) ?? "AnySearch request failed with status " + response.status;
  const symbol = readAnySearchErrorSymbol(payload);

  if (response.status === 402 || response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && (response.status === 401 || response.status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && (response.status === 401 || response.status === 403)) {
    if (
      response.status === 403 &&
      (symbol === "private_capability_not_enabled" || message.toLowerCase().includes("private capability"))
    ) {
      return new ProviderRequestError(400, message, payload);
    }
    return new ProviderRequestError(response.status, message, payload);
  }
  if (phase === "execute" && (response.status === 400 || response.status === 415)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(response.status || 502, message, payload);
}

function createAnySearchMcpToolError(
  toolName: AnySearchMcpToolName,
  content: string | undefined,
): ProviderRequestError {
  const message = content ?? "AnySearch MCP tool " + toolName + " returned an error";
  const symbol = readMcpErrorSymbol(content);
  if (symbol && rateLimitedErrorSymbols.has(symbol)) {
    return new ProviderRequestError(429, message);
  }
  if (symbol && credentialErrorSymbols.has(symbol)) {
    return new ProviderRequestError(401, message);
  }
  if (symbol && invalidInputErrorSymbols.has(symbol)) {
    return new ProviderRequestError(400, message);
  }

  const normalized = message.toLowerCase();
  if (normalized.includes("quota") || normalized.includes("rate limit")) {
    return new ProviderRequestError(429, message);
  }
  if (
    normalized.includes("invalid api key") ||
    normalized.includes("unauthorized") ||
    normalized.includes("expired api key")
  ) {
    return new ProviderRequestError(401, message);
  }
  if (
    normalized.includes("invalid") ||
    normalized.includes("required") ||
    normalized.includes("must ") ||
    normalized.includes("unsupported content")
  ) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(502, message);
}

function readMcpErrorSymbol(content: string | undefined): string | undefined {
  const firstLine = content?.split("\n", 1)[0]?.trim();
  return firstLine && !firstLine.includes(" ") ? firstLine : undefined;
}

function readAnySearchErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  const error = optionalRecord(record?.error);
  return readNonEmptyString(record?.message) ?? readNonEmptyString(record?.error) ?? readNonEmptyString(error?.message);
}

function readAnySearchErrorSymbol(payload: unknown): string | undefined {
  return readNonEmptyString(optionalRecord(payload)?.symbol);
}

function readMcpTextContent(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const text = value
    .map((item) => {
      const record = optionalRecord(item);
      return record?.type === "text" ? readNonEmptyString(record.text) : undefined;
    })
    .filter((item): item is string => item !== undefined)
    .join("\n\n");
  return text || undefined;
}

function readNonEmptyStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const strings = value.map(readNonEmptyString);
  return strings.every((item): item is string => item !== undefined) && strings.length > 0 ? strings : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function readOutputString(value: unknown, fieldName: string): string {
  if (typeof value !== "string") {
    throw new ProviderRequestError(502, "AnySearch response " + fieldName + " must be a string", value);
  }
  return value;
}

function readNonNegativeInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new ProviderRequestError(502, "AnySearch response " + fieldName + " must be a non-negative integer", value);
  }
  return value;
}
