import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { isIP } from "node:net";
import { domainToASCII } from "node:url";
import { optionalRecord, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  getProviderActionHandler,
  ProviderRequestError,
  providerUserAgent,
} from "../provider-runtime.ts";

export interface LeadboxerCredentialCheck {
  providerAccountId?: string;
  accountLabel: string;
  providerScopes: string[];
  providerMetadata: Record<string, unknown>;
}

interface ApiKeyProviderActionInput {
  apiKey: string;
  actionName: string;
  input: Record<string, unknown>;
  providerMetadata?: Record<string, unknown>;
  values?: Record<string, string>;
}

type LeadboxerRequestPhase = "validate" | "execute";
type LeadboxerActionHandler = (input: ApiKeyProviderActionInput, fetcher: typeof fetch) => Promise<unknown>;

export const leadboxerApiBaseUrl = "https://api.leadboxer.com";

const leadboxerValidationEndpoint = "/v1/management/credits";
const leadboxerRequestTimeoutMs = 30_000;

const leadboxerActionHandlers: ProviderActionHandlers<"leadboxer", LeadboxerActionHandler> = {
  lookup_ip(input, fetcher) {
    return executeLookup(input, fetcher, "/v1/ip-lookup", "ip");
  },
  lookup_domain(input, fetcher) {
    return executeLookup(input, fetcher, "/v1/domain-lookup", "domain");
  },
};

export async function validateLeadboxerCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<LeadboxerCredentialCheck> {
  const payload = await requestLeadboxerJson({
    apiKey: requiredString(input.apiKey, "apiKey", (message) => new ProviderRequestError(400, message)),
    path: leadboxerValidationEndpoint,
    fetcher,
    phase: "validate",
  });
  const body = requireRecord(payload, "LeadBoxer credit grants response");
  if (!Array.isArray(body.data)) {
    throw new ProviderRequestError(502, "LeadBoxer credit grants response data must be an array");
  }

  return {
    accountLabel: "LeadBoxer API Key",
    providerScopes: [],
    providerMetadata: {
      apiBaseUrl: leadboxerApiBaseUrl,
      validationEndpoint: leadboxerValidationEndpoint,
      creditGrantCount: body.data.length,
    },
  };
}

export async function executeLeadboxerAction(
  input: ApiKeyProviderActionInput,
  fetcher: typeof fetch,
): Promise<unknown> {
  const handler = getProviderActionHandler(leadboxerActionHandlers, input.actionName);
  if (!handler) {
    throw new ProviderRequestError(500, `LeadBoxer action is not implemented yet: ${input.actionName}`);
  }
  return handler(input, fetcher);
}

export function buildLeadboxerUrl(path: string, query: Record<string, string | undefined> = {}): URL {
  const url = new URL(path, leadboxerApiBaseUrl);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

export async function requestLeadboxerJson(input: {
  apiKey: string;
  path: string;
  query?: Record<string, string | undefined>;
  fetcher: typeof fetch;
  phase: LeadboxerRequestPhase;
}): Promise<unknown> {
  const timeoutHandle = createProviderTimeout(undefined, leadboxerRequestTimeoutMs);

  try {
    const response = await input.fetcher(buildLeadboxerUrl(input.path, input.query), {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": providerUserAgent,
        "x-api-key": input.apiKey,
      },
      signal: timeoutHandle.signal,
    });
    const payload = await readLeadboxerPayload(response);

    if (!response.ok) {
      throw createLeadboxerError(response, payload, input.phase);
    }

    return payload;
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }

    if (timeoutHandle.didTimeout() || isAbortError(error)) {
      throw new ProviderRequestError(504, "LeadBoxer request timed out");
    }

    throw new ProviderRequestError(
      502,
      error instanceof Error ? `LeadBoxer request failed: ${error.message}` : "LeadBoxer request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

async function executeLookup(
  input: ApiKeyProviderActionInput,
  fetcher: typeof fetch,
  path: string,
  lookupField: "ip" | "domain",
) {
  const lookupValue = normalizeLookupValue(input.input[lookupField], lookupField);
  const payload = await requestLeadboxerJson({
    apiKey: input.apiKey,
    path,
    query: {
      [lookupField]: lookupValue,
      datasetId: optionalString(input.input.datasetId)?.trim(),
    },
    fetcher,
    phase: "execute",
  });

  return requireRecord(payload, `LeadBoxer ${lookupField} lookup response`);
}

function normalizeLookupValue(value: unknown, field: "ip" | "domain"): string {
  const text = requireString(value, field).trim();
  if (field === "ip") {
    if (isIP(text) === 0) throw new ProviderRequestError(400, "ip must be a valid IPv4 or IPv6 address");
    return text;
  }
  const normalized = normalizeDomain(text);
  if (!isCleanDomain(normalized)) {
    throw new ProviderRequestError(400, "domain must be a clean domain name without protocol, path, or www prefix");
  }
  return normalized;
}

function normalizeDomain(value: string): string {
  if (hasWhitespace(value) || [":", "/", "?", "#"].some((character) => value.includes(character))) {
    return value.toLowerCase();
  }
  return (domainToASCII(value) || value).toLowerCase();
}

function isCleanDomain(value: string): boolean {
  if (
    !value ||
    value.length > 253 ||
    value.startsWith("www.") ||
    value.startsWith(".") ||
    value.endsWith(".") ||
    hasWhitespace(value)
  )
    return false;
  const labels = value.split(".");
  return (
    labels.length >= 2 &&
    labels.every((label) => {
      if (!label || label.length > 63 || label.startsWith("-") || label.endsWith("-")) return false;
      return [...label].every((character) => {
        const code = character.charCodeAt(0);
        return (code >= 48 && code <= 57) || (code >= 97 && code <= 122) || character === "-";
      });
    })
  );
}

function hasWhitespace(value: string): boolean {
  return [...value].some((character) => character.trim() === "");
}

async function readLeadboxerPayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ProviderRequestError(502, "LeadBoxer returned invalid JSON");
  }
}

function createLeadboxerError(response: Response, payload: unknown, phase: LeadboxerRequestPhase) {
  const message = extractLeadboxerErrorMessage(payload) ?? `LeadBoxer request failed with status ${response.status}`;

  if (response.status === 402 || response.status === 429) {
    return new ProviderRequestError(429, message);
  }

  if (phase === "validate" && response.status >= 400 && response.status < 500) {
    return new ProviderRequestError(400, message);
  }

  if (phase === "execute" && response.status === 401) {
    return new ProviderRequestError(409, message);
  }

  if (phase === "execute" && response.status === 403) {
    return new ProviderRequestError(403, message);
  }

  if (phase === "execute" && (response.status === 400 || response.status === 404 || response.status === 409)) {
    return new ProviderRequestError(400, message);
  }

  return new ProviderRequestError(response.status || 500, message);
}

function extractLeadboxerErrorMessage(payload: unknown) {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  const record = optionalRecord(payload);
  if (!record) {
    return undefined;
  }

  for (const key of ["detail", "message", "title", "error"]) {
    const value = optionalString(record[key])?.trim();
    if (value) {
      return value;
    }
  }

  if (!Array.isArray(record.errors)) {
    return undefined;
  }

  for (const item of record.errors) {
    const error = optionalRecord(item);
    const message = error ? optionalString(error.message)?.trim() : undefined;
    if (message) {
      return message;
    }
  }

  return undefined;
}

function requireRecord(value: unknown, label: string) {
  const record = optionalRecord(value);
  if (!record) {
    throw new ProviderRequestError(502, `${label} must be an object`);
  }
  return record;
}

function requireString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}
