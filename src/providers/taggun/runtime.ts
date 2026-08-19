import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { optionalBoolean, optionalNumber, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl, compactJson } from "../../core/request.ts";
import { ProviderRequestError, providerUserAgent } from "../provider-runtime.ts";

const taggunApiBaseUrl = "https://api.taggun.io";
const simpleUrlPath = "/api/receipt/v1/simple/url";
const verboseUrlPath = "/api/receipt/v1/verbose/url";
const campaignSettingsListPath = "/api/validation/v1/campaign/settings/list";
const campaignSettingsPath = "/api/validation/v1/campaign/settings";
const campaignReceiptValidationUrlPath = "/api/validation/v1/campaign/receipt-validation/url";

type TaggunActionHandler = ProviderRuntimeHandler<ApiKeyProviderContext>;

export const taggunActionHandlers: ProviderActionHandlers<"taggun", TaggunActionHandler> = {
  extract_receipt_simple_url(input, context) {
    return executeReceiptUrlExtraction(simpleUrlPath, input, context);
  },
  extract_receipt_verbose_url(input, context) {
    return executeReceiptUrlExtraction(verboseUrlPath, input, context);
  },
  async list_campaign_ids(_input, context) {
    const payload = await taggunGetJson(campaignSettingsListPath, context);
    return {
      campaignIds: readCampaignIdList(payload),
    };
  },
  async get_campaign_settings(input, context) {
    const campaignId = requiredString(input.campaignId, "campaignId", providerInputError);
    const settings = requirePayloadObject(
      await taggunGetJson(`${campaignSettingsPath}/${encodeURIComponent(campaignId)}`, context),
    );

    return {
      campaignId,
      settings,
    };
  },
  async validate_receipt_url(input, context) {
    const payload = requirePayloadObject(
      await taggunPostJson(campaignReceiptValidationUrlPath, buildValidationUrlBody(input), context),
    );

    return normalizeValidationPayload(payload);
  },
};

export async function validateTaggunCredential(): Promise<{
  profile: { accountId: string; displayName: string };
  grantedScopes: string[];
  metadata: Record<string, unknown>;
}> {
  return {
    profile: {
      accountId: "taggun",
      displayName: "Taggun API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: taggunApiBaseUrl,
      validationMode: "format_only",
    },
  };
}

async function executeReceiptUrlExtraction(
  path: string,
  input: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<Record<string, unknown>> {
  const payload = requirePayloadObject(await taggunPostJson(path, buildReceiptUrlBody(input), context));
  return normalizeReceiptPayload(payload);
}

async function taggunGetJson(path: string, context: ApiKeyProviderContext): Promise<unknown> {
  return taggunRequestJson(path, {
    method: "GET",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
  });
}

async function taggunPostJson(
  path: string,
  body: Record<string, unknown>,
  context: ApiKeyProviderContext,
): Promise<unknown> {
  return taggunRequestJson(path, {
    method: "POST",
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    signal: context.signal,
    body,
  });
}

async function taggunRequestJson(
  path: string,
  input: {
    method: "GET" | "POST";
    apiKey: string;
    fetcher: typeof fetch;
    signal?: AbortSignal;
    body?: Record<string, unknown>;
  },
): Promise<unknown> {
  let response: Response;
  try {
    response = await input.fetcher(new URL(path, taggunApiBaseUrl), {
      method: input.method,
      headers: taggunHeaders(input.apiKey, input.body ? { "content-type": "application/json" } : {}),
      body: input.body ? JSON.stringify(input.body) : undefined,
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Taggun request failed: ${error.message}` : "Taggun request failed",
    );
  }

  const payload = await readTaggunPayload(response);
  if (!response.ok) {
    throw createTaggunError(response, payload);
  }

  return payload;
}

function taggunHeaders(apiKey: string, extraHeaders: Record<string, string>): Record<string, string> {
  return {
    accept: "application/json",
    apikey: apiKey,
    "user-agent": providerUserAgent,
    ...extraHeaders,
  };
}

async function readTaggunPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Taggun returned invalid JSON");
  }
}

function createTaggunError(response: Response, payload: unknown): ProviderRequestError {
  const message = extractTaggunErrorMessage(payload) ?? response.statusText ?? "Taggun request failed";

  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  if (response.status === 401 || response.status === 403) {
    return new ProviderRequestError(401, message, payload);
  }

  if (response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(response.status, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractTaggunErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return optionalString(record.message) ?? optionalString(record.error) ?? optionalString(record.result);
}

function buildReceiptUrlBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactJson({
    url: readRequiredHttpsUrl(input.url),
    headers: readOptionalHeaders(input.headers),
    extractLineItems: optionalBoolean(input.extractLineItems),
    extractTime: optionalBoolean(input.extractTime),
    ipAddress: optionalString(input.ipAddress),
    near: optionalString(input.near),
    language: optionalString(input.language),
    ignoreMerchantName: optionalString(input.ignoreMerchantName),
    refresh: optionalBoolean(input.refresh),
    incognito: optionalBoolean(input.incognito),
    subAccountId: optionalString(input.subAccountId),
    referenceId: optionalString(input.referenceId),
  }) as Record<string, unknown>;
}

function buildValidationUrlBody(input: Record<string, unknown>): Record<string, unknown> {
  return compactJson({
    url: readRequiredHttpsUrl(input.url),
    campaignId: requiredString(input.campaignId, "campaignId", providerInputError),
    headers: readOptionalHeaders(input.headers),
    referenceId: optionalString(input.referenceId),
    userId: optionalString(input.userId),
    subAccountId: optionalString(input.subAccountId),
    incognito: optionalBoolean(input.incognito),
    ipAddress: optionalString(input.ipAddress),
    near: optionalString(input.near),
    language: optionalString(input.language),
  }) as Record<string, unknown>;
}

function normalizeReceiptPayload(receipt: Record<string, unknown>): Record<string, unknown> {
  return {
    receipt,
    trackingId: optionalString(receipt.trackingId) ?? null,
    confidenceLevel: optionalNumber(receipt.confidenceLevel) ?? null,
    totalAmount: readExtractedNumber(receipt.totalAmount),
    taxAmount: readExtractedNumber(receipt.taxAmount),
    merchantName: readExtractedString(receipt.merchantName),
    merchantCountryCode: readExtractedString(receipt.merchantCountryCode),
    date: readExtractedString(receipt.date),
    rawText: readRawText(receipt.text),
  };
}

function normalizeValidationPayload(validation: Record<string, unknown>): Record<string, unknown> {
  return {
    validation,
    successful: optionalBoolean(validation.successful) ?? null,
    failedValidations: readStringArray(validation.failedValidations),
    passedValidations: readStringArray(validation.passedValidations),
    trackingId: optionalString(validation.trackingId) ?? null,
  };
}

function requirePayloadObject(payload: unknown): Record<string, unknown> {
  const record = optionalRecord(payload);
  if (!record) {
    throw new ProviderRequestError(502, "Taggun returned an invalid payload", payload);
  }
  return record;
}

function readCampaignIdList(payload: unknown): string[] {
  if (!Array.isArray(payload)) {
    throw new ProviderRequestError(502, "Taggun returned an invalid campaign list", payload);
  }

  const campaignIds: string[] = [];
  for (const item of payload) {
    if (typeof item !== "string") {
      throw new ProviderRequestError(502, "Taggun returned an invalid campaign list", payload);
    }
    campaignIds.push(item);
  }
  return campaignIds;
}

function readRequiredHttpsUrl(value: unknown): string {
  const text = requiredString(value, "url", providerInputError);
  const url = assertPublicHttpUrl(text, { fieldName: "url", createError: providerInputError });
  if (url.protocol !== "https:") {
    throw new ProviderRequestError(400, "url must be a public HTTPS URL");
  }
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "url must not include credentials");
  }
  return url.toString();
}

function readOptionalHeaders(value: unknown): Record<string, string> | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }

  const headers = Object.fromEntries(
    Object.entries(record).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  return Object.keys(headers).length > 0 ? headers : undefined;
}

function readExtractedNumber(value: unknown): number | null {
  const record = optionalRecord(value);
  return record ? (optionalNumber(record.data) ?? null) : null;
}

function readExtractedString(value: unknown): string | null {
  const record = optionalRecord(value);
  return record ? (optionalString(record.data) ?? null) : null;
}

function readRawText(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  const record = optionalRecord(value);
  return record ? (optionalString(record.text) ?? optionalString(record.data) ?? null) : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string");
}

function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}
