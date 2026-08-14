import type { ProviderFetch } from "./provider-runtime.ts";

import { optionalRecord, optionalString } from "../core/cast.ts";
import { providerUserAgent, ProviderRequestError } from "./provider-runtime.ts";

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
  timeoutMs?: number;
  /**
   * Provider slug used in the fallback error messages this module generates itself.
   * Defaults to Google Drive so existing callers keep their current wording.
   */
  service?: string;
}

interface GoogleFetchOptions {
  fetcher: ProviderFetch;
  timeoutMs?: number;
  init?: RequestInit;
  service: string;
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
    signal: input.signal,
    ...(input.rawBody != null ? { body: input.rawBody } : hasJsonBody ? { body: JSON.stringify(input.body) } : {}),
  };
  const response = await googleFetchWithTimeout(target.toString(), {
    fetcher: input.fetcher,
    timeoutMs: input.timeoutMs ?? googleDefaultRequestTimeoutMs,
    init: requestInit,
    service,
  });

  await assertGoogleResponse(response, service);
  return response;
}

async function googleFetchWithTimeout(url: string | URL, input: GoogleFetchOptions): Promise<Response> {
  const timeoutMs = input.timeoutMs ?? googleDefaultRequestTimeoutMs;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return input.fetcher(url, input.init);
  }

  const controller = new AbortController();
  const parentSignal = input.init?.signal;
  let didTimeout = false;
  const timeoutHandle = globalThis.setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);
  const abortFromParent = (): void => controller.abort(parentSignal?.reason);
  if (parentSignal) {
    if (parentSignal.aborted) {
      abortFromParent();
    } else {
      parentSignal.addEventListener("abort", abortFromParent, { once: true });
    }
  }

  try {
    return await input.fetcher(url, {
      ...(input.init ?? {}),
      signal: controller.signal,
    });
  } catch (error) {
    if (didTimeout && isAbortLikeError(error)) {
      const timeoutSeconds = Math.max(1, Math.ceil(timeoutMs / 1000));
      const unit = timeoutSeconds === 1 ? "second" : "seconds";
      throw new ProviderRequestError(502, `${input.service} request timed out after ${timeoutSeconds} ${unit}`);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutHandle);
    if (parentSignal) {
      parentSignal.removeEventListener("abort", abortFromParent);
    }
  }
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

function isAbortLikeError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}
