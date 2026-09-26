import type { ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord, optionalString as asOptionalString, pickOptionalString } from "../../core/cast.ts";
import { providerUserAgent, ProviderRequestError, withRetryAfterSeconds } from "../provider-runtime.ts";

export const googlecalendarApiBaseUrl = "https://www.googleapis.com/calendar/v3";

export type GooglecalendarQueryValue = string | readonly string[] | undefined;

export interface GooglecalendarRequestInput {
  accessToken: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  method?: string;
  query?: Record<string, GooglecalendarQueryValue>;
  body?: unknown;
  rawBody?: BodyInit;
  headers?: Record<string, string>;
  syncTokenAware?: boolean;
}

const service = "googlecalendar";
const googleDefaultRequestTimeoutMs = 30_000;

export async function googlecalendarJsonRequest<T>(url: string, input: GooglecalendarRequestInput): Promise<T> {
  try {
    const response = await googlecalendarRequest(url, input);
    return (await response.json()) as T;
  } catch (error) {
    throw maybeRewriteSyncTokenError(error, input.syncTokenAware);
  }
}

export async function googlecalendarRequest(url: string, input: GooglecalendarRequestInput): Promise<Response> {
  try {
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
      timeoutMs: googleDefaultRequestTimeoutMs,
      init: requestInit,
    });

    await assertGoogleResponse(response);
    return response;
  } catch (error) {
    throw maybeRewriteSyncTokenError(error, input.syncTokenAware);
  }
}

export function resolveCalendarId(input: Record<string, unknown>): string {
  const calendarId = pickOptionalString(input, "calendarId");
  if (!calendarId) {
    throw new ProviderRequestError(400, "calendarId is required");
  }
  return calendarId;
}

export function resolveEventId(input: Record<string, unknown>): string {
  const eventId = pickOptionalString(input, "eventId");
  if (!eventId) {
    throw new ProviderRequestError(400, "eventId is required");
  }
  return eventId;
}

export function resolveRuleId(input: Record<string, unknown>): string {
  const ruleId = pickOptionalString(input, "ruleId");
  if (!ruleId) {
    throw new ProviderRequestError(400, "ruleId is required");
  }
  return ruleId;
}

export function resolveSettingId(input: Record<string, unknown>): string {
  const settingId = pickOptionalString(input, "settingId");
  if (!settingId) {
    throw new ProviderRequestError(400, "settingId is required");
  }
  return settingId;
}

function maybeRewriteSyncTokenError(error: unknown, syncTokenAware?: boolean): unknown {
  if (syncTokenAware && error instanceof ProviderRequestError && error.status === 410) {
    return new ProviderRequestError(400, "syncToken expired; retry without syncToken for a full resync", error.details);
  }

  return error;
}

async function googleFetchWithTimeout(
  url: string | URL,
  input: {
    fetcher: ProviderFetch;
    timeoutMs?: number;
    init?: RequestInit;
  },
): Promise<Response> {
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
    if (didTimeout && error instanceof DOMException && error.name === "AbortError") {
      throw new ProviderRequestError(
        502,
        `${service} request timed out after ${Math.max(1, Math.ceil(timeoutMs / 1000))} seconds`,
      );
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

async function assertGoogleResponse(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }

  const { message, details } = await extractGoogleError(response);
  throw new ProviderRequestError(response.status, message, withRetryAfterSeconds(response, details));
}

async function extractGoogleError(response: Response): Promise<{ message: string; details: unknown }> {
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
    const message = asOptionalString(error?.message) ?? asOptionalString(parsed.error_description) ?? rawText;
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
