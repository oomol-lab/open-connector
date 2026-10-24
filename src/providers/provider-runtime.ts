import type { ProviderErrorCode } from "../core/provider-error-codes.ts";
import type { ProviderDispatchContext, ProviderHttpDispatchOptions } from "../core/provider-http-dispatch.ts";
import type { ProviderNetworkPolicy } from "../core/provider-network-policy.ts";
import type { ExecutionResult } from "../core/types.ts";

import { Buffer } from "node:buffer";
import {
  CastError,
  optionalRecord,
  optionalString,
  requiredNumber,
  requiredRecord,
  requiredString,
} from "../core/cast.ts";
import { createGuardedFetch } from "../core/guarded-fetch.ts";
import {
  dispatchProviderHttpAttempt,
  ProviderHttpDispatchError,
  runWithProviderHttpDispatch,
} from "../core/provider-http-dispatch.ts";
import { readBoundedResponseBytes } from "../core/request.ts";

/**
 * Fetch-compatible function accepted by provider runtime helpers and tests.
 */
export type ProviderFetch = typeof fetch;

export interface ProviderFetchOptions {
  /** Bind runtime policy; private targets still require the transport's allowPrivateNetwork opt-in. */
  network?: ProviderNetworkPolicy;
  /** Base transport; defaults to the global fetch. A guarded fetch is unwrapped so guards never stack. */
  fetch?: ProviderFetch;
  /** Opt into runtime private-network permission with isPrivateNetworkAccessAllowed; omitted keeps targets public-only. */
  allowPrivateNetwork?: () => boolean;
  /**
   * Skip the DNS resolved-address check (URL and redirect guards still apply).
   * Only pass for providers whose egress host is a hardcoded literal, never
   * derived from user/credential input. See {@link GuardedFetchOptions.skipDnsValidation}.
   */
  skipDnsValidation?: boolean;
  /** Additional credential-bearing headers to strip from cross-origin redirects. */
  additionalSensitiveHeaders?: readonly string[];
}

/**
 * Create the SSRF-guarded fetch used for all provider egress: the request URL,
 * every redirect hop, and (when DNS is available) every resolved address are
 * validated against the shared public-URL policy, so a provider-reachable URL
 * cannot redirect or resolve into loopback/link-local/metadata/private targets.
 */
export function createProviderFetch(options: ProviderFetchOptions = {}): ProviderFetch {
  return createGuardedFetch({
    network: options.network,
    dispatchAttempt: async (attempt, signal, transport, revalidate) => {
      try {
        return await dispatchProviderHttpAttempt(attempt, signal, transport, revalidate);
      } catch (error) {
        if (error instanceof ProviderHttpDispatchError) throw new ProviderDispatchRequestError(error.retryAfterSeconds);
        throw error;
      }
    },
    fetch: options.fetch,
    allowPrivateNetwork: options.allowPrivateNetwork,
    skipDnsValidation: options.skipDnsValidation,
    additionalSensitiveHeaders: options.additionalSensitiveHeaders,
    mapTransportError: (error) =>
      error instanceof TypeError
        ? new ProviderRequestError(502, `provider network request failed${describeTransportCauseCode(error)}`)
        : error,
    createError: (message) => new ProviderRequestError(502, message),
  });
}

/**
 * Shared public-only SSRF-guarded fetch for provider egress. Providers that
 * issue their own requests (custom proxy executors, context builders) must use
 * this instead of the global fetch.
 *
 * It is also receiver-safe: provider runtimes commonly store the fetcher on a
 * context object and call `context.fetcher(...)`, which would forward the
 * context as `this` to the Workers-native fetch and trigger an Illegal
 * invocation error. This wrapper closes over the platform call lexically, so
 * the native fetch is always invoked without a stray receiver.
 */
export const providerFetch: ProviderFetch = createProviderFetch();

/** Preserve admission denials at the shared runtime boundary despite provider-specific error mapping. */
export async function withProviderHttpDispatchResult<T>(
  context: ProviderDispatchContext,
  run: () => T | Promise<T>,
  options?: ProviderHttpDispatchOptions,
): Promise<T> {
  try {
    return await runWithProviderHttpDispatch(context, run, options);
  } catch (error) {
    if (error instanceof ProviderHttpDispatchError) throw new ProviderDispatchRequestError(error.retryAfterSeconds);
    throw error;
  }
}

/**
 * Default User-Agent sent by local provider executors.
 */
export const providerUserAgent = "oomol-connect/0.1";

/**
 * Error raised for provider API responses and mapped to stable execution errors.
 */
export class ProviderRequestError extends Error {
  readonly status: number;
  readonly details?: unknown;
  readonly code?: ProviderErrorCode;

  constructor(status: number, message: string, details?: unknown, code?: ProviderErrorCode) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

/** A dispatch denial is retryable and must not be wrapped as a bad provider credential. */
export class ProviderDispatchRequestError extends ProviderRequestError {
  constructor(retryAfterSeconds?: number) {
    super(429, "Provider HTTP dispatch is temporarily unavailable.", { retryAfterSeconds }, "rate_limited");
  }
}

/**
 * Return the 400 error providers throw for invalid action input or credentials.
 * The message is surfaced verbatim as the `invalid_input` execution error.
 */
export function providerInputError(message: string): ProviderRequestError {
  return new ProviderRequestError(400, message);
}

/**
 * Return the 502 error providers throw for an upstream response they cannot
 * use. The message is surfaced verbatim as the `provider_error` execution error.
 */
export function providerResponseError(message: string): ProviderRequestError {
  return new ProviderRequestError(502, message);
}

/**
 * Read a required string action input, raising the 400 error providers map
 * missing or blank fields to. Example: `requiredInputString(" x ", "name") => "x"`;
 * `requiredInputString("", "name")` throws `name is required.`.
 */
export function requiredInputString(value: unknown, fieldName: string): string {
  return requiredString(value, fieldName, providerInputError);
}

/**
 * Read a required number action input, raising the 400 error providers map
 * missing or non-numeric fields to. Example: `requiredInputNumber(1.5, "weight") => 1.5`;
 * `requiredInputNumber("x", "weight")` throws `weight must be a number`.
 */
export function requiredInputNumber(value: unknown, fieldName: string): number {
  return requiredNumber(value, fieldName, providerInputError);
}

/**
 * Read a record out of an upstream response, raising the 502 error providers
 * map malformed payloads to. Example: `requiredResponseRecord([], "payload")`
 * throws `payload must be an object`.
 */
export function requiredResponseRecord(value: unknown, label: string): Record<string, unknown> {
  return requiredRecord(value, label, providerResponseError);
}

export interface ProviderTimeout {
  signal: AbortSignal;
  didTimeout(): boolean;
  cleanup(): void;
}

export const defaultProviderJsonMaxResponseBytes: number = 20 * 1024 * 1024;

const defaultProviderErrorMaxResponseBytes = 64 * 1024;

/** Shared request budget for native AbortSignal and SDK timeout APIs. */
export const defaultProviderRequestTimeoutMs = 30_000;

/**
 * Build an HTTP Basic `authorization` header value from an already composed
 * credential, usually `user:password` but also a bare API key or a key with a
 * provider-specific suffix. RFC 7617 encodes the credential from its UTF-8
 * bytes, so this is the only correct way to build the header: `btoa` understands
 * Latin-1 only, which silently sends the wrong bytes for accented credentials
 * and throws on anything outside Latin-1.
 */
export function basicAuthorizationHeader(value: string): string {
  return `Basic ${Buffer.from(value, "utf8").toString("base64")}`;
}

/**
 * Return an abort signal that fires when either the parent signal aborts or the
 * provider-local timeout expires. The timeout defaults to 30 seconds, the value
 * almost every provider request uses; pass `timeoutMs` only for endpoints that
 * genuinely need a different budget.
 */
export function createProviderTimeout(
  parentSignal: AbortSignal | undefined,
  timeoutMs: number = defaultProviderRequestTimeoutMs,
): ProviderTimeout {
  const controller = new AbortController();
  let timeoutReached = false;
  const timeoutId = setTimeout(() => {
    timeoutReached = true;
    controller.abort();
  }, timeoutMs);
  const abortFromParent = (): void => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) {
    abortFromParent();
  } else {
    parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  }
  return {
    signal: controller.signal,
    didTimeout: () => timeoutReached,
    cleanup() {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener("abort", abortFromParent);
    },
  };
}

/**
 * Return whether a caught error represents a fetch abort: the `AbortError`
 * raised by an aborted controller or the `TimeoutError` raised by
 * `AbortSignal.timeout()`.
 */
export function isAbortLikeError(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

/**
 * Return whether an error came from a specific aborted signal, counting the
 * signal's own abort reason regardless of the name it carries.
 */
export function isAbortSignalError(signal: AbortSignal | undefined, error: unknown): boolean {
  return signal?.aborted === true && (isAbortLikeError(error) || error === signal.reason);
}

/**
 * Options for {@link runProviderRequest}.
 */
export interface ProviderRequestOptions {
  /** Caller signal, usually the execution context's; aborting it aborts the request. */
  signal?: AbortSignal;
  /** Provider-local budget for the whole request; defaults to 30 seconds. */
  timeoutMs?: number;
  /** Provider name used in the timeout and failure messages, e.g. `"Skio"`. */
  label: string;
}

/**
 * Run a provider request under the shared timeout and error mapping.
 *
 * `request` receives the combined abort signal and should perform the fetch and
 * read the body. A `ProviderRequestError` thrown inside passes through
 * untouched; a timeout or abort becomes `504 "<label> request timed out"`; any
 * other failure becomes `502 "<label> request failed[: <message>]"`. The
 * timeout is always cleaned up.
 */
export async function runProviderRequest<T>(
  options: ProviderRequestOptions,
  request: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const timeout = createProviderTimeout(options.signal, options.timeoutMs);
  try {
    return await request(timeout.signal);
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeout.didTimeout() || isAbortLikeError(error) || isAbortSignalError(timeout.signal, error)) {
      throw new ProviderRequestError(504, `${options.label} request timed out`);
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `${options.label} request failed: ${error.message}` : `${options.label} request failed`,
    );
  } finally {
    timeout.cleanup();
  }
}

/**
 * Set defined query parameters on a URL.
 */
export function setSearchParams(url: URL, query: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
}

/**
 * Read a bounded provider error response body as text.
 */
export async function readProviderErrorTextBody(
  response: Response,
  fieldName: string,
  signal?: AbortSignal,
): Promise<string> {
  try {
    return await readProviderTextBody(response, fieldName, defaultProviderErrorMaxResponseBytes, signal);
  } catch (error) {
    // A size-limit or broken-body failure degrades to the fallback message, but
    // a timeout, abort, or the caller's own abort reason must keep propagating
    // so runProviderRequest reports 504 instead of the upstream status the body
    // read was interrupted for. `AbortSignal.abort(reason)` accepts arbitrary
    // reasons, which `isAbortLikeError` alone cannot recognize.
    if (signal?.aborted) throw signal.reason;
    if (isAbortLikeError(error)) throw error;
    return "";
  }
}

// The three HTTP-date forms of RFC 9110 section 5.6.7. Date.parse alone is too
// lenient for a header: V8 reads "wait 5" as 1 May 2001, and reads the zone-less
// asctime form as local time although every HTTP-date is UTC.

const imfFixdatePattern =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), \d{2} (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{4} \d{2}:\d{2}:\d{2} GMT$/;

const rfc850DatePattern =
  /^(?:Mon|Tues|Wednes|Thurs|Fri|Satur|Sun)day, \d{2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2} \d{2}:\d{2}:\d{2} GMT$/;

const asctimeDatePattern =
  /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [ \d]\d \d{2}:\d{2}:\d{2} \d{4}$/;

/**
 * Read a `Retry-After` header as whole seconds from now: an integer delay
 * verbatim, an HTTP-date as the seconds until that instant (never negative).
 * Examples: `"73" => 73`; a date 90 s ahead `=> 90`; absent or unparseable
 * `=> undefined`.
 */
export function readRetryAfterSeconds(headers: Headers, now: number = Date.now()): number | undefined {
  const value = headers.get("retry-after")?.trim();
  if (!value) {
    return undefined;
  }
  if (/^\d+$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : undefined;
  }
  const retryAt =
    imfFixdatePattern.test(value) || rfc850DatePattern.test(value)
      ? Date.parse(value)
      : asctimeDatePattern.test(value)
        ? Date.parse(`${value} GMT`)
        : Number.NaN;
  return Number.isFinite(retryAt) ? Math.max(0, Math.ceil((retryAt - now) / 1000)) : undefined;
}

/**
 * Attach a rate-limited response's `Retry-After` to its error details in the
 * shape Slack established, `details.retryAfterSeconds`, so every provider's
 * 429 (and 503) reaches the action envelope with the same pacing hint.
 * Other statuses, and responses without a usable header, return `details`
 * untouched; non-record details are kept under `body`.
 */
export function withRetryAfterSeconds(response: Response, details?: unknown): unknown {
  if (response.status !== 429 && response.status !== 503) {
    return details;
  }
  const retryAfterSeconds = readRetryAfterSeconds(response.headers);
  if (retryAfterSeconds === undefined) {
    return details;
  }
  const record = optionalRecord(details) ?? (details == null ? {} : { body: details });
  return { ...record, retryAfterSeconds };
}

/**
 * Read a JSON provider response or raise a structured provider request error.
 */
export async function readProviderJson<T>(response: Response, source: string): Promise<T> {
  if (response.ok) {
    return response.json() as Promise<T>;
  }

  const text = await readProviderErrorTextBody(response, `${source} error response`);
  throw new ProviderRequestError(response.status, text || `${source} request failed`);
}

export interface ReadProviderJsonBodyOptions {
  emptyBody: unknown;
  invalidJsonMessage: string;
  invalidJsonStatus?: number;
  invalidJsonFallback?: (text: string, error: unknown) => unknown;
  maxBytes?: number;
  trimEmptyBody?: boolean;
}

/**
 * Read a bounded provider response body as text.
 */
export async function readProviderTextBody(
  response: Response,
  fieldName: string,
  maxBytes: number = defaultProviderJsonMaxResponseBytes,
  signal?: AbortSignal,
): Promise<string> {
  const bytes = await readBoundedResponseBytes(response, {
    maxBytes,
    fieldName,
    createError: (message) => new ProviderRequestError(413, message),
    signal,
  });
  return new TextDecoder().decode(bytes);
}

/**
 * Read a bounded provider response body as JSON.
 */
export async function readProviderJsonBody(response: Response, options: ReadProviderJsonBodyOptions): Promise<unknown> {
  const text = await readProviderTextBody(response, "provider JSON response", options.maxBytes);
  return parseProviderJsonBodyText(text, options);
}

/**
 * Parse an already-read provider response body as JSON.
 */
export function parseProviderJsonBodyText(text: string, options: ReadProviderJsonBodyOptions): unknown {
  const isEmpty = options.trimEmptyBody === false ? text === "" : text.trim() === "";
  if (isEmpty) {
    return options.emptyBody;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    const fallback = options.invalidJsonFallback?.(text, error);
    if (fallback !== undefined) {
      return fallback;
    }
    throw new ProviderRequestError(options.invalidJsonStatus ?? 502, options.invalidJsonMessage, error);
  }
}

/**
 * The action error code a provider request failure reports: the provider's own
 * code when it chose one, else one inferred from the upstream status. A
 * provider that needs to react to the classification, such as retrying a rate
 * limit, reads it here instead of re-deriving it from the status.
 */
export function providerRequestErrorCode(error: ProviderRequestError): ProviderErrorCode {
  // `provider_error` is the generic fallback; a 429 is unambiguous, so refine it.
  // A specific provider code (including one chosen for a 429) still wins.
  return error.code === "provider_error" && error.status === 429
    ? "rate_limited"
    : (error.code ??
        (error.status === 401 || error.status === 403
          ? "authorization_failed"
          : error.status === 429
            ? "rate_limited"
            : // A 3xx is an upstream redirect that `redirect: "manual"` surfaced unfollowed, not bad input.
              error.status < 500 && (error.status < 300 || error.status >= 400)
              ? "invalid_input"
              : "provider_error"));
}

/**
 * Map provider runtime failures to the standard action execution result.
 */
export function toProviderExecutionError(error: unknown, fallbackMessage: string): ExecutionResult {
  if (error instanceof ProviderRequestError) {
    return {
      ok: false,
      error: {
        code: providerRequestErrorCode(error),
        message: error.message,
        details: {
          status: error.status,
          details: error.details,
        },
      },
    };
  }
  if (error instanceof CastError) {
    return {
      ok: false,
      error: {
        code: "invalid_input",
        message: error.message,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "internal_error",
      message: fallbackMessage,
    },
  };
}

/**
 * The platform error code behind a transport failure (`ENOTFOUND`,
 * `ECONNREFUSED`, `CERT_HAS_EXPIRED`, ...), formatted for appending to a
 * provider-visible message, or `""` when there is none.
 *
 * Only the code — never `cause.message`, which on undici embeds the target host
 * (`getaddrinfo ENOTFOUND secret.internal`). That host is exactly what the
 * transport-error mapping exists to keep out of provider-visible errors; the
 * code is an enum-like token that identifies the failure without naming it.
 */
function describeTransportCauseCode(error: unknown): string {
  const code = optionalString(optionalRecord(optionalRecord(error)?.cause)?.code);
  return code ? ` (${code})` : "";
}
