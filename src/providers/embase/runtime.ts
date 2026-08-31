import type { ProviderActionHandlers } from "../provider-runtime.ts";

import { compactObject, optionalRecord, optionalString, requiredString } from "../../core/cast.ts";
import {
  createProviderTimeout,
  isAbortLikeError,
  providerInputError,
  providerUserAgent,
  ProviderRequestError,
} from "../provider-runtime.ts";

const embaseApiBaseUrl = "https://api.elsevier.com/content/embase";
const embaseDefaultRequestTimeoutMs = 30_000;

type EmbasePhase = "validate" | "execute";
interface EmbaseCredentials {
  apiKey: string;
  institutionToken?: string;
}
interface EmbaseQuota {
  limit: number | null;
  remaining: number | null;
  resetAt: string | null;
}
interface EmbaseResponse {
  payload: Record<string, unknown>;
  quota: EmbaseQuota;
}
interface EmbaseActionContext {
  fetcher: typeof fetch;
  credentials: EmbaseCredentials;
}
type EmbaseActionHandler = (input: Record<string, unknown>, context: EmbaseActionContext) => Promise<unknown>;

export const embaseActionHandlers: ProviderActionHandlers<"embase", EmbaseActionHandler> = {
  async search_articles(input, context) {
    const hasQuery = optionalString(input.query) != null;
    const hasAlertId = optionalString(input.alertId) != null;
    if (hasQuery === hasAlertId) throw new ProviderRequestError(400, "exactly one of query or alertId is required");
    const response = await requestEmbaseJson({
      path: "/article",
      params: mapParams(input, {
        query: "query",
        alertId: "alertid",
        start: "start",
        count: "count",
        sort: "sort",
      }),
      ...context,
      phase: "execute",
    });

    const header = readNestedRecord(response.payload, ["header"]);
    return {
      totalResults: readNullableInteger(header.hits),
      entries: readResultRecords(response.payload.results),
      quota: response.quota,
      raw: response.payload,
    };
  },
  async get_article(input, context) {
    const identifierType = readRequiredString(input.identifierType, "identifierType");
    const identifier = readRequiredString(input.identifier, "identifier");
    const response = await requestEmbaseJson({
      path: `/article/${identifierType}/${encodeURIComponent(identifier)}`,
      params: {},
      ...context,
      phase: "execute",
    });

    return {
      record: readFirstResultRecord(response.payload.results),
      quota: response.quota,
      raw: response.payload,
    };
  },
};

export function createEmbaseActionContext(values: Record<string, string>, fetcher: typeof fetch): EmbaseActionContext {
  return { credentials: readValidationCredentials(values), fetcher };
}

export async function validateEmbaseCredential(
  input: Record<string, string>,
  fetcher: typeof fetch,
): Promise<{ profile: { displayName: string }; grantedScopes: string[]; metadata: Record<string, unknown> }> {
  const credentials = readValidationCredentials(input);
  const response = await requestEmbaseJson({
    path: "/article",
    params: { query: "heart", count: "1" },
    credentials,
    fetcher,
    phase: "validate",
  });

  return {
    profile: { displayName: "Embase API Key" },
    grantedScopes: [],
    metadata: compactObject({
      validationEndpoint: "/article",
      usesInstitutionToken: credentials.institutionToken ? true : undefined,
      quotaLimit: response.quota.limit ?? undefined,
      quotaRemaining: response.quota.remaining ?? undefined,
      quotaResetAt: response.quota.resetAt ?? undefined,
    }),
  };
}

async function requestEmbaseJson(input: {
  path: string;
  params: Record<string, string | undefined>;
  credentials: EmbaseCredentials;
  fetcher: typeof fetch;
  phase: EmbasePhase;
}): Promise<EmbaseResponse> {
  const timeoutHandle = createProviderTimeout(undefined, embaseDefaultRequestTimeoutMs);

  try {
    const response = await input.fetcher(buildEmbaseUrl(input.path, input.params), {
      method: "GET",
      headers: buildEmbaseHeaders(input.credentials),
      signal: timeoutHandle.signal,
    });
    const payload = await readEmbasePayload(response);

    if (!response.ok) {
      throw createEmbaseError(response.status, payload, input.phase);
    }

    const payloadRecord = optionalRecord(payload);
    if (!payloadRecord) {
      throw new ProviderRequestError(502, "Embase returned an invalid JSON object");
    }

    return { payload: payloadRecord, quota: readEmbaseQuota(response.headers) };
  } catch (error) {
    if (error instanceof ProviderRequestError) {
      throw error;
    }
    if (timeoutHandle.didTimeout() || isAbortLikeError(error)) {
      throw new ProviderRequestError(504, "Embase request timed out");
    }
    throw new ProviderRequestError(
      502,
      error instanceof Error ? `Embase request failed: ${error.message}` : "Embase request failed",
    );
  } finally {
    timeoutHandle.cleanup();
  }
}

function buildEmbaseUrl(path: string, params: Record<string, string | undefined>) {
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, `${embaseApiBaseUrl}/`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, value);
    }
  }
  return url;
}

function buildEmbaseHeaders(credentials: EmbaseCredentials) {
  const headers: Record<string, string> = {
    accept: "application/json",
    "user-agent": providerUserAgent,
    "x-els-apikey": credentials.apiKey,
  };
  if (credentials.institutionToken) {
    headers["x-els-insttoken"] = credentials.institutionToken;
  }
  return headers;
}

async function readEmbasePayload(response: Response) {
  const text = await response.text();
  if (text.trim() === "") {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text.trim();
  }
}

function createEmbaseError(status: number, payload: unknown, phase: EmbasePhase) {
  const message = extractEmbaseErrorMessage(payload) ?? `Embase request failed with status ${status}`;
  if (status === 429) {
    return new ProviderRequestError(429, message);
  }
  if (phase === "validate" && 400 <= status && status < 500) {
    return new ProviderRequestError(400, message);
  }
  if (status === 401) {
    return new ProviderRequestError(409, message);
  }
  if (status === 403) {
    return new ProviderRequestError(403, message);
  }
  if (400 <= status && status < 500) {
    return new ProviderRequestError(502, message, status);
  }
  return new ProviderRequestError(502, message);
}

function extractEmbaseErrorMessage(payload: unknown): string | undefined {
  if (typeof payload === "string") {
    const text = payload.trim();
    if (!text.startsWith("<")) {
      return text || undefined;
    }
    for (const element of ["statusText", "error-message", "message"]) {
      const value = readXmlElement(text, element);
      if (value) {
        return value;
      }
    }
    return undefined;
  }
  return findNestedMessage(payload);
}

function findNestedMessage(value: unknown): string | undefined {
  const record = optionalRecord(value);
  if (!record) {
    return undefined;
  }
  for (const key of ["message", "statusText", "error-message", "error", "detail"]) {
    const message = optionalString(record[key])?.trim();
    if (message) {
      return message;
    }
  }
  for (const nested of Object.values(record)) {
    const message = findNestedMessage(nested);
    if (message) {
      return message;
    }
  }
  return undefined;
}

function readXmlElement(xml: string, element: string) {
  const openTag = `<${element}>`;
  const closeTag = `</${element}>`;
  const start = xml.indexOf(openTag);
  const end = xml.indexOf(closeTag, start + openTag.length);
  if (start < 0 || end < 0) {
    return undefined;
  }
  const value = xml.slice(start + openTag.length, end).trim();
  return value || undefined;
}

function readNestedRecord(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const record = optionalRecord(payload[key]);
    if (record) {
      return record;
    }
  }
  throw new ProviderRequestError(502, `Embase response is missing the expected ${keys.join(" or ")} envelope`);
}

function readResultRecords(value: unknown) {
  if (!Array.isArray(value)) {
    throw new ProviderRequestError(502, "Embase response is missing the expected results array");
  }

  return value.map((item, index) => {
    const record = optionalRecord(item);
    if (!record) {
      throw new ProviderRequestError(502, `Embase results[${index}] is not a JSON object`);
    }
    return record;
  });
}

function readFirstResultRecord(value: unknown) {
  const record = readResultRecords(value)[0];
  if (!record) {
    throw new ProviderRequestError(502, "Embase response is missing the expected results record");
  }
  return record;
}

function readEmbaseQuota(headers: Headers): EmbaseQuota {
  const resetEpochSeconds = readNullableInteger(headers.get("x-ratelimit-reset"));
  return {
    limit: readNullableInteger(headers.get("x-ratelimit-limit")),
    remaining: readNullableInteger(headers.get("x-ratelimit-remaining")),
    resetAt: toIsoDate(resetEpochSeconds),
  };
}

function toIsoDate(epochSeconds: number | null) {
  if (epochSeconds === null || !Number.isSafeInteger(epochSeconds)) {
    return null;
  }
  const date = new Date(epochSeconds * 1_000);
  return Number.isNaN(date.valueOf()) ? null : date.toISOString();
}

function mapParams(input: Record<string, unknown>, mapping: Record<string, string>) {
  const params: Record<string, string | undefined> = {};
  for (const [inputName, upstreamName] of Object.entries(mapping)) {
    const value = input[inputName];
    if (value !== undefined && value !== null) {
      params[upstreamName] = typeof value === "string" ? value.trim() : String(value);
    }
  }
  return params;
}

function readValidationCredentials(input: Record<string, string>): EmbaseCredentials {
  return {
    apiKey: requiredString(input.apiKey, "apiKey", providerInputError),
    institutionToken: readOptionalCredential(input.institutionToken),
  };
}

function readOptionalCredential(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function readNullableInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function readRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ProviderRequestError(400, `${fieldName} is required`);
  }
  return value.trim();
}
