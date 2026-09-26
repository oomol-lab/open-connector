import type { ProviderFetch } from "../provider-runtime.ts";

import { optionalRecord, optionalString } from "../../core/cast.ts";
import {
  ProviderRequestError,
  readProviderErrorTextBody,
  readProviderJsonBody,
  runProviderRequest,
  setSearchParams,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";

const graphBaseUrl = "https://graph.microsoft.com/v1.0/";
const graphOrigin = "https://graph.microsoft.com";

interface MicrosoftGraphRequestOptions {
  accessToken: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
  method?: string;
  query?: Record<string, string | undefined>;
  headers?: Record<string, string>;
  body?: unknown;
  allowNextLink?: (pathname: string) => boolean;
  refineErrorMessage?: (code: string, message: string) => string;
  label: string;
}

/**
 * Issue one authenticated Microsoft Graph request using the shared provider transport policy.
 */
export async function microsoftGraphRequest(
  pathOrUrl: string,
  options: MicrosoftGraphRequestOptions,
): Promise<Response> {
  const url = buildMicrosoftGraphUrl(pathOrUrl, options.query, options.allowNextLink);
  const method = (options.method ?? (options.body === undefined ? "GET" : "POST")).toUpperCase();
  if ((method === "GET" || method === "HEAD") && options.body !== undefined) {
    throw new ProviderRequestError(400, `${options.label} ${method} request must not include a body`);
  }
  const headers = new Headers(options.headers);
  headers.set("authorization", `Bearer ${options.accessToken}`);
  if (options.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return runProviderRequest({ signal: options.signal, label: options.label }, async (signal) => {
    const response = await options.fetcher(url, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal,
    });
    if (!response.ok) {
      throw await microsoftGraphResponseError(response, options);
    }
    return response;
  });
}

/**
 * Issue a Microsoft Graph request and decode its JSON response.
 */
export async function microsoftGraphJson<T>(pathOrUrl: string, options: MicrosoftGraphRequestOptions): Promise<T> {
  const response = await microsoftGraphRequest(pathOrUrl, options);
  return (await readProviderJsonBody(response, {
    emptyBody: null,
    invalidJsonMessage: `${options.label} returned invalid JSON`,
    invalidJsonStatus: 502,
  })) as T;
}

function buildMicrosoftGraphUrl(
  pathOrUrl: string,
  query: Record<string, string | undefined> | undefined,
  allowNextLink: ((pathname: string) => boolean) | undefined,
): URL {
  const normalizedPathOrUrl = pathOrUrl.toLowerCase();
  const absolute = normalizedPathOrUrl.startsWith("https://") || normalizedPathOrUrl.startsWith("http://");
  const requiresNextLinkValidation = absolute || pathOrUrl.startsWith("/");
  const url = absolute ? new URL(pathOrUrl) : new URL(pathOrUrl, graphBaseUrl);
  if (url.origin !== graphOrigin || url.protocol !== "https:") {
    throw new ProviderRequestError(400, "Microsoft Graph URL must target https://graph.microsoft.com");
  }
  if (requiresNextLinkValidation && (!url.pathname.startsWith("/v1.0/") || !allowNextLink?.(url.pathname))) {
    throw new ProviderRequestError(400, "nextLink does not target an allowed Microsoft Graph endpoint");
  }
  setSearchParams(url, query ?? {});
  return url;
}

async function microsoftGraphResponseError(
  response: Response,
  options: MicrosoftGraphRequestOptions,
): Promise<ProviderRequestError> {
  const text = await readProviderErrorTextBody(response, `${options.label} error response`);
  let code = "";
  let message = text || `${options.label} request failed with status ${response.status}`;
  if (text) {
    try {
      const payload = optionalRecord(JSON.parse(text));
      const error = optionalRecord(payload?.error);
      code = optionalString(error?.code) ?? "";
      message = optionalString(error?.message) ?? optionalString(payload?.message) ?? message;
    } catch {
      // Keep the upstream text when it is not JSON.
    }
  }
  return new ProviderRequestError(
    response.status,
    options.refineErrorMessage?.(code, message) ?? message,
    withRetryAfterSeconds(response),
  );
}
