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

export const threatfoxApiBaseUrl = "https://threatfox-api.abuse.ch";
export const threatfoxApiPath = "/api/v1/";
const threatfoxValidationQuery = { query: "get_iocs", days: 1 };

export interface ThreatfoxRuntimeContext {
  apiKey: string;
  fetcher: ProviderFetch;
  signal?: AbortSignal;
}

type ThreatfoxActionHandler = (input: Record<string, unknown>, context: ThreatfoxRuntimeContext) => Promise<unknown>;

export const threatfoxActionHandlers: ProviderActionHandlers<"threatfox", ThreatfoxActionHandler> = {
  async lookup_ioc(input, context) {
    const ioc = lookupIocParam(input.ioc);
    const isHash =
      (ioc.length === 32 || ioc.length === 64) &&
      [...ioc.toLowerCase()].every((character) => "0123456789abcdef".includes(character));
    const payload = await requestThreatfox(
      context,
      isHash ? { query: "search_hash", hash: ioc } : { query: "search_ioc", search_term: ioc, exact_match: true },
    );
    const record = optionalRecord(payload);
    const queryStatus = optionalString(record?.query_status) ?? "";
    // ThreatFox reports "no_result" (singular) when the IOC is unknown.
    if (queryStatus === "no_result" || queryStatus === "no_results") {
      return { found: false, query_status: queryStatus, entries: undefined };
    }
    if (queryStatus !== "ok" || !record) {
      throw new ProviderRequestError(502, `ThreatFox returned an unexpected query_status: ${queryStatus || "missing"}`);
    }
    // An "ok" without an entry array is a malformed upstream response: never
    // report a positive IOC match with zero evidence.
    if (!Array.isArray(record.data)) {
      throw new ProviderRequestError(502, "ThreatFox returned ok without an entry array");
    }
    return {
      found: true,
      query_status: queryStatus,
      entries: optionalObjectArray(record.data).map(normalizeIocEntry),
    };
  },
};

/**
 * The queried IOC travels to ThreatFox as POST data and is never fetched, so
 * only the general shape is validated here; ThreatFox itself reports
 * `illegal_search_term` for anything it cannot parse.
 */
function lookupIocParam(value: unknown): string {
  const ioc = requiredInputString(value, "ioc").trim();
  if (!ioc) {
    throw providerInputError("ioc must be a non-empty indicator of compromise.");
  }
  if (/\s/.test(ioc)) {
    throw providerInputError("ioc must not contain whitespace.");
  }
  if (ioc.length > 2048) {
    throw providerInputError("ioc must not exceed 2048 characters.");
  }
  return ioc;
}

async function requestThreatfox(context: ThreatfoxRuntimeContext, query: Record<string, unknown>): Promise<unknown> {
  const endpoint = new URL(threatfoxApiPath, threatfoxApiBaseUrl);
  return runProviderRequest({ label: "ThreatFox", signal: context.signal }, async (signal) => {
    const response = await context.fetcher(endpoint, {
      method: "POST",
      headers: {
        "Auth-Key": context.apiKey,
        accept: "application/json",
        // ThreatFox expects a JSON body (see threatfox.abuse.ch/api docs); a
        // form-encoded body is rejected with query_status "no_json".
        "content-type": "application/json",
        "user-agent": providerUserAgent,
      },
      body: JSON.stringify(query),
      signal,
    });
    if (!response.ok) {
      throw await readThreatfoxError(response);
    }
    return parseProviderJsonBodyText(await readProviderTextBody(response, "ThreatFox response"), {
      emptyBody: null,
      invalidJsonMessage: "ThreatFox returned malformed JSON",
    });
  });
}

/** Lightweight credential check: lists one day of recent IOCs; HTTP failures retain their provider error semantics. */
export async function validateThreatfoxAuthKey(
  apiKey: string,
  fetcher: ProviderFetch,
  signal?: AbortSignal,
): Promise<void> {
  const context: ThreatfoxRuntimeContext = { apiKey, fetcher, signal };
  const payload = optionalRecord(await requestThreatfox(context, threatfoxValidationQuery));
  if (optionalString(payload?.query_status) !== "ok") {
    throw new ProviderRequestError(502, "ThreatFox validation returned an unexpected response");
  }
}

function normalizeIocEntry(record: Record<string, unknown>): Record<string, unknown> {
  return {
    ...record,
    id: stringifyId(record.id),
    ioc: optionalString(record.ioc) ?? "",
    threat_type: optionalString(record.threat_type) ?? "",
    threat_type_desc: optionalString(record.threat_type_desc) ?? "",
    ioc_type: optionalString(record.ioc_type) ?? "",
    ioc_type_desc: optionalString(record.ioc_type_desc) ?? "",
    malware: optionalString(record.malware) ?? "",
    malware_printable: optionalString(record.malware_printable) ?? "",
    confidence_level: optionalInteger(record.confidence_level) ?? 0,
    first_seen: optionalString(record.first_seen) ?? "",
    last_seen: optionalString(record.last_seen) ?? null,
    reporter: optionalString(record.reporter) ?? "",
    reference: optionalString(record.reference) ?? null,
    tags: optionalStringArray(record.tags) ?? [],
    malware_samples: (optionalObjectArray(record.malware_samples) ?? []).map(normalizeMalwareSample),
  };
}

function normalizeMalwareSample(item: Record<string, unknown>): Record<string, unknown> {
  return {
    ...item,
    time_stamp: optionalString(item.time_stamp) ?? "",
    md5_hash: optionalString(item.md5_hash) ?? "",
    sha256_hash: optionalString(item.sha256_hash) ?? "",
    malware_bazaar: optionalString(item.malware_bazaar) ?? "",
  };
}

/** ThreatFox entry IDs arrive as strings but may be numbers in edge cases. */
function stringifyId(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(Math.trunc(value));
  return "";
}

// HTTP status alone cannot distinguish an invalid key from access or subscription restrictions.
export async function readThreatfoxError(response: Response): Promise<ProviderRequestError> {
  const text = (await readProviderErrorTextBody(response, "ThreatFox error response")).trim();
  const message = text.slice(0, 200) || `ThreatFox request failed with HTTP ${response.status}`;
  const status = response.status;
  const code = status === 429 ? "rate_limited" : "provider_error";
  return new ProviderRequestError(status, message, withRetryAfterSeconds(response, {}), code);
}
