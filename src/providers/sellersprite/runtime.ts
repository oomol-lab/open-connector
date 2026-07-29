import type { CredentialValidationResult, ExecutionResult } from "../../core/types.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString, requiredStringArray } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
  readProviderJsonBody,
  toProviderExecutionError,
} from "../provider-runtime.ts";

export const sellerSpriteApiBaseUrl = "https://api.sellersprite.com";

const sellerSpriteValidationPath = "/v1/visits";
const sellerSpriteRequestTimeoutMs = 30_000;
const sellerSpriteMarketplaces = new Set(["US", "JP", "UK", "DE", "FR", "IT", "ES", "CA", "IN"]);
const competitorStringFields: readonly string[] = ["brand", "sellerName", "nodeIdPath", "keyword"];
const researchStringFields: readonly string[] = [
  "keyword",
  "includeSellers",
  "excludeSellers",
  "excludeKeywords",
  "weightUnit",
  "includeBrands",
  "excludeBrands",
  "dimensionType",
  "sellerNation",
  "fulfillment",
];
const reverseKeywordArrayFields: readonly string[] = ["badges", "trafficKeywordTypes", "conversionKeywordTypes"];
const emptySellerSpriteBody = Symbol("empty SellerSprite response");

type SellerSpritePhase = "validate" | "execute";

interface SellerSpriteRequest {
  path: string;
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">;
  phase: SellerSpritePhase;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}

interface SellerSpriteEnvelope {
  code?: unknown;
  message?: unknown;
  data?: unknown;
}

interface SellerSpriteErrorInput {
  status: number;
  code?: string;
  message?: string;
  retryAfter: string | null;
  phase: SellerSpritePhase;
}

class SellerSpriteRequestError extends ProviderRequestError {
  readonly code: string;

  constructor(code: string, status: number, message: string, details?: unknown) {
    super(status, message, details);
    this.code = code;
  }
}

export const sellerSpriteActionHandlers: Record<string, ProviderRuntimeHandler<ApiKeyProviderContext>> = {
  async get_api_usage(_input, context): Promise<unknown> {
    const data = await requestSellerSpriteData({
      path: sellerSpriteValidationPath,
      context,
      phase: "execute",
    });
    return { usage: data };
  },
  async get_asin_detail(input, context): Promise<unknown> {
    const marketplace = requireMarketplace(input.marketplace);
    const asin = requireAsin(input.asin, "asin");
    const data = await requestSellerSpriteData({
      path: `/v1/asin/${encodeURIComponent(marketplace)}/${encodeURIComponent(asin)}`,
      context,
      phase: "execute",
    });
    const detail = requireResponseObject(data, "SellerSprite ASIN detail");
    requireResponseString(detail.asin, "data.asin");
    return detail;
  },
  async lookup_competitors(input, context): Promise<unknown> {
    const data = await requestSellerSpriteData({
      path: "/v1/product/competitor-lookup",
      method: "POST",
      body: normalizeCompetitorInput(input),
      context,
      phase: "execute",
    });
    return normalizeProductPage(data);
  },
  async research_products(input, context): Promise<unknown> {
    const data = await requestSellerSpriteData({
      path: "/v1/product/research",
      method: "POST",
      body: normalizeResearchInput(input),
      context,
      phase: "execute",
    });
    return normalizeProductPage(data);
  },
  async reverse_asin_keywords(input, context): Promise<unknown> {
    const data = await requestSellerSpriteData({
      path: "/v1/traffic/keyword",
      method: "POST",
      body: normalizeReverseKeywordInput(input),
      context,
      phase: "execute",
    });
    return normalizeReverseKeywords(data);
  },
};

export async function validateSellerSpriteCredential(
  apiKey: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const usage = await requestSellerSpriteData({
    path: sellerSpriteValidationPath,
    context: { apiKey, fetcher, signal },
    phase: "validate",
  });

  return {
    profile: {
      accountId: "sellersprite",
      displayName: "SellerSprite API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: sellerSpriteApiBaseUrl,
      validationEndpoint: sellerSpriteValidationPath,
      usage,
    },
  };
}

export function toSellerSpriteExecutionError(error: unknown): ExecutionResult {
  if (error instanceof SellerSpriteRequestError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        details: {
          status: error.status,
          details: error.details,
        },
      },
    };
  }
  return toProviderExecutionError(error, "SellerSprite request failed");
}

async function requestSellerSpriteData(input: SellerSpriteRequest): Promise<unknown> {
  const timeout = createProviderTimeout(input.context.signal, sellerSpriteRequestTimeoutMs);
  let response: Response;
  let payload: unknown;

  try {
    response = await input.context.fetcher(new URL(input.path, sellerSpriteApiBaseUrl), {
      method: input.method ?? "GET",
      headers: {
        accept: "application/json",
        "content-type": "application/json;charset=UTF-8",
        "secret-key": input.context.apiKey,
        "user-agent": providerUserAgent,
        "x-request-id": randomUuidV7(),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
      signal: timeout.signal,
    });
    payload = await readProviderJsonBody(response, {
      emptyBody: emptySellerSpriteBody,
      invalidJsonMessage: "SellerSprite returned invalid JSON",
    });
    if (payload === emptySellerSpriteBody) {
      throw new ProviderRequestError(502, "SellerSprite returned an empty response");
    }
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "SellerSprite request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `SellerSprite request failed: ${error.message}` : "SellerSprite request failed",
    );
  } finally {
    timeout.cleanup();
  }

  const envelope = asSellerSpriteEnvelope(payload);
  const code = optionalString(envelope.code);
  const message = optionalString(envelope.message);

  if (!response.ok || code !== "OK") {
    throw createSellerSpriteError({
      status: response.status,
      code,
      message,
      retryAfter: response.headers.get("retry-after"),
      phase: input.phase,
    });
  }

  return envelope.data;
}

function normalizeCompetitorInput(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {
    ...input,
    marketplace: requireMarketplace(input.marketplace),
    month: normalizeOptionalMonth(input.month),
    asins: normalizeOptionalAsins(input.asins),
    order: normalizeOptionalOrder(input.order),
  };
  normalizeOptionalStrings(output, input, competitorStringFields);
  return compactObject(output);
}

function normalizeResearchInput(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {
    ...input,
    marketplace: requireMarketplace(input.marketplace),
    month: normalizeOptionalMonth(input.month),
    nodeIdPaths: normalizeOptionalStringArray(input.nodeIdPaths, "nodeIdPaths"),
    order: normalizeOptionalOrder(input.order),
  };
  normalizeOptionalStrings(output, input, researchStringFields);
  return compactObject(output);
}

function normalizeReverseKeywordInput(input: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {
    ...input,
    marketplace: requireMarketplace(input.marketplace),
    asin: requireAsin(input.asin, "asin"),
    keyword: normalizeOptionalString(input.keyword, "keyword"),
    month: normalizeOptionalMonth(input.month),
    order: normalizeOptionalOrder(input.order),
  };
  for (const fieldName of reverseKeywordArrayFields) {
    output[fieldName] = normalizeOptionalStringArray(input[fieldName], fieldName);
  }
  return compactObject(output);
}

function normalizeOptionalStrings(
  output: Record<string, unknown>,
  input: Record<string, unknown>,
  fieldNames: readonly string[],
): void {
  for (const fieldName of fieldNames) {
    output[fieldName] = normalizeOptionalString(input[fieldName], fieldName);
  }
}

function normalizeOptionalString(value: unknown, fieldName: string): string | undefined {
  return value === undefined ? undefined : requireInputString(value, fieldName);
}

function normalizeOptionalStringArray(value: unknown, fieldName: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredStringArray(value, fieldName, requestError).map((item, index) =>
    requireInputString(item, `${fieldName}[${index}]`),
  );
}

function normalizeOptionalAsins(value: unknown): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  return requiredStringArray(value, "asins", requestError).map((item, index) => requireAsin(item, `asins[${index}]`));
}

function normalizeOptionalMonth(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const month = requireInputString(value, "month");
  if (!isValidMonth(month)) {
    throw new ProviderRequestError(400, "month must use YYYYMM format");
  }
  return month;
}

function normalizeOptionalOrder(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  const order = optionalRecord(value);
  if (!order) {
    throw new ProviderRequestError(400, "order must be an object");
  }
  const normalized: Record<string, unknown> = {
    ...order,
    field: normalizeOptionalString(order.field, "order.field"),
  };
  if (order.desc !== undefined && typeof order.desc !== "boolean") {
    throw new ProviderRequestError(400, "order.desc must be a boolean");
  }
  return compactObject(normalized);
}

function requireMarketplace(value: unknown): string {
  const marketplace = requireInputString(value, "marketplace");
  if (!sellerSpriteMarketplaces.has(marketplace)) {
    throw new ProviderRequestError(400, "marketplace is not supported by SellerSprite");
  }
  return marketplace;
}

function requireAsin(value: unknown, fieldName: string): string {
  const asin = requireInputString(value, fieldName).toUpperCase();
  if (!isAsin(asin)) {
    throw new ProviderRequestError(400, `${fieldName} must contain 10 ASCII letters or digits`);
  }
  return asin;
}

function requireInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, requestError);
}

function requestError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

function asSellerSpriteEnvelope(value: unknown): SellerSpriteEnvelope {
  const envelope = optionalRecord(value);
  if (!envelope) {
    throw new ProviderRequestError(502, "SellerSprite returned an invalid response envelope");
  }
  return envelope;
}

function createSellerSpriteError(input: SellerSpriteErrorInput): ProviderRequestError {
  const message =
    input.message ||
    (input.code
      ? `SellerSprite request failed with ${input.code}`
      : `SellerSprite request failed with status ${input.status || 500}`);
  const details = {
    providerCode: input.code ?? null,
    retryAfter: input.retryAfter,
  };

  if (input.status === 429 || input.code === "ERROR_VISIT_MAX" || isRateLimitMessage(message)) {
    return new SellerSpriteRequestError("rate_limited", 429, message, {
      ...details,
      reason: input.code === "ERROR_VISIT_MAX" ? "quota_exhausted" : "rate_limit",
    });
  }

  if (input.code === "ERROR_SECRET_KEY_OVERDUE") {
    return new SellerSpriteRequestError("credential_expired", 401, message, details);
  }

  if (input.code === "ERROR_SECRET_KEY" || input.code === "ERROR_SECRET_KEY_INVALID" || input.status === 401) {
    return new SellerSpriteRequestError(
      input.phase === "validate" ? "invalid_input" : "credential_expired",
      input.phase === "validate" ? 400 : 401,
      message,
      details,
    );
  }

  if (input.code === "ERROR_AUTH_ERROR" || input.status === 403 || isModuleAccessMessage(message)) {
    return new SellerSpriteRequestError(
      input.phase === "validate" ? "invalid_input" : "scope_missing",
      input.phase === "validate" ? 400 : 403,
      message,
      {
        ...details,
        reason: "module_not_purchased_or_unavailable",
      },
    );
  }

  if (input.code === "ERROR_PARAM" || (input.status >= 400 && input.status < 500)) {
    return new SellerSpriteRequestError("invalid_input", 400, message, details);
  }

  return new SellerSpriteRequestError("provider_error", input.status >= 500 ? input.status : 502, message, details);
}

function isRateLimitMessage(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    message.includes("频繁") ||
    message.includes("限流") ||
    message.includes("访问次数已达上限") ||
    lower.includes("too many requests") ||
    lower.includes("rate limit")
  );
}

function isModuleAccessMessage(message: string): boolean {
  return (
    message.includes("未购买") ||
    message.includes("未订阅") ||
    message.includes("未开通") ||
    message.includes("无权限") ||
    (message.includes("没有") && message.includes("权限"))
  );
}

function normalizeProductPage(value: unknown): Record<string, unknown> {
  const data = requireResponseObject(value, "SellerSprite product page");
  return {
    ...data,
    pages: requireResponseInteger(data.pages, "data.pages"),
    page: requireResponseInteger(data.page, "data.page"),
    size: requireResponseInteger(data.size, "data.size"),
    total: requireResponseInteger(data.total, "data.total"),
    items: requireResponseObjectArray(data.items, "data.items"),
  };
}

function normalizeReverseKeywords(value: unknown): Record<string, unknown> {
  const data = requireResponseObject(value, "SellerSprite reverse keyword page");
  return {
    ...data,
    marketplace: requireResponseString(data.marketplace, "data.marketplace"),
    asin: requireResponseString(data.asin, "data.asin"),
    total: requireResponseInteger(data.total, "data.total"),
    items: requireResponseObjectArray(data.items, "data.items"),
    stats: data.stats === undefined || data.stats === null ? [] : requireResponseObjectArray(data.stats, "data.stats"),
  };
}

function requireResponseObject(value: unknown, fieldName: string): Record<string, unknown> {
  const object = optionalRecord(value);
  if (!object) {
    throw new ProviderRequestError(502, `${fieldName} must be an object`);
  }
  return object;
}

function requireResponseObjectArray(value: unknown, fieldName: string): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an array`);
  }
  return value.map((item, index) => requireResponseObject(item, `${fieldName}[${index}]`));
}

function requireResponseString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(502, `${fieldName} must be a non-empty string`);
  }
  return value;
}

function requireResponseInteger(value: unknown, fieldName: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an integer`);
  }
  return value;
}

function isValidMonth(value: string): boolean {
  if (value.length !== 6) {
    return false;
  }
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 48 || code > 57) {
      return false;
    }
  }
  const month = Number(value.slice(4));
  return month >= 1 && month <= 12;
}

function isAsin(value: string): boolean {
  if (value.length !== 10) {
    return false;
  }
  for (const character of value) {
    const code = character.charCodeAt(0);
    const isUppercaseLetter = code >= 65 && code <= 90;
    const isDigit = code >= 48 && code <= 57;
    if (!isUppercaseLetter && !isDigit) {
      return false;
    }
  }
  return true;
}

function randomUuidV7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let timestamp = Date.now();
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp % 256;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
