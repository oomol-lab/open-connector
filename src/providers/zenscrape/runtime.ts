import type { CredentialValidationResult } from "../../core/types.ts";
import type { ProviderActionHandlers } from "../provider-runtime.ts";
import type { ApiKeyProviderContext, ProviderRuntimeHandler } from "../provider-runtime.ts";

import { compactObject, optionalBoolean, optionalNumber, optionalRawString, optionalRecord } from "../../core/cast.ts";
import {
  providerUserAgent,
  ProviderRequestError,
  readProviderTextBody,
  runProviderRequest,
} from "../provider-runtime.ts";

export const zenscrapeApiBaseUrl = "https://app.zenscrape.com/api/v1";
const zenscrapeGetUrl = `${zenscrapeApiBaseUrl}/get`;
const requestTimeoutMs = 80_000;
const maxResponseBytes = 20 * 1024 * 1024;
const maxNonJsonErrorMessageLength = 300;

type ZenscrapePhase = "validate" | "execute";

export const zenscrapeActionHandlers: ProviderActionHandlers<
  "zenscrape",
  ProviderRuntimeHandler<ApiKeyProviderContext>
> = {
  async fetch_url(input, context) {
    const forwardHeaders = buildForwardHeaders(input);
    const { response, bodyText } = await requestZenscrapeRaw(
      buildFetchQuery(input, forwardHeaders),
      forwardHeaders,
      context,
      "execute",
    );
    return {
      body: bodyText,
      metadata: {
        statusCode: response.status,
        contentType: response.headers.get("content-type"),
      },
      headers: Object.fromEntries(response.headers.entries()),
    };
  },
};

export async function validateZenscrapeCredential(
  input: { apiKey: string },
  { fetcher, signal }: { fetcher: typeof fetch; signal?: AbortSignal },
): Promise<CredentialValidationResult> {
  await requestZenscrapeRaw(
    { url: "https://example.com" },
    undefined,
    { apiKey: input.apiKey, fetcher, signal },
    "validate",
  );
  return {
    profile: { accountId: "zenscrape", displayName: "Zenscrape API Key" },
    grantedScopes: [],
    metadata: {
      validationEndpoint: "/api/v1/get",
      apiBaseUrl: zenscrapeApiBaseUrl,
    },
  };
}

async function requestZenscrapeRaw(
  query: Record<string, string | number | boolean | undefined>,
  forwardHeaders: Record<string, string> | undefined,
  context: Pick<ApiKeyProviderContext, "apiKey" | "fetcher" | "signal">,
  phase: ZenscrapePhase,
): Promise<{ response: Response; bodyText: string }> {
  return runProviderRequest(
    { signal: context.signal, timeoutMs: requestTimeoutMs, label: "Zenscrape" },
    async (signal) => {
      const response = await context.fetcher(buildZenscrapeUrl(query, context.apiKey), {
        method: "GET",
        headers: {
          accept: "*/*",
          "user-agent": providerUserAgent,
          ...forwardHeaders,
        },
        signal,
      });
      const bodyText = await readProviderTextBody(response, "Zenscrape response", maxResponseBytes);
      if (!response.ok) {
        throw createZenscrapeError(response.status, bodyText, phase);
      }
      return { response, bodyText };
    },
  );
}

function buildZenscrapeUrl(query: Record<string, string | number | boolean | undefined>, apiKey: string): URL {
  const requestUrl = new URL(zenscrapeGetUrl);
  requestUrl.searchParams.set("apikey", apiKey);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) requestUrl.searchParams.set(key, String(value));
  }
  return requestUrl;
}

function buildFetchQuery(
  input: Record<string, unknown>,
  forwardHeaders: Record<string, string> | undefined,
): Record<string, string | number | boolean | undefined> {
  const render = optionalBoolean(input.render);
  const waitForCss = optionalRawString(input.waitForCss);
  const javascriptSnippet = optionalRawString(input.javascriptSnippet);
  const keepHeaders = optionalBoolean(input.keepHeaders);
  if ((waitForCss || javascriptSnippet) && render !== true) {
    throw new ProviderRequestError(400, "waitForCss and javascriptSnippet require render to be true");
  }
  if (forwardHeaders && keepHeaders === false) {
    throw new ProviderRequestError(400, "customHeaders and cookies require keepHeaders to be true or omitted");
  }
  return compactObject({
    url: readRequiredRawString(input.url, "url"),
    render,
    premium: optionalBoolean(input.premium),
    location: optionalRawString(input.location),
    device_type: optionalRawString(input.deviceType),
    wait_for: optionalNumber(input.waitFor),
    wait_for_css: waitForCss,
    block_ads: optionalBoolean(input.blockAds),
    javascript_snippet: javascriptSnippet,
    block_resources: stringifyOptionalStringArray(input.blockResources, "blockResources"),
    keep_headers: keepHeaders ?? (forwardHeaders ? true : undefined),
  });
}

function buildForwardHeaders(input: Record<string, unknown>): Record<string, string> | undefined {
  const customHeaders = readOptionalStringRecord(input.customHeaders, "customHeaders");
  const cookies = optionalRawString(input.cookies);
  if (!customHeaders && !cookies) return undefined;
  const forwardHeaders = { ...customHeaders };
  if (cookies) forwardHeaders.Cookie = cookies;
  return forwardHeaders;
}

function createZenscrapeError(status: number, body: string, phase: ZenscrapePhase): ProviderRequestError {
  const message = extractZenscrapeErrorMessage(body) ?? `Zenscrape request failed with status ${status}`;
  if (status === 429) return new ProviderRequestError(429, message);
  if (phase === "validate" && status >= 400 && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (phase === "execute" && (status === 401 || status === 403)) {
    return new ProviderRequestError(status, message);
  }
  if (phase === "execute" && status === 400) {
    return new ProviderRequestError(400, message);
  }
  return new ProviderRequestError(status || 502, message);
}

function extractZenscrapeErrorMessage(body: string): string | undefined {
  const trimmed = body.trim();
  if (!trimmed) return undefined;
  try {
    const message = findMessage(JSON.parse(trimmed) as unknown);
    if (message) return message;
  } catch {}
  if (looksLikeHtml(trimmed)) {
    return "Zenscrape returned a non-JSON error response";
  }
  return trimmed.length <= maxNonJsonErrorMessageLength
    ? trimmed
    : `${trimmed.slice(0, maxNonJsonErrorMessageLength)}...`;
}

function findMessage(value: unknown): string | undefined {
  const record = optionalRecord(value);
  if (!record) return undefined;
  const directMessage = optionalRawString(record.message)?.trim() ?? optionalRawString(record.error)?.trim();
  if (directMessage) return directMessage;
  for (const child of Object.values(record)) {
    const childMessage = findMessage(child);
    if (childMessage) return childMessage;
  }
  return undefined;
}

function readRequiredRawString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function readOptionalStringRecord(value: unknown, fieldName: string): Record<string, string> | undefined {
  if (value === undefined) return undefined;
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(400, `${fieldName} must be an object`);
  }
  return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, String(child)]));
}

function stringifyOptionalStringArray(value: unknown, fieldName: string): string | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(400, `${fieldName} must be an array`);
  }
  return value.map(String).join(",");
}

function looksLikeHtml(value: string): boolean {
  const prefix = value.slice(0, 32).toLowerCase();
  return prefix.startsWith("<!doctype") || prefix.startsWith("<html");
}
