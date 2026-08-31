import type { ProviderFetch } from "./provider-runtime.ts";

import { optionalRecord, optionalString } from "../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerUserAgent,
  ProviderRequestError,
} from "./provider-runtime.ts";

export type GoogleQueryValue = string | readonly string[] | undefined;

const defaultService = "googledrive";
const googleDefaultRequestTimeoutMs = 30_000;

export interface GoogleRequestOptions {
  accessToken: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  method?: string;
  query?: Record<string, GoogleQueryValue>;
  body?: unknown;
  rawBody?: BodyInit;
  headers?: Record<string, string>;
  /**
   * Request timeout as a positive number of milliseconds; defaults to 30 seconds. There is no
   * "no timeout" value: callers that need longer than the default pass a larger positive number.
   */
  timeoutMs?: number;
  /**
   * Provider slug used in the fallback error messages this module generates itself.
   * Defaults to Google Drive so existing callers keep their current wording.
   */
  service?: string;
}

export async function googleJsonRequest<T>(url: string, input: GoogleRequestOptions): Promise<T> {
  const response = await googleRequest(url, input);
  return (await response.json()) as T;
}

export async function googleRequest(url: string, input: GoogleRequestOptions): Promise<Response> {
  const service = input.service ?? defaultService;
  const target = new URL(url);
  for (const [key, value] of Object.entries(input.query ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) {
        target.searchParams.append(key, item);
      }
      continue;
    }
    if (typeof value === "string") {
      target.searchParams.set(key, value);
    }
  }

  const headers = {
    authorization: `Bearer ${input.accessToken}`,
    "user-agent": providerUserAgent,
    ...(input.headers ?? {}),
  };
  const hasJsonBody = input.rawBody == null && input.body !== undefined;
  const hasRequestBody = input.rawBody != null || hasJsonBody;
  const method = (input.method ?? (hasRequestBody ? "POST" : "GET")).toUpperCase();
  if ((method === "GET" || method === "HEAD") && hasRequestBody) {
    throw new ProviderRequestError(400, `${service} ${method} request must not include a body`);
  }

  const requestInit: RequestInit = {
    method,
    headers:
      hasJsonBody && !hasContentTypeHeader(headers)
        ? {
            ...headers,
            "content-type": "application/json",
          }
        : headers,
    ...(input.rawBody != null ? { body: input.rawBody } : hasJsonBody ? { body: JSON.stringify(input.body) } : {}),
  };
  const timeoutMs = input.timeoutMs ?? googleDefaultRequestTimeoutMs;
  const timeout = createProviderTimeout(input.signal, timeoutMs);
  let response: Response;
  try {
    response = await input.fetcher(target.toString(), { ...requestInit, signal: timeout.signal });
  } catch (error) {
    if (timeout.didTimeout() && isAbortLikeError(error)) {
      const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
      const unit = timeoutSeconds === 1 ? "second" : "seconds";
      throw new ProviderRequestError(502, `${service} request timed out after ${timeoutSeconds} ${unit}`);
    }
    throw error;
  } finally {
    timeout.cleanup();
  }

  await assertGoogleResponse(response, service);
  return response;
}

function hasContentTypeHeader(headers: Record<string, string>): boolean {
  return Object.keys(headers).some((key) => key.toLowerCase() === "content-type");
}

async function assertGoogleResponse(response: Response, service: string): Promise<void> {
  if (response.ok) {
    return;
  }

  const { message, details } = await extractGoogleError(response, service);
  throw new ProviderRequestError(response.status, message, details);
}

async function extractGoogleError(response: Response, service: string): Promise<{ message: string; details: unknown }> {
  const rawText = await response.text().catch(() => "");
  if (!rawText) {
    return {
      message: `${service} request failed with ${response.status}`,
      details: { status: response.status },
    };
  }

  try {
    const parsed = JSON.parse(rawText) as Record<string, unknown>;
    const error = optionalRecord(parsed.error);
    const message = optionalString(error?.message) ?? optionalString(parsed.error_description) ?? rawText;
    return {
      message,
      details: parsed,
    };
  } catch {
    return {
      message: rawText,
      details: rawText,
    };
  }
}
