import type { CredentialValidationResult } from "../../core/types.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalBoolean, optionalInteger, optionalNumber, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  ProviderRequestError,
  providerUserAgent,
  requiredResponseRecord,
} from "../provider-runtime.ts";

const screenshotbaseApiBaseUrl = "https://api.screenshotbase.com";

const screenshotbaseStatusPath = "/v1/status";
const screenshotbaseTakePath = "/v1/take";
const screenshotbaseRequestTimeoutMs = 95_000;

type ScreenshotbaseRequestPhase = "validate" | "execute";

interface ScreenshotbaseRequestInput {
  readonly path: string;
  readonly query?: Record<string, unknown>;
  readonly apiKey: string;
  readonly fetcher: typeof fetch;
  readonly phase: ScreenshotbaseRequestPhase;
}

export const screenshotbaseActionHandlers: Record<
  string,
  (input: Record<string, unknown>, context: ApiKeyProviderContext) => Promise<unknown>
> = {
  get_quota_status(_input, context) {
    return getQuotaStatus(context, "execute");
  },
  async take_screenshot(input, context) {
    const payload = await requestScreenshotbaseJson({
      path: screenshotbaseTakePath,
      query: buildTakeScreenshotQuery(input),
      apiKey: context.apiKey,
      fetcher: context.fetcher,
      phase: "execute",
    });
    const url = optionalString(payload.url);
    if (!url) {
      throw new ProviderRequestError(502, "screenshotbase capture response did not include url");
    }
    return { url };
  },
};

export async function validateScreenshotbaseCredential(
  input: { apiKey: string },
  fetcher: typeof fetch,
): Promise<CredentialValidationResult> {
  const status = await getQuotaStatus({ apiKey: input.apiKey, fetcher }, "validate");
  const accountId = status.accountId;

  return {
    profile: {
      accountId: accountId == null ? undefined : String(accountId),
      displayName: accountId == null ? "screenshotbase API Key" : `screenshotbase ${accountId}`,
    },
    metadata: {
      apiBaseUrl: screenshotbaseApiBaseUrl,
      validationEndpoint: screenshotbaseStatusPath,
      accountId,
      quotas: {
        month: status.month,
        grace: status.grace,
      },
    },
  };
}

async function getQuotaStatus(context: ApiKeyProviderContext, phase: ScreenshotbaseRequestPhase) {
  const payload = await requestScreenshotbaseJson({
    path: screenshotbaseStatusPath,
    apiKey: context.apiKey,
    fetcher: context.fetcher,
    phase,
  });
  const quotas = requiredResponseRecord(payload.quotas, "quotas");

  return {
    accountId: readNullableInteger(payload.account_id),
    month: normalizeQuotaBucket(quotas.month, "quotas.month"),
    grace: quotas.grace == null ? null : normalizeQuotaBucket(quotas.grace, "quotas.grace"),
  };
}

function buildTakeScreenshotQuery(input: Record<string, unknown>) {
  return {
    url: optionalString(input.url),
    format: optionalString(input.format),
    quality: optionalInteger(input.quality),
    full_page: optionalBoolean(input.fullPage),
    viewport_width: optionalInteger(input.viewportWidth),
    viewport_height: optionalInteger(input.viewportHeight),
    device_scale_factor: optionalNumber(input.deviceScaleFactor),
    ip_country_code: optionalString(input.ipCountryCode),
    delay: optionalInteger(input.delay),
    timeout: optionalInteger(input.timeout),
    wait_until: optionalString(input.waitUntil),
    block_cookie_banners: optionalBoolean(input.blockCookieBanners),
    block_ads: optionalBoolean(input.blockAds),
    block_chats: optionalBoolean(input.blockChats),
    hide_selectors: Array.isArray(input.hideSelectors) ? input.hideSelectors : undefined,
    styles: optionalString(input.styles),
    attachment_name: optionalString(input.attachmentName),
    upload: true,
  };
}

async function requestScreenshotbaseJson(input: ScreenshotbaseRequestInput) {
  const timeoutHandle = createProviderTimeout(undefined, screenshotbaseRequestTimeoutMs);

  try {
    const response = await input.fetcher(buildScreenshotbaseUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        apikey: input.apiKey,
        "user-agent": providerUserAgent,
      },
      signal: timeoutHandle.signal,
    });
    const payload = await readScreenshotbasePayload(response);
    if (!response.ok) {
      throw createScreenshotbaseError(response.status, payload, input.phase);
    }
    return requiredResponseRecord(payload, "response");
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutHandle.didTimeout() || isAbortError(error)) {
      throw new ProviderRequestError(504, "screenshotbase request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `screenshotbase request failed: ${error.message}` : "screenshotbase request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function buildScreenshotbaseUrl(path: string, query?: Record<string, unknown>) {
  const url = new URL(path, screenshotbaseApiBaseUrl);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value == null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        url.searchParams.append(`${key}[]`, String(item));
      }
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function readScreenshotbasePayload(response: Response) {
  const text = await response.text().catch(() => "");
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function createScreenshotbaseError(status: number, payload: unknown, phase: ScreenshotbaseRequestPhase) {
  const message = extractErrorMessage(payload) ?? `screenshotbase request failed with ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && (status === 401 || status === 403)) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(401, message);
  }
  if (status === 400 || status === 422) {
    return new ProviderRequestError(400, message);
  }
  if (status === 408) {
    return new ProviderRequestError(504, message);
  }
  return new ProviderRequestError(status >= 500 ? 502 : status, message);
}

function normalizeQuotaBucket(value: unknown, fieldName: string) {
  const bucket = requiredResponseRecord(value, fieldName);
  return {
    total: requireInteger(bucket.total, `${fieldName}.total`),
    used: requireInteger(bucket.used, `${fieldName}.used`),
    remaining: requireInteger(bucket.remaining, `${fieldName}.remaining`),
  };
}

function requireInteger(value: unknown, fieldName: string) {
  if (!Number.isInteger(value)) {
    throw new ProviderRequestError(502, `${fieldName} must be an integer`);
  }
  return value as number;
}

function readNullableInteger(value: unknown) {
  return Number.isInteger(value) ? (value as number) : null;
}

function extractErrorMessage(payload: unknown) {
  if (typeof payload === "string") {
    return payload.trim() || undefined;
  }
  const object = optionalRecord(payload);
  const error = optionalRecord(object?.error);
  return optionalString(object?.message) ?? optionalString(error?.message);
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
