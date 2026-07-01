import type { CredentialValidators, ExecutionContext, ProviderExecutors } from "../../core/types.ts";
import type { ApiflashActionName } from "./actions.ts";

import { optionalBoolean, optionalInteger, optionalRecord, optionalString, compactObject } from "../../core/cast.ts";
import { assertPublicHttpUrl } from "../../core/request.ts";
import {
  defineProviderExecutors,
  providerUserAgent,
  ProviderRequestError,
  requireApiKeyCredential,
} from "../provider-runtime.ts";

const service = "apiflash";
const apiflashApiBaseUrl = "https://api.apiflash.com";
const apiflashScreenshotPath = "/v1/urltoimage";
const apiflashQuotaPath = "/v1/urltoimage/quota";

type ApiflashQueryValue = boolean | number | string | undefined;
type ApiflashRequestPhase = "validate" | "execute";

interface ApiflashActionContext {
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

type ApiflashActionHandler = (input: Record<string, unknown>, context: ApiflashActionContext) => Promise<unknown>;

export const apiflashActionHandlers: Record<ApiflashActionName, ApiflashActionHandler> = {
  capture_website_screenshot(input, context) {
    return captureApiflashWebsiteScreenshot(input, context);
  },
  get_quota_information(_input, context) {
    return getApiflashQuotaInformation(context);
  },
  get_screenshot_metadata(input, context) {
    return getApiflashScreenshotMetadata(input, context);
  },
};

export const executors: ProviderExecutors = defineProviderExecutors<ApiflashActionContext>({
  service,
  handlers: apiflashActionHandlers,
  async createContext(context: ExecutionContext, fetcher: typeof fetch): Promise<ApiflashActionContext> {
    const credential = await requireApiKeyCredential(context, service);
    return {
      apiKey: credential.apiKey,
      fetcher,
      signal: context.signal,
    };
  },
});

export const credentialValidators: CredentialValidators = {
  async apiKey(input, { fetcher, signal }) {
    const payload = await requestApiflash({
      path: apiflashQuotaPath,
      apiKey: input.apiKey,
      fetcher,
      signal,
      phase: "validate",
    });
    const quota = parseApiflashQuotaPayload(payload);
    return {
      profile: {
        accountId: "api_key",
        displayName: "ApiFlash Access Key",
      },
      grantedScopes: [],
      metadata: compactObject({
        validationEndpoint: apiflashQuotaPath,
        apiBaseUrl: apiflashApiBaseUrl,
        quotaLimit: quota.limit,
        quotaRemaining: quota.remaining,
        quotaReset: quota.reset,
      }),
    };
  },
};

async function captureApiflashWebsiteScreenshot(
  input: Record<string, unknown>,
  context: ApiflashActionContext,
): Promise<unknown> {
  validateCaptureInput(input);
  const response = await fetchApiflash({
    path: apiflashScreenshotPath,
    apiKey: context.apiKey,
    query: buildCaptureQuery(input),
    fetcher: context.fetcher,
    signal: context.signal,
  });
  const payload = await readApiflashPayload(response);
  if (!response.ok) {
    throw createApiflashError(response, payload, "execute");
  }

  const record = requireObject(payload, "apiflash capture response must be an object");
  const screenshotUrl = optionalString(record.url);
  if (!screenshotUrl) {
    throw new ProviderRequestError(502, "apiflash capture response did not include screenshot url", payload);
  }

  return compactObject({
    url: screenshotUrl,
    extracted_html: optionalString(record.extracted_html),
    extracted_text: optionalString(record.extracted_text),
    quota: readApiflashQuotaHeaders(response.headers),
  });
}

async function getApiflashQuotaInformation(context: ApiflashActionContext): Promise<unknown> {
  return parseApiflashQuotaPayload(
    await requestApiflash({
      path: apiflashQuotaPath,
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      signal: context.signal,
      phase: "execute",
    }),
  );
}

async function getApiflashScreenshotMetadata(
  input: Record<string, unknown>,
  context: ApiflashActionContext,
): Promise<unknown> {
  const screenshotUrl = optionalString(input.url);
  if (!screenshotUrl) {
    throw new ProviderRequestError(400, "url is required");
  }
  const publicUrl = assertPublicHttpUrl(screenshotUrl, {
    fieldName: "url",
    createError: (message) => new ProviderRequestError(400, message),
  });

  const response = await context.fetcher(publicUrl, {
    method: "HEAD",
    headers: apiflashHeaders(),
    signal: context.signal,
  });
  if (!response.ok) {
    const payload = await readApiflashPayload(response);
    throw createApiflashMetadataError(response, payload);
  }

  return compactObject({
    url: publicUrl.toString(),
    content_type: response.headers.get("content-type") ?? undefined,
    content_length: readHeaderInteger(response.headers, "content-length"),
    etag: response.headers.get("etag") ?? undefined,
    last_modified: response.headers.get("last-modified") ?? undefined,
    cache_control: response.headers.get("cache-control") ?? undefined,
  });
}

async function requestApiflash(input: {
  path: string;
  apiKey: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
  phase: ApiflashRequestPhase;
}): Promise<unknown> {
  const response = await fetchApiflash(input);
  const payload = await readApiflashPayload(response);
  if (!response.ok) {
    throw createApiflashError(response, payload, input.phase);
  }
  return payload;
}

async function fetchApiflash(input: {
  path: string;
  apiKey: string;
  query?: Record<string, ApiflashQueryValue>;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}): Promise<Response> {
  try {
    return await input.fetcher(buildApiflashUrl(input.path, input.apiKey, input.query), {
      headers: apiflashHeaders(),
      signal: input.signal,
    });
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `ApiFlash request failed: ${error.message}` : "ApiFlash request failed",
    );
  }
}

function buildCaptureQuery(input: Record<string, unknown>): Record<string, ApiflashQueryValue> {
  return compactObject({
    url: optionalString(input.url),
    response_type: "json",
    fresh: optionalBoolean(input.fresh),
    ttl: optionalInteger(input.ttl),
    full_page: optionalBoolean(input.full_page),
    scroll_page: optionalBoolean(input.scroll_page),
    width: optionalInteger(input.width),
    height: optionalInteger(input.height),
    delay: optionalInteger(input.delay),
    wait_for: optionalString(input.wait_for),
    wait_until: optionalString(input.wait_until),
    element: optionalString(input.element),
    element_overlap: optionalBoolean(input.element_overlap),
    format: optionalString(input.format),
    quality: optionalInteger(input.quality),
    transparent: optionalBoolean(input.transparent),
    extract_html: optionalBoolean(input.extract_html),
    extract_text: optionalBoolean(input.extract_text),
    accept_language: optionalString(input.accept_language),
    user_agent: optionalString(input.user_agent),
    headers: optionalString(input.headers),
    cookies: optionalString(input.cookies),
    fail_on_status: optionalString(input.fail_on_status),
    no_ads: optionalBoolean(input.no_ads),
    no_tracking: optionalBoolean(input.no_tracking),
    no_cookie_banners: optionalBoolean(input.no_cookie_banners),
  });
}

function buildApiflashUrl(
  path: string,
  apiKey: string,
  query: Record<string, ApiflashQueryValue> = {},
): URL {
  const url = new URL(path, apiflashApiBaseUrl);
  url.searchParams.set("access_key", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function apiflashHeaders(): Record<string, string> {
  return {
    "user-agent": providerUserAgent,
  };
}

function parseApiflashQuotaPayload(payload: unknown): Record<string, number> {
  const record = requireObject(payload, "apiflash quota response must be an object");
  const limit = optionalInteger(record.limit);
  const remaining = optionalInteger(record.remaining);
  const reset = optionalInteger(record.reset);
  if (limit === undefined || remaining === undefined || reset === undefined) {
    throw new ProviderRequestError(502, "apiflash quota response is missing required fields", payload);
  }

  return {
    limit,
    remaining,
    reset,
  };
}

function readApiflashQuotaHeaders(headers: Headers): Record<string, number> | undefined {
  const limit = readHeaderInteger(headers, "X-Quota-Limit");
  const remaining = readHeaderInteger(headers, "X-Quota-Remaining");
  const reset = readHeaderInteger(headers, "X-Quota-Reset");
  if (limit === undefined && remaining === undefined && reset === undefined) {
    return undefined;
  }

  return compactObject({
    limit,
    remaining,
    reset,
  });
}

function readHeaderInteger(headers: Headers, key: string): number | undefined {
  const rawValue = headers.get(key);
  if (!rawValue) {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

async function readApiflashPayload(response: Response): Promise<unknown> {
  const text = await response.text().catch(() => "");
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createApiflashError(
  response: Response,
  payload: unknown,
  phase: ApiflashRequestPhase,
): ProviderRequestError {
  const message =
    extractApiflashErrorMessage(payload) ??
    response.statusText ??
    `apiflash request failed with ${response.status}`;

  if (response.status === 429 || response.status === 402) {
    return new ProviderRequestError(429, message, payload);
  }
  if (phase === "validate" && response.status === 401) {
    return new ProviderRequestError(400, message, payload);
  }
  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(401, message, payload);
  }
  if (response.status === 400) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 403) {
    return new ProviderRequestError(403, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function createApiflashMetadataError(response: Response, payload: unknown): ProviderRequestError {
  const message =
    extractApiflashErrorMessage(payload) ??
    response.statusText ??
    `apiflash screenshot metadata request failed with ${response.status}`;

  if (response.status === 404) {
    return new ProviderRequestError(400, message, payload);
  }
  if (response.status === 429) {
    return new ProviderRequestError(429, message, payload);
  }

  return new ProviderRequestError(response.status || 500, message, payload);
}

function extractApiflashErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string" && payload.trim()) {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  return (
    optionalString(record.message) ??
    optionalString(record.error) ??
    optionalString(record.error_message) ??
    optionalString(record.type)
  );
}

function validateCaptureInput(input: Record<string, unknown>): void {
  if (optionalBoolean(input.element_overlap) === true && !optionalString(input.element)) {
    throw new ProviderRequestError(400, "element_overlap requires element");
  }
  if (optionalBoolean(input.transparent) === true && optionalString(input.format) !== "png") {
    throw new ProviderRequestError(400, "transparent capture requires format=png");
  }
}

function requireObject(value: unknown, message: string): Record<string, unknown> {
  const record = optionalRecord(value);
  if (record) {
    return record;
  }
  throw new ProviderRequestError(502, message, value);
}
