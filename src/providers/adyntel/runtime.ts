import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext } from "../provider-runtime.ts";

import { optionalInteger, optionalRecord, optionalString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

export interface AdyntelContext extends ApiKeyProviderContext {
  email: string;
}

export const adyntelApiBaseUrl = "https://api.adyntel.com";
export const adyntelMcpSseUrl = "https://mcp.adyntel.com/sse";

const adyntelDefaultRequestTimeoutMs = 65_000;
const adyntelCredentialValidationTimeoutMs = 10_000;

type AdyntelActionHandler = (input: Record<string, unknown>, context: AdyntelContext) => Promise<unknown>;

export interface AdyntelCredentialValidationInput {
  apiKey: string;
  values: Record<string, string>;
}

interface AdyntelCredentialValidationOptions {
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface AdyntelRemoteCredentialValidationInput {
  apiKey: string;
  email: string;
  fetcher: typeof fetch;
  signal?: AbortSignal;
}

interface AdyntelRequestOptions {
  context: AdyntelContext;
  path: string;
  body: Record<string, unknown>;
}

export const adyntelActionHandlers: ProviderActionHandlers<"adyntel", AdyntelActionHandler> = {
  search_meta_ads(input, context) {
    return requestAdSearch(context, input, "/facebook", [
      "company_domain",
      "facebook_url",
      "country_code",
      "continuation_token",
      "media_type",
      "active_status",
    ]);
  },
  search_google_ads(input, context) {
    return requestAdSearch(context, input, "/google", [
      "company_domain",
      "media_type",
      "continuation_token",
      "extract_text",
      "data_provider",
    ]);
  },
  search_linkedin_ads(input, context) {
    return requestAdSearch(context, input, "/linkedin", [
      "company_domain",
      "linkedin_page_id",
      "continuation_token",
      "extract",
      "live_ads",
      "data_provider",
    ]);
  },
  search_tiktok_ads(input, context) {
    return requestAdSearch(context, input, "/tiktok_search", ["keyword", "country_code"]);
  },
  async get_tiktok_ad_details(input, context) {
    const payload = await requestAdyntelJson({
      context,
      path: "/tiktok_ad_details",
      body: pickDefined(input, ["id"]),
    });

    return {
      no_results: payload === null,
      raw: optionalRecord(payload) ?? null,
    };
  },
  async get_domain_keywords(input, context) {
    const payload = await requestAdyntelJson({
      context,
      path: "/domain-keywords",
      body: pickDefined(input, ["company_domain", "language", "limit"]),
    });
    const record = optionalRecord(payload);

    return {
      no_results: payload === null,
      organic: optionalRecord(record?.organic) ?? null,
      organic_percentages: optionalRecord(record?.organic_percentages) ?? null,
      paid: optionalRecord(record?.paid) ?? null,
      paid_percentages: optionalRecord(record?.paid_percentages) ?? null,
      raw: record ?? null,
    };
  },
};

export async function validateAdyntelCredential(
  input: AdyntelCredentialValidationInput,
  options: AdyntelCredentialValidationOptions,
): Promise<CredentialValidationResult> {
  const apiKey = requireAdyntelApiKey(input.apiKey);
  const email = requireAdyntelEmail(input.values.email);
  await validateAdyntelRemoteCredential({
    apiKey,
    email,
    fetcher: options.fetcher,
    signal: options.signal,
  });

  return {
    profile: {
      accountId: `adyntel:${email}`,
      displayName: `Adyntel ${email}`,
    },
    grantedScopes: [],
    metadata: {
      apiBaseUrl: adyntelApiBaseUrl,
      email,
      validationEndpoint: adyntelMcpSseUrl,
      validationMode: "remote_mcp_sse",
    },
  };
}

export function requireAdyntelEmail(value: unknown): string {
  const email = optionalString(value);
  if (!email) {
    throw new ProviderRequestError(400, "Adyntel account email is required");
  }
  return email;
}

async function validateAdyntelRemoteCredential(input: AdyntelRemoteCredentialValidationInput): Promise<void> {
  const timeout = createProviderTimeout(input.signal, adyntelCredentialValidationTimeoutMs);

  try {
    const response = await input.fetcher(adyntelMcpSseUrl, {
      method: "GET",
      headers: {
        accept: "text/event-stream",
        "user-agent": providerUserAgent,
        "x-adyntel-api-key": input.apiKey,
        "x-adyntel-email": input.email,
      },
      signal: timeout.signal,
    });

    if (response.ok) {
      await response.body?.cancel().catch(() => undefined);
      return;
    }

    throw createAdyntelCredentialValidationError(response.status, await response.text().catch(() => ""));
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Adyntel credential validation timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error
        ? `Adyntel credential validation failed: ${error.message}`
        : "Adyntel credential validation failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function requestAdSearch(
  context: AdyntelContext,
  input: Record<string, unknown>,
  path: string,
  fields: string[],
) {
  const payload = await requestAdyntelJson({
    context,
    path,
    body: pickDefined(input, fields),
  });

  return normalizeAdSearchPayload(payload);
}

async function requestAdyntelJson(options: AdyntelRequestOptions): Promise<unknown> {
  const timeout = createProviderTimeout(options.context.signal, adyntelDefaultRequestTimeoutMs);

  try {
    const response = await options.context.fetcher(new URL(options.path, adyntelApiBaseUrl), {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify({
        api_key: options.context.apiKey,
        email: options.context.email,
        ...options.body,
      }),
      signal: timeout.signal,
    });

    if (response.status === 204) {
      return null;
    }

    const payload = await readAdyntelPayload(response);
    if (!response.ok) {
      throw createAdyntelError(response.status, payload);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Adyntel request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Adyntel request failed: ${error.message}` : "Adyntel request failed",
    );
  } finally {
    timeout.cleanup();
  }
}

async function readAdyntelPayload(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim().length === 0) {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Invalid Adyntel response: ${error.message}` : "Invalid Adyntel response",
    );
  }
}

function createAdyntelError(status: number, payload: unknown): ProviderRequestError {
  const message = readAdyntelErrorMessage(payload) ?? `Adyntel request failed with status ${status}`;

  if (status === 402 || status === 429) {
    return new ProviderRequestError(429, message, { status, payload });
  }
  return new ProviderRequestError(status || 500, message, payload);
}

function createAdyntelCredentialValidationError(status: number, text: string): ProviderRequestError {
  const payload = readAdyntelErrorPayload(text);
  const message =
    readAdyntelErrorMessage(payload) ??
    optionalString(payload) ??
    `Adyntel credential validation failed with status ${status}`;
  const normalizedStatus = status === 401 || status === 403 ? 400 : status >= 500 ? 502 : status || 400;
  return new ProviderRequestError(normalizedStatus, message, {
    status,
    endpoint: adyntelMcpSseUrl,
    payload,
  });
}

function readAdyntelErrorPayload(text: string): unknown {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

function readAdyntelErrorMessage(payload: unknown): string | undefined {
  const record = optionalRecord(payload);
  return optionalString(record?.message) ?? optionalString(record?.detail) ?? optionalString(record?.error);
}

function normalizeAdSearchPayload(payload: unknown) {
  const record = optionalRecord(payload);
  return {
    no_results: payload === null,
    ads: extractAds(record),
    continuation_token: optionalString(record?.continuation_token) ?? null,
    page_id: optionalString(record?.page_id) ?? null,
    is_last_page: typeof record?.is_last_page === "boolean" ? record.is_last_page : null,
    number_of_ads: optionalInteger(record?.number_of_ads) ?? null,
    total_ads: optionalInteger(record?.total_ads) ?? null,
    total_ad_count: optionalInteger(record?.total_ad_count) ?? null,
    raw: record ?? null,
  };
}

function extractAds(record: Record<string, unknown> | undefined): Array<Record<string, unknown>> {
  if (!record) {
    return [];
  }

  const ads = record.ads;
  if (Array.isArray(ads)) {
    return ads.flatMap((item) => (optionalRecord(item) ? [item as Record<string, unknown>] : []));
  }

  const data = record.data;
  if (Array.isArray(data)) {
    return data.flatMap((item) => (optionalRecord(item) ? [item as Record<string, unknown>] : []));
  }

  const results = record.results;
  if (!Array.isArray(results)) {
    return [];
  }

  const flattened = results.flatMap((item) => (Array.isArray(item) ? item : [item]));
  return flattened.flatMap((item) => (optionalRecord(item) ? [item as Record<string, unknown>] : []));
}

function requireAdyntelApiKey(value: unknown): string {
  const apiKey = optionalString(value);
  if (!apiKey) {
    throw new ProviderRequestError(400, "apiKey is required");
  }
  return apiKey;
}

function pickDefined(input: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(keys.flatMap((key) => (input[key] === undefined ? [] : [[key, input[key]]])));
}
