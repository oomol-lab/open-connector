import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalInteger, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export const zyteApiBaseUrl = "https://api.zyte.com/v1";
const zyteApiExtractPath = "/extract";
const zyteApiTimeoutMs = 60_000;

type ZyteApiPhase = "validate" | "execute";
type ZyteApiExtractField = "article" | "browserHtml" | "pageContent" | "product";
type ZyteApiActionHandler = ProviderRuntimeHandler<ZyteApiContext>;

export interface ZyteApiContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

export const zyteApiActionHandlers: ProviderActionHandlers<"zyte_api", ZyteApiActionHandler> = {
  async fetch_browser_html(input, context) {
    const payload = await requestZyteApiJson(
      compactObject({
        url: readTargetUrl(input.url),
        browserHtml: true,
        ipType: optionalString(input.ipType),
      }),
      context,
      "execute",
    );
    return normalizeTextExtractResponse(payload, "browserHtml");
  },
  extract_product(input, context) {
    return executeStructuredExtract(input, context, "product", "productOptions");
  },
  extract_article(input, context) {
    return executeStructuredExtract(input, context, "article", "articleOptions");
  },
  extract_page_content(input, context) {
    return executeStructuredExtract(input, context, "pageContent", "pageContentOptions");
  },
};

export async function validateZyteApiCredential(
  apiKeyInput: string,
  fetcher: typeof fetch,
  signal?: AbortSignal,
): Promise<CredentialValidationResult> {
  const apiKey = requiredString(apiKeyInput, "apiKey", (message) => new ProviderRequestError(400, message));
  await requestZyteApiJson({}, { apiKey, fetcher, signal }, "validate");

  return {
    profile: {
      accountId: "zyte_api:api_key",
      displayName: "Zyte API Key",
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: zyteApiBaseUrl,
      validationEndpoint: zyteApiExtractPath,
      validationStrategy: "invalid_request_auth_check",
    },
  };
}

async function executeStructuredExtract(
  input: Record<string, unknown>,
  context: ZyteApiContext,
  field: Exclude<ZyteApiExtractField, "browserHtml">,
  optionsField: string,
): Promise<unknown> {
  const extractFrom = optionalString(input.extractFrom);
  const payload = await requestZyteApiJson(
    compactObject({
      url: readTargetUrl(input.url),
      [field]: true,
      ipType: optionalString(input.ipType),
      [optionsField]: extractFrom ? { extractFrom } : undefined,
    }),
    context,
    "execute",
  );
  return normalizeObjectExtractResponse(payload, field);
}

async function requestZyteApiJson(
  body: Record<string, unknown>,
  context: ZyteApiContext,
  phase: ZyteApiPhase,
): Promise<unknown> {
  const timeout = createProviderTimeout(context.signal, zyteApiTimeoutMs);
  let response: Response;
  try {
    response = await context.fetcher(`${zyteApiBaseUrl}${zyteApiExtractPath}`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: buildBasicAuthorization(context.apiKey),
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(body),
      signal: timeout.signal,
    });
  } catch (error) {
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Zyte API request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Zyte API request failed: ${error.message}` : "Zyte API request failed",
      error,
    );
  } finally {
    timeout.cleanup();
  }

  const payload = await readZyteApiPayload(response);
  if (!response.ok) {
    if (phase === "validate" && response.status === 400) {
      return payload;
    }
    throw createZyteApiError(response.status, payload, phase);
  }
  return payload;
}

function normalizeTextExtractResponse(payload: unknown, field: "browserHtml"): Record<string, unknown> {
  const record = readObject(payload);
  const value = optionalString(record[field]);
  if (value === undefined) {
    throw new ProviderRequestError(502, `Zyte API extract response did not include ${field}`);
  }
  return compactObject({
    url: readRequiredOutputString(record.url, "url"),
    statusCode: optionalInteger(record.statusCode),
    [field]: value,
  });
}

function normalizeObjectExtractResponse(
  payload: unknown,
  field: Exclude<ZyteApiExtractField, "browserHtml">,
): Record<string, unknown> {
  const record = readObject(payload);
  const value = optionalRecord(record[field]);
  if (!value) {
    throw new ProviderRequestError(502, `Zyte API extract response did not include ${field}`);
  }
  return compactObject({
    url: readRequiredOutputString(record.url, "url"),
    statusCode: optionalInteger(record.statusCode),
    [field]: value,
  });
}

async function readZyteApiPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "Zyte API returned invalid JSON");
  }
}

function createZyteApiError(status: number, payload: unknown, phase: ZyteApiPhase): ProviderRequestError {
  const message = extractZyteApiMessage(payload) ?? `Zyte API request failed with ${status || 500}`;
  if (status === 429 || status === 503) {
    return new ProviderRequestError(status, message, payload);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message, payload);
  }
  if (status === 401 || status === 403) {
    return new ProviderRequestError(401, message, payload);
  }
  if ([400, 421, 422, 451].includes(status)) {
    return new ProviderRequestError(400, message, payload);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status || 502, message, payload);
}

function extractZyteApiMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return optionalString(record?.detail) ?? optionalString(record?.title) ?? optionalString(record?.type);
}

function readTargetUrl(value: unknown): string {
  const rawUrl = requiredString(value, "url", (message) => new ProviderRequestError(400, message));
  const url = assertPublicHttpUrl(rawUrl, {
    fieldName: "url",
    createError: (message) => new ProviderRequestError(400, message),
  });
  if (url.username || url.password) {
    throw new ProviderRequestError(400, "url must not include credentials");
  }
  return url.toString();
}

function readObject(value: unknown): Record<string, unknown> {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, "Zyte API returned an invalid object payload");
  }
  return record;
}

function readRequiredOutputString(value: unknown, fieldName: string): string {
  const text = optionalString(value);
  if (text === undefined) {
    throw new ProviderRequestError(502, `Zyte API extract response did not include ${fieldName}`);
  }
  return text;
}

function buildBasicAuthorization(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}
