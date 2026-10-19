import type { ProviderActionHandlers, ProviderFetch } from "../provider-runtime.ts";

import {
  optionalInteger,
  optionalObjectArray,
  optionalRecord,
  optionalString,
  optionalStringArray,
} from "../../core/cast.ts";
import {
  parseProviderJsonBodyText,
  providerInputError,
  ProviderRequestError,
  providerUserAgent,
  readProviderErrorTextBody,
  readProviderTextBody,
  requiredInputString,
  runProviderRequest,
  withRetryAfterSeconds,
} from "../provider-runtime.ts";

export const urlhausApiBaseUrl = "https://urlhaus-api.abuse.ch";
export const urlhausValidationPath = "/v1/urls/recent/limit/1/";

export interface UrlhausRuntimeContext {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type UrlhausActionHandler = (input: Record<string, unknown>, context: UrlhausRuntimeContext) => Promise<unknown>;

export const urlhausActionHandlers: ProviderActionHandlers<"urlhaus", UrlhausActionHandler> = {
  async lookup_url(input, context) {
    const url = lookupUrlParam(input.url);
    const payload = await requestUrlhaus({ context, url });
    const record = optionalRecord(payload);
    const queryStatus = optionalString(record?.query_status) ?? "";
    if (queryStatus === "no_results") {
      return { found: false, query_status: queryStatus, entry: undefined };
    }
    if (queryStatus === "invalid_url") {
      throw providerInputError("URLhaus rejected the url as invalid.");
    }
    if (queryStatus !== "ok" || !record) {
      throw new ProviderRequestError(502, `URLhaus returned an unexpected query_status: ${queryStatus || "missing"}`);
    }
    return { found: true, query_status: queryStatus, entry: normalizeUrlEntry(record) };
  },
};

/**
 * The queried value travels to URLhaus as POST data and is never fetched, so
 * only the scheme and general shape are validated here; URLhaus itself
 * reports `invalid_url` for anything it cannot parse.
 */
function lookupUrlParam(value: unknown): string {
  const url = requiredInputString(value, "url").trim();
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw providerInputError("url must be a valid absolute URL, for example https://example.com/payload.exe.");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw providerInputError("url must use the http or https scheme.");
  }
  return url;
}

interface UrlhausRequest {
  context: UrlhausRuntimeContext;
  url: string;
}

async function requestUrlhaus(request: UrlhausRequest): Promise<unknown> {
  const endpoint = new URL("/v1/url/", urlhausApiBaseUrl);
  return runProviderRequest({ label: "URLhaus", signal: request.context.signal }, async (signal) => {
    const response = await request.context.fetcher(endpoint, {
      method: "POST",
      headers: {
        "Auth-Key": request.context.apiKey,
        accept: "application/json",
        // URLhaus expects form-encoded POST data (see urlhaus-api.abuse.ch docs),
        // not JSON: a JSON body yields HTTP 200 with an empty response.
        "content-type": "application/x-www-form-urlencoded",
        "user-agent": providerUserAgent,
      },
      body: new URLSearchParams({ url: request.url }).toString(),
      signal,
    });
    if (!response.ok) {
      throw await readUrlhausError(response);
    }
    return parseProviderJsonBodyText(await readProviderTextBody(response, "URLhaus response"), {
      emptyBody: null,
      invalidJsonMessage: "URLhaus returned malformed JSON",
    });
  });
}

/** Lightweight credential check: lists one recent URL; HTTP failures retain their provider error semantics. */
export async function validateUrlhausAuthKey(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<void> {
  await runProviderRequest({ label: "URLhaus", signal }, async (requestSignal) => {
    const response = await fetcher(new URL(urlhausValidationPath, urlhausApiBaseUrl), {
      headers: {
        "Auth-Key": apiKey,
        accept: "application/json",
        "user-agent": providerUserAgent,
      },
      signal: requestSignal,
    });
    if (!response.ok) {
      throw await readUrlhausError(response);
    }
    const payload = optionalRecord(
      parseProviderJsonBodyText(await readProviderTextBody(response, "URLhaus validation response"), {
        emptyBody: null,
        invalidJsonMessage: "URLhaus returned malformed JSON",
      }),
    );
    if (optionalString(payload?.query_status) !== "ok") {
      throw new ProviderRequestError(502, "URLhaus validation returned an unexpected response");
    }
  });
}

function normalizeUrlEntry(record: Record<string, unknown>): Record<string, unknown> {
  const blacklists = optionalRecord(record.blacklists) ?? {};
  const idValue = record.id;
  return {
    ...record,
    id: typeof idValue === "string" ? idValue : typeof idValue === "number" ? String(idValue) : "",
    urlhaus_reference: optionalString(record.urlhaus_reference) ?? "",
    url: optionalString(record.url) ?? "",
    url_status: optionalString(record.url_status) ?? "",
    host: optionalString(record.host) ?? "",
    date_added: optionalString(record.date_added) ?? "",
    last_online: optionalString(record.last_online) ?? null,
    threat: optionalString(record.threat) ?? "",
    blacklists: {
      ...blacklists,
      surbl: optionalString(blacklists.surbl) ?? "",
      spamhaus_dbl: optionalString(blacklists.spamhaus_dbl) ?? "",
    },
    reporter: optionalString(record.reporter) ?? "",
    larted: optionalString(record.larted) ?? "",
    takedown_time_seconds: optionalInteger(record.takedown_time_seconds) ?? null,
    tags: optionalStringArray(record.tags) ?? [],
    payloads: (optionalObjectArray(record.payloads) ?? []).map(normalizePayload),
  };
}

function normalizePayload(item: Record<string, unknown>): Record<string, unknown> {
  return {
    ...item,
    firstseen: optionalString(item.firstseen) ?? "",
    filename: optionalString(item.filename) ?? null,
    file_type: optionalString(item.file_type) ?? "",
    response_size: stringifySize(item.response_size),
    response_md5: optionalString(item.response_md5) ?? "",
    response_sha256: optionalString(item.response_sha256) ?? "",
    urlhaus_download: optionalString(item.urlhaus_download) ?? "",
    signature: optionalString(item.signature) ?? null,
  };
}

/** URLhaus reports the payload size inconsistently as a string or a number. */
function stringifySize(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return optionalString(value) ?? "";
}

// HTTP status alone cannot distinguish an invalid key from access or subscription restrictions.
export async function readUrlhausError(response: Response): Promise<ProviderRequestError> {
  const text = (await readProviderErrorTextBody(response, "URLhaus error response")).trim();
  const message = text.slice(0, 200) || `URLhaus request failed with HTTP ${response.status}`;
  const status = response.status;
  const code = status === 429 ? "rate_limited" : "provider_error";
  return new ProviderRequestError(status, message, withRetryAfterSeconds(response, {}), code);
}
